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

const DEFAULT_TICK_MS = 60_000;
const DEFAULT_SCHEDULE_TITLE = "Scheduled Run";

let schedulerTimer: number | null = null;
let tickInFlight = false;

async function appendSchedulerLog(line: string): Promise<void> {
  if (!isTauri()) return;
  invoke("append_log_file", { filename: "scheduler.txt", line }).catch(console.warn);
}

function collectSchedulePaths(tree: SchedulerTreeNode[]): string[] {
  const paths: string[] = [];
  const walk = (nodes: SchedulerTreeNode[]) => {
    for (const node of nodes) {
      if (node.type === "schedule") {
        paths.push(node.path);
      } else if (node.type === "folder" && node.children) {
        walk(node.children);
      }
    }
  };
  walk(tree);
  return paths;
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

async function runSchedulerTick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;

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
  } catch (error) {
    console.error("[scheduler-runner] Tick failed:", error);
  } finally {
    tickInFlight = false;
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
