import { Play, Square, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTaskStore, type TaskData } from "@/stores/task-store";

interface TaskCardProps {
  task: TaskData;
}

export function TaskCard({ task }: TaskCardProps) {
  const { startTask, stopTask, redoTask, openTaskModal } = useTaskStore();

  const handleAction = (e: React.MouseEvent, action: () => Promise<void>) => {
    e.stopPropagation();
    action();
  };

  return (
    <div
      className="group relative cursor-pointer rounded-md border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
      onClick={() => openTaskModal(task)}
    >
      {/* Content */}
      <div>
        <h4 className="text-sm font-medium truncate pr-6">{task.title}</h4>
        {task.description && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        )}
        <span className="mt-1 block text-xs text-muted-foreground">
          {formatDate(task.createdAt)}
        </span>
      </div>

      {/* Action button - top right, always visible */}
      <div className="absolute top-2 right-2">
        {task.stage === "backlog" && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => handleAction(e, () => startTask(task.id))}
            title="Start task"
          >
            <Play className="h-3 w-3" />
          </Button>
        )}
        {task.stage === "in_progress" && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => handleAction(e, () => stopTask(task.id))}
            title="Stop task"
          >
            <Square className="h-3 w-3" />
          </Button>
        )}
        {task.stage === "done" && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => handleAction(e, () => redoTask(task.id))}
            title="Redo task"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}
