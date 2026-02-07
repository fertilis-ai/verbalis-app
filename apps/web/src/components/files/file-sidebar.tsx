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

// Platform detection for folder colors
function usePlatform() {
  const [platform, setPlatform] = React.useState<"mac" | "windows" | "linux">("mac");

  React.useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes("mac")) {
      setPlatform("mac");
    } else if (userAgent.includes("win")) {
      setPlatform("windows");
    } else {
      setPlatform("linux");
    }
  }, []);

  return platform;
}

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
  const platform = usePlatform();
  const folderColorClass = folderColorClasses[platform];
  const [isCreatingFile, setIsCreatingFile] = React.useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = React.useState(false);
  const [newItemName, setNewItemName] = React.useState("");
  const newItemInputRef = React.useRef<HTMLInputElement>(null);

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
    if ((isCreatingFile || isCreatingFolder) && newItemInputRef.current) {
      newItemInputRef.current.focus();
    }
  }, [isCreatingFile, isCreatingFolder]);

  const handleCreateFile = () => {
    setIsCreatingFile(true);
    setIsCreatingFolder(false);
    setNewItemName("");
  };

  const handleCreateFolder = () => {
    setIsCreatingFolder(true);
    setIsCreatingFile(false);
    setNewItemName("");
  };

  const handleNewItemSubmit = async () => {
    if (!newItemName.trim()) {
      setIsCreatingFile(false);
      setIsCreatingFolder(false);
      return;
    }

    if (isCreatingFile) {
      await createFile(null, newItemName.trim());
    } else if (isCreatingFolder) {
      await createFolder(null, newItemName.trim());
    }

    setIsCreatingFile(false);
    setIsCreatingFolder(false);
    setNewItemName("");
  };

  const handleNewItemKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleNewItemSubmit();
    } else if (e.key === "Escape") {
      setIsCreatingFile(false);
      setIsCreatingFolder(false);
      setNewItemName("");
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
            onClick={handleCreateFolder}
            title="New folder"
          >
            <FolderPlus className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCreateFile}
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
        {(isCreatingFile || isCreatingFolder) && (
          <div className="flex items-center gap-1 py-0.5 px-1">
            {isCreatingFolder ? (
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
              placeholder={isCreatingFolder ? "folder name" : "file name"}
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
}

function FileTree({
  nodes,
  selectedFile,
  onSelectFile,
  onToggleDirectory,
  folderColorClass,
  depth = 0,
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
}

function FileTreeNode({
  node,
  selectedFile,
  onSelectFile,
  onToggleDirectory,
  folderColorClass,
  depth,
}: FileTreeNodeProps) {
  const {
    editingPath,
    editingName,
    setEditingName,
    startEditing,
    cancelEditing,
    submitEditing,
    deleteItem,
    createFile,
    createFolder,
  } = useFileStore();

  const [isHovered, setIsHovered] = React.useState(false);
  const [isCreatingFileInside, setIsCreatingFileInside] = React.useState(false);
  const [isCreatingFolderInside, setIsCreatingFolderInside] = React.useState(false);
  const [newItemName, setNewItemName] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const newItemInputRef = React.useRef<HTMLInputElement>(null);

  const isEditing = editingPath === node.path;

  // Focus input when editing
  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Focus new item input when creating inside folder
  React.useEffect(() => {
    if ((isCreatingFileInside || isCreatingFolderInside) && newItemInputRef.current) {
      newItemInputRef.current.focus();
    }
  }, [isCreatingFileInside, isCreatingFolderInside]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      submitEditing();
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  };

  const handleNewItemSubmit = async () => {
    if (newItemName.trim()) {
      if (isCreatingFileInside) {
        await createFile(node.path, newItemName.trim());
      } else if (isCreatingFolderInside) {
        await createFolder(node.path, newItemName.trim());
      }
    }
    setIsCreatingFileInside(false);
    setIsCreatingFolderInside(false);
    setNewItemName("");
  };

  const handleNewItemKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleNewItemSubmit();
    } else if (e.key === "Escape") {
      setIsCreatingFileInside(false);
      setIsCreatingFolderInside(false);
      setNewItemName("");
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
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
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

        {/* Actions on hover */}
        {isHovered && !isEditing && (
          <div
            className="flex items-center gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Add folder/file inside folder */}
            {node.isDirectory && (
              <>
                <button
                  className="p-0.5 rounded-sm hover:bg-background"
                  onClick={() => {
                    setIsCreatingFolderInside(true);
                    setIsCreatingFileInside(false);
                    setNewItemName("");
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
                    setIsCreatingFileInside(true);
                    setIsCreatingFolderInside(false);
                    setNewItemName("");
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
      {node.isDirectory && node.isExpanded && (isCreatingFileInside || isCreatingFolderInside) && (
        <div
          className="flex items-center gap-1 py-0.5"
          style={{ paddingLeft: (depth + 1) * 12 + 4 }}
        >
          <span className="h-3 w-3" />
          {isCreatingFolderInside ? (
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
            className="h-5 text-xs px-1 py-0 flex-1"
            placeholder={isCreatingFolderInside ? "folder name" : "file name"}
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
        />
      )}
    </div>
  );
}
