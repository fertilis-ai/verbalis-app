/**
 * Agent Debug Logger
 *
 * Writes timestamped log entries to ~/.verbalis/logs/agent.txt for tracing agent execution.
 * Logging is only active when enabled in settings.
 *
 * Format: [ISO timestamp] [CATEGORY] message
 */

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./storage";

export type LogCategory =
  | "USER_INPUT"   // User sends message
  | "ADAPTER"      // Adapter lifecycle (init, run, stop)
  | "LLM_CALL"     // LLM request/response
  | "EVENT"        // Agent events emitted
  | "TOOL"         // Tool execution flow
  | "CONTEXT";     // Context-window budgeting / trimming

// In-memory flag for whether logging is enabled
// This is updated by the settings store
let loggingEnabled = false;

/**
 * Set whether agent debug logging is enabled.
 * Called by the settings store when the setting changes.
 */
export function setLoggingEnabled(enabled: boolean): void {
  loggingEnabled = enabled;
}

/**
 * Check if logging is currently enabled.
 */
export function isLoggingEnabled(): boolean {
  return loggingEnabled;
}

/**
 * Format a log entry with timestamp and category.
 */
function formatLogEntry(category: LogCategory, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  let entry = `[${timestamp}] [${category}] ${message}`;

  if (data !== undefined) {
    try {
      const dataStr = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      // Truncate very long data
      const truncated = dataStr.length > 1000 ? `${dataStr.slice(0, 1000)}... (truncated)` : dataStr;
      entry += `\n  Data: ${truncated}`;
    } catch {
      entry += `\n  Data: [unable to serialize]`;
    }
  }

  return entry;
}

/**
 * Log an agent-related event.
 *
 * @param category - The category of the log entry
 * @param message - The log message
 * @param data - Optional data to include (will be JSON stringified)
 */
export function logAgent(category: LogCategory, message: string, data?: unknown): void {
  if (!loggingEnabled || !isTauri()) {
    return;
  }

  const entry = formatLogEntry(category, message, data);

  // Fire and forget - don't await to avoid blocking
  invoke("append_log", { line: entry }).catch((error) => {
    console.warn("[logger] Failed to write log:", error);
  });
}

/**
 * Clear the log file.
 */
export async function clearLog(): Promise<void> {
  if (!isTauri()) {
    return;
  }

  try {
    await invoke("clear_log");
  } catch (error) {
    console.warn("[logger] Failed to clear log:", error);
  }
}

/**
 * Read the current log file contents.
 * Useful for displaying in a debug panel.
 */
export async function readLog(): Promise<string> {
  if (!isTauri()) {
    return "";
  }

  try {
    return await invoke("read_log");
  } catch (error) {
    console.warn("[logger] Failed to read log:", error);
    return "";
  }
}
