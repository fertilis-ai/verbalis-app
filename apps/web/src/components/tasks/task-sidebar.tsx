import * as React from "react";
import {
  Plus,
  FolderPlus,
  MoreVertical,
  Pin,
  Pencil,
  Trash2,
  Folder,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTaskStore, type TaskTreeNode } from "@/stores/task-store";

export function TaskSidebar() {
  const {
    taskTree,
    selectedFolderId,
    createFolder,
    renameFolder,
    deleteFolder,
    toggleFolderPin,
    selectFolder,
    createTask,
    loadTasksFromDisk,
  } = useTaskStore();

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");

  // Load tasks on mount and set up polling
  React.useEffect(() => {
    loadTasksFromDisk();

    // Poll every 5 seconds for external changes
    const interval = setInterval(() => {
      loadTasksFromDisk();
    }, 5000);

    return () => clearInterval(interval);
  }, [loadTasksFromDisk]);

  const handleCreateFolder = async () => {
    await createFolder("New Folder");
  };

  const handleCreateTask = async () => {
    await createTask("New Task");
  };

  const startEditing = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const handleRenameSubmit = async () => {
    if (!editingId || !editingName.trim()) return;
    await renameFolder(editingId, editingName.trim());
    setEditingId(null);
    setEditingName("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setEditingId(null);
      setEditingName("");
    }
  };

  // Separate pinned folders
  const pinnedFolders = taskTree.filter((n) => n.isPinned);
  const unpinnedFolders = taskTree.filter((n) => !n.isPinned);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-10 items-center justify-between border-b border-border px-2">
        <span className="text-sm font-medium">Tasks</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleCreateFolder}
          title="New folder"
        >
          <FolderPlus className="h-5 w-5" />
        </Button>
      </div>

      {/* Folder List */}
      <div className="flex-1 overflow-auto p-2">
        <div className="flex flex-col gap-0.5">
          {/* Pinned folders */}
          {pinnedFolders.length > 0 && (
            <>
              {pinnedFolders.map((folder) => (
                <FolderItem
                  key={folder.id}
                  folder={folder}
                  isSelected={selectedFolderId === folder.id}
                  isEditing={editingId === folder.id}
                  editingName={editingName}
                  onSelect={() => selectFolder(folder.id, folder.path)}
                  onCreateTask={handleCreateTask}
                  onStartEditing={() => startEditing(folder.id, folder.name)}
                  onEditingNameChange={setEditingName}
                  onKeyDown={handleKeyDown}
                  onRenameSubmit={handleRenameSubmit}
                  onDelete={() => deleteFolder(folder.id)}
                  onTogglePin={() => toggleFolderPin(folder.id)}
                />
              ))}
              <div className="my-1 border-b border-border" />
            </>
          )}

          {/* Unpinned folders */}
          {unpinnedFolders.length === 0 && pinnedFolders.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No folders yet. Create one to get started.
            </p>
          ) : (
            unpinnedFolders.map((folder) => (
              <FolderItem
                key={folder.id}
                folder={folder}
                isSelected={selectedFolderId === folder.id}
                isEditing={editingId === folder.id}
                editingName={editingName}
                onSelect={() => selectFolder(folder.id, folder.path)}
                onCreateTask={handleCreateTask}
                onStartEditing={() => startEditing(folder.id, folder.name)}
                onEditingNameChange={setEditingName}
                onKeyDown={handleKeyDown}
                onRenameSubmit={handleRenameSubmit}
                onDelete={() => deleteFolder(folder.id)}
                onTogglePin={() => toggleFolderPin(folder.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface FolderItemProps {
  folder: TaskTreeNode;
  isSelected: boolean;
  isEditing: boolean;
  editingName: string;
  onSelect: () => void;
  onCreateTask: () => void;
  onStartEditing: () => void;
  onEditingNameChange: (name: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onRenameSubmit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}

function FolderItem({
  folder,
  isSelected,
  isEditing,
  editingName,
  onSelect,
  onCreateTask,
  onStartEditing,
  onEditingNameChange,
  onKeyDown,
  onRenameSubmit,
  onDelete,
  onTogglePin,
}: FolderItemProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-muted",
        isSelected && "bg-muted"
      )}
      onClick={onSelect}
    >
      <Folder className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />

      {isEditing ? (
        <input
          type="text"
          value={editingName}
          onChange={(e) => onEditingNameChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onRenameSubmit}
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 bg-transparent border-b border-primary outline-none text-sm"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 truncate">{folder.name}</span>
      )}

      {/* Hover actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon-xs"
          className="h-5 w-5"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(); // Select folder first
            onCreateTask(); // Then create task
          }}
          title="New task"
        >
          <Plus className="h-3 w-3" />
        </Button>
        <FolderContextMenu
          folder={folder}
          onRename={onStartEditing}
          onDelete={onDelete}
          onTogglePin={onTogglePin}
        />
      </div>
    </div>
  );
}

interface FolderContextMenuProps {
  folder: TaskTreeNode;
  onRename: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}

function FolderContextMenu({ folder, onRename, onDelete, onTogglePin }: FolderContextMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-xs" className="h-5 w-5" />}
        onClick={(e) => e.stopPropagation()}
      >
        <MoreVertical className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={onRename}>
          <Pencil className="mr-2 h-4 w-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onTogglePin}>
          <Pin className="mr-2 h-4 w-4" />
          {folder.isPinned ? "Unpin" : "Pin"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
