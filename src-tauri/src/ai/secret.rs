//! API keys (specification §14.3). A key lives in the operating system's credential store (the Windows
//! Credential Manager), never in the database, the logs or the interface: the database only names its entry
//! (`ai_providers.secret_ref`), and no command ever returns it. When the system store cannot be used, the key
//! is kept in memory until ARCHIVE closes, and the interface says so: it is never written anywhere in plain
//! text.

use std::collections::HashMap;
use std::fmt;
use std::sync::{Arc, Mutex, PoisonError};

use serde::Serialize;
use ts_rs::TS;
use zeroize::Zeroizing;

use crate::error::{AppError, AppResult};

/// Service name of the entries in the credential store.
pub const SERVICE: &str = "ARCHIVE";
const KEY_MIN_CHARS: usize = 8;
const KEY_MAX_CHARS: usize = 512;

/// A secret value: never printed, never serialized, wiped from memory when dropped.
#[derive(Clone)]
pub struct Secret(Zeroizing<String>);

impl Secret {
    pub fn new(value: String) -> Self {
        Self(Zeroizing::new(value))
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Secret {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("Secret(…)")
    }
}

/// Checks an API key typed by the user. The error never repeats the value.
pub fn parse_key(value: String) -> AppResult<Secret> {
    let value = Zeroizing::new(value);
    let key = value.trim();
    let length = key.chars().count();
    if !(KEY_MIN_CHARS..=KEY_MAX_CHARS).contains(&length) {
        return Err(AppError::InvalidInput(format!(
            "the API key must have between {KEY_MIN_CHARS} and {KEY_MAX_CHARS} characters"
        )));
    }
    if !key.chars().all(|character| character.is_ascii_graphic()) {
        return Err(AppError::InvalidInput(
            "the API key may only contain visible ASCII characters, without spaces".to_owned(),
        ));
    }
    Ok(Secret::new(key.to_owned()))
}

/// Name of the credential store entry holding a provider's key.
pub fn entry_name(provider_id: &str) -> String {
    format!("ai-provider:{provider_id}")
}

/// Where a key is kept.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum KeyStorage {
    /// In the operating system's credential store.
    System,
    /// In memory until ARCHIVE closes: the system store could not be used.
    Session,
}

/// Why a credential store could not be used. The description never holds a secret.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VaultError(pub String);

/// A credential store.
pub trait Vault: Send + Sync {
    fn set(&self, name: &str, secret: &Secret) -> Result<(), VaultError>;
    fn get(&self, name: &str) -> Result<Option<Secret>, VaultError>;
    fn delete(&self, name: &str) -> Result<(), VaultError>;
}

/// Describes a credential store error without its data: two variants carry the bytes of the secret.
fn describe(error: &keyring_core::Error) -> String {
    use keyring_core::Error;
    match error {
        Error::PlatformFailure(source) => format!("platform failure: {source}"),
        Error::NoStorageAccess(source) => format!("no access to the store: {source}"),
        Error::NoEntry => "no entry".to_owned(),
        Error::BadEncoding(_) => "the stored value is not UTF-8".to_owned(),
        Error::BadDataFormat(_, _) => "the stored value has an unexpected format".to_owned(),
        Error::BadStoreFormat(_) => "the store has an unexpected format".to_owned(),
        Error::TooLong(attribute, limit) => format!("{attribute} is longer than {limit}"),
        Error::Invalid(parameter, _) => format!("invalid {parameter}"),
        Error::Ambiguous(entries) => format!("{} entries match", entries.len()),
        Error::NoDefaultStore => "no credential store".to_owned(),
        Error::NotSupportedByStore(_) => "operation not supported by the store".to_owned(),
        _ => "unknown credential store error".to_owned(),
    }
}

/// A store of the `keyring-core` family: the Windows Credential Manager, or the mock store of the tests.
pub struct KeyringVault {
    store: Arc<keyring_core::api::CredentialStore>,
}

impl KeyringVault {
    pub fn new(store: Arc<keyring_core::api::CredentialStore>) -> Self {
        Self { store }
    }

    fn entry(&self, name: &str) -> Result<keyring_core::Entry, VaultError> {
        self.store
            .build(SERVICE, name, None)
            .map_err(|error| VaultError(describe(&error)))
    }
}

impl Vault for KeyringVault {
    fn set(&self, name: &str, secret: &Secret) -> Result<(), VaultError> {
        self.entry(name)?
            .set_password(secret.expose())
            .map_err(|error| VaultError(describe(&error)))
    }

    fn get(&self, name: &str) -> Result<Option<Secret>, VaultError> {
        match self.entry(name)?.get_password() {
            Ok(value) => Ok(Some(Secret::new(value))),
            Err(keyring_core::Error::NoEntry) => Ok(None),
            Err(error) => Err(VaultError(describe(&error))),
        }
    }

    fn delete(&self, name: &str) -> Result<(), VaultError> {
        match self.entry(name)?.delete_credential() {
            Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(()),
            Err(error) => Err(VaultError(describe(&error))),
        }
    }
}

/// The credential store of this platform: the Windows Credential Manager. ARCHIVE is a Windows application;
/// elsewhere (development, tests) there is none, and keys are kept for the session only.
pub fn platform_vault() -> Option<Box<dyn Vault>> {
    #[cfg(windows)]
    {
        match windows_native_keyring_store::Store::new() {
            Ok(store) => return Some(Box::new(KeyringVault::new(store))),
            Err(error) => log::warn!(
                "Windows Credential Manager unavailable: {}",
                describe(&error)
            ),
        }
    }
    None
}

/// The keys of the AI providers: in the system store when it works, otherwise in memory for the session.
pub struct Secrets {
    vault: Option<Box<dyn Vault>>,
    session: Mutex<HashMap<String, Secret>>,
}

impl Secrets {
    pub fn new(vault: Option<Box<dyn Vault>>) -> Self {
        Self {
            vault,
            session: Mutex::new(HashMap::new()),
        }
    }

    /// Whether this platform has a system credential store at all.
    pub fn system_store(&self) -> bool {
        self.vault.is_some()
    }

    fn session(&self) -> std::sync::MutexGuard<'_, HashMap<String, Secret>> {
        self.session.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Keeps a key, in the system store when possible. Returns where it went.
    pub fn store(&self, name: &str, secret: Secret) -> KeyStorage {
        if let Some(vault) = &self.vault {
            match vault.set(name, &secret) {
                Ok(()) => {
                    self.session().remove(name);
                    return KeyStorage::System;
                }
                Err(VaultError(reason)) => log::warn!(
                    "credential store unavailable ({reason}): the key is kept for this session only"
                ),
            }
        }
        self.session().insert(name.to_owned(), secret);
        // An older key of the same entry must not outlive the new one in the system store.
        if let Some(vault) = &self.vault
            && let Err(VaultError(reason)) = vault.delete(name)
        {
            log::warn!("an older key could not be removed from the credential store: {reason}");
        }
        KeyStorage::Session
    }

    /// The key of an entry, and where it is kept. `stored` says whether the system store should hold one.
    pub fn read(&self, name: &str, stored: bool) -> AppResult<Option<(Secret, KeyStorage)>> {
        if let Some(secret) = self.session().get(name) {
            return Ok(Some((secret.clone(), KeyStorage::Session)));
        }
        match (&self.vault, stored) {
            (Some(vault), true) => match vault.get(name) {
                Ok(secret) => Ok(secret.map(|secret| (secret, KeyStorage::System))),
                Err(VaultError(reason)) => Err(AppError::Credentials(reason)),
            },
            _ => Ok(None),
        }
    }

    /// Whether a key is kept in memory for this session.
    pub fn in_session(&self, name: &str) -> bool {
        self.session().contains_key(name)
    }

    /// Forgets a key everywhere.
    pub fn remove(&self, name: &str) -> AppResult<()> {
        self.session().remove(name);
        match &self.vault {
            Some(vault) => vault
                .delete(name)
                .map_err(|VaultError(reason)| AppError::Credentials(reason)),
            None => Ok(()),
        }
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// A store that always fails, like a locked or missing credential store.
    pub(crate) struct BrokenVault;

    impl Vault for BrokenVault {
        fn set(&self, _: &str, _: &Secret) -> Result<(), VaultError> {
            Err(VaultError("no access to the store".to_owned()))
        }
        fn get(&self, _: &str) -> Result<Option<Secret>, VaultError> {
            Err(VaultError("no access to the store".to_owned()))
        }
        fn delete(&self, _: &str) -> Result<(), VaultError> {
            Err(VaultError("no access to the store".to_owned()))
        }
    }

    pub(crate) fn mock_vault() -> Box<dyn Vault> {
        Box::new(KeyringVault::new(
            keyring_core::mock::Store::new().expect("mock store"),
        ))
    }

    #[test]
    fn a_key_is_checked_without_ever_being_repeated() {
        assert_eq!(
            parse_key("  sk-test-0123456789  ".to_owned())
                .expect("valid")
                .expose(),
            "sk-test-0123456789"
        );
        for invalid in ["short", "sk-with space-0123", "sk-accentué-0123", ""] {
            let error = parse_key(invalid.to_owned()).expect_err(invalid);
            let message = error.to_string();
            assert!(
                invalid.is_empty() || !message.contains(invalid.trim()),
                "{message}"
            );
        }
        assert!(parse_key("k".repeat(513)).is_err());
        assert_eq!(
            format!("{:?}", Secret::new("sk-hidden".to_owned())),
            "Secret(…)"
        );
    }

    #[test]
    fn keys_go_to_the_system_store_and_never_stay_in_memory() {
        let secrets = Secrets::new(Some(mock_vault()));
        let name = entry_name("provider-1");
        assert!(secrets.system_store());
        assert_eq!(
            secrets.store(&name, Secret::new("sk-first-key-0001".to_owned())),
            KeyStorage::System
        );
        assert!(!secrets.in_session(&name));
        let (key, storage) = secrets.read(&name, true).expect("read").expect("key");
        assert_eq!(
            (key.expose(), storage),
            ("sk-first-key-0001", KeyStorage::System)
        );
        // Not marked as stored: the store is not even asked.
        assert!(secrets.read(&name, false).expect("read").is_none());

        secrets.remove(&name).expect("removed");
        assert!(secrets.read(&name, true).expect("read").is_none());
        secrets.remove(&name).expect("removing twice is harmless");
    }

    #[test]
    fn without_a_usable_store_the_key_lives_for_the_session_only() {
        for vault in [Some(Box::new(BrokenVault) as Box<dyn Vault>), None] {
            let secrets = Secrets::new(vault);
            let name = entry_name("provider-2");
            assert_eq!(
                secrets.store(&name, Secret::new("sk-session-key-02".to_owned())),
                KeyStorage::Session
            );
            assert!(secrets.in_session(&name));
            let (key, storage) = secrets.read(&name, false).expect("read").expect("key");
            assert_eq!(
                (key.expose(), storage),
                ("sk-session-key-02", KeyStorage::Session)
            );
            secrets.session().remove(&name);
            assert!(!secrets.in_session(&name));
        }
        // A store that fails on reading is reported, never taken for « no key ».
        let secrets = Secrets::new(Some(Box::new(BrokenVault)));
        assert!(matches!(
            secrets.read("ai-provider:x", true),
            Err(AppError::Credentials(_))
        ));
    }

    #[cfg(windows)]
    #[test]
    fn the_windows_credential_manager_keeps_and_forgets_a_key() {
        let secrets = Secrets::new(platform_vault());
        assert!(secrets.system_store(), "Credential Manager available");
        let name = entry_name(&format!("test-{}", crate::util::new_id()));
        assert_eq!(
            secrets.store(&name, Secret::new("sk-windows-test-0003".to_owned())),
            KeyStorage::System
        );
        let fresh = Secrets::new(platform_vault());
        let (key, storage) = fresh.read(&name, true).expect("read").expect("key");
        assert_eq!(
            (key.expose(), storage),
            ("sk-windows-test-0003", KeyStorage::System)
        );
        fresh.remove(&name).expect("removed");
        assert!(fresh.read(&name, true).expect("read").is_none());
    }
}
