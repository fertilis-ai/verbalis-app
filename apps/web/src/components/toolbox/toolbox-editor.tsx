import * as React from "react";
import { Wrench, Play, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useToolboxStore, itemKey, type ToolboxCategory } from "@/stores/toolbox-store";
import { ToolboxTabs } from "./toolbox-tabs";
import { CodeOverlayEditor } from "@/components/shared/code-overlay-editor";
import { runWorkflowByName } from "@/lib/workflows/run-workflow";
import { validateToolboxContent } from "@/lib/toolbox/toolbox-schemas";

// Map category to language for syntax highlighting
function getLanguage(category: ToolboxCategory): string {
  switch (category) {
    case "prompts":
      return "yaml";
    case "memories":
      return "markdown";
    case "agents":
      return "markdown";
    case "skills":
      return "markdown";
    case "workflows":
      return "yaml";
    default:
      return "text";
  }
}

export function ToolboxEditor() {
  const { openItems, activeItemKey, updateItem, updateOpenItemContent, markOpenItemSaved } =
    useToolboxStore();
  const [isRunning, setIsRunning] = React.useState(false);

  const activeItem = openItems.find(
    (i) => itemKey(i.category, i.name) === activeItemKey
  );
  const hasOpenItems = openItems.length > 0;

  // Same schema contract the agent's tools enforce, but advisory here: a
  // human can always save (warn-but-allow), the agent's writes are rejected.
  const validation = React.useMemo(() => {
    if (!activeItem) return null;
    return validateToolboxContent(activeItem.category, activeItem.currentContent);
  }, [activeItem]);

  const handleSave = async () => {
    if (activeItem) {
      await updateItem(activeItem.category, activeItem.name, activeItem.currentContent);
      markOpenItemSaved(activeItem.category, activeItem.name, activeItem.currentContent);
    }
  };

  const handleRunWorkflow = async () => {
    if (!activeItem || activeItem.category !== "workflows" || isRunning) return;
    // Persist any unsaved edits so the run uses the current content.
    if (activeItem.isModified) await handleSave();
    setIsRunning(true);
    const name = activeItem.name;
    toast(`Running workflow "${name}"…`);
    try {
      const result = await runWorkflowByName(name);
      if (result.error) {
        toast.error(`Workflow "${name}" failed: ${result.error}`);
      } else {
        toast.success(`Workflow "${name}" completed (${result.stepOutputs.length} steps).`);
      }
    } catch (error) {
      toast.error(`Workflow "${name}" failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      {hasOpenItems ? (
        <ToolboxTabs />
      ) : (
        <div className="flex h-10 items-center border-b border-border px-2 bg-sidebar">
          <span className="text-sm font-medium">Toolbox</span>
        </div>
      )}

      {!activeItem ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <Wrench className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-medium">No item selected</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Select an item from the sidebar to edit
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
        {validation && !validation.ok && (
          <div className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{validation.error} (saving is still allowed)</span>
          </div>
        )}
        {activeItem.category === "workflows" && (
          <div className="flex items-center justify-end gap-2 border-b border-border/50 px-3 py-1.5">
            <button
              type="button"
              onClick={handleRunWorkflow}
              disabled={isRunning}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {isRunning ? "Running…" : "Run workflow"}
            </button>
          </div>
        )}
        <CodeOverlayEditor
          className="flex flex-1 overflow-hidden font-mono text-sm"
          content={activeItem.currentContent}
          language={getLanguage(activeItem.category)}
          onChange={(value) =>
            updateOpenItemContent(activeItem.category, activeItem.name, value)
          }
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
              e.preventDefault();
              handleSave();
            }
          }}
        />
        </div>
      )}
    </div>
  );
}
