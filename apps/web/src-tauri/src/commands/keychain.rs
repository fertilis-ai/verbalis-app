//! API keys in the OS keychain.
//!
//! All keys live in a single keychain item (a JSON map of provider -> key) so that
//! launching the app costs at most one keychain access. On macOS each access by an
//! untrusted binary is a separate password prompt.

use std::collections::HashMap;

const KEYCHAIN_SERVICE: &str = "com.verbalis.app";
const KEYCHAIN_ACCOUNT: &str = "api-keys";

/// Providers that were stored as one keychain item each before keys were consolidated.
const LEGACY_PROVIDERS: [&str; 4] = ["anthropic", "openai", "google", "openrouter"];

fn entry(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, account)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))
}

/// Read the key map. `None` means the item does not exist yet.
fn read_keys() -> Result<Option<HashMap<String, String>>, String> {
    match entry(KEYCHAIN_ACCOUNT)?.get_password() {
        Ok(json) => serde_json::from_str(&json)
            .map(Some)
            .map_err(|e| format!("Failed to parse keys from keychain: {}", e)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to read keys from keychain: {}", e)),
    }
}

fn write_keys(keys: &HashMap<String, String>) -> Result<(), String> {
    let json = serde_json::to_string(keys)
        .map_err(|e| format!("Failed to serialize keys: {}", e))?;
    entry(KEYCHAIN_ACCOUNT)?
        .set_password(&json)
        .map_err(|e| format!("Failed to store keys in keychain: {}", e))
}

/// Move per-provider items into the single item. Looking up a missing item does not
/// prompt, so this only costs extra accesses for keys that actually exist.
fn migrate_legacy_keys() -> Result<HashMap<String, String>, String> {
    let mut keys = HashMap::new();
    let mut legacy = Vec::new();
    let mut complete = true;
    for provider in LEGACY_PROVIDERS {
        let legacy_entry = entry(provider)?;
        match legacy_entry.get_password() {
            Ok(password) => {
                if !password.is_empty() {
                    keys.insert(provider.to_string(), password);
                }
                legacy.push((provider, legacy_entry));
            }
            Err(keyring::Error::NoEntry) => {}
            Err(e) => {
                log::warn!("Failed to read legacy {} key from keychain: {}", provider, e);
                complete = false;
            }
        }
    }
    // Writing the single item ends migration for good. If any read failed (e.g. the
    // user denied the prompt), fail instead so nothing creates the item without that
    // key; migration retries on the next launch.
    if !complete {
        return Err("Failed to read legacy keys from keychain".to_string());
    }
    if legacy.is_empty() {
        return Ok(keys);
    }
    write_keys(&keys)?;
    for (provider, legacy_entry) in legacy {
        if let Err(e) = legacy_entry.delete_credential() {
            log::warn!("Failed to delete legacy {} key from keychain: {}", provider, e);
        }
    }
    Ok(keys)
}

fn load_keys() -> Result<HashMap<String, String>, String> {
    match read_keys()? {
        Some(keys) => Ok(keys),
        None => migrate_legacy_keys(),
    }
}

/// Store an API key in the OS keychain. An empty key removes the provider.
#[tauri::command]
pub fn store_api_key(provider: String, key: String) -> Result<(), String> {
    let mut keys = load_keys()?;
    if key.is_empty() {
        if keys.remove(&provider).is_none() {
            return Ok(());
        }
    } else if keys.get(&provider) == Some(&key) {
        return Ok(());
    } else {
        keys.insert(provider, key);
    }
    write_keys(&keys)
}

/// Get an API key from the OS keychain. Returns None if not found.
#[tauri::command]
pub fn get_api_key(provider: String) -> Result<Option<String>, String> {
    Ok(load_keys()?.remove(&provider))
}

/// Delete an API key from the OS keychain. Idempotent (no error if missing).
#[tauri::command]
pub fn delete_api_key(provider: String) -> Result<(), String> {
    store_api_key(provider, String::new())
}

/// Load all API keys from the OS keychain in one call.
#[tauri::command]
pub fn get_all_api_keys() -> Result<HashMap<String, String>, String> {
    load_keys()
}
