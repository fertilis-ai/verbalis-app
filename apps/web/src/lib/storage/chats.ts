import YAML from "yaml";
import type { FileNode } from "@/lib/tauri/commands";
import { dirname } from "@/lib/path-resolution";
import { deletePath, getAppDataDirCached, pathExists, readFile, renamePath, writeFile } from "./fs";
import { createItemFolder, loadTreeRecursive } from "./tree";

// Chat tree node (folder or chat)
export interface ChatTreeNode {
  type: "folder" | "chat";
  id: string;
  name: string;
  path: string;
  isPinned: boolean;
  children?: ChatTreeNode[];
  // For chats only
  title?: string;
  updatedAt?: string;
}

// Chat storage
export interface ChatData {
  id: string;
  title: string;
  model: string;
  agentId: string | null;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
      status: string;
      result?: string;
      error?: string;
      durationMs?: number;
    }>;
  }>;
  createdAt: string;
  updatedAt: string;
}

// Load a chat directly by its file path (supports nested folders)
export async function loadChatByPath(path: string): Promise<ChatData | null> {
  if (!(await pathExists(path))) return null;
  try {
    const content = await readFile(path);
    return path.endsWith(".yaml") ? YAML.parse(content) : JSON.parse(content);
  } catch {
    return null;
  }
}

// Chat folder operations
export async function createChatFolder(name: string, parentPath?: string): Promise<string> {
  const dir = await getAppDataDirCached();
  return createItemFolder(`${dir}/chats`, name, parentPath);
}

// Save chat to a specific folder (or root if no folderId)
export async function saveChatToFolder(chat: ChatData, folderPath?: string): Promise<void> {
  const dir = await getAppDataDirCached();
  const basePath = folderPath || `${dir}/chats`;
  const path = `${basePath}/${chat.id}.json`;
  await writeFile(path, JSON.stringify(chat, null, 2));
}

// Parse a file entry as a ChatTreeNode (JSON or legacy YAML)
async function parseChatEntry(entry: FileNode): Promise<ChatTreeNode | null> {
  if (entry.name.endsWith(".json") && entry.name !== "_meta.json") {
    try {
      const content = await readFile(entry.path);
      const chat: ChatData = JSON.parse(content);
      return {
        type: "chat",
        id: chat.id,
        name: entry.name.replace(".json", ""),
        path: entry.path,
        isPinned: false,
        title: chat.title,
        updatedAt: chat.updatedAt,
      };
    } catch {
      return null;
    }
  }
  if (entry.name.endsWith(".yaml") && entry.name !== "_meta.yaml") {
    try {
      const content = await readFile(entry.path);
      const chat: ChatData = YAML.parse(content);
      return {
        type: "chat",
        id: chat.id,
        name: entry.name.replace(".yaml", ""),
        path: entry.path,
        isPinned: false,
        title: chat.title,
        updatedAt: chat.updatedAt,
      };
    } catch {
      return null;
    }
  }
  return null;
}

// Load entire chat tree from disk
export async function loadChatTree(): Promise<ChatTreeNode[]> {
  const dir = await getAppDataDirCached();
  const chatsDir = `${dir}/chats`;

  if (!(await pathExists(chatsDir))) {
    return [];
  }

  const result = await loadTreeRecursive<ChatTreeNode>(chatsDir, "folder", parseChatEntry);
  return result;
}

// Delete a chat by path (works for nested chats)
export async function deleteChatByPath(chatPath: string): Promise<void> {
  await deletePath(chatPath);
}

// Delete a folder and all its contents
export async function deleteChatFolder(folderPath: string): Promise<void> {
  await deletePath(folderPath);
}

// Rename a chat file
export async function renameChat(oldPath: string, newId: string): Promise<string> {
  const dir = dirname(oldPath);
  const newPath = `${dir}/${newId}.json`;
  await renamePath(oldPath, newPath);
  return newPath;
}

// Rename a folder
export async function renameChatFolder(oldPath: string, newName: string): Promise<string> {
  const parentDir = dirname(oldPath);
  const newPath = `${parentDir}/${newName}`;
  await renamePath(oldPath, newPath);
  return newPath;
}
