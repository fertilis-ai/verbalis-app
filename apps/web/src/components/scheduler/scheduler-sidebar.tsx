import { Clock } from "lucide-react";
import { useSchedulerStore } from "@/stores/scheduler-store";
import { useShallow } from "zustand/react/shallow";
import { FolderTreeSidebar } from "@/components/shared/folder-tree-sidebar";
import type { SidebarTreeNodeData } from "@/components/shared/sidebar-tree-node";

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
  } = useSchedulerStore(
    useShallow((s) => ({
      schedulerTree: s.schedulerTree,
      schedules: s.schedules,
      selectedScheduleId: s.selectedScheduleId,
      expandedFolders: s.expandedFolders,
      createFolder: s.createFolder,
      renameFolder: s.renameFolder,
      deleteFolder: s.deleteFolder,
      toggleFolderPin: s.toggleFolderPin,
      toggleFolderExpansion: s.toggleFolderExpansion,
      createSchedule: s.createSchedule,
      renameSchedule: s.renameSchedule,
      deleteSchedule: s.deleteSchedule,
      moveSchedule: s.moveSchedule,
      selectSchedule: s.selectSchedule,
      loadSchedulersFromDisk: s.loadSchedulersFromDisk,
    }))
  );

  const items = schedules.map((s) => ({ id: s.id, label: s.name || "New Schedule" }));

  return (
    <FolderTreeSidebar
      title="Scheduler"
      rootFolderName="Scheduler"
      tree={schedulerTree}
      leafType="schedule"
      leafIcon={Clock}
      items={items}
      selectedItemId={selectedScheduleId}
      expandedFolders={expandedFolders}
      getDisplayName={getScheduleDisplayName}
      emptyText="No schedules yet"
      newItemTitle="New schedule"
      createInFolderTitle="New schedule in folder"
      loadFromDisk={loadSchedulersFromDisk}
      onCreateFolder={() => createFolder("New Folder")}
      onCreateItem={(folderId) => createSchedule("New Schedule", folderId)}
      onSelect={selectSchedule}
      onToggleExpand={toggleFolderExpansion}
      onTogglePin={toggleFolderPin}
      onRenameFolder={renameFolder}
      onRenameLeaf={renameSchedule}
      onDeleteFolder={deleteFolder}
      onDeleteLeaf={deleteSchedule}
      onMoveLeaf={moveSchedule}
    />
  );
}
