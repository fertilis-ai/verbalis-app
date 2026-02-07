import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <DialogPrimitive.Root open={open} onOpenChange={(open) => !open && onCancel()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50 data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0" />
        <DialogPrimitive.Popup className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-popover p-6 shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/10">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              </div>
              <DialogPrimitive.Title className="text-lg font-medium">
                {title}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close render={<Button variant="ghost" size="icon-xs" />}>
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <p className="text-sm text-muted-foreground mb-6">
            {description(taskCount)}
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
