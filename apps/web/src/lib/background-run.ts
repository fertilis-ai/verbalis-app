import { isTauri } from "@tauri-apps/api/core";
import { appendLogFile } from "@/lib/tauri/commands";
import { isLoggingEnabled } from "@/lib/logger";
import { YOLO_MODE_CONFIG } from "@/lib/guardrails/presets";
import { useChatStore } from "@/stores/chat-store";

/** Append a line to a run log in ~/.verbalis/logs, only when logging is on in the desktop app. */
export async function appendRunLog(filename: string, line: string): Promise<void> {
  if (!isLoggingEnabled() || !isTauri()) return;
  appendLogFile(filename, line).catch(console.warn);
}

export interface BackgroundRun {
  /** Log file under ~/.verbalis/logs, e.g. "tasks.txt". */
  logFile: string;
  /** What is running, as named in the log lines: `task`, `schedule`. */
  kind: string;
  id: string;
  name: string;
  /** Title of the background conversation. */
  title: string;
  prompt: string;
  agentId: string | null;
  onConversationCreated?: (conversationId: string) => void;
}

export type BackgroundRunResult =
  | { conversationId: string; error?: undefined }
  | { conversationId: null; error: unknown };

/**
 * Run a prompt in a new background conversation (hidden from the chat
 * sidebar) with YOLO guardrails, logging its start, completion or error.
 * Never throws: a failure comes back as `{ conversationId: null, error }`.
 */
export async function runBackgroundConversation(run: BackgroundRun): Promise<BackgroundRunResult> {
  const label = `${run.kind} "${run.name}"`;
  try {
    await appendRunLog(run.logFile, `[${new Date().toISOString()}] Starting ${label} (${run.id})`);

    const chatStore = useChatStore.getState();
    const conversation = await chatStore.createConversationInBackground({ title: run.title });

    run.onConversationCreated?.(conversation.id);

    await chatStore.sendMessageToConversation(conversation.id, run.prompt, {
      agentId: run.agentId,
      allowAutoRename: false,
      setStreaming: false,
      guardrailsConfig: YOLO_MODE_CONFIG,
    });

    await appendRunLog(run.logFile, `[${new Date().toISOString()}] Completed ${label} (${run.id})`);

    return { conversationId: conversation.id };
  } catch (error) {
    await appendRunLog(run.logFile, `[${new Date().toISOString()}] Error in ${label}: ${error}`);
    return { conversationId: null, error };
  }
}
