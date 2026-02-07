import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTaskStore } from "@/stores/task-store";
import { useAgentStore } from "@/stores/agent-store";
import { useSettingsStore } from "@/stores/settings-store";

export function TaskModal() {
  const { editingTask, isTaskModalOpen, closeTaskModal, updateTask, deleteTask, createTask } = useTaskStore();
  const agents = useAgentStore((s) => s.agents);
  const workingDirectory = useSettingsStore((s) => s.workingDirectory);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [agent, setAgent] = React.useState("default");
  const [outputFolder, setOutputFolder] = React.useState("");

  const isCreateMode = !editingTask;

  React.useEffect(() => {
    if (editingTask) {
      setTitle(editingTask.title);
      setDescription(editingTask.description);
      setAgent(editingTask.agent || "default");
      setOutputFolder(editingTask.outputFolder || workingDirectory);
    } else {
      // Reset form for create mode
      setTitle("");
      setDescription("");
      setAgent("default");
      setOutputFolder(workingDirectory);
    }
  }, [editingTask, isTaskModalOpen, workingDirectory]);

  const handleSave = async () => {
    if (!title.trim()) return;

    if (isCreateMode) {
      // Create new task
      await createTask(title.trim(), description.trim(), agent, outputFolder.trim());
      closeTaskModal();
      return;
    }

    // Update existing task
    if (editingTask) {
      await updateTask(editingTask.id, {
        title: title.trim(),
        description: description.trim(),
        agent,
        outputFolder: outputFolder.trim(),
      });
      closeTaskModal();
    }
  };

  const handleDelete = async () => {
    if (editingTask) {
      await deleteTask(editingTask.id);
      closeTaskModal();
    }
  };

  return (
    <DialogPrimitive.Root open={isTaskModalOpen} onOpenChange={(open) => !open && closeTaskModal()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50 data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0" />
        <DialogPrimitive.Popup className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-popover p-6 shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95">
          <div className="flex items-center justify-between mb-4">
            <DialogPrimitive.Title className="text-lg font-medium">
              {isCreateMode ? "New Task" : "Edit Task"}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close render={<Button variant="ghost" size="icon-xs" />}>
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title..."
                className="mt-1"
                autoFocus
              />
            </div>

            <div>
              <label className="text-sm font-medium">Agent</label>
              <select
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {agents.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Task description..."
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                rows={4}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Output Folder</label>
              <Input
                value={outputFolder}
                onChange={(e) => setOutputFolder(e.target.value)}
                placeholder="/path/to/output..."
                className="mt-1"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-between">
            {!isCreateMode ? (
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="mr-1 h-4 w-4" />
                Delete
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={closeTaskModal}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!title.trim()}>
                {isCreateMode ? "Create" : "Update"}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
