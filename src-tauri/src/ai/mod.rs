//! AI layer (specification §14, ARCHITECTURE.md §11). AI is optional: nothing here runs without a provider the
//! user configured, and nothing is sent without an explicit action of the user.
//!
//! - [`provider`]: what every provider offers, and the [`anthropic`], [`openai`] and [`gemini`] implementations,
//!   which build requests and read responses without doing any I/O;
//! - [`http`]: the only place that talks to the network, from the core (never from the interface);
//! - [`secret`]: the API keys, in the operating system's credential store;
//! - [`config`]: the configured providers; [`retrieval`], [`prompt`], [`conversations`] and [`assistant`]:
//!   the knowledge-grounded assistant.

pub mod anthropic;
pub mod assistant;
pub mod config;
pub mod conversations;
pub mod gemini;
pub mod http;
pub mod openai;
pub mod prompt;
pub mod provider;
pub mod retrieval;
pub mod secret;
pub mod sse;
#[cfg(test)]
mod test_server;
