use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

/// The default agent seeded into ~/.verbalis/agents. Shared with the web
/// build's storage fallback (`src/lib/storage.ts`).
const DEFAULT_AGENT_CONTENT: &str = include_str!("../../src/lib/toolbox/default-agent.md");

/// Get the user's home directory
#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|h| h.to_string_lossy().to_string())
        .ok_or_else(|| "Could not find home directory".to_string())
}

/// The app data directory (~/.verbalis)
fn app_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    Ok(home.join(".verbalis"))
}

/// Get the app data directory (~/.verbalis)
#[tauri::command]
pub fn get_app_data_dir() -> Result<String, String> {
    Ok(app_dir()?.to_string_lossy().to_string())
}

/// Initialize the app data directory structure
#[tauri::command]
pub fn init_app_data_dir() -> Result<(), String> {
    let app_dir = app_dir()?;

    let subdirs = [
        "chats",
        "memories",
        "agents",
        "prompts",
        "skills",
        "workflows",
        "tasks",
        "scheduler",
        "logs",
        "images",
    ];

    // Create main directory and subdirectories
    for subdir in subdirs {
        let path = app_dir.join(subdir);
        fs::create_dir_all(&path).map_err(|e| format!("Failed to create {}: {}", subdir, e))?;
    }

    // Create default agent if it doesn't exist
    let default_agent_path = app_dir.join("agents").join("default.md");
    if !default_agent_path.exists() {
        fs::write(&default_agent_path, DEFAULT_AGENT_CONTENT)
            .map_err(|e| format!("Failed to write default agent: {}", e))?;
    }

    // Migrate old log path (~/.verbalis/log.txt → ~/.verbalis/logs/agent.txt)
    let old_log = app_dir.join("log.txt");
    let new_log = app_dir.join("logs").join("agent.txt");
    if old_log.exists() && !new_log.exists() {
        let _ = fs::rename(&old_log, &new_log);
    }

    Ok(())
}

/// Read a directory tree recursively (with max depth)
#[tauri::command]
pub async fn read_directory(path: String, max_depth: Option<u32>) -> Result<Vec<FileNode>, String> {
    let path = expand_tilde(&path);
    let path = Path::new(&path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }

    let max_depth = max_depth.unwrap_or(3);
    read_directory_recursive(path, 0, max_depth)
}

fn read_directory_recursive(
    path: &Path,
    current_depth: u32,
    max_depth: u32,
) -> Result<Vec<FileNode>, String> {
    let mut nodes = Vec::new();

    let entries = fs::read_dir(path).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let entry_path = entry.path();
        let name = entry
            .file_name()
            .to_string_lossy()
            .to_string();

        // Skip hidden files and common ignore patterns
        if name.starts_with('.') || name == "node_modules" || name == "target" || name == "dist" {
            continue;
        }

        let is_directory = entry_path.is_dir();
        let children = if is_directory && current_depth < max_depth {
            Some(read_directory_recursive(&entry_path, current_depth + 1, max_depth)?)
        } else if is_directory {
            Some(Vec::new()) // Empty children, can be loaded on demand
        } else {
            None
        };

        nodes.push(FileNode {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_directory,
            children,
        });
    }

    // Sort: directories first, then alphabetically
    nodes.sort_by(|a, b| {
        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(nodes)
}

/// Read a file's content
#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    let path = expand_tilde(&path);
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

/// Write content to a file
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    let path = expand_tilde(&path);
    let path = Path::new(&path);

    // Create parent directories if they don't exist
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directories: {}", e))?;
    }

    fs::write(path, content).map_err(|e| format!("Failed to write file: {}", e))
}

/// Write binary data (base64-encoded) to a file
#[tauri::command]
pub async fn write_file_base64(path: String, data_base64: String) -> Result<(), String> {
    use base64::Engine;
    let path = expand_tilde(&path);
    let path = Path::new(&path);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directories: {}", e))?;
    }

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|e| format!("Failed to decode base64 data: {}", e))?;
    fs::write(path, bytes).map_err(|e| format!("Failed to write file: {}", e))
}

/// Read a file and return its contents base64-encoded
#[tauri::command]
pub async fn read_file_base64(path: String) -> Result<String, String> {
    use base64::Engine;
    let path = expand_tilde(&path);
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Reveal a file in the OS file manager (Finder/Explorer)
#[tauri::command]
pub async fn reveal_in_folder(path: String) -> Result<(), String> {
    let path = expand_tilde(&path);

    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg("-R").arg(&path).spawn();

    #[cfg(target_os = "windows")]
    let result = Command::new("explorer").arg(format!("/select,{}", path)).spawn();

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let result = {
        // No standard "reveal" on Linux — open the containing directory
        let parent = Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(path.clone());
        Command::new("xdg-open").arg(parent).spawn()
    };

    result.map_err(|e| format!("Failed to reveal in folder: {}", e))?;
    Ok(())
}

/// Copy a file to a new location (creates parent directories)
#[tauri::command]
pub async fn copy_file(source_path: String, dest_path: String) -> Result<(), String> {
    let source = expand_tilde(&source_path);
    let dest = expand_tilde(&dest_path);
    let dest = Path::new(&dest);

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directories: {}", e))?;
    }

    fs::copy(&source, dest).map_err(|e| format!("Failed to copy file: {}", e))?;
    Ok(())
}

/// Delete a file or directory
#[tauri::command]
pub async fn delete_path(path: String) -> Result<(), String> {
    let path = expand_tilde(&path);
    let path = Path::new(&path);

    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| format!("Failed to delete directory: {}", e))
    } else {
        fs::remove_file(path).map_err(|e| format!("Failed to delete file: {}", e))
    }
}

/// Create a directory
#[tauri::command]
pub async fn create_directory(path: String) -> Result<(), String> {
    let path = expand_tilde(&path);
    fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory: {}", e))
}

/// Check if a path exists
#[tauri::command]
pub fn path_exists(path: String) -> bool {
    let path = expand_tilde(&path);
    Path::new(&path).exists()
}

/// List files in a directory matching a pattern
/// Returns filenames without extension (e.g., "my-agent" instead of "/path/to/my-agent.yaml")
#[tauri::command]
pub fn list_files(dir: String, extension: Option<String>) -> Result<Vec<String>, String> {
    let dir = expand_tilde(&dir);
    let path = Path::new(&dir);

    if !path.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let entry_path = entry.path();

        if entry_path.is_file() {
            let matches = if let Some(ref ext) = extension {
                entry_path.extension().and_then(|e| e.to_str()) == Some(ext)
            } else {
                true
            };

            if matches {
                // Return just the filename without extension (matches web storage behavior)
                if let Some(stem) = entry_path.file_stem() {
                    files.push(stem.to_string_lossy().to_string());
                }
            }
        }
    }

    files.sort();
    Ok(files)
}

/// Expand ~ to home directory
fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") {
        if let Some(home) = dirs::home_dir() {
            return format!("{}{}", home.display(), &path[1..]);
        }
    }
    path.to_string()
}

// ============================================================================
// HTTP Requests
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub duration_ms: u64,
}

/// Make an HTTP request
#[tauri::command]
pub async fn http_request(
    url: String,
    method: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<HttpResponse, String> {
    let start = std::time::Instant::now();
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(30000)); // Default 30s

    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let method = method.to_uppercase();
    let mut request = match method.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "PATCH" => client.patch(&url),
        "HEAD" => client.head(&url),
        _ => return Err(format!("Unsupported HTTP method: {}", method)),
    };

    // Add headers
    if let Some(hdrs) = headers {
        for (key, value) in hdrs {
            request = request.header(&key, &value);
        }
    }

    // Add body
    if let Some(b) = body {
        request = request.body(b);
    }

    let response = request.send().await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status().as_u16();
    let headers: HashMap<String, String> = response.headers()
        .iter()
        .map(|(k, v)| {
            let value = v.to_str().unwrap_or_else(|_| {
                log::warn!("Dropping non-UTF8 value for response header {}", k);
                ""
            });
            (k.to_string(), value.to_string())
        })
        .collect();

    let body = response.text().await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    let duration_ms = start.elapsed().as_millis() as u64;

    Ok(HttpResponse {
        status,
        headers,
        body,
        duration_ms,
    })
}

/// Rename/move a file or directory
#[tauri::command]
pub async fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    let old_path = expand_tilde(&old_path);
    let new_path = expand_tilde(&new_path);

    let old = Path::new(&old_path);
    let new = Path::new(&new_path);

    if !old.exists() {
        return Err(format!("Source path does not exist: {}", old_path));
    }

    // Create parent directories for the new path if needed
    if let Some(parent) = new.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directories: {}", e))?;
    }

    fs::rename(old, new).map_err(|e| format!("Failed to rename: {}", e))
}

// ============================================================================
// Debug Logging
// ============================================================================

/// Get the logs directory (~/.verbalis/logs)
fn get_logs_dir() -> Result<PathBuf, String> {
    Ok(app_dir()?.join("logs"))
}

/// Rejects log filenames that could escape the logs directory.
fn validate_log_filename(filename: &str) -> Result<(), String> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Invalid filename".to_string());
    }
    Ok(())
}

/// Get the log file path (~/.verbalis/logs/agent.txt)
fn get_log_path() -> Result<PathBuf, String> {
    Ok(get_logs_dir()?.join("agent.txt"))
}

/// Append a line to the debug log file
#[tauri::command]
pub fn append_log(line: String) -> Result<(), String> {
    use std::io::Write;

    let log_path = get_log_path()?;

    // Ensure the directory exists
    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create log directory: {}", e))?;
    }

    // Open file in append mode, create if doesn't exist
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    // Write the line with a newline
    writeln!(file, "{}", line)
        .map_err(|e| format!("Failed to write to log file: {}", e))?;

    Ok(())
}

/// Clear the debug log file
#[tauri::command]
pub fn clear_log() -> Result<(), String> {
    let log_path = get_log_path()?;

    if log_path.exists() {
        fs::write(&log_path, "")
            .map_err(|e| format!("Failed to clear log file: {}", e))?;
    }

    Ok(())
}

/// Read the debug log file contents
#[tauri::command]
pub fn read_log() -> Result<String, String> {
    let log_path = get_log_path()?;

    if !log_path.exists() {
        return Ok(String::new());
    }

    fs::read_to_string(&log_path)
        .map_err(|e| format!("Failed to read log file: {}", e))
}

/// List log files in ~/.verbalis/logs/
#[tauri::command]
pub fn list_log_files() -> Result<Vec<String>, String> {
    let logs_dir = get_logs_dir()?;

    if !logs_dir.exists() {
        return Ok(Vec::new());
    }

    let entries =
        fs::read_dir(&logs_dir).map_err(|e| format!("Failed to read logs directory: {}", e))?;

    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        if path.is_file() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                files.push(name.to_string());
            }
        }
    }

    files.sort();
    Ok(files)
}

/// Read a specific log file from ~/.verbalis/logs/
#[tauri::command]
pub fn read_log_file(filename: String) -> Result<String, String> {
    validate_log_filename(&filename)?;

    let log_path = get_logs_dir()?.join(&filename);

    if !log_path.exists() {
        return Ok(String::new());
    }

    fs::read_to_string(&log_path).map_err(|e| format!("Failed to read log file: {}", e))
}

/// Append a line to a specific log file in ~/.verbalis/logs/
#[tauri::command]
pub fn append_log_file(filename: String, line: String) -> Result<(), String> {
    validate_log_filename(&filename)?;

    let logs_dir = get_logs_dir()?;
    if !logs_dir.exists() {
        fs::create_dir_all(&logs_dir)
            .map_err(|e| format!("Failed to create logs directory: {}", e))?;
    }

    let log_path = logs_dir.join(&filename);

    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    use std::io::Write;
    writeln!(file, "{}", line).map_err(|e| format!("Failed to write to log file: {}", e))?;

    Ok(())
}

/// Clear a specific log file in ~/.verbalis/logs/
#[tauri::command]
pub fn clear_log_file(filename: String) -> Result<(), String> {
    validate_log_filename(&filename)?;

    let log_path = get_logs_dir()?.join(&filename);

    if log_path.exists() {
        fs::write(&log_path, "").map_err(|e| format!("Failed to clear log file: {}", e))?;
    }

    Ok(())
}

/// Overwrite a log file with the given content (for debug logging of API requests, etc.)
#[tauri::command]
pub fn write_log_file(filename: String, content: String) -> Result<(), String> {
    validate_log_filename(&filename)?;

    let log_path = get_logs_dir()?.join(&filename);
    fs::write(&log_path, content).map_err(|e| format!("Failed to write log file: {}", e))?;

    Ok(())
}

// ============================================================================
// Keychain (OS Secure Storage)
// ============================================================================

const KEYCHAIN_SERVICE: &str = "com.verbalis.app";

/// Store an API key in the OS keychain
#[tauri::command]
pub fn store_api_key(provider: String, key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &provider)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
    entry
        .set_password(&key)
        .map_err(|e| format!("Failed to store key in keychain: {}", e))
}

/// Get an API key from the OS keychain. Returns None if not found.
#[tauri::command]
pub fn get_api_key(provider: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &provider)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to read key from keychain: {}", e)),
    }
}

/// Delete an API key from the OS keychain. Idempotent (no error if missing).
#[tauri::command]
pub fn delete_api_key(provider: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &provider)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to delete key from keychain: {}", e)),
    }
}

/// Load all API keys from the OS keychain in one call.
#[tauri::command]
pub fn get_all_api_keys() -> Result<HashMap<String, String>, String> {
    let providers = ["anthropic", "openai", "google", "openrouter"];
    let mut keys = HashMap::new();
    for provider in providers {
        let entry = keyring::Entry::new(KEYCHAIN_SERVICE, provider)
            .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
        match entry.get_password() {
            Ok(password) => {
                keys.insert(provider.to_string(), password);
            }
            Err(keyring::Error::NoEntry) => {}
            Err(e) => {
                log::warn!("Failed to read {} key from keychain: {}", provider, e);
            }
        }
    }
    Ok(keys)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_log_filename_rejects_traversal() {
        assert!(validate_log_filename("agent.txt").is_ok());
        assert!(validate_log_filename("../secrets").is_err());
        assert!(validate_log_filename("sub/agent.txt").is_err());
        assert!(validate_log_filename("sub\\agent.txt").is_err());
        assert!(validate_log_filename("..").is_err());
    }

    #[test]
    fn default_agent_has_frontmatter() {
        assert!(DEFAULT_AGENT_CONTENT.starts_with("---\nname: default\n"));
    }
}
