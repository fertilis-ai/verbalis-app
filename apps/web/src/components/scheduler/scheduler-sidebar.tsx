import * as React from "react";
import {
  Plus,
  FolderPlus,
  MoreVertical,
  Pin,
  Pencil,
  Trash2,
  ChevronRight,
  Clock,
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
import { useSchedulerStore, type SchedulerTreeNode } from "@/stores/scheduler-store";

export function SchedulerSidebar() {
  const {
    schedulerTree,
    schedules,
    selectedScheduleId,
    expandedFolders,
    createFolder,
    renameFolder,
    deleteFolder,
    toggleFolderPin,
    toggleFolderExpansion,
    createSchedule,
    renameSchedule,
    deleteSchedule,
    selectSchedule,
    loadSchedulersFromDisk,
  } = useSchedulerStore();

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");
  const [editingType, setEditingType] = React.useState<"folder" | "schedule" | null>(null);

  // Load schedulers on mount and set up polling
  React.useEffect(() => {
    loadSchedulersFromDisk();

    // Poll every 5 seconds for external changes
    const interval = setInterval(() => {
      loadSchedulersFromDisk();
    }, 5000);

    return () => clearInterval(interval);
  }, [loadSchedulersFromDisk]);

  const handleCreateFolder = async () => {
    await createFolder("New Folder");
  };

  const handleCreateSchedule = async (folderId?: string) => {
    await createSchedule("New Schedule", folderId);
  };

  const startEditing = (id: string, name: string, type: "folder" | "schedule") => {
    setEditingId(id);
    setEditingName(name);
    setEditingType(type);
  };

  const handleRenameSubmit = async () => {
    if (!editingId || !editingName.trim() || !editingType) return;

    if (editingType === "folder") {
      await renameFolder(editingId, editingName.trim());
    } else {
      await renameSchedule(editingId, editingName.trim());
    }

    setEditingId(null);
    setEditingName("");
    setEditingType(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setEditingId(null);
      setEditingName("");
      setEditingType(null);
    }
  };

  // Separate pinned items
  const pinnedFolders = schedulerTree.filter((n) => n.type === "folder" && n.isPinned);
  const unpinnedItems = schedulerTree.filter((n) => !(n.type === "folder" && n.isPinned));

  // Find schedules that are in memory but not yet in tree (for immediate UI feedback)
  const scheduleIdsInTree = new Set<string>();
  const collectScheduleIds = (nodes: SchedulerTreeNode[]) => {
    for (const node of nodes) {
      if (node.type === "schedule") {
        scheduleIdsInTree.add(node.id);
      } else if (node.children) {
        collectScheduleIds(node.children);
      }
    }
  };
  collectScheduleIds(schedulerTree);

  const inMemoryOnlySchedules = schedules.filter((s) => !scheduleIdsInTree.has(s.id));

  const hasAnyItems =
    pinnedFolders.length > 0 || unpinnedItems.length > 0 || inMemoryOnlySchedules.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-10 items-center justify-between border-b border-border px-2">
        <span className="text-sm font-medium">Scheduler</span>
        <div className="flex items-center gap-1">
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
            onClick={() => handleCreateSchedule()}
            title="New schedule"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Scheduler Tree */}
      <div className="flex-1 overflow-auto p-2">
        <div className="flex flex-col gap-0.5">
          {/* Pinned folders */}
          {pinnedFolders.length > 0 && (
            <>
              {pinnedFolders.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedScheduleId={selectedScheduleId}
                  expandedFolders={expandedFolders}
                  editingId={editingId}
                  editingName={editingName}
                  onSelect={selectSchedule}
                  onToggleExpand={toggleFolderExpansion}
                  onCreateScheduleInFolder={handleCreateSchedule}
                  onStartEditing={startEditing}
                  onEditingNameChange={setEditingName}
                  onKeyDown={handleKeyDown}
                  onRenameSubmit={handleRenameSubmit}
                  onDeleteFolder={deleteFolder}
                  onDeleteSchedule={deleteSchedule}
                  onTogglePin={toggleFolderPin}
                />
              ))}
              <div className="my-1 border-b border-border" />
            </>
          )}

          {/* Rest of tree */}
          {!hasAnyItems ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No schedules yet
            </p>
          ) : (
            <>
              {unpinnedItems.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedScheduleId={selectedScheduleId}
                  expandedFolders={expandedFolders}
                  editingId={editingId}
                  editingName={editingName}
                  onSelect={selectSchedule}
                  onToggleExpand={toggleFolderExpansion}
                  onCreateScheduleInFolder={handleCreateSchedule}
                  onStartEditing={startEditing}
                  onEditingNameChange={setEditingName}
                  onKeyDown={handleKeyDown}
                  onRenameSubmit={handleRenameSubmit}
                  onDeleteFolder={deleteFolder}
                  onDeleteSchedule={deleteSchedule}
                  onTogglePin={toggleFolderPin}
                />
              ))}

              {/* In-memory only schedules (not yet on disk) */}
              {inMemoryOnlySchedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-muted",
                    selectedScheduleId === schedule.id && "bg-muted"
                  )}
                  onClick={() => selectSchedule(schedule.id)}
                >
                  <Clock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{schedule.name || "New Schedule"}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface TreeNodeProps {
  node: SchedulerTreeNode;
  depth: number;
  selectedScheduleId: string | null;
  expandedFolders: Set<string>;
  editingId: string | null;
  editingName: string;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onCreateScheduleInFolder: (folderId: string) => void;
  onStartEditing: (id: string, name: string, type: "folder" | "schedule") => void;
  onEditingNameChange: (name: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onRenameSubmit: () => void;
  onDeleteFolder: (id: string) => Promise<void>;
  onDeleteSchedule: (id: string) => Promise<void>;
  onTogglePin: (id: string) => Promise<void>;
}

function TreeNode({
  node,
  depth,
  selectedScheduleId,
  expandedFolders,
  editingId,
  editingName,
  onSelect,
  onToggleExpand,
  onCreateScheduleInFolder,
  onStartEditing,
  onEditingNameChange,
  onKeyDown,
  onRenameSubmit,
  onDeleteFolder,
  onDeleteSchedule,
  onTogglePin,
}: TreeNodeProps) {
  const isFolder = node.type === "folder";
  const isExpanded = expandedFolders.has(node.id);
  const isEditing = editingId === node.id;
  const isSelected = !isFolder && selectedScheduleId === node.id;
  const baseIndent = 8;
  const indentStep = 24;
  const paddingLeft = `${baseIndent + depth * indentStep}px`;

  const displayName = node.name;

  if (isFolder) {
    return (
      <div>
        <div
          className="group flex items-center gap-1 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-muted"
          style={{ paddingLeft }}
        >
          <button
            className="flex-shrink-0 p-0.5 hover:bg-muted-foreground/10 rounded"
            onClick={() => onToggleExpand(node.id)}
          >
            <ChevronRight
              className={cn(
                "h-3 w-3 transition-transform",
                isExpanded && "rotate-90"
              )}
            />
          </button>

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
            />
          ) : (
            <span
              className="flex-1 truncate"
              onClick={() => onToggleExpand(node.id)}
            >
              {displayName}
            </span>
          )}

          {/* Hover actions */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon-xs"
              className="h-5 w-5"
              onClick={(e) => {
                e.stopPropagation();
                if (!isExpanded) {
                  onToggleExpand(node.id);
                }
                onCreateScheduleInFolder(node.id);
              }}
              title="New schedule in folder"
            >
              <Plus className="h-3 w-3" />
            </Button>
            <FolderContextMenu
              node={node}
              onRename={() => onStartEditing(node.id, node.name, "folder")}
              onDelete={() => onDeleteFolder(node.id)}
              onTogglePin={() => onTogglePin(node.id)}
            />
          </div>
        </div>

        {/* Children */}
        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                selectedScheduleId={selectedScheduleId}
                expandedFolders={expandedFolders}
                editingId={editingId}
                editingName={editingName}
                onSelect={onSelect}
                onToggleExpand={onToggleExpand}
                onCreateScheduleInFolder={onCreateScheduleInFolder}
                onStartEditing={onStartEditing}
                onEditingNameChange={onEditingNameChange}
                onKeyDown={onKeyDown}
                onRenameSubmit={onRenameSubmit}
                onDeleteFolder={onDeleteFolder}
                onDeleteSchedule={onDeleteSchedule}
                onTogglePin={onTogglePin}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Schedule item
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-muted",
        isSelected && "bg-muted"
      )}
      style={{ paddingLeft }}
      onClick={() => onSelect(node.id)}
    >
      <Clock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />

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
        <span className="flex-1 truncate">{displayName}</span>
      )}

      {/* Hover actions */}
      <div className="flex items-center opacity-0 group-hover:opacity-100">
        <ScheduleContextMenu
          onRename={() => onStartEditing(node.id, displayName, "schedule")}
          onDelete={() => onDeleteSchedule(node.id)}
        />
      </div>
    </div>
  );
}

interface FolderContextMenuProps {
  node: SchedulerTreeNode;
  onRename: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}

function FolderContextMenu({ node, onRename, onDelete, onTogglePin }: FolderContextMenuProps) {
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
          {node.isPinned ? "Unpin" : "Pin"}
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

interface ScheduleContextMenuProps {
  onRename: () => void;
  onDelete: () => void;
}

function ScheduleContextMenu({ onRename, onDelete }: ScheduleContextMenuProps) {
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
