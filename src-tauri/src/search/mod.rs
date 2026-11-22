//! Full-text search (specification §9, ARCHITECTURE.md §9): the index kept by the write transactions, the
//! queries, and the history of searches.

pub mod expression;
pub mod history;
pub mod index;
pub mod query;

#[cfg(test)]
mod tests;
