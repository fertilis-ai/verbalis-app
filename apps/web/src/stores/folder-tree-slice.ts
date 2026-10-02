import { findNodeInTree, getSiblingFolderNames, getUniqueName, type TreeNode } from "@/lib/tree-utils";
import { toggleInSet } from "@/lib/set-utils";

/** A sidebar tree node backed by a path on disk (folders have type "folder"). */
export interface FolderTreeNode extends TreeNode {
  path: string;
}

/** Disk operations on a folder, by path. */
export interface FolderStorage {
  rename: (path: string, newName: string) => Promise<unknown>;
  remove: (path: string) => Promise<void>;
  togglePin: (path: string) => Promise<void>;
}

export interface FolderActions {
  renameFolder: (folderId: string, newName: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  toggleFolderPin: (folderId: string) => Promise<void>;
}

export interface FolderTreeActions extends FolderActions {
  createFolder: (name: string, parentFolderId?: string) => Promise<void>;
}

interface FolderActionsConfig<N extends FolderTreeNode, S extends FolderStorage> {
  /** Prefix for error logs, e.g. "chat-store". */
  logPrefix: string;
  getTree: () => N[];
  /** Reload the tree from disk after a change. */
  reload: () => Promise<void>;
  storage: S;
}

/**
 * Rename, delete and pin for folders in a store's tree. Each action finds the
 * folder by id, runs the disk operation and reloads the tree. An unknown id or
 * a non-folder node is ignored; a failure is logged, not thrown.
 */
export function createFolderActions<N extends FolderTreeNode>(
  config: FolderActionsConfig<N, FolderStorage>
): FolderActions {
  const { logPrefix, getTree, reload, storage } = config;

  const withFolder = async (folderId: string, action: string, op: (path: string) => Promise<unknown>) => {
    try {
      const folder = findNodeInTree(getTree(), folderId);
      if (folder?.type !== "folder") return;
      await op(folder.path);
      await reload();
    } catch (error) {
      console.error(`[${logPrefix}] Failed to ${action} folder:`, error);
    }
  };

  return {
    renameFolder: (folderId, newName) => withFolder(folderId, "rename", (path) => storage.rename(path, newName)),
    deleteFolder: (folderId) => withFolder(folderId, "delete", storage.remove),
    toggleFolderPin: (folderId) => withFolder(folderId, "toggle pin of", storage.togglePin),
  };
}

/**
 * Folder CRUD for a nested tree: `createFolderActions` plus `createFolder`,
 * which de-duplicates the name among its siblings ("Projects 2") and creates
 * it inside the parent folder, or at the root.
 */
export function createFolderTreeSlice<N extends FolderTreeNode>(
  config: FolderActionsConfig<
    N,
    FolderStorage & { create: (name: string, parentPath?: string) => Promise<unknown> }
  >
): FolderTreeActions {
  const { logPrefix, getTree, reload, storage } = config;

  return {
    ...createFolderActions(config),
    createFolder: async (name, parentFolderId) => {
      try {
        const tree = getTree();
        const uniqueName = getUniqueName(name, getSiblingFolderNames(tree, parentFolderId));
        const parent = parentFolderId ? findNodeInTree(tree, parentFolderId) : null;
        await storage.create(uniqueName, parent?.type === "folder" ? parent.path : undefined);
        await reload();
      } catch (error) {
        console.error(`[${logPrefix}] Failed to create folder:`, error);
      }
    },
  };
}

export interface FolderExpansionState {
  expandedFolders: Set<string>;
  toggleFolderExpansion: (folderId: string) => void;
}

/** The expanded/collapsed state of a sidebar tree's folders. */
export function createFolderExpansionSlice(
  set: (update: (state: FolderExpansionState) => Partial<FolderExpansionState>) => void
): FolderExpansionState {
  return {
    expandedFolders: new Set<string>(),
    toggleFolderExpansion: (folderId) => {
      set((state) => ({ expandedFolders: toggleInSet(state.expandedFolders, folderId) }));
    },
  };
}
