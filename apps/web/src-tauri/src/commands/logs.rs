//! Debug logging to ~/.verbalis/logs.

use std::fs;
use std::path::PathBuf;

use super::app_dir;

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
}
