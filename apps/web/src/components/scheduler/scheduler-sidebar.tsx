import {
  Plus,
  FolderPlus,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSchedulerStore } from "@/stores/scheduler-store";
import { usePollingLoader } from "@/lib/hooks/use-polling-loader";
import { useInlineEditing } from "@/lib/hooks/use-inline-editing";
import { splitByPinned, collectTreeIds, collectFolders } from "@/lib/sidebar-utils";
import { SidebarTreeNode, type SidebarTreeNodeData } from "@/components/shared/sidebar-tree-node";

const scheduleLeafIcon = <Clock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />;

function getScheduleDisplayName(node: SidebarTreeNodeData) {
  return node.name;
}

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
    moveSchedule,
    selectSchedule,
    loadSchedulersFromDisk,
  } = useSchedulerStore();

  usePollingLoader(loadSchedulersFromDisk);

  const { editingId, editingName, startEditing, setEditingName, handleRenameSubmit, handleKeyDown } =
    useInlineEditing({
      onRename: async (id, name, type) => {
        if (type === "folder") {
          await renameFolder(id, name);
        } else {
          await renameSchedule(id, name);
        }
      },
    });

  const handleCreateFolder = async () => {
    await createFolder("New Folder");
  };

  const handleCreateSchedule = async (folderId?: string) => {
    await createSchedule("New Schedule", folderId);
  };

  const { pinned: pinnedFolders, unpinned: unpinnedItems } = splitByPinned(schedulerTree);

  const moveTargets = [
    { id: null, name: "Scheduler", depth: 0 },
    ...collectFolders(schedulerTree).map((f) => ({ ...f, depth: f.depth + 1 })),
  ];

  const scheduleIdsInTree = collectTreeIds(schedulerTree, "schedule");
  const inMemoryOnlySchedules = schedules.filter((s) => !scheduleIdsInTree.has(s.id));

  const hasAnyItems =
    pinnedFolders.length > 0 || unpinnedItems.length > 0 || inMemoryOnlySchedules.length > 0;

  const treeNodeProps = {
    expandedFolders,
    editingId,
    editingName,
    leafIcon: scheduleLeafIcon,
    leafType: "schedule" as const,
    createInFolderTitle: "New schedule in folder",
    selectedItemId: selectedScheduleId,
    onSelect: selectSchedule,
    onToggleExpand: toggleFolderExpansion,
    onCreateInFolder: handleCreateSchedule,
    onStartEditing: startEditing,
    onEditingNameChange: setEditingName,
    onKeyDown: handleKeyDown,
    onRenameSubmit: handleRenameSubmit,
    onDeleteFolder: deleteFolder,
    onDeleteLeaf: deleteSchedule,
    onTogglePin: toggleFolderPin,
    getDisplayName: getScheduleDisplayName,
    moveTargets,
    onMoveLeaf: moveSchedule,
  };

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
              No schedules yet
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
