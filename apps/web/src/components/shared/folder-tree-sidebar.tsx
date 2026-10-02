import type * as React from "react";
import { Plus, FolderPlus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePollingLoader } from "@/lib/hooks/use-polling-loader";
import { useInlineEditing } from "@/lib/hooks/use-inline-editing";
import { splitByPinned, collectTreeIds, collectFolders } from "@/lib/sidebar-utils";
import { SidebarTreeNode, type SidebarTreeNodeData } from "@/components/shared/sidebar-tree-node";

interface FolderTreeSidebarProps {
  /** Header label. */
  title: string;
  /** Name of the root "Move to folder" target. */
  rootFolderName: string;
  tree: SidebarTreeNodeData[];
  /** Leaf type in the tree ("chat", "schedule"). */
  leafType: string;
  leafIcon: LucideIcon;
  /** Items not on disk yet, listed after the tree. Filtered to ids missing from it. */
  items: Array<{ id: string; label: string }>;
  selectedItemId: string | null;
  expandedFolders: Set<string>;
  getDisplayName: (node: SidebarTreeNodeData) => string;
  emptyText: string;
  newItemTitle: string;
  createInFolderTitle: string;
  /** Polled every 5s to pick up changes made on disk. */
  loadFromDisk: () => void;
  onCreateFolder: () => void;
  onCreateItem: (folderId?: string) => void;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onTogglePin: (id: string) => void;
  onRenameFolder: (id: string, name: string) => Promise<void>;
  onRenameLeaf: (id: string, name: string) => Promise<void>;
  onDeleteFolder: (id: string) => void;
  onDeleteLeaf: (id: string) => void;
  onMoveLeaf: (id: string, targetFolderId: string | null) => void;
  /** Rows shown above the tree (e.g. chat's incognito session). */
  header?: React.ReactNode;
}

/** A pinnable, nested folder tree of leaves with inline rename, as used by Chat and Scheduler. */
export function FolderTreeSidebar({
  title,
  rootFolderName,
  tree,
  leafType,
  leafIcon: LeafIcon,
  items,
  selectedItemId,
  expandedFolders,
  getDisplayName,
  emptyText,
  newItemTitle,
  createInFolderTitle,
  loadFromDisk,
  onCreateFolder,
  onCreateItem,
  onSelect,
  onToggleExpand,
  onTogglePin,
  onRenameFolder,
  onRenameLeaf,
  onDeleteFolder,
  onDeleteLeaf,
  onMoveLeaf,
  header,
}: FolderTreeSidebarProps) {
  usePollingLoader(loadFromDisk);

  const { editingId, editingName, startEditing, setEditingName, handleRenameSubmit, handleKeyDown } =
    useInlineEditing({
      onRename: async (id, name, type) => {
        if (type === "folder") {
          await onRenameFolder(id, name);
        } else {
          await onRenameLeaf(id, name);
        }
      },
    });

  const { pinned: pinnedFolders, unpinned: unpinnedItems } = splitByPinned(tree);

  const moveTargets = [
    { id: null, name: rootFolderName, depth: 0 },
    ...collectFolders(tree).map((f) => ({ ...f, depth: f.depth + 1 })),
  ];

  const idsInTree = collectTreeIds(tree, leafType);
  const inMemoryOnlyItems = items.filter((item) => !idsInTree.has(item.id));

  const hasAnyItems =
    pinnedFolders.length > 0 || unpinnedItems.length > 0 || inMemoryOnlyItems.length > 0;

  const treeNodeProps = {
    expandedFolders,
    editingId,
    editingName,
    leafIcon: <LeafIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />,
    leafType,
    createInFolderTitle,
    selectedItemId,
    onSelect,
    onToggleExpand,
    onCreateInFolder: onCreateItem,
    onStartEditing: startEditing,
    onEditingNameChange: setEditingName,
    onKeyDown: handleKeyDown,
    onRenameSubmit: handleRenameSubmit,
    onDeleteFolder,
    onDeleteLeaf,
    onTogglePin,
    getDisplayName,
    moveTargets,
    onMoveLeaf,
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-10 items-center justify-between border-b border-border px-2">
        <span className="text-sm font-medium">{title}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onCreateFolder()}
            title="New folder"
          >
            <FolderPlus className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onCreateItem()}
            title={newItemTitle}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto p-2">
        <div className="flex flex-col gap-0.5">
          {header}

          {/* Pinned folders */}
          {pinnedFolders.length > 0 && (
            <>
              {pinnedFolders.map((node) => (
                <SidebarTreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  {...treeNodeProps}
                />
              ))}
              <div className="my-1 border-b border-border" />
            </>
          )}

          {/* Rest of tree */}
          {!hasAnyItems ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              {emptyText}
            </p>
          ) : (
            <>
              {unpinnedItems.map((node) => (
                <SidebarTreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  {...treeNodeProps}
                />
              ))}

              {/* In-memory only items (not yet on disk) */}
              {inMemoryOnlyItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-muted",
                    selectedItemId === item.id && "bg-muted"
                  )}
                  onClick={() => onSelect(item.id)}
                >
                  <LeafIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{item.label}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
