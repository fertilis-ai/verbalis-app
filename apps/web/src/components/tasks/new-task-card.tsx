import { Plus } from "lucide-react";
import { useTaskStore } from "@/stores/task-store";

export function NewTaskCard() {
  const { selectedFolderId, openTaskModal } = useTaskStore();

  if (!selectedFolderId) return null;

  return (
    <button
      onClick={() => openTaskModal()}
      className="flex w-full items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
    >
      <Plus className="h-4 w-4" />
      New task
    </button>
  );
}
