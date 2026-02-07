import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/storage";
import { isLoggingEnabled } from "@/lib/logger";
import { useChatStore } from "@/stores/chat-store";
import type { TaskData } from "@/lib/storage";

async function appendTaskLog(line: string): Promise<void> {
  if (!isLoggingEnabled() || !isTauri()) return;
  invoke("append_log_file", { filename: "tasks.txt", line }).catch(console.warn);
}

export interface ExecuteTaskOptions {
  onConversationCreated?: (conversationId: string) => void;
}

export interface ExecuteTaskResult {
  conversationId: string | null;
  success: boolean;
}

export async function executeTask(
  task: TaskData,
  options?: ExecuteTaskOptions
): Promise<ExecuteTaskResult> {
  const nowIso = new Date().toISOString();
  const prompt = task.description?.trim() ?? "";

  if (!prompt) {
    await appendTaskLog(`[${nowIso}] Skipped task "${task.title}" (${task.id}) - empty description`);
    return { conversationId: null, success: false };
  }

  try {
    await appendTaskLog(`[${nowIso}] Starting task "${task.title}" (${task.id})`);

    const chatStore = useChatStore.getState();
    const conversation = await chatStore.createConversationInBackground({
      title: task.title || "Task Run",
    });

    options?.onConversationCreated?.(conversation.id);

    await chatStore.sendMessageToConversation(conversation.id, prompt, {
      agentId: task.agent,
      allowAutoRename: false,
      setStreaming: false,
    });

    await appendTaskLog(`[${new Date().toISOString()}] Completed task "${task.title}" (${task.id})`);

    return { conversationId: conversation.id, success: true };
  } catch (error) {
    await appendTaskLog(`[${new Date().toISOString()}] Error in task "${task.title}": ${error}`);
    return { conversationId: null, success: false };
  }
}
