use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppConfig {
    pub theme: String,
    pub working_directory: String,
    pub user_mode: String,
    pub yolo: bool,
    pub sandboxed: bool,
    pub guardrails: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            working_directory: dirs::home_dir()
                .map(|h| h.join("Projects").to_string_lossy().to_string())
                .unwrap_or_else(|| "~/Projects".to_string()),
            user_mode: "normal".to_string(),
            yolo: false,
            sandboxed: true,
            guardrails: true,
        }
    }
}

const DEFAULT_AGENT_CONTENT: &str = r#"---
name: default
model: claude-sonnet-4-20250514
temperature: 0.3
---

You are the default orchestration agent for chat. Your job is to coordinate tool use and reasoning to solve user requests efficiently, safely, and transparently.

Core behavior:
- Be tool-first when tools are available and likely to reduce uncertainty or effort.
- Keep plans concise and in-line unless the user explicitly wants a longer plan.
- Ask a brief clarifying question only when it materially reduces risk or rework.
- If multiple paths exist, present 2-3 options with a clear recommendation.

Tool use policy:
- Prefer precise tools over speculation. Use search, file inspection, or commands to verify.
- Use the minimum number of tools needed to reach a reliable answer.
- For potentially destructive actions (delete, overwrite, reset, install system-wide), ask for confirmation first.
- When using shell commands:
  - Prefer read-only commands first (rg, ls, cat) before edits.
  - Avoid long-running or noisy commands unless necessary.
  - Summarize results and show key outputs.

Execution strategy:
1. Restate the goal briefly.
2. Decide whether tools are required.
3. Execute tools in a safe, incremental order.
4. Summarize findings and propose next steps.
5. Confirm before any risky changes.

Quality and safety:
- Never assume facts that can be quickly verified.
- Preserve user data and existing project structure.
- Avoid unnecessary edits or churn.
- If uncertain, be explicit and offer a safe fallback.

Response style:
- Be warm, direct, and collaborative.
- Keep responses focused and actionable.
- Use clear formatting for commands and file paths.
- End with suggested next steps when appropriate.
"#;

/// Get the user's home directory
#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|h| h.to_string_lossy().to_string())
        .ok_or_else(|| "Could not find home directory".to_string())
}

/// Get the app data directory (~/.sapio)
#[tauri::command]
pub fn get_app_data_dir() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let app_dir = home.join(".sapio");
    Ok(app_dir.to_string_lossy().to_string())
}

/// Initialize the app data directory structure
#[tauri::command]
pub fn init_app_data_dir() -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let app_dir = home.join(".sapio");

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
    ];

    // Create main directory and subdirectories
    for subdir in subdirs {
        let path = app_dir.join(subdir);
        fs::create_dir_all(&path).map_err(|e| format!("Failed to create {}: {}", subdir, e))?;
    }

    // Create default config if it doesn't exist
    let config_path = app_dir.join("config.yaml");
    if !config_path.exists() {
        let default_config = AppConfig::default();
        let yaml = serde_yaml::to_string(&default_config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        fs::write(&config_path, yaml).map_err(|e| format!("Failed to write config: {}", e))?;
    }

    // Create default agent if it doesn't exist
    let default_agent_path = app_dir.join("agents").join("default.md");
    if !default_agent_path.exists() {
        fs::write(&default_agent_path, DEFAULT_AGENT_CONTENT)
            .map_err(|e| format!("Failed to write default agent: {}", e))?;
    }

    // Migrate old log path (~/.sapio/log.txt → ~/.sapio/logs/agent.txt)
    let old_log = app_dir.join("log.txt");
    let new_log = app_dir.join("logs").join("agent.txt");
    if old_log.exists() && !new_log.exists() {
        let _ = fs::rename(&old_log, &new_log);
    }

    Ok(())
}

/// Read a directory tree recursively (with max depth)
#[tauri::command]
pub fn read_directory(path: String, max_depth: Option<u32>) -> Result<Vec<FileNode>, String> {
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
pub fn read_file(path: String) -> Result<String, String> {
    let path = expand_tilde(&path);
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

/// Write content to a file
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    let path = expand_tilde(&path);
    let path = Path::new(&path);

    // Create parent directories if they don't exist
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directories: {}", e))?;
    }

    fs::write(path, content).map_err(|e| format!("Failed to write file: {}", e))
}

/// Delete a file or directory
#[tauri::command]
pub fn delete_path(path: String) -> Result<(), String> {
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
pub fn create_directory(path: String) -> Result<(), String> {
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

/// Run the bundled pi sidecar with args and return combined stdout/stderr.
#[tauri::command]
pub async fn run_pi_sidecar(
    app: tauri::AppHandle,
    args: Vec<String>,
) -> Result<String, String> {
    let mut output = String::new();

    let (mut rx, _child) = app
        .shell()
        .sidecar("pi-sidecar")
        .map_err(|e| e.to_string())?
        .args(args)
        .spawn()
        .map_err(|e| e.to_string())?;
    let mut exit_code: Option<i32> = None;
    let mut exit_signal: Option<String> = None;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(data) => {
                output.push_str(&String::from_utf8_lossy(&data));
            }
            CommandEvent::Stderr(data) => {
                output.push_str(&String::from_utf8_lossy(&data));
            }
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code;
                exit_signal = payload.signal.map(|signal| signal.to_string());
                break;
            }
            _ => {}
        }
    }

    if let Some(signal) = exit_signal {
        return Err(format!("pi sidecar terminated by signal: {}", signal));
    }

    if let Some(code) = exit_code {
        if code != 0 {
            return Err(format!("pi sidecar exited with code {}: {}", code, output));
        }
    }

    Ok(output)
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
// Shell Execution
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct ShellOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
}

/// Execute a shell command with optional timeout
#[tauri::command]
pub async fn execute_shell(
    command: String,
    cwd: Option<String>,
    timeout_ms: Option<u64>,
    _sandbox: bool,
) -> Result<ShellOutput, String> {
    let start = std::time::Instant::now();
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(60000)); // Default 60s

    let shell = if cfg!(target_os = "windows") {
        "cmd"
    } else {
        "sh"
    };

    let shell_arg = if cfg!(target_os = "windows") {
        "/C"
    } else {
        "-c"
    };

    let mut cmd = Command::new(shell);
    cmd.arg(shell_arg)
        .arg(&command)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(ref dir) = cwd {
        let expanded = expand_tilde(dir);
        cmd.current_dir(&expanded);
    }

    let child = cmd.spawn().map_err(|e| format!("Failed to spawn command: {}", e))?;

    // Wait with timeout
    let output = tokio::time::timeout(timeout, async {
        child.wait_with_output()
    })
    .await
    .map_err(|_| format!("Command timed out after {}ms", timeout.as_millis()))?
    .map_err(|e| format!("Failed to wait for command: {}", e))?;

    let duration_ms = start.elapsed().as_millis() as u64;

    Ok(ShellOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code(),
        duration_ms,
    })
}

// ============================================================================
// Clipboard Operations
// ============================================================================

/// Read from clipboard
#[tauri::command]
pub fn read_clipboard() -> Result<String, String> {
    // Use arboard for cross-platform clipboard
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Failed to access clipboard: {}", e))?;

    clipboard.get_text()
        .map_err(|e| format!("Failed to read clipboard: {}", e))
}

/// Write to clipboard
#[tauri::command]
pub fn write_clipboard(content: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Failed to access clipboard: {}", e))?;

    clipboard.set_text(content)
        .map_err(|e| format!("Failed to write to clipboard: {}", e))
}

// ============================================================================
// Notifications
// ============================================================================

/// Send a system notification
#[tauri::command]
pub fn send_notification(title: String, body: String) -> Result<(), String> {
    notify_rust::Notification::new()
        .summary(&title)
        .body(&body)
        .appname("Sapio")
        .show()
        .map_err(|e| format!("Failed to send notification: {}", e))?;

    Ok(())
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
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
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

// ============================================================================
// Backup/Restore for Undo
// ============================================================================

/// Backup a file before modification (returns backup path)
#[tauri::command]
pub fn backup_file(path: String) -> Result<String, String> {
    let path = expand_tilde(&path);
    let source = Path::new(&path);

    if !source.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    // Create backup directory
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let backup_dir = home.join(".sapio").join("backups");
    fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    // Generate backup filename with timestamp
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);

    let filename = source.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");

    let backup_path = backup_dir.join(format!("{}_{}", timestamp, filename));

    // Copy file to backup
    fs::copy(source, &backup_path)
        .map_err(|e| format!("Failed to backup file: {}", e))?;

    Ok(backup_path.to_string_lossy().to_string())
}

/// Restore a file from backup
#[tauri::command]
pub fn restore_file(backup_path: String, original_path: String) -> Result<(), String> {
    let backup = Path::new(&backup_path);
    let expanded_original = expand_tilde(&original_path);
    let original = Path::new(&expanded_original);

    if !backup.exists() {
        return Err(format!("Backup file does not exist: {}", backup_path));
    }

    // Restore the file
    fs::copy(backup, original)
        .map_err(|e| format!("Failed to restore file: {}", e))?;

    // Optionally delete the backup
    let _ = fs::remove_file(backup);

    Ok(())
}

/// Read the app config
#[tauri::command]
pub fn read_config() -> Result<AppConfig, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let config_path = home.join(".sapio").join("config.yaml");

    if !config_path.exists() {
        return Ok(AppConfig::default());
    }

    let content =
        fs::read_to_string(&config_path).map_err(|e| format!("Failed to read config: {}", e))?;
    serde_yaml::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))
}

/// Save the app config
#[tauri::command]
pub fn save_config(config: AppConfig) -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let config_path = home.join(".sapio").join("config.yaml");

    let yaml =
        serde_yaml::to_string(&config).map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&config_path, yaml).map_err(|e| format!("Failed to write config: {}", e))
}

/// Rename/move a file or directory
#[tauri::command]
pub fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
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

/// Get the logs directory (~/.sapio/logs)
fn get_logs_dir() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    Ok(home.join(".sapio").join("logs"))
}

/// Get the log file path (~/.sapio/logs/agent.txt)
fn get_log_path() -> Result<std::path::PathBuf, String> {
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

/// List log files in ~/.sapio/logs/
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

/// Read a specific log file from ~/.sapio/logs/
#[tauri::command]
pub fn read_log_file(filename: String) -> Result<String, String> {
    // Guard against path traversal
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Invalid filename".to_string());
    }

    let log_path = get_logs_dir()?.join(&filename);

    if !log_path.exists() {
        return Ok(String::new());
    }

    fs::read_to_string(&log_path).map_err(|e| format!("Failed to read log file: {}", e))
}

/// Append a line to a specific log file in ~/.sapio/logs/
#[tauri::command]
pub fn append_log_file(filename: String, line: String) -> Result<(), String> {
    // Guard against path traversal
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Invalid filename".to_string());
    }

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

/// Clear a specific log file in ~/.sapio/logs/
#[tauri::command]
pub fn clear_log_file(filename: String) -> Result<(), String> {
    // Guard against path traversal
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Invalid filename".to_string());
    }

    let log_path = get_logs_dir()?.join(&filename);

    if log_path.exists() {
        fs::write(&log_path, "").map_err(|e| format!("Failed to clear log file: {}", e))?;
    }

    Ok(())
}
