import { ConfirmDialog } from "@/components/shared/confirm-dialog";

interface ConfirmModalProps {
  open: boolean;
  action: "play" | "stop" | "redo" | null;
  taskCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

const actionMessages = {
  play: {
    title: "Start All Tasks",
    description: (count: number) =>
      `Start ${count} task${count === 1 ? "" : "s"}? This will execute all Backlog tasks via the selected agent.`,
    confirmLabel: "Start All",
  },
  stop: {
    title: "Stop All Tasks",
    description: (count: number) =>
      `Stop ${count} task${count === 1 ? "" : "s"}? This will stop all running agents and move tasks back to Backlog.`,
    confirmLabel: "Stop All",
  },
  redo: {
    title: "Redo All Tasks",
    description: (count: number) =>
      `Redo ${count} task${count === 1 ? "" : "s"}? This will re-execute all Done tasks.`,
    confirmLabel: "Redo All",
  },
};

export function ConfirmModal({
  open,
  action,
  taskCount,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!action) return null;

  const { title, description, confirmLabel } = actionMessages[action];

  return (
    <ConfirmDialog
      open={open}
      title={title}
      description={description(taskCount)}
      confirmLabel={confirmLabel}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
