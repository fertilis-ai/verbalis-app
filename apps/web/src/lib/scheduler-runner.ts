import CronExpressionParser from "cron-parser";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useChatStore } from "@/stores/chat-store";
import {
  loadSchedulerTree,
  loadSchedule,
  saveSchedule,
  type ScheduleData,
  type SchedulerTreeNode,
} from "@/lib/storage";
import { YOLO_MODE_CONFIG } from "@/lib/guardrails/presets";
import { collectFromTree } from "@/lib/tree-utils";
import { listWorkflows, loadWorkflow, runWorkflow } from "@/lib/workflows/run-workflow";

const DEFAULT_TICK_MS = 60_000;
const DEFAULT_SCHEDULE_TITLE = "Scheduled Run";

let schedulerTimer: number | null = null;
let tickInFlight = false;

async function appendSchedulerLog(line: string): Promise<void> {
  if (!isTauri()) return;
  invoke("append_log_file", { filename: "scheduler.txt", line }).catch(console.warn);
}

function collectSchedulePaths(tree: SchedulerTreeNode[]): string[] {
  return collectFromTree(tree, (node) => (node.type === "schedule" ? node.path : undefined));
}

function computeNextRun(cron: string, fromDate: Date): string | null {
  try {
    const interval = CronExpressionParser.parse(cron, { currentDate: fromDate });
    return interval.next().toISOString();
  } catch {
    return null;
  }
}

async function saveScheduleAtPath(schedule: ScheduleData, schedulePath: string): Promise<void> {
  const folderPath = schedulePath.substring(0, schedulePath.lastIndexOf("/"));
  await saveSchedule(schedule, folderPath);
}

async function markScheduleError(
  schedule: ScheduleData,
  schedulePath: string,
  error: unknown
): Promise<void> {
  const now = new Date().toISOString();
  const updated: ScheduleData = {
    ...schedule,
    hasError: true,
    updatedAt: now,
  };
  await saveScheduleAtPath(updated, schedulePath);
  console.error("[scheduler-runner] Schedule failed:", schedule.id, error);
}

export interface ExecuteScheduleResult {
  conversationId: string | null;
  startedAt: string;
}

export interface RunScheduleNowOptions {
  onConversationCreated?: (conversationId: string) => void;
}

async function executeSchedule(
  schedule: ScheduleData,
  schedulePath: string,
  options: { manual: boolean; onConversationCreated?: (conversationId: string) => void }
): Promise<ExecuteScheduleResult> {
  const now = new Date();
  const nowIso = now.toISOString();
  const nextRun = schedule.enabled ? computeNextRun(schedule.cron, now) : null;

  if (!options.manual && schedule.enabled && !nextRun) {
    await markScheduleError(schedule, schedulePath, "Invalid cron expression");
    return { conversationId: null, startedAt: nowIso };
  }

  const updatedSchedule: ScheduleData = {
    ...schedule,
    lastRun: nowIso,
    nextRun,
    hasError: false,
    updatedAt: nowIso,
  };

  await saveScheduleAtPath(updatedSchedule, schedulePath);

  const prompt = schedule.prompt?.trim() ?? "";
  if (!prompt) {
    if (!options.manual) {
      await markScheduleError(updatedSchedule, schedulePath, "Schedule prompt is empty");
    }
    return { conversationId: null, startedAt: nowIso };
  }

  try {
    await appendSchedulerLog(`[${nowIso}] Starting schedule "${schedule.name}" (${schedule.id})`);

    const chatStore = useChatStore.getState();
    const conversation = await chatStore.createConversationInBackground({
      title: schedule.name?.trim() || DEFAULT_SCHEDULE_TITLE,
    });

    options.onConversationCreated?.(conversation.id);

    await chatStore.sendMessageToConversation(conversation.id, prompt, {
      agentId: schedule.agentId,
      allowAutoRename: false,
      setStreaming: false,
      guardrailsConfig: YOLO_MODE_CONFIG,
    });

    await appendSchedulerLog(`[${new Date().toISOString()}] Completed schedule "${schedule.name}" (${schedule.id})`);

    return { conversationId: conversation.id, startedAt: nowIso };
  } catch (error) {
    await appendSchedulerLog(`[${new Date().toISOString()}] Error in schedule "${schedule.name}": ${error}`);
    await markScheduleError(updatedSchedule, schedulePath, error);
    return { conversationId: null, startedAt: nowIso };
  }
}

async function normalizeSchedule(schedule: ScheduleData, schedulePath: string): Promise<void> {
  if (!schedule.enabled) {
    if (schedule.nextRun !== null) {
      const updated: ScheduleData = {
        ...schedule,
        nextRun: null,
        updatedAt: new Date().toISOString(),
      };
      await saveScheduleAtPath(updated, schedulePath);
    }
    return;
  }

  const nextRun = schedule.nextRun ? new Date(schedule.nextRun) : null;
  if (!nextRun || Number.isNaN(nextRun.getTime())) {
    const computed = computeNextRun(schedule.cron, new Date());
    const updated: ScheduleData = {
      ...schedule,
      nextRun: computed,
      hasError: computed ? schedule.hasError : true,
      updatedAt: new Date().toISOString(),
    };
    await saveScheduleAtPath(updated, schedulePath);
  }
}

// ---------------------------------------------------------------------------
// Workflow scheduling
//
// Workflows (Toolbox "workflows" category) with a `trigger.schedule` cron are
// discovered alongside schedules on each tick. Unlike schedules they have no
// persisted run state, so next-run times are tracked in memory: a workflow's
// nextRun is seeded on first sighting (so it doesn't fire on startup) and
// advanced after each run.
// ---------------------------------------------------------------------------

const workflowNextRun = new Map<string, Date>();

async function runWorkflowsTick(now: Date): Promise<void> {
  let names: string[];
  try {
    names = await listWorkflows();
  } catch {
    return;
  }
  const seen = new Set<string>();

  for (const name of names) {
    const workflow = await loadWorkflow(name);
    const cron = workflow?.trigger?.schedule;
    if (!workflow || !cron) continue;
    seen.add(name);

    const existing = workflowNextRun.get(name);
    if (!existing) {
      // First sighting — seed the next run without firing immediately.
      const next = computeNextRun(cron, now);
      if (next) workflowNextRun.set(name, new Date(next));
      continue;
    }

    if (existing <= now) {
      const next = computeNextRun(cron, now);
      workflowNextRun.set(name, next ? new Date(next) : new Date(now.getTime() + DEFAULT_TICK_MS));
      try {
        await appendSchedulerLog(`[${now.toISOString()}] Starting workflow "${name}"`);
        await runWorkflow(workflow);
        await appendSchedulerLog(`[${new Date().toISOString()}] Completed workflow "${name}"`);
      } catch (error) {
        await appendSchedulerLog(`[${new Date().toISOString()}] Error in workflow "${name}": ${error}`);
        console.error("[scheduler-runner] Workflow failed:", name, error);
      }
    }
  }

  // Drop tracking for workflows that no longer exist / lost their schedule.
  for (const key of [...workflowNextRun.keys()]) {
    if (!seen.has(key)) workflowNextRun.delete(key);
  }
}

async function runSchedulerTick(): Promise<void> {
  if (tickInFlight) {
    console.warn("[scheduler-runner] Previous tick still running, skipping this tick");
    return;
  }
  tickInFlight = true;
  const tickStartedAt = Date.now();

  try {
    const tree = await loadSchedulerTree();
    const schedulePaths = collectSchedulePaths(tree);
    const now = new Date();

    for (const schedulePath of schedulePaths) {
      const schedule = await loadSchedule(schedulePath);
      if (!schedule) continue;

      if (!schedule.enabled) {
        await normalizeSchedule(schedule, schedulePath);
        continue;
      }

      if (!schedule.nextRun) {
        await normalizeSchedule(schedule, schedulePath);
        continue;
      }

      const dueAt = new Date(schedule.nextRun);
      if (Number.isNaN(dueAt.getTime())) {
        await markScheduleError(schedule, schedulePath, "Invalid nextRun timestamp");
        continue;
      }

      if (dueAt <= now) {
        await executeSchedule(schedule, schedulePath, { manual: false });
      }
    }

    // Discover and run scheduled workflows alongside schedules.
    await runWorkflowsTick(now);
  } catch (error) {
    console.error("[scheduler-runner] Tick failed:", error);
  } finally {
    tickInFlight = false;
    const tickDuration = Date.now() - tickStartedAt;
    if (tickDuration > DEFAULT_TICK_MS) {
      console.warn(
        `[scheduler-runner] Tick took ${tickDuration}ms, longer than the ${DEFAULT_TICK_MS}ms interval`
      );
    }
  }
}

export function startSchedulerRunner(tickMs = DEFAULT_TICK_MS): void {
  if (schedulerTimer !== null) return;
  schedulerTimer = window.setInterval(() => {
    void runSchedulerTick();
  }, tickMs);
  void runSchedulerTick();
}

export function stopSchedulerRunner(): void {
  if (schedulerTimer === null) return;
  window.clearInterval(schedulerTimer);
  schedulerTimer = null;
}

export async function runScheduleNow(
  schedulePath: string,
  options?: RunScheduleNowOptions
): Promise<ExecuteScheduleResult | null> {
  const schedule = await loadSchedule(schedulePath);
  if (!schedule) return null;
  return executeSchedule(schedule, schedulePath, {
    manual: true,
    onConversationCreated: options?.onConversationCreated,
  });
}
