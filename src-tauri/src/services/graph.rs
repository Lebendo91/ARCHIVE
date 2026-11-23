//! Knowledge graph (specification §11): the documents and notes of the knowledge base, what connects them (links
//! written in notes, relations, and on request the suggestions of the memory engine) and how they are organised
//! (workspaces, tags).
//!
//! Everything is filtered and limited here, before anything is sent (spec §11.3): the interface never receives
//! thousands of nodes. Without a focus, the most connected items are kept; with one, its neighbourhood. The
//! neighbours of the items the user expands are added afterwards, up to a hard ceiling. Nothing is invented: an
//! item without any connection is not drawn, and a rejected suggestion never appears.

use std::cmp::Reverse;
use std::collections::{HashMap, HashSet};

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{AppError, AppResult};
use crate::repo::relations::{RelationOrigin, RelationStatus};
use crate::repo::{EntityKind, TokenColor};
use crate::services::relations::RELATION_TYPES;
use crate::util::{fold_for_search, validate_id};

/// Hard ceiling of the nodes sent at once, expansions included.
pub const NODES_MAX: u32 = 500;
/// Ceiling of the edges sent at once. Beyond it, workspace memberships are left out first, then tags.
pub const EDGES_MAX: usize = 4_000;
/// Items whose neighbours can be added to one graph.
pub const EXPANDED_MAX: usize = 50;
/// Relations written as links in the text of a note.
pub const LINK_TYPE: &str = "links_to";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum GraphNodeKind {
    Document,
    Note,
    Workspace,
    Tag,
}

impl GraphNodeKind {
    fn name(self) -> &'static str {
        match self {
            GraphNodeKind::Document => "document",
            GraphNodeKind::Note => "note",
            GraphNodeKind::Workspace => "workspace",
            GraphNodeKind::Tag => "tag",
        }
    }

    /// Key of a node in the graph, unique across kinds.
    pub fn key(self, id: &str) -> String {
        format!("{}:{id}", self.name())
    }

    fn of_item(kind: EntityKind) -> Option<Self> {
        match kind {
            EntityKind::Document => Some(GraphNodeKind::Document),
            EntityKind::Note => Some(GraphNodeKind::Note),
            _ => None,
        }
    }
}

/// What an edge stands for. The order is the order of importance: when there are too many edges, the last
/// kinds are left out first.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum GraphEdgeKind {
    /// A link written in a note.
    Link,
    /// A relation created by the user, or suggested by the engine and accepted.
    Relation,
    /// A relation suggested by the engine and not decided yet.
    Suggestion,
    /// The item carries the tag.
    Tag,
    /// The item belongs to the workspace.
    Workspace,
}

/// An item of the graph, as the user designates it.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct GraphItem {
    pub kind: GraphNodeKind,
    pub id: String,
}

impl GraphItem {
    fn key(&self) -> String {
        self.kind.key(&self.id)
    }
}

/// What to show. Filters apply before the limit, so that the limit keeps the most relevant nodes among those
/// the user asked for.
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct GraphQuery {
    /// Kinds of node: documents and notes are the items; workspaces and tags show how they are organised.
    pub node_kinds: Vec<GraphNodeKind>,
    /// Types of relation shown: `links_to` for the links written in notes, and the types of relation.
    pub relation_types: Vec<String>,
    /// Also the relations suggested by the engine and not decided yet.
    #[serde(default)]
    #[ts(optional)]
    pub include_suggestions: Option<bool>,
    /// Only the items of this workspace.
    #[serde(default)]
    #[ts(optional)]
    pub workspace_id: Option<String>,
    /// The neighbourhood of this item instead of the whole knowledge base.
    #[serde(default)]
    #[ts(optional)]
    pub focus: Option<GraphItem>,
    /// Items whose neighbours are added (progressive loading).
    #[serde(default)]
    #[ts(optional)]
    pub expanded: Option<Vec<GraphItem>>,
    /// Nodes kept before the expansions.
    pub limit: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GraphNode {
    /// Unique key in the graph: `<kind>:<id>`.
    pub key: String,
    pub kind: GraphNodeKind,
    pub id: String,
    /// Title of the item, name of the workspace or of the tag. Empty for a note without a title.
    pub label: String,
    /// Connections of the node with the current filters, drawn or not.
    pub degree: u32,
    pub archived: bool,
    /// File extension of a document.
    pub format: Option<String>,
    /// Colour of a workspace or of a tag.
    pub color: Option<TokenColor>,
    /// Icon of a workspace.
    pub icon: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GraphEdge {
    /// The relation for links, relations and suggestions; built from both ends otherwise.
    pub id: String,
    pub kind: GraphEdgeKind,
    /// Key of the node the edge starts from: the note that links, the source of a relation, the item that
    /// belongs or is tagged.
    pub source: String,
    pub target: String,
    /// Type of a link (`links_to`), of a relation or of a suggestion.
    pub relation_type: Option<String>,
    pub origin: Option<RelationOrigin>,
    /// How sure the engine is of a relation it found.
    pub confidence: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    /// Nodes that matched before the limit: connected nodes, or the focus and its neighbours.
    pub total: u32,
    /// True when the limit left nodes out.
    pub truncated: bool,
    /// True when edges were left out to stay under the ceiling.
    pub edges_truncated: bool,
    /// Documents and notes in the knowledge base (or in the workspace filtered), connected or not.
    pub items: u32,
}

/// Validated filters.
struct Filters {
    kinds: HashSet<GraphNodeKind>,
    types: Vec<String>,
    suggestions: bool,
    workspace: Option<String>,
    focus: Option<GraphItem>,
    expanded: Vec<GraphItem>,
    limit: usize,
}

fn check_item(item: &GraphItem, field: &str) -> AppResult<()> {
    validate_id(&item.id, field)
}

fn validate(query: &GraphQuery) -> AppResult<Filters> {
    if query.limit == 0 || query.limit > NODES_MAX {
        return Err(AppError::InvalidInput(format!(
            "limit must be between 1 and {NODES_MAX}"
        )));
    }
    if query.node_kinds.is_empty() {
        return Err(AppError::InvalidInput(
            "at least one kind of node is required".to_owned(),
        ));
    }
    let mut types = Vec::new();
    for relation_type in &query.relation_types {
        if relation_type != LINK_TYPE && !RELATION_TYPES.contains(&relation_type.as_str()) {
            return Err(AppError::InvalidInput(format!(
                "unknown relation type {relation_type:?}"
            )));
        }
        if !types.contains(relation_type) {
            types.push(relation_type.clone());
        }
    }
    if let Some(workspace_id) = &query.workspace_id {
        validate_id(workspace_id, "workspace id")?;
    }
    let mut kinds: HashSet<GraphNodeKind> = query.node_kinds.iter().copied().collect();
    if let Some(focus) = &query.focus {
        check_item(focus, "focus id")?;
        // The item the user starts from is always shown, whatever the kinds selected.
        kinds.insert(focus.kind);
    }
    let expanded = query.expanded.clone().unwrap_or_default();
    if expanded.len() > EXPANDED_MAX {
        return Err(AppError::InvalidInput(format!(
            "at most {EXPANDED_MAX} items can be expanded"
        )));
    }
    for item in &expanded {
        check_item(item, "expanded item id")?;
    }
    Ok(Filters {
        kinds,
        types,
        suggestions: query.include_suggestions.unwrap_or(false),
        workspace: query.workspace_id.clone(),
        focus: query.focus.clone(),
        expanded,
        limit: query.limit as usize,
    })
}

/// Every node and edge that matches the filters, before the limit.
#[derive(Default)]
struct Universe {
    nodes: HashMap<String, GraphNode>,
    edges: Vec<GraphEdge>,
    /// Workspace of each item, to draw memberships once the workspaces are known.
    memberships: Vec<(String, String)>,
}

impl Universe {
    fn add(&mut self, kind: GraphNodeKind, id: String, label: String, archived: bool) -> String {
        let key = kind.key(&id);
        self.nodes.insert(
            key.clone(),
            GraphNode {
                key: key.clone(),
                kind,
                id,
                label,
                degree: 0,
                archived,
                format: None,
                color: None,
                icon: None,
            },
        );
        key
    }
}

type ItemRow = (String, String, Option<String>, bool, Option<String>);

/// Live documents or notes (the trash is never shown), with their workspace.
fn load_items(
    connection: &Connection,
    kind: GraphNodeKind,
    filters: &Filters,
    universe: &mut Universe,
) -> AppResult<()> {
    let sql = match kind {
        GraphNodeKind::Document => {
            "SELECT id, title, workspace_id, is_archived, file_extension FROM documents
             WHERE deleted_at IS NULL AND (?1 IS NULL OR workspace_id = ?1)"
        }
        GraphNodeKind::Note => {
            "SELECT id, title, workspace_id, is_archived, NULL FROM notes
             WHERE deleted_at IS NULL AND (?1 IS NULL OR workspace_id = ?1)"
        }
        GraphNodeKind::Workspace | GraphNodeKind::Tag => return Ok(()),
    };
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map(params![filters.workspace], |row| {
        Ok((
            row.get(0)?,
            row.get(1)?,
            row.get(2)?,
            row.get(3)?,
            row.get(4)?,
        ))
    })?;
    for row in rows {
        let (id, title, workspace, archived, format): ItemRow = row?;
        let key = universe.add(kind, id, title, archived);
        if let Some(node) = universe.nodes.get_mut(&key) {
            node.format = format;
        }
        if let Some(workspace) = workspace {
            universe.memberships.push((key, workspace));
        }
    }
    Ok(())
}

fn load_workspaces(
    connection: &Connection,
    filters: &Filters,
    universe: &mut Universe,
) -> AppResult<()> {
    let mut statement = connection.prepare(
        "SELECT id, name, color, icon, is_archived FROM workspaces WHERE ?1 IS NULL OR id = ?1",
    )?;
    let rows = statement.query_map(params![filters.workspace], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, TokenColor>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, bool>(4)?,
        ))
    })?;
    for row in rows {
        let (id, name, color, icon, archived) = row?;
        let key = universe.add(GraphNodeKind::Workspace, id, name, archived);
        if let Some(node) = universe.nodes.get_mut(&key) {
            node.color = Some(color);
            node.icon = Some(icon);
        }
    }
    Ok(())
}

fn load_tags(connection: &Connection, universe: &mut Universe) -> AppResult<()> {
    let mut statement = connection.prepare("SELECT id, name, color FROM tags")?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, TokenColor>(2)?,
        ))
    })?;
    for row in rows {
        let (id, name, color) = row?;
        let key = universe.add(GraphNodeKind::Tag, id, name, false);
        if let Some(node) = universe.nodes.get_mut(&key) {
            node.color = Some(color);
        }
    }
    let mut statement = connection.prepare(
        "SELECT 'document', document_id, tag_id FROM document_tags
         UNION ALL SELECT 'note', note_id, tag_id FROM note_tags",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, EntityKind>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    for row in rows {
        let (kind, item, tag) = row?;
        let Some(kind) = GraphNodeKind::of_item(kind) else {
            continue;
        };
        let source = kind.key(&item);
        let target = GraphNodeKind::Tag.key(&tag);
        if universe.nodes.contains_key(&source) && universe.nodes.contains_key(&target) {
            universe.edges.push(GraphEdge {
                id: format!("tag:{tag}:{source}"),
                kind: GraphEdgeKind::Tag,
                source,
                target,
                relation_type: None,
                origin: None,
                confidence: None,
            });
        }
    }
    Ok(())
}

/// Links, decided relations and, on request, suggestions between live items. Rejected suggestions never.
fn load_relations(
    connection: &Connection,
    filters: &Filters,
    universe: &mut Universe,
) -> AppResult<()> {
    if filters.types.is_empty() {
        return Ok(());
    }
    let types = serde_json::to_string(&filters.types)
        .map_err(|error| AppError::Internal(format!("relation types: {error}")))?;
    let mut statement = connection.prepare(
        "SELECT id, source_type, source_id, target_type, target_id, relation_type, origin, status, confidence
         FROM relations
         WHERE relation_type IN (SELECT value FROM json_each(?1))
           AND (status = 'accepted' OR (?2 AND status = 'suggested'))",
    )?;
    let rows = statement.query_map(params![types, filters.suggestions], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, EntityKind>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, EntityKind>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, RelationOrigin>(6)?,
            row.get::<_, RelationStatus>(7)?,
            row.get::<_, Option<f64>>(8)?,
        ))
    })?;
    for row in rows {
        let (
            id,
            source_type,
            source_id,
            target_type,
            target_id,
            relation_type,
            origin,
            status,
            confidence,
        ) = row?;
        let (Some(source_kind), Some(target_kind)) = (
            GraphNodeKind::of_item(source_type),
            GraphNodeKind::of_item(target_type),
        ) else {
            continue;
        };
        let source = source_kind.key(&source_id);
        let target = target_kind.key(&target_id);
        // Both ends must be shown: live, of a kind selected, in the workspace filtered.
        if !universe.nodes.contains_key(&source) || !universe.nodes.contains_key(&target) {
            continue;
        }
        let kind = if relation_type == LINK_TYPE {
            GraphEdgeKind::Link
        } else if status == RelationStatus::Suggested {
            GraphEdgeKind::Suggestion
        } else {
            GraphEdgeKind::Relation
        };
        universe.edges.push(GraphEdge {
            id,
            kind,
            source,
            target,
            relation_type: Some(relation_type),
            origin: Some(origin),
            confidence,
        });
    }
    Ok(())
}

/// The focus is shown even when the filters leave it out (another workspace, for example), if it still exists
/// outside the trash.
fn load_focus(
    connection: &Connection,
    focus: &GraphItem,
    universe: &mut Universe,
) -> AppResult<()> {
    if universe.nodes.contains_key(&focus.key()) {
        return Ok(());
    }
    let sql = match focus.kind {
        GraphNodeKind::Document => {
            "SELECT title, is_archived, file_extension FROM documents WHERE id = ?1 AND deleted_at IS NULL"
        }
        GraphNodeKind::Note => {
            "SELECT title, is_archived, NULL FROM notes WHERE id = ?1 AND deleted_at IS NULL"
        }
        GraphNodeKind::Workspace => "SELECT name, is_archived, NULL FROM workspaces WHERE id = ?1",
        GraphNodeKind::Tag => "SELECT name, 0, NULL FROM tags WHERE id = ?1",
    };
    let found = connection
        .query_row(sql, [&focus.id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, bool>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .optional()?;
    let Some((label, archived, format)) = found else {
        return Err(AppError::NotFound { entity: "item" });
    };
    let key = universe.add(focus.kind, focus.id.clone(), label, archived);
    if let Some(node) = universe.nodes.get_mut(&key) {
        node.format = format;
    }
    Ok(())
}

fn load(connection: &Connection, filters: &Filters) -> AppResult<Universe> {
    let mut universe = Universe::default();
    for kind in [GraphNodeKind::Document, GraphNodeKind::Note] {
        if filters.kinds.contains(&kind) {
            load_items(connection, kind, filters, &mut universe)?;
        }
    }
    if filters.kinds.contains(&GraphNodeKind::Workspace) {
        load_workspaces(connection, filters, &mut universe)?;
    }
    if filters.kinds.contains(&GraphNodeKind::Tag) {
        load_tags(connection, &mut universe)?;
    }
    if let Some(focus) = &filters.focus {
        load_focus(connection, focus, &mut universe)?;
    }
    for (item, workspace) in std::mem::take(&mut universe.memberships) {
        let target = GraphNodeKind::Workspace.key(&workspace);
        if universe.nodes.contains_key(&target) {
            universe.edges.push(GraphEdge {
                id: format!("workspace:{item}"),
                kind: GraphEdgeKind::Workspace,
                source: item,
                target,
                relation_type: None,
                origin: None,
                confidence: None,
            });
        }
    }
    load_relations(connection, filters, &mut universe)?;
    for edge in &universe.edges {
        for end in [&edge.source, &edge.target] {
            if let Some(node) = universe.nodes.get_mut(end) {
                node.degree += 1;
            }
        }
    }
    Ok(universe)
}

/// Most connected first; then a stable order, so that the same knowledge base always gives the same graph.
fn rank(node: &GraphNode) -> (Reverse<u32>, GraphNodeKind, String, String) {
    (
        Reverse(node.degree),
        node.kind,
        fold_for_search(&node.label),
        node.id.clone(),
    )
}

/// Neighbours of a node not chosen yet, in the order of their rank.
fn neighbours<'a>(
    universe: &'a Universe,
    adjacency: &HashMap<&str, Vec<usize>>,
    key: &str,
    chosen: &HashSet<String>,
) -> Vec<&'a GraphNode> {
    let mut seen = HashSet::new();
    let mut found: Vec<&GraphNode> = adjacency
        .get(key)
        .into_iter()
        .flatten()
        .filter_map(|&index| {
            let edge = &universe.edges[index];
            let other = if edge.source == key {
                &edge.target
            } else {
                &edge.source
            };
            (!chosen.contains(other) && seen.insert(other.as_str()))
                .then(|| universe.nodes.get(other))
                .flatten()
        })
        .collect();
    found.sort_by_cached_key(|node| rank(node));
    found
}

fn count_items(connection: &Connection, workspace: Option<&str>) -> AppResult<u32> {
    Ok(connection.query_row(
        "SELECT (SELECT count(*) FROM documents WHERE deleted_at IS NULL AND (?1 IS NULL OR workspace_id = ?1))
              + (SELECT count(*) FROM notes WHERE deleted_at IS NULL AND (?1 IS NULL OR workspace_id = ?1))",
        params![workspace],
        |row| row.get(0),
    )?)
}

/// The graph that answers a query: filtered, then limited, then expanded.
pub fn load_graph(connection: &Connection, query: &GraphQuery) -> AppResult<GraphData> {
    let filters = validate(query)?;
    let universe = load(connection, &filters)?;
    let mut adjacency: HashMap<&str, Vec<usize>> = HashMap::new();
    for (index, edge) in universe.edges.iter().enumerate() {
        adjacency.entry(&edge.source).or_default().push(index);
        adjacency.entry(&edge.target).or_default().push(index);
    }

    let mut chosen: HashSet<String> = HashSet::new();
    let mut order: Vec<String> = Vec::new();
    let mut choose = |key: &str, chosen: &mut HashSet<String>| {
        if chosen.insert(key.to_owned()) {
            order.push(key.to_owned());
        }
    };
    let total = if let Some(focus) = &filters.focus {
        let key = focus.key();
        choose(&key, &mut chosen);
        let around = neighbours(&universe, &adjacency, &key, &chosen);
        let total = around.len() + 1;
        for node in around.into_iter().take(filters.limit.saturating_sub(1)) {
            choose(&node.key, &mut chosen);
        }
        total
    } else {
        let mut connected: Vec<&GraphNode> = universe
            .nodes
            .values()
            .filter(|node| node.degree > 0)
            .collect();
        connected.sort_by_cached_key(|node| rank(node));
        for node in connected.iter().take(filters.limit) {
            choose(&node.key, &mut chosen);
        }
        connected.len()
    };
    let truncated = total > chosen.len();

    let ceiling = NODES_MAX as usize;
    for item in &filters.expanded {
        let key = item.key();
        if !chosen.contains(&key) {
            continue;
        }
        for node in neighbours(&universe, &adjacency, &key, &chosen) {
            if chosen.len() >= ceiling {
                break;
            }
            choose(&node.key, &mut chosen);
        }
    }

    let mut edges: Vec<&GraphEdge> = universe
        .edges
        .iter()
        .filter(|edge| chosen.contains(&edge.source) && chosen.contains(&edge.target))
        .collect();
    edges.sort_by(|a, b| {
        (a.kind, &a.source, &a.target, &a.id).cmp(&(b.kind, &b.source, &b.target, &b.id))
    });
    let edges_truncated = edges.len() > EDGES_MAX;
    edges.truncate(EDGES_MAX);

    let nodes = order
        .iter()
        .filter_map(|key| universe.nodes.get(key).cloned())
        .collect();
    Ok(GraphData {
        nodes,
        edges: edges.into_iter().cloned().collect(),
        total: u32::try_from(total).unwrap_or(u32::MAX),
        truncated,
        edges_truncated,
        items: count_items(connection, filters.workspace.as_deref())?,
    })
}

#[cfg(test)]
mod tests {
    use rusqlite::Transaction;

    use super::*;
    use crate::db::Database;
    use crate::db::testing::open_temporary;
    use crate::repo::documents::{self, NewDocument};
    use crate::repo::notes::{self, NoteContent, NoteFormat};
    use crate::repo::relations::{self, NewRelation};
    use crate::repo::tags::{self, Tagged};
    use crate::repo::workspaces::{self, NewWorkspace};
    use crate::util::new_id;

    fn document(
        transaction: &Transaction<'_>,
        title: &str,
        workspace: Option<&str>,
    ) -> AppResult<String> {
        let id = new_id();
        documents::insert(
            transaction,
            &NewDocument {
                stored_filename: format!("{id}.pdf"),
                id: id.clone(),
                title: title.to_owned(),
                original_filename: format!("{title}.pdf"),
                file_extension: "pdf".to_owned(),
                mime_type: "application/pdf".to_owned(),
                file_size: 1_024,
                content_hash: format!("{:0>64}", id.replace('-', "")),
                workspace_id: workspace.map(str::to_owned),
                folder_id: None,
                metadata: serde_json::json!({}),
            },
        )?;
        Ok(id)
    }

    fn note(
        transaction: &Transaction<'_>,
        title: &str,
        workspace: Option<&str>,
    ) -> AppResult<String> {
        Ok(notes::create(
            transaction,
            &NoteContent {
                title: title.to_owned(),
                content: String::new(),
                content_format: NoteFormat::Plain,
                content_text: String::new(),
            },
            workspace,
            None,
        )?
        .id)
    }

    fn relate(
        transaction: &Transaction<'_>,
        source: (EntityKind, &str),
        target: (EntityKind, &str),
        relation_type: &str,
        origin: RelationOrigin,
    ) -> AppResult<String> {
        Ok(relations::create(
            transaction,
            &NewRelation {
                source: (source.0, source.1.to_owned()),
                target: (target.0, target.1.to_owned()),
                relation_type: relation_type.to_owned(),
                origin,
                confidence: (origin != RelationOrigin::User).then_some(0.42),
                provenance: serde_json::json!({}),
            },
        )?
        .id)
    }

    fn every_type() -> Vec<String> {
        std::iter::once(LINK_TYPE)
            .chain(RELATION_TYPES.iter().copied())
            .map(str::to_owned)
            .collect()
    }

    fn query(kinds: &[GraphNodeKind]) -> GraphQuery {
        GraphQuery {
            node_kinds: kinds.to_vec(),
            relation_types: every_type(),
            include_suggestions: None,
            workspace_id: None,
            focus: None,
            expanded: None,
            limit: 300,
        }
    }

    const ITEMS: &[GraphNodeKind] = &[GraphNodeKind::Document, GraphNodeKind::Note];

    fn graph(database: &Database, query: &GraphQuery) -> GraphData {
        database
            .read(|connection| load_graph(connection, query))
            .expect("graph")
    }

    fn keys(data: &GraphData) -> Vec<&str> {
        let mut keys: Vec<&str> = data.nodes.iter().map(|node| node.key.as_str()).collect();
        keys.sort_unstable();
        keys
    }

    fn sorted(mut keys: Vec<String>) -> Vec<String> {
        keys.sort_unstable();
        keys
    }

    struct Base {
        workspace: String,
        tag: String,
        datasheet: String,
        course: String,
        timer: String,
        safety: String,
        lonely: String,
        trashed: String,
    }

    /// A small knowledge base: a link, a relation of the user, a suggestion, a rejected suggestion, a link to a
    /// document in the trash, a workspace and a tag, and a note without any connection.
    fn base(database: &Database) -> Base {
        database
            .write(|tx| {
                let workspace = workspaces::create(
                    tx,
                    &NewWorkspace {
                        name: "Électronique".to_owned(),
                        description: None,
                        color: Some(TokenColor::Cyan),
                        icon: Some("cpu".to_owned()),
                    },
                )?
                .id;
                let tag = tags::create(tx, "NE555", TokenColor::Amber)?.id;
                let datasheet = document(tx, "Fiche technique NE555", Some(&workspace))?;
                let course = document(tx, "Cours d’électronique", Some(&workspace))?;
                let timer = note(tx, "Montage astable", None)?;
                let safety = note(tx, "Sécurité électrique", None)?;
                let lonely = note(tx, "Liste de courses", None)?;
                let trashed = document(tx, "Ancien schéma", None)?;
                tags::attach(tx, &tag, Tagged::Document(&datasheet))?;
                tags::attach(tx, &tag, Tagged::Note(&timer))?;
                let note_kind = EntityKind::Note;
                let document_kind = EntityKind::Document;
                relate(
                    tx,
                    (note_kind, &timer),
                    (document_kind, &datasheet),
                    LINK_TYPE,
                    RelationOrigin::User,
                )?;
                relate(
                    tx,
                    (note_kind, &timer),
                    (document_kind, &trashed),
                    LINK_TYPE,
                    RelationOrigin::User,
                )?;
                relate(
                    tx,
                    (note_kind, &safety),
                    (document_kind, &course),
                    "explains",
                    RelationOrigin::User,
                )?;
                relate(
                    tx,
                    (document_kind, &datasheet),
                    (note_kind, &safety),
                    "related_to",
                    RelationOrigin::Rule,
                )?;
                let rejected = relate(
                    tx,
                    (note_kind, &timer),
                    (note_kind, &lonely),
                    "related_to",
                    RelationOrigin::Rule,
                )?;
                relations::set_status(tx, &rejected, RelationStatus::Rejected)?;
                documents::trash(tx, &trashed)?;
                Ok(Base {
                    workspace,
                    tag,
                    datasheet,
                    course,
                    timer,
                    safety,
                    lonely,
                    trashed,
                })
            })
            .expect("knowledge base")
    }

    #[test]
    fn the_graph_shows_connected_items_and_only_what_is_real() {
        let (_dir, database) = open_temporary();
        let base = base(&database);
        let document = |id: &str| GraphNodeKind::Document.key(id);
        let note = |id: &str| GraphNodeKind::Note.key(id);

        // Links and decided relations: the lonely note, the trash and the rejected suggestion stay out.
        let data = graph(&database, &query(ITEMS));
        assert_eq!(
            keys(&data),
            sorted(vec![
                document(&base.datasheet),
                document(&base.course),
                note(&base.timer),
                note(&base.safety),
            ])
        );
        assert_eq!((data.total, data.truncated, data.items), (4, false, 5));
        let kinds: Vec<(GraphEdgeKind, Option<&str>)> = data
            .edges
            .iter()
            .map(|edge| (edge.kind, edge.relation_type.as_deref()))
            .collect();
        assert_eq!(
            kinds,
            vec![
                (GraphEdgeKind::Link, Some(LINK_TYPE)),
                (GraphEdgeKind::Relation, Some("explains")),
            ]
        );
        let link = &data.edges[0];
        assert_eq!(
            (link.source.as_str(), link.target.as_str()),
            (
                note(&base.timer).as_str(),
                document(&base.datasheet).as_str()
            )
        );
        let datasheet = data
            .nodes
            .iter()
            .find(|node| node.id == base.datasheet)
            .expect("datasheet");
        assert_eq!(
            (datasheet.label.as_str(), datasheet.format.as_deref()),
            ("Fiche technique NE555", Some("pdf"))
        );

        // Suggestions on request, with how sure the engine is; never the rejected one.
        let mut with_suggestions = query(ITEMS);
        with_suggestions.include_suggestions = Some(true);
        let data = graph(&database, &with_suggestions);
        let suggestions: Vec<&GraphEdge> = data
            .edges
            .iter()
            .filter(|edge| edge.kind == GraphEdgeKind::Suggestion)
            .collect();
        assert_eq!(suggestions.len(), 1);
        assert_eq!(suggestions[0].confidence, Some(0.42));
        assert_eq!(suggestions[0].origin, Some(RelationOrigin::Rule));
        assert!(
            !data
                .nodes
                .iter()
                .any(|node| node.id == base.lonely || node.id == base.trashed)
        );

        // Workspaces and tags show the organisation, with their colours.
        let data = graph(
            &database,
            &query(&[
                GraphNodeKind::Document,
                GraphNodeKind::Note,
                GraphNodeKind::Workspace,
                GraphNodeKind::Tag,
            ]),
        );
        let workspace = data
            .nodes
            .iter()
            .find(|node| node.kind == GraphNodeKind::Workspace)
            .expect("workspace");
        assert_eq!(
            (
                workspace.id.as_str(),
                workspace.degree,
                workspace.color,
                workspace.icon.as_deref()
            ),
            (
                base.workspace.as_str(),
                2,
                Some(TokenColor::Cyan),
                Some("cpu")
            )
        );
        let tag = data
            .nodes
            .iter()
            .find(|node| node.kind == GraphNodeKind::Tag)
            .expect("tag");
        assert_eq!((tag.id.as_str(), tag.degree), (base.tag.as_str(), 2));
        assert_eq!(
            data.edges
                .iter()
                .filter(|edge| edge.kind == GraphEdgeKind::Workspace)
                .count(),
            2
        );
        // The most connected node comes first.
        assert_eq!(data.nodes[0].id, base.datasheet);

        // Only the links written in notes.
        let mut links = query(ITEMS);
        links.relation_types = vec![LINK_TYPE.to_owned()];
        let data = graph(&database, &links);
        assert_eq!(
            keys(&data),
            sorted(vec![document(&base.datasheet), note(&base.timer)])
        );

        // Only one workspace: its two documents, which are not connected to each other.
        let mut scoped = query(ITEMS);
        scoped.workspace_id = Some(base.workspace.clone());
        let data = graph(&database, &scoped);
        assert!(data.nodes.is_empty() && data.edges.is_empty());
        assert_eq!((data.total, data.items), (0, 2));
        scoped.node_kinds.push(GraphNodeKind::Workspace);
        let data = graph(&database, &scoped);
        assert_eq!(data.nodes.len(), 3);
    }

    #[test]
    fn the_neighbourhood_of_an_item_and_its_expansions_respect_the_limits() {
        let (_dir, database) = open_temporary();
        let base = base(&database);
        let (hub, spokes, outer) = database
            .write(|tx| {
                let hub = note(tx, "Index", None)?;
                let mut spokes = Vec::new();
                let mut outer = Vec::new();
                for index in 0..30 {
                    let spoke = note(tx, &format!("Fiche {index:02}"), None)?;
                    relate(
                        tx,
                        (EntityKind::Note, &hub),
                        (EntityKind::Note, &spoke),
                        LINK_TYPE,
                        RelationOrigin::User,
                    )?;
                    let far = note(tx, &format!("Annexe {index:02}"), None)?;
                    relate(
                        tx,
                        (EntityKind::Note, &spoke),
                        (EntityKind::Note, &far),
                        "references",
                        RelationOrigin::User,
                    )?;
                    spokes.push(spoke);
                    outer.push(far);
                }
                Ok((hub, spokes, outer))
            })
            .expect("hub");
        let note_item = |id: &str| GraphItem {
            kind: GraphNodeKind::Note,
            id: id.to_owned(),
        };

        // The neighbourhood of the hub, cut at the limit: the hub first, then its neighbours.
        let mut around = query(ITEMS);
        around.focus = Some(note_item(&hub));
        around.limit = 10;
        let data = graph(&database, &around);
        assert_eq!(data.nodes.len(), 10);
        assert_eq!(data.nodes[0].id, hub);
        assert_eq!(data.nodes[0].degree, 30);
        assert_eq!((data.total, data.truncated), (31, true));
        assert!(data.nodes[1..].iter().all(|node| spokes.contains(&node.id)));
        assert_eq!(data.edges.len(), 9);

        // Expanding a neighbour adds its own neighbours, and the edges between what is shown.
        let shown = data.nodes[1].id.clone();
        let index = spokes.iter().position(|id| *id == shown).expect("spoke");
        around.expanded = Some(vec![note_item(&shown)]);
        let data = graph(&database, &around);
        assert_eq!(data.nodes.len(), 11);
        assert!(data.nodes.iter().any(|node| node.id == outer[index]));
        assert_eq!(data.edges.len(), 10);
        // An item that is not shown cannot be expanded.
        around.expanded = Some(vec![note_item(&outer[0])]);
        assert_eq!(graph(&database, &around).nodes.len(), 10);

        // Without a focus, the most connected items first.
        let mut overview = query(ITEMS);
        overview.limit = 5;
        let data = graph(&database, &overview);
        assert_eq!(data.nodes.len(), 5);
        assert_eq!(data.nodes[0].id, hub);
        assert!(data.truncated);
        assert_eq!(data.total, 1 + 30 + 30 + 4);

        // An item without any connection is shown alone when the user starts from it.
        let mut alone = query(ITEMS);
        alone.focus = Some(note_item(&base.lonely));
        let data = graph(&database, &alone);
        assert_eq!(data.nodes.len(), 1);
        assert!(data.edges.is_empty());
        assert_eq!((data.total, data.truncated), (1, false));

        // The focus is shown even when the kinds selected leave it out.
        let mut tag_focus = query(ITEMS);
        tag_focus.focus = Some(GraphItem {
            kind: GraphNodeKind::Tag,
            id: base.tag.clone(),
        });
        let data = graph(&database, &tag_focus);
        assert_eq!(data.nodes[0].kind, GraphNodeKind::Tag);
        assert_eq!(data.nodes.len(), 3);

        // The trash and unknown items cannot be a focus.
        for missing in [
            GraphItem {
                kind: GraphNodeKind::Document,
                id: base.trashed.clone(),
            },
            note_item(&new_id()),
        ] {
            let mut lost = query(ITEMS);
            lost.focus = Some(missing);
            assert!(matches!(
                database.read(|connection| load_graph(connection, &lost)),
                Err(AppError::NotFound { .. })
            ));
        }
    }

    #[test]
    fn the_expansions_stop_at_the_ceiling_and_the_queries_are_checked() {
        let (_dir, database) = open_temporary();
        let hub = database
            .write(|tx| {
                let hub = note(tx, "Index", None)?;
                for index in 0..(NODES_MAX as usize + 20) {
                    let spoke = note(tx, &format!("Fiche {index:03}"), None)?;
                    relate(
                        tx,
                        (EntityKind::Note, &hub),
                        (EntityKind::Note, &spoke),
                        LINK_TYPE,
                        RelationOrigin::User,
                    )?;
                }
                Ok(hub)
            })
            .expect("hub");
        let mut expanded = query(ITEMS);
        expanded.limit = 50;
        expanded.expanded = Some(vec![GraphItem {
            kind: GraphNodeKind::Note,
            id: hub.clone(),
        }]);
        let data = graph(&database, &expanded);
        assert_eq!(data.nodes.len(), NODES_MAX as usize);
        assert!(data.truncated);

        let changed = |change: &dyn Fn(&mut GraphQuery)| {
            let mut changed = query(ITEMS);
            change(&mut changed);
            changed
        };
        let checks = [
            ("no limit", changed(&|q| q.limit = 0)),
            ("limit too high", changed(&|q| q.limit = NODES_MAX + 1)),
            ("no kind", changed(&|q| q.node_kinds.clear())),
            (
                "unknown type",
                changed(&|q| q.relation_types = vec!["DROP TABLE relations".to_owned()]),
            ),
            (
                "bad workspace",
                changed(&|q| q.workspace_id = Some("../x".to_owned())),
            ),
            (
                "bad focus",
                changed(&|q| {
                    q.focus = Some(GraphItem {
                        kind: GraphNodeKind::Note,
                        id: "not-an-id".to_owned(),
                    });
                }),
            ),
            (
                "too many expansions",
                changed(&|q| {
                    q.expanded = Some(vec![
                        GraphItem {
                            kind: GraphNodeKind::Note,
                            id: new_id(),
                        };
                        EXPANDED_MAX + 1
                    ]);
                }),
            ),
        ];
        for (name, refused) in checks {
            assert!(
                matches!(
                    database.read(|connection| load_graph(connection, &refused)),
                    Err(AppError::InvalidInput(_))
                ),
                "{name}"
            );
        }

        // No relation type: the organisation only, or nothing.
        let mut none = query(ITEMS);
        none.relation_types.clear();
        let data = graph(&database, &none);
        assert!(data.nodes.is_empty());
        assert_eq!(data.items, NODES_MAX + 21);
    }
}
