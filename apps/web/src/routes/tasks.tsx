import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/app-layout";
import { TaskSidebar } from "@/components/tasks/task-sidebar";
import { KanbanBoard } from "@/components/tasks/kanban-board";

export const Route = createFileRoute("/tasks")({
  component: TasksPage,
});

function TasksPage() {
  return (
    <AppLayout section="tasks" leftPane={<TaskSidebar />}>
      <KanbanBoard />
    </AppLayout>
  );
}
