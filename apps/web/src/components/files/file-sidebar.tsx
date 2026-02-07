import * as React from "react";
import {
  Search,
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useFileStore, type FileNode } from "@/stores/file-store";
import { useSettingsStore } from "@/stores/settings-store";

// Platform detection for folder colors (never changes at runtime)
const detectedPlatform: "mac" | "windows" | "linux" = (() => {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  return "linux";
})();

// Folder color classes by platform
const folderColorClasses = {
  mac: "text-blue-500",
  windows: "text-yellow-500",
  linux: "text-orange-500",
} as const;

export function FileSidebar() {
  const {
    tree,
    selectedFile,
    toggleDirectory,
    setSearchOpen,
    loadFileTree,
    refreshTree,
    openFile,
    createFile,
    createFolder,
  } = useFileStore();
  const { workingDirectory } = useSettingsStore();
  const folderColorClass = folderColorClasses[detectedPlatform];
  const [creatingInPath, setCreatingInPath] = React.useState<string | null>(null);
  const [creatingType, setCreatingType] = React.useState<"file" | "folder">("file");
  const [newItemName, setNewItemName] = React.useState("");
  const newItemInputRef = React.useRef<HTMLInputElement>(null);

  const isCreating = creatingInPath !== null;

  // Load file tree on mount and when workingDirectory changes
  React.useEffect(() => {
    if (workingDirectory) {
      loadFileTree(workingDirectory);
    }
  }, [workingDirectory, loadFileTree]);

  // Polling for external file changes (5 seconds)
  React.useEffect(() => {
    const interval = setInterval(() => {
      refreshTree();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshTree]);

  // Keyboard shortcut for search
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setSearchOpen]);

  // Focus new item input when creating
  React.useEffect(() => {
    if (isCreating && newItemInputRef.current) {
      newItemInputRef.current.focus();
    }
  }, [isCreating]);

  const startCreating = (path: string, type: "file" | "folder") => {
    setCreatingInPath(path);
    setCreatingType(type);
    setNewItemName("");
  };

  const cancelCreating = () => {
    setCreatingInPath(null);
    setNewItemName("");
  };

  const handleNewItemSubmit = async () => {
    if (!newItemName.trim() || creatingInPath === null) {
      cancelCreating();
      return;
    }

    const parentPath = creatingInPath === "__root__" ? null : creatingInPath;
    if (creatingType === "file") {
      await createFile(parentPath, newItemName.trim());
    } else {
      await createFolder(parentPath, newItemName.trim());
    }

    cancelCreating();
  };

  const handleNewItemKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleNewItemSubmit();
    } else if (e.key === "Escape") {
      cancelCreating();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-10 items-center justify-between border-b border-border px-2">
        <span className="text-sm font-medium">Workspace</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSearchOpen(true)}
            title="Search files (Ctrl+P)"
          >
            <Search className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => startCreating("__root__", "folder")}
            title="New folder"
          >
            <FolderPlus className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => startCreating("__root__", "file")}
            title="New file"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Working directory */}
      <div className="p-2 text-xs text-muted-foreground truncate">
        {workingDirectory}
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-auto px-2">
        {/* New item input at root */}
        {creatingInPath === "__root__" && (
          <div className="flex items-center gap-1 py-0.5 px-1">
            {creatingType === "folder" ? (
              <Folder className={cn("h-3.5 w-3.5 flex-shrink-0", folderColorClass)} />
            ) : (
              <File className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            )}
            <Input
              ref={newItemInputRef}
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={handleNewItemKeyDown}
              onBlur={handleNewItemSubmit}
              className="h-5 text-xs px-1 py-0"
              placeholder={creatingType === "folder" ? "folder name" : "file name"}
            />
          </div>
        )}

        {tree.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No files loaded. Configure working directory in Settings.
          </p>
        ) : (
          <FileTree
            nodes={tree}
            selectedFile={selectedFile}
            onSelectFile={(path) => openFile(path)}
            onToggleDirectory={toggleDirectory}
            folderColorClass={folderColorClass}
            creatingInPath={creatingInPath}
            creatingType={creatingType}
            newItemName={newItemName}
            setNewItemName={setNewItemName}
            newItemInputRef={newItemInputRef}
            onNewItemKeyDown={handleNewItemKeyDown}
            onNewItemSubmit={handleNewItemSubmit}
            onStartCreating={startCreating}
          />
        )}
      </div>
    </div>
  );
}

interface FileTreeProps {
  nodes: FileNode[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  onToggleDirectory: (path: string) => void;
  folderColorClass: string;
  depth?: number;
  creatingInPath: string | null;
  creatingType: "file" | "folder";
  newItemName: string;
  setNewItemName: (name: string) => void;
  newItemInputRef: React.RefObject<HTMLInputElement | null>;
  onNewItemKeyDown: (e: React.KeyboardEvent) => void;
  onNewItemSubmit: () => void;
  onStartCreating: (path: string, type: "file" | "folder") => void;
}

function FileTree({
  nodes,
  selectedFile,
  onSelectFile,
  onToggleDirectory,
  folderColorClass,
  depth = 0,
  creatingInPath,
  creatingType,
  newItemName,
  setNewItemName,
  newItemInputRef,
  onNewItemKeyDown,
  onNewItemSubmit,
  onStartCreating,
}: FileTreeProps) {
  return (
    <div className="flex flex-col">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          selectedFile={selectedFile}
          onSelectFile={onSelectFile}
          onToggleDirectory={onToggleDirectory}
          folderColorClass={folderColorClass}
          depth={depth}
          creatingInPath={creatingInPath}
          creatingType={creatingType}
          newItemName={newItemName}
          setNewItemName={setNewItemName}
          newItemInputRef={newItemInputRef}
          onNewItemKeyDown={onNewItemKeyDown}
          onNewItemSubmit={onNewItemSubmit}
          onStartCreating={onStartCreating}
        />
      ))}
    </div>
  );
}

interface FileTreeNodeProps {
  node: FileNode;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  onToggleDirectory: (path: string) => void;
  folderColorClass: string;
  depth: number;
  creatingInPath: string | null;
  creatingType: "file" | "folder";
  newItemName: string;
  setNewItemName: (name: string) => void;
  newItemInputRef: React.RefObject<HTMLInputElement | null>;
  onNewItemKeyDown: (e: React.KeyboardEvent) => void;
  onNewItemSubmit: () => void;
  onStartCreating: (path: string, type: "file" | "folder") => void;
}

function FileTreeNode({
  node,
  selectedFile,
  onSelectFile,
  onToggleDirectory,
  folderColorClass,
  depth,
  creatingInPath,
  creatingType,
  newItemName,
  setNewItemName,
  newItemInputRef,
  onNewItemKeyDown,
  onNewItemSubmit,
  onStartCreating,
}: FileTreeNodeProps) {
  const {
    editingPath,
    editingName,
    setEditingName,
    startEditing,
    cancelEditing,
    submitEditing,
    deleteItem,
  } = useFileStore();

  const inputRef = React.useRef<HTMLInputElement>(null);

  const isEditing = editingPath === node.path;
  const isCreatingInside = creatingInPath === node.path;

  // Focus input when editing
  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      submitEditing();
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  };

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete "${node.name}"?`)) {
      deleteItem(node.path);
    }
  };

  return (
    <div>
      <div
        className={cn(
          "group flex cursor-pointer items-center gap-1 rounded-sm px-1 py-0.5 text-xs hover:bg-muted",
          selectedFile === node.path && "bg-muted"
        )}
        style={{ paddingLeft: depth * 12 + 4 }}
        onClick={() => {
          if (node.isDirectory) {
            onToggleDirectory(node.path);
          } else {
            onSelectFile(node.path);
          }
        }}
      >
        {/* Chevron / icon */}
        {node.isDirectory ? (
          <>
            {node.isExpanded ? (
              <ChevronDown className="h-3 w-3 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 flex-shrink-0" />
            )}
            {node.isExpanded ? (
              <FolderOpen className={cn("h-3.5 w-3.5 flex-shrink-0", folderColorClass)} />
            ) : (
              <Folder className={cn("h-3.5 w-3.5 flex-shrink-0", folderColorClass)} />
            )}
          </>
        ) : (
          <>
            <span className="h-3 w-3" />
            <File className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          </>
        )}

        {/* Name or editing input */}
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => submitEditing()}
            className="h-5 text-xs px-1 py-0 flex-1"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate flex-1">{node.name}</span>
        )}

        {/* Actions on hover (CSS-driven visibility) */}
        {!isEditing && (
          <div
            className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Add folder/file inside folder */}
            {node.isDirectory && (
              <>
                <button
                  className="p-0.5 rounded-sm hover:bg-background"
                  onClick={() => {
                    onStartCreating(node.path, "folder");
                    if (!node.isExpanded) {
                      onToggleDirectory(node.path);
                    }
                  }}
                  title="New folder inside"
                >
                  <FolderPlus className="h-3 w-3" />
                </button>
                <button
                  className="p-0.5 rounded-sm hover:bg-background"
                  onClick={() => {
                    onStartCreating(node.path, "file");
                    if (!node.isExpanded) {
                      onToggleDirectory(node.path);
                    }
                  }}
                  title="New file inside"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </>
            )}

            {/* Context menu */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    className="p-0.5 rounded-sm hover:bg-background"
                    title="More actions"
                  />
                }
              >
                <MoreHorizontal className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="right">
                <DropdownMenuItem onClick={() => startEditing(node.path)}>
                  <Pencil className="h-3 w-3 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-3 w-3 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* New file/folder input inside folder */}
      {node.isDirectory && node.isExpanded && isCreatingInside && (
        <div
          className="flex items-center gap-1 py-0.5"
          style={{ paddingLeft: (depth + 1) * 12 + 4 }}
        >
          <span className="h-3 w-3" />
          {creatingType === "folder" ? (
            <Folder className={cn("h-3.5 w-3.5 flex-shrink-0", folderColorClass)} />
          ) : (
            <File className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          )}
          <Input
            ref={newItemInputRef}
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={onNewItemKeyDown}
            onBlur={onNewItemSubmit}
            className="h-5 text-xs px-1 py-0 flex-1"
            placeholder={creatingType === "folder" ? "folder name" : "file name"}
          />
        </div>
      )}

      {/* Children */}
      {node.isDirectory && node.isExpanded && node.children && (
        <FileTree
          nodes={node.children}
          selectedFile={selectedFile}
          onSelectFile={onSelectFile}
          onToggleDirectory={onToggleDirectory}
          folderColorClass={folderColorClass}
          depth={depth + 1}
          creatingInPath={creatingInPath}
          creatingType={creatingType}
          newItemName={newItemName}
          setNewItemName={setNewItemName}
          newItemInputRef={newItemInputRef}
          onNewItemKeyDown={onNewItemKeyDown}
          onNewItemSubmit={onNewItemSubmit}
          onStartCreating={onStartCreating}
        />
      )}
    </div>
  );
}
