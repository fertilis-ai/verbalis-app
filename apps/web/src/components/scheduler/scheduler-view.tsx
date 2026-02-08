import * as React from "react";
import { Clock, Play, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSchedulerStore, describeCron, type ScheduleData } from "@/stores/scheduler-store";
import { useToolboxStore } from "@/stores/toolbox-store";
import { CronBuilder } from "./cron-builder";
import { useDebouncedCallback } from "use-debounce";

export function SchedulerView() {
  const {
    getSelectedSchedule,
    updateSchedule,
    runScheduleNow,
    stopScheduleRun,
    runningScheduleId,
    schedulerLog,
    schedulerLogScheduleId,
  } = useSchedulerStore();
  const toolboxItems = useToolboxStore((s) => s.items);
  const agents = toolboxItems.filter((i) => i.category === "agents");

  const selectedSchedule = getSelectedSchedule();

  // Local state for cron (synced with store for bidirectional updates)
  const [cronValue, setCronValue] = React.useState(selectedSchedule?.cron ?? "0 9 * * *");

  // Sync cron value when schedule changes
  React.useEffect(() => {
    if (selectedSchedule) {
      setCronValue(selectedSchedule.cron);
    }
  }, [selectedSchedule?.id, selectedSchedule?.cron]);

  // Debounced update for text fields (300ms delay)
  const debouncedUpdate = useDebouncedCallback(
    (updates: Partial<ScheduleData>) => {
      if (selectedSchedule) {
        updateSchedule(selectedSchedule.id, updates);
      }
    },
    300
  );

  // Immediate update for toggles/selects
  const handleImmediateUpdate = (updates: Partial<ScheduleData>) => {
    if (selectedSchedule) {
      updateSchedule(selectedSchedule.id, updates);
    }
  };

  // Run now validation and handler
  const canRun = (selectedSchedule?.prompt.trim().length ?? 0) > 0;
  const isRunning = runningScheduleId === selectedSchedule?.id;

  const handleRunNow = async () => {
    if (!selectedSchedule || !canRun) return;
    await runScheduleNow(selectedSchedule.id);
  };

  // No schedule selected
  if (!selectedSchedule) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-10 items-center border-b border-border px-4">
          <span className="text-sm font-medium">Scheduler</span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <Clock className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-medium">No schedule selected</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Select a schedule from the sidebar or create a new one
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Schedule selected - show form
  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex h-10 items-center justify-between border-b border-border px-4">
        <span className="text-sm font-medium">{selectedSchedule.name}</span>
        {isRunning ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={stopScheduleRun}
          >
            <Square className="size-3" />
            Stop
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={!canRun || runningScheduleId !== null}
            onClick={handleRunNow}
          >
            <Play className="size-3" />
            Run now
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Name + Enabled row */}
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium">Name</label>
              <Input
                key={selectedSchedule.id + "-name"}
                defaultValue={selectedSchedule.name}
                onChange={(e) => debouncedUpdate({ name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <label className="text-sm font-medium">Enabled</label>
              <button
                type="button"
                role="switch"
                aria-checked={selectedSchedule.enabled}
                onClick={() => handleImmediateUpdate({ enabled: !selectedSchedule.enabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  selectedSchedule.enabled ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                    selectedSchedule.enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Schedule (Cron) */}
          <div>
            <label className="text-sm font-medium">Schedule (Cron)</label>
            <div className="mt-1 space-y-2">
              <Input
                value={cronValue}
                onChange={(e) => {
                  setCronValue(e.target.value);
                  debouncedUpdate({ cron: e.target.value });
                }}
                placeholder="0 9 * * *"
              />
              <p className="text-sm text-muted-foreground">{describeCron(cronValue)}</p>
              <CronBuilder
                value={cronValue}
                onChange={(v) => {
                  setCronValue(v);
                  handleImmediateUpdate({ cron: v });
                }}
              />
            </div>
          </div>

          {/* Agent */}
          <div>
            <label className="text-sm font-medium">Agent</label>
            <select
              value={selectedSchedule.agentId}
              onChange={(e) => handleImmediateUpdate({ agentId: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-transparent dark:bg-input/30 h-8 px-2.5 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {agents.map((agent) => (
                <option key={agent.name} value={agent.name}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          {/* Prompt */}
          <div>
            <label className="text-sm font-medium">Prompt</label>
            <textarea
              key={selectedSchedule.id + "-prompt"}
              defaultValue={selectedSchedule.prompt}
              onChange={(e) => debouncedUpdate({ prompt: e.target.value })}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="mt-1 w-full rounded-md border border-input bg-transparent dark:bg-input/30 px-2.5 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              rows={6}
              placeholder="What should the agent do when this schedule runs?"
            />
          </div>

          {/* Run info */}
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-border p-4">
            <div>
              <span className="text-sm text-muted-foreground">Last Run</span>
              <p className="text-sm font-medium">
                {selectedSchedule.lastRun
                  ? new Date(selectedSchedule.lastRun).toLocaleString()
                  : "Never"}
              </p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Next Run</span>
              <p className="text-sm font-medium">
                {selectedSchedule.nextRun
                  ? new Date(selectedSchedule.nextRun).toLocaleString()
                  : "Not scheduled"}
              </p>
            </div>
          </div>

          {/* Preview */}
          {schedulerLogScheduleId === selectedSchedule.id && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Preview</label>
              {isRunning && !schedulerLog ? (
                <div className="flex items-center gap-2 rounded-lg border border-border p-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Running...</span>
                </div>
              ) : schedulerLog ? (
                <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/50 p-4 font-mono text-sm whitespace-pre-wrap">
                  {schedulerLog}
                </pre>
              ) : null}
            </div>
          )}

          {/* Error indicator */}
          {selectedSchedule.hasError && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4">
              <p className="text-sm text-red-500">
                Last execution encountered an error. Check logs for details.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
