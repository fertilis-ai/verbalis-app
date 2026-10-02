import YAML from "yaml";
import type { FileNode } from "@/lib/tauri/commands";
import { createDirectory, pathExists, readDirectory, readFile, writeFile } from "./fs";

// Folder metadata (shared by chats, scheduler, etc.)
export interface FolderMeta {
  isPinned: boolean;
  createdAt: string;
}

// Backward-compatible aliases
export type ChatFolderMeta = FolderMeta;
export type SchedulerFolderMeta = FolderMeta;

// Generic folder creation for any storage section (chats, scheduler, etc.)
export async function createItemFolder(sectionDir: string, name: string, parentPath?: string): Promise<string> {
  // Ensure base directory exists before creating subfolder
  if (!(await pathExists(sectionDir))) {
    await createDirectory(sectionDir);
  }

  const basePath = parentPath ? `${parentPath}/${name}` : `${sectionDir}/${name}`;
  await createDirectory(basePath);

  // Create folder metadata
  const meta: FolderMeta = {
    isPinned: false,
    createdAt: new Date().toISOString(),
  };
  await writeFile(`${basePath}/_meta.yaml`, YAML.stringify(meta));

  return basePath;
}

export async function saveFolderMeta(folderPath: string, meta: FolderMeta): Promise<void> {
  await writeFile(`${folderPath}/_meta.yaml`, YAML.stringify(meta));
}

export async function loadFolderMeta(folderPath: string): Promise<FolderMeta | null> {
  const metaPath = `${folderPath}/_meta.yaml`;
  if (!(await pathExists(metaPath))) return null;
  const content = await readFile(metaPath);
  return YAML.parse(content);
}

// Generic recursive tree loader for any folder-based storage section.
// `parseLeafEntry` converts a non-directory file entry into a leaf node, or returns null to skip.
// `folderType` is the type string used for folder nodes (e.g. "folder").
// `TNode` must have at minimum: type, id, name, path, isPinned, and optional children.
interface TreeNodeBase {
  type: string;
  id: string;
  name: string;
  path: string;
  isPinned: boolean;
  children?: TreeNodeBase[];
  updatedAt?: string;
}

export async function loadTreeRecursive<TNode extends TreeNodeBase>(
  dirPath: string,
  folderType: string,
  parseLeafEntry: (entry: FileNode) => Promise<TNode | null>,
): Promise<TNode[]> {
  const nodes: TNode[] = [];
  const entries = await readDirectory(dirPath, 1);

  for (const entry of entries) {
    if (entry.is_directory) {
      const meta = await loadFolderMeta(entry.path);
      const children = await loadTreeRecursive<TNode>(entry.path, folderType, parseLeafEntry);
      const maxChildUpdated = children.reduce((max, c) => {
        return c.updatedAt && c.updatedAt > (max ?? "") ? c.updatedAt : max;
      }, undefined as string | undefined);
      nodes.push({
        type: folderType,
        id: entry.name,
        name: entry.name,
        path: entry.path,
        isPinned: meta?.isPinned ?? false,
        children,
        updatedAt: maxChildUpdated,
      } as unknown as TNode);
    } else {
      const leaf = await parseLeafEntry(entry);
      if (leaf) nodes.push(leaf);
    }
  }

  // Sort: pinned first, folders before leaves, then most recent first
  nodes.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (a.type !== b.type) return a.type === folderType ? -1 : 1;
    if (a.updatedAt || b.updatedAt) {
      return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    }
    return a.name.localeCompare(b.name);
  });

  return nodes;
}
