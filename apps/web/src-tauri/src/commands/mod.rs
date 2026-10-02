//! Tauri commands, one module per area. `lib.rs` registers them by path.

pub mod fs;
pub mod http;
pub mod keychain;
pub mod logs;

use std::path::PathBuf;

/// The app data directory (~/.verbalis)
pub(crate) fn app_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    Ok(home.join(".verbalis"))
}
