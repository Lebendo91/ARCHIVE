//! Workspaces (specification §12): organise knowledge by context.

use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::{TokenColor, check_icon, count_where, expect_one, map_delete_error, map_write_error};
use crate::error::{AppError, AppResult};
use crate::util::{check_length, clean_name, name_key, new_id, now_ms, validate_id};

const ENTITY: &str = "workspace";
pub const NAME_MAX: usize = 120;
pub const DESCRIPTION_MAX: usize = 2_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub description: String,
    pub color: TokenColor,
    pub icon: String,
    pub is_archived: bool,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct NewWorkspace {
    pub name: String,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub color: Option<TokenColor>,
    #[serde(default)]
    #[ts(optional)]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct WorkspacePatch {
    #[serde(default)]
    #[ts(optional)]
    pub name: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub color: Option<TokenColor>,
    #[serde(default)]
    #[ts(optional)]
    pub icon: Option<String>,
}

const COLUMNS: &str =
    "id, name, description, color, icon, is_archived, sort_order, created_at, updated_at";

fn from_row(row: &Row<'_>) -> rusqlite::Result<Workspace> {
    Ok(Workspace {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        color: row.get(3)?,
        icon: row.get(4)?,
        is_archived: row.get(5)?,
        sort_order: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

pub fn get(connection: &Connection, id: &str) -> AppResult<Workspace> {
    validate_id(id, "workspace id")?;
    connection
        .query_row(
            &format!("SELECT {COLUMNS} FROM workspaces WHERE id = ?1"),
            [id],
            from_row,
        )
        .optional()?
        .ok_or(AppError::NotFound { entity: ENTITY })
}

pub fn list(connection: &Connection, include_archived: bool) -> AppResult<Vec<Workspace>> {
    let mut statement = connection.prepare(&format!(
        "SELECT {COLUMNS} FROM workspaces WHERE ?1 OR is_archived = 0 ORDER BY sort_order, created_at"
    ))?;
    let rows = statement.query_map([include_archived], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn create(transaction: &Transaction<'_>, input: &NewWorkspace) -> AppResult<Workspace> {
    let name = clean_name(&input.name, "workspace name", NAME_MAX)?;
    let description = input.description.as_deref().unwrap_or("").trim().to_owned();
    check_length(&description, "workspace description", DESCRIPTION_MAX)?;
    let icon = input.icon.clone().unwrap_or_else(|| "folder".to_owned());
    check_icon(&icon)?;
    let now = now_ms();
    let next_order: i64 = transaction.query_row(
        "SELECT coalesce(max(sort_order), -1) + 1 FROM workspaces",
        [],
        |row| row.get(0),
    )?;
    let workspace = Workspace {
        id: new_id(),
        name,
        description,
        color: input.color.unwrap_or(TokenColor::Amber),
        icon,
        is_archived: false,
        sort_order: next_order,
        created_at: now,
        updated_at: now,
    };
    transaction
        .execute(
            "INSERT INTO workspaces (id, name, name_key, description, color, icon, is_archived, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8, ?8)",
            params![
                workspace.id,
                workspace.name,
                name_key(&workspace.name),
                workspace.description,
                workspace.color,
                workspace.icon,
                workspace.sort_order,
                now
            ],
        )
        .map_err(|error| map_write_error(error, ENTITY))?;
    Ok(workspace)
}

pub fn update(
    transaction: &Transaction<'_>,
    id: &str,
    patch: &WorkspacePatch,
) -> AppResult<Workspace> {
    let mut workspace = get(transaction, id)?;
    if let Some(name) = &patch.name {
        workspace.name = clean_name(name, "workspace name", NAME_MAX)?;
    }
    if let Some(description) = &patch.description {
        let description = description.trim();
        check_length(description, "workspace description", DESCRIPTION_MAX)?;
        description.clone_into(&mut workspace.description);
    }
    if let Some(color) = patch.color {
        workspace.color = color;
    }
    if let Some(icon) = &patch.icon {
        check_icon(icon)?;
        icon.clone_into(&mut workspace.icon);
    }
    workspace.updated_at = now_ms();
    let affected = transaction
        .execute(
            "UPDATE workspaces SET name = ?2, name_key = ?3, description = ?4, color = ?5, icon = ?6, updated_at = ?7
             WHERE id = ?1",
            params![
                workspace.id,
                workspace.name,
                name_key(&workspace.name),
                workspace.description,
                workspace.color,
                workspace.icon,
                workspace.updated_at
            ],
        )
        .map_err(|error| map_write_error(error, ENTITY))?;
    expect_one(affected, ENTITY)?;
    Ok(workspace)
}

pub fn set_archived(
    transaction: &Transaction<'_>,
    id: &str,
    archived: bool,
) -> AppResult<Workspace> {
    validate_id(id, "workspace id")?;
    let affected = transaction.execute(
        "UPDATE workspaces SET is_archived = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, archived, now_ms()],
    )?;
    expect_one(affected, ENTITY)?;
    get(transaction, id)
}

/// Deletes an empty workspace. A workspace that still holds folders, documents or notes is never deleted
/// implicitly (specification §12.3): its resources must be moved first.
pub fn delete(transaction: &Transaction<'_>, id: &str) -> AppResult<()> {
    validate_id(id, "workspace id")?;
    let held = count_where(transaction, "folders", "workspace_id", id)?
        + count_where(transaction, "documents", "workspace_id", id)?
        + count_where(transaction, "notes", "workspace_id", id)?;
    if held > 0 {
        return Err(AppError::InUse {
            entity: ENTITY,
            reason: format!("{held} folders, documents or notes still belong to it"),
        });
    }
    let affected = transaction
        .execute("DELETE FROM workspaces WHERE id = ?1", [id])
        .map_err(|error| map_delete_error(error, ENTITY))?;
    expect_one(affected, ENTITY)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::open_temporary;

    fn new(name: &str) -> NewWorkspace {
        NewWorkspace {
            name: name.to_owned(),
            description: None,
            color: None,
            icon: None,
        }
    }

    #[test]
    fn create_read_update_archive_and_delete() {
        let (_dir, database) = open_temporary();
        let created = database
            .write(|tx| create(tx, &new("  Études  ")))
            .expect("create");
        assert_eq!(created.name, "Études");
        assert_eq!(created.color, TokenColor::Amber);
        assert_eq!(
            database.read(|c| get(c, &created.id)).expect("get"),
            created
        );

        let patch = WorkspacePatch {
            name: Some("Électronique".to_owned()),
            color: Some(TokenColor::Cyan),
            icon: Some("cpu".to_owned()),
            description: Some("Cours et projets".to_owned()),
        };
        let updated = database
            .write(|tx| update(tx, &created.id, &patch))
            .expect("update");
        assert_eq!(
            (updated.name.as_str(), updated.color, updated.icon.as_str()),
            ("Électronique", TokenColor::Cyan, "cpu")
        );

        let archived = database
            .write(|tx| set_archived(tx, &created.id, true))
            .expect("archive");
        assert!(archived.is_archived);
        assert!(database.read(|c| list(c, false)).expect("list").is_empty());
        assert_eq!(database.read(|c| list(c, true)).expect("list").len(), 1);

        database
            .write(|tx| delete(tx, &created.id))
            .expect("delete");
        assert!(matches!(
            database.read(|c| get(c, &created.id)),
            Err(AppError::NotFound { .. })
        ));
    }

    #[test]
    fn names_are_unique_regardless_of_case_and_spacing() {
        let (_dir, database) = open_temporary();
        database
            .write(|tx| create(tx, &new("Études supérieures")))
            .expect("first");
        let error = database
            .write(|tx| create(tx, &new("ÉTUDES   supérieures")))
            .expect_err("duplicate");
        assert!(matches!(error, AppError::NameTaken { .. }));
    }

    #[test]
    fn invalid_input_is_rejected() {
        let (_dir, database) = open_temporary();
        assert!(matches!(
            database.write(|tx| create(tx, &new("   "))),
            Err(AppError::InvalidInput(_))
        ));
        let bad_icon = NewWorkspace {
            icon: Some("../../x".to_owned()),
            ..new("Projet")
        };
        assert!(matches!(
            database.write(|tx| create(tx, &bad_icon)),
            Err(AppError::InvalidInput(_))
        ));
        assert!(matches!(
            database.read(|c| get(c, "not-an-id")),
            Err(AppError::InvalidInput(_))
        ));
    }

    #[test]
    fn workspaces_are_listed_in_creation_order() {
        let (_dir, database) = open_temporary();
        for name in ["A", "B", "C"] {
            database.write(|tx| create(tx, &new(name))).expect("create");
        }
        let names: Vec<String> = database
            .read(|c| list(c, false))
            .expect("list")
            .into_iter()
            .map(|w| w.name)
            .collect();
        assert_eq!(names, ["A", "B", "C"]);
    }

    #[test]
    fn a_workspace_holding_resources_cannot_be_deleted() {
        let (_dir, database) = open_temporary();
        let workspace = database
            .write(|tx| create(tx, &new("Travail")))
            .expect("create");
        database
            .write(|tx| crate::repo::folders::create(tx, &workspace.id, None, "Réunions"))
            .expect("folder");
        let error = database
            .write(|tx| delete(tx, &workspace.id))
            .expect_err("must be refused");
        assert!(matches!(error, AppError::InUse { .. }));
        assert!(database.read(|c| get(c, &workspace.id)).is_ok());
    }
}
