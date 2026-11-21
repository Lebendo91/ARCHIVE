//! Folders: a tree inside a workspace (specification §5.1, §12.1).

use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};
use serde::Serialize;
use ts_rs::TS;

use super::{count_where, expect_one, map_delete_error, map_write_error};
use crate::error::{AppError, AppResult};
use crate::util::{clean_name, name_key, new_id, now_ms, validate_id};

const ENTITY: &str = "folder";
pub const NAME_MAX: usize = 120;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Folder {
    pub id: String,
    pub workspace_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
}

const COLUMNS: &str = "id, workspace_id, parent_id, name, created_at, updated_at";

fn from_row(row: &Row<'_>) -> rusqlite::Result<Folder> {
    Ok(Folder {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        parent_id: row.get(2)?,
        name: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

pub fn get(connection: &Connection, id: &str) -> AppResult<Folder> {
    validate_id(id, "folder id")?;
    connection
        .query_row(
            &format!("SELECT {COLUMNS} FROM folders WHERE id = ?1"),
            [id],
            from_row,
        )
        .optional()?
        .ok_or(AppError::NotFound { entity: ENTITY })
}

pub fn list_for_workspace(connection: &Connection, workspace_id: &str) -> AppResult<Vec<Folder>> {
    validate_id(workspace_id, "workspace id")?;
    let mut statement = connection.prepare(&format!(
        "SELECT {COLUMNS} FROM folders WHERE workspace_id = ?1 ORDER BY name_key"
    ))?;
    let rows = statement.query_map([workspace_id], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn check_parent(
    connection: &Connection,
    workspace_id: &str,
    parent_id: Option<&str>,
) -> AppResult<()> {
    if let Some(parent_id) = parent_id {
        let parent = get(connection, parent_id)?;
        if parent.workspace_id != workspace_id {
            return Err(AppError::InvalidInput(
                "the parent folder belongs to another workspace".to_owned(),
            ));
        }
    }
    Ok(())
}

pub fn create(
    transaction: &Transaction<'_>,
    workspace_id: &str,
    parent_id: Option<&str>,
    name: &str,
) -> AppResult<Folder> {
    crate::repo::workspaces::get(transaction, workspace_id)?;
    check_parent(transaction, workspace_id, parent_id)?;
    let name = clean_name(name, "folder name", NAME_MAX)?;
    let now = now_ms();
    let folder = Folder {
        id: new_id(),
        workspace_id: workspace_id.to_owned(),
        parent_id: parent_id.map(str::to_owned),
        name,
        created_at: now,
        updated_at: now,
    };
    transaction
        .execute(
            "INSERT INTO folders (id, workspace_id, parent_id, name, name_key, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![folder.id, folder.workspace_id, folder.parent_id, folder.name, name_key(&folder.name), now],
        )
        .map_err(|error| map_write_error(error, ENTITY))?;
    Ok(folder)
}

pub fn rename(transaction: &Transaction<'_>, id: &str, name: &str) -> AppResult<Folder> {
    validate_id(id, "folder id")?;
    let name = clean_name(name, "folder name", NAME_MAX)?;
    let affected = transaction
        .execute(
            "UPDATE folders SET name = ?2, name_key = ?3, updated_at = ?4 WHERE id = ?1",
            params![id, name, name_key(&name), now_ms()],
        )
        .map_err(|error| map_write_error(error, ENTITY))?;
    expect_one(affected, ENTITY)?;
    get(transaction, id)
}

/// Moves a folder under another parent of the same workspace (or to the root), refusing cycles.
pub fn move_to(
    transaction: &Transaction<'_>,
    id: &str,
    new_parent_id: Option<&str>,
) -> AppResult<Folder> {
    let folder = get(transaction, id)?;
    check_parent(transaction, &folder.workspace_id, new_parent_id)?;
    let mut ancestor = new_parent_id.map(str::to_owned);
    while let Some(current) = ancestor {
        if current == folder.id {
            return Err(AppError::InvalidInput(
                "a folder cannot be moved inside itself".to_owned(),
            ));
        }
        ancestor = get(transaction, &current)?.parent_id;
    }
    let affected = transaction
        .execute(
            "UPDATE folders SET parent_id = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, new_parent_id, now_ms()],
        )
        .map_err(|error| map_write_error(error, ENTITY))?;
    expect_one(affected, ENTITY)?;
    get(transaction, id)
}

/// Deletes an empty folder. Sub-folders, documents and notes must be moved or deleted first.
pub fn delete(transaction: &Transaction<'_>, id: &str) -> AppResult<()> {
    validate_id(id, "folder id")?;
    let held = count_where(transaction, "folders", "parent_id", id)?
        + count_where(transaction, "documents", "folder_id", id)?
        + count_where(transaction, "notes", "folder_id", id)?;
    if held > 0 {
        return Err(AppError::InUse {
            entity: ENTITY,
            reason: format!("{held} folders, documents or notes are still inside"),
        });
    }
    let affected = transaction
        .execute("DELETE FROM folders WHERE id = ?1", [id])
        .map_err(|error| map_delete_error(error, ENTITY))?;
    expect_one(affected, ENTITY)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::open_temporary;
    use crate::repo::workspaces::{self, NewWorkspace};

    fn workspace(database: &crate::db::Database, name: &str) -> String {
        database
            .write(|tx| {
                workspaces::create(
                    tx,
                    &NewWorkspace {
                        name: name.to_owned(),
                        description: None,
                        color: None,
                        icon: None,
                    },
                )
            })
            .expect("workspace")
            .id
    }

    #[test]
    fn folders_form_a_tree_with_unique_names_per_level() {
        let (_dir, database) = open_temporary();
        let ws = workspace(&database, "Études");
        let root = database
            .write(|tx| create(tx, &ws, None, "Cours"))
            .expect("root");
        let child = database
            .write(|tx| create(tx, &ws, Some(&root.id), "Électronique"))
            .expect("child");
        assert_eq!(child.parent_id.as_deref(), Some(root.id.as_str()));
        assert!(matches!(
            database.write(|tx| create(tx, &ws, None, "COURS")),
            Err(AppError::NameTaken { .. })
        ));
        database
            .write(|tx| create(tx, &ws, Some(&root.id), "Cours"))
            .expect("same name at another level");
        assert_eq!(
            database
                .read(|c| list_for_workspace(c, &ws))
                .expect("list")
                .len(),
            3
        );
    }

    #[test]
    fn moving_a_folder_inside_itself_is_refused() {
        let (_dir, database) = open_temporary();
        let ws = workspace(&database, "Projets");
        let parent = database.write(|tx| create(tx, &ws, None, "A")).expect("a");
        let child = database
            .write(|tx| create(tx, &ws, Some(&parent.id), "B"))
            .expect("b");
        assert!(matches!(
            database.write(|tx| move_to(tx, &parent.id, Some(&child.id))),
            Err(AppError::InvalidInput(_))
        ));
        let moved = database
            .write(|tx| move_to(tx, &child.id, None))
            .expect("move to root");
        assert!(moved.parent_id.is_none());
    }

    #[test]
    fn a_parent_from_another_workspace_is_refused() {
        let (_dir, database) = open_temporary();
        let first = workspace(&database, "Un");
        let second = workspace(&database, "Deux");
        let foreign = database
            .write(|tx| create(tx, &second, None, "Ailleurs"))
            .expect("folder");
        assert!(matches!(
            database.write(|tx| create(tx, &first, Some(&foreign.id), "Ici")),
            Err(AppError::InvalidInput(_))
        ));
    }

    #[test]
    fn only_empty_folders_can_be_deleted() {
        let (_dir, database) = open_temporary();
        let ws = workspace(&database, "Notes");
        let parent = database
            .write(|tx| create(tx, &ws, None, "Parent"))
            .expect("parent");
        let child = database
            .write(|tx| create(tx, &ws, Some(&parent.id), "Enfant"))
            .expect("child");
        assert!(matches!(
            database.write(|tx| delete(tx, &parent.id)),
            Err(AppError::InUse { .. })
        ));
        database
            .write(|tx| delete(tx, &child.id))
            .expect("delete child");
        database
            .write(|tx| delete(tx, &parent.id))
            .expect("delete parent");
        assert!(
            database
                .read(|c| list_for_workspace(c, &ws))
                .expect("list")
                .is_empty()
        );
    }

    #[test]
    fn renaming_keeps_names_unique() {
        let (_dir, database) = open_temporary();
        let ws = workspace(&database, "Travail");
        database
            .write(|tx| create(tx, &ws, None, "Clients"))
            .expect("a");
        let other = database
            .write(|tx| create(tx, &ws, None, "Fournisseurs"))
            .expect("b");
        assert!(matches!(
            database.write(|tx| rename(tx, &other.id, "clients")),
            Err(AppError::NameTaken { .. })
        ));
        assert_eq!(
            database
                .write(|tx| rename(tx, &other.id, "Partenaires"))
                .expect("rename")
                .name,
            "Partenaires"
        );
    }
}
