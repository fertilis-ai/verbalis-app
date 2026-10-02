import type { TaskData } from "@/lib/storage";
import { appendRunLog, runBackgroundConversation } from "@/lib/background-run";

const TASK_LOG = "tasks.txt";

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
  const prompt = task.description?.trim() ?? "";

  if (!prompt) {
    await appendRunLog(
      TASK_LOG,
      `[${new Date().toISOString()}] Skipped task "${task.title}" (${task.id}) - empty description`
    );
    return { conversationId: null, success: false };
  }

  const { conversationId } = await runBackgroundConversation({
    logFile: TASK_LOG,
    kind: "task",
    id: task.id,
    name: task.title,
    title: task.title || "Task Run",
    prompt,
    agentId: task.agent,
    onConversationCreated: options?.onConversationCreated,
  });

  return { conversationId, success: conversationId !== null };
}
