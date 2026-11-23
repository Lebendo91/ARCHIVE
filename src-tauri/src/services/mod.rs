//! Business operations that combine several repositories and record their timeline events, always inside
//! one transaction.

pub mod dashboard;
pub mod documents;
pub mod graph;
pub mod notes;
pub mod relations;
pub mod workspaces;

#[cfg(test)]
mod timeline_tests;
