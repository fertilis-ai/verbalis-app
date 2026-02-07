import { Play, Square, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTaskStore } from "@/stores/task-store";
import { KanbanColumn } from "./kanban-column";
import { TaskCard } from "./task-card";
import { NewTaskCard } from "./new-task-card";
import { ConfirmModal } from "./confirm-modal";
import { TaskModal } from "./task-modal";

export function KanbanBoard() {
  const {
    selectedFolderId,
    getTasksByStage,
    confirmModalAction,
    setConfirmModalAction,
    playAll,
    stopAll,
    redoAll,
    taskTree,
    runningTaskIds,
  } = useTaskStore();

  // Find the selected folder name
  const findFolderName = (): string => {
    const folder = taskTree.find((f) => f.id === selectedFolderId);
    return folder?.name ?? "Tasks";
  };

  const backlogTasks = getTasksByStage("backlog");
  const inProgressTasks = getTasksByStage("in_progress");
  const doneTasks = getTasksByStage("done");

  const getConfirmTaskCount = () => {
    switch (confirmModalAction) {
      case "play":
        return backlogTasks.length;
      case "stop":
        return inProgressTasks.length;
      case "redo":
        return doneTasks.length;
      default:
        return 0;
    }
  };

  const handleConfirmAction = async () => {
    switch (confirmModalAction) {
      case "play":
        await playAll();
        break;
      case "stop":
        await stopAll();
        break;
      case "redo":
        await redoAll();
        break;
    }
    setConfirmModalAction(null);
  };

  const handlePlayClick = () => {
    if (backlogTasks.length > 0) {
      setConfirmModalAction("play");
    }
  };

  const handleStopClick = () => {
    if (inProgressTasks.length > 0) {
      setConfirmModalAction("stop");
    }
  };

  const handleRedoClick = () => {
    if (doneTasks.length > 0) {
      setConfirmModalAction("redo");
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-10 items-center justify-between border-b border-border px-2">
        <span className="text-sm font-medium">{findFolderName()}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handlePlayClick}
            disabled={!selectedFolderId || backlogTasks.length === 0}
            title="Start all backlog tasks"
          >
            <Play className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleStopClick}
            disabled={!selectedFolderId || inProgressTasks.length === 0}
            title="Stop all in-progress tasks"
          >
            <Square className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleRedoClick}
            disabled={!selectedFolderId || doneTasks.length === 0}
            title="Redo all done tasks"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!selectedFolderId ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">Select a folder to view tasks</p>
        </div>
      ) : (
        <div className="flex flex-1 gap-4 overflow-auto p-4">
          {/* Backlog Column */}
          <KanbanColumn title="Backlog" count={backlogTasks.length}>
            <NewTaskCard />
            {backlogTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </KanbanColumn>

          {/* In Progress Column */}
          <KanbanColumn title="In Progress" count={inProgressTasks.length} loading={runningTaskIds.size > 0}>
            {inProgressTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </KanbanColumn>

          {/* Done Column */}
          <KanbanColumn title="Done" count={doneTasks.length}>
            {doneTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </KanbanColumn>
        </div>
      )}

      {/* Task Modal */}
      <TaskModal />

      {/* Confirm Modal */}
      <ConfirmModal
        open={confirmModalAction !== null}
        action={confirmModalAction}
        taskCount={getConfirmTaskCount()}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmModalAction(null)}
      />
    </div>
  );
}
