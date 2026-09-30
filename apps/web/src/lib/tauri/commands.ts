/**
 * Typed wrappers for the Rust commands in `src-tauri/src/commands.rs`, one
 * function per command. Call these instead of `invoke("…")` so a renamed
 * command or argument fails type-checking instead of at runtime.
 *
 * Argument keys are camelCase: Tauri maps them to the snake_case Rust
 * parameter names (`maxDepth` → `max_depth`). Return structs are serialized
 * as-is, so their fields stay snake_case (`is_directory`, `duration_ms`).
 *
 * This module is a leaf: it must import only `@tauri-apps/api/core`, because
 * logger, storage and http all depend on it.
 */

import { invoke } from "@tauri-apps/api/core";

export interface FileNode {
  name: string;
  path: string;
  is_directory: boolean;
  children?: FileNode[];
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  duration_ms: number;
}

export interface HttpRequest {
  url: string;
  method: string;
  headers?: Record<string, string> | null;
  body?: string | null;
  timeoutMs?: number | null;
}

// ============================================================================
// App directories
// ============================================================================

export function getHomeDir(): Promise<string> {
  return invoke<string>("get_home_dir");
}

export function getAppDataDir(): Promise<string> {
  return invoke<string>("get_app_data_dir");
}

export function initAppDataDir(): Promise<void> {
  return invoke("init_app_data_dir");
}

// ============================================================================
// File system
// ============================================================================

/** Rust defaults `maxDepth` to 3 when it is omitted. */
export function readDirectory(path: string, maxDepth?: number): Promise<FileNode[]> {
  return invoke<FileNode[]>("read_directory", { path, maxDepth });
}

export function readFile(path: string): Promise<string> {
  return invoke<string>("read_file", { path });
}

export function writeFile(path: string, content: string): Promise<void> {
  return invoke("write_file", { path, content });
}

export function readFileBase64(path: string): Promise<string> {
  return invoke<string>("read_file_base64", { path });
}

export function writeFileBase64(path: string, dataBase64: string): Promise<void> {
  return invoke("write_file_base64", { path, dataBase64 });
}

export function copyFile(sourcePath: string, destPath: string): Promise<void> {
  return invoke("copy_file", { sourcePath, destPath });
}

export function revealInFolder(path: string): Promise<void> {
  return invoke("reveal_in_folder", { path });
}

export function deletePath(path: string): Promise<void> {
  return invoke("delete_path", { path });
}

export function createDirectory(path: string): Promise<void> {
  return invoke("create_directory", { path });
}

export function pathExists(path: string): Promise<boolean> {
  return invoke<boolean>("path_exists", { path });
}

/** File names without their extension, sorted. Directories are skipped. */
export function listFiles(dir: string, extension?: string): Promise<string[]> {
  return invoke<string[]>("list_files", { dir, extension });
}

export function renamePath(oldPath: string, newPath: string): Promise<void> {
  return invoke("rename_path", { oldPath, newPath });
}

// ============================================================================
// HTTP
// ============================================================================

export function httpRequest(request: HttpRequest): Promise<HttpResponse> {
  return invoke<HttpResponse>("http_request", { ...request });
}

// ============================================================================
// Logs (~/.verbalis/logs)
// ============================================================================

/** Appends to the agent log (`agent.txt`). */
export function appendLog(line: string): Promise<void> {
  return invoke("append_log", { line });
}

export function clearLog(): Promise<void> {
  return invoke("clear_log");
}

export function readLog(): Promise<string> {
  return invoke<string>("read_log");
}

export function listLogFiles(): Promise<string[]> {
  return invoke<string[]>("list_log_files");
}

export function readLogFile(filename: string): Promise<string> {
  return invoke<string>("read_log_file", { filename });
}

export function appendLogFile(filename: string, line: string): Promise<void> {
  return invoke("append_log_file", { filename, line });
}

export function clearLogFile(filename: string): Promise<void> {
  return invoke("clear_log_file", { filename });
}

export function writeLogFile(filename: string, content: string): Promise<void> {
  return invoke("write_log_file", { filename, content });
}

// ============================================================================
// Keychain
// ============================================================================

export function storeApiKey(provider: string, key: string): Promise<void> {
  return invoke("store_api_key", { provider, key });
}

export function getApiKey(provider: string): Promise<string | null> {
  return invoke<string | null>("get_api_key", { provider });
}

export function deleteApiKey(provider: string): Promise<void> {
  return invoke("delete_api_key", { provider });
}

export function getAllApiKeys(): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("get_all_api_keys");
}
