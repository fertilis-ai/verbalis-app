import { isTauri } from "@tauri-apps/api/core";
import * as commands from "@/lib/tauri/commands";
import type { FileNode } from "@/lib/tauri/commands";
// Shared with src-tauri/src/commands/fs.rs (include_str!), which seeds it on desktop.
import DEFAULT_AGENT_FILE from "@/lib/toolbox/default-agent.md?raw";
import {
  webCreateDirectory,
  webDeletePath,
  webListFiles,
  webPathExists,
  webReadDirectory,
  webReadFile,
  webRenamePath,
  webWriteFile,
} from "./web-fs";

// Types for file system operations
export type { FileNode };

// Re-export isTauri from @tauri-apps/api/core for convenience
export { isTauri };

// File System Commands
export async function getAppDataDir(): Promise<string> {
  if (!isTauri()) {
    return "/verbalis-data";  // Virtual path for localStorage
  }
  return commands.getAppDataDir();
}

let appDataDirPromise: Promise<string> | null = null;
export function getAppDataDirCached(): Promise<string> {
  if (!appDataDirPromise) appDataDirPromise = getAppDataDir();
  return appDataDirPromise;
}

export async function initAppDataDir(): Promise<void> {
  if (!isTauri()) {
    // Initialize default directories in virtual FS
    webCreateDirectory("/verbalis-data/chats");
    webCreateDirectory("/verbalis-data/tasks");
    webCreateDirectory("/verbalis-data/agents");
    webCreateDirectory("/verbalis-data/scheduler");
    webCreateDirectory("/verbalis-data/prompts");
    webCreateDirectory("/verbalis-data/memories");
    webCreateDirectory("/verbalis-data/skills");
    webCreateDirectory("/verbalis-data/workflows");
    webCreateDirectory("/verbalis-data/logs");
    if (!webPathExists("/verbalis-data/agents/default.md")) {
      webWriteFile("/verbalis-data/agents/default.md", DEFAULT_AGENT_FILE);
    }
    return;
  }
  return commands.initAppDataDir();
}

export async function readDirectory(
  path: string,
  maxDepth?: number
): Promise<FileNode[]> {
  if (!isTauri()) {
    return webReadDirectory(path);
  }
  return commands.readDirectory(path, maxDepth);
}

export async function readFile(path: string): Promise<string> {
  if (!isTauri()) {
    return webReadFile(path);
  }
  return commands.readFile(path);
}

export async function writeFile(path: string, content: string): Promise<void> {
  if (!isTauri()) {
    webWriteFile(path, content);
    return;
  }
  return commands.writeFile(path, content);
}

export async function deletePath(path: string): Promise<void> {
  if (!isTauri()) {
    webDeletePath(path);
    return;
  }
  return commands.deletePath(path);
}

export async function createDirectory(path: string): Promise<void> {
  if (!isTauri()) {
    webCreateDirectory(path);
    return;
  }
  return commands.createDirectory(path);
}

export async function pathExists(path: string): Promise<boolean> {
  if (!isTauri()) {
    return webPathExists(path);
  }
  return commands.pathExists(path);
}

export async function listFiles(
  dir: string,
  extension?: string
): Promise<string[]> {
  if (!isTauri()) {
    return webListFiles(dir, extension);
  }
  return commands.listFiles(dir, extension);
}

// Rename/move a file or directory
export async function renamePath(oldPath: string, newPath: string): Promise<void> {
  if (!isTauri()) {
    webRenamePath(oldPath, newPath);
    return;
  }
  return commands.renamePath(oldPath, newPath);
}
