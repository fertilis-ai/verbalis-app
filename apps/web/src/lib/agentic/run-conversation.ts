import type { Api, Model, ThinkingLevel } from "@earendil-works/pi-ai";
import type { AgentLoopEvent } from "@/lib/agentic/types";
import type { VerbalisAdapterConfig } from "@/lib/agentic/verbalis-agent-adapter";
import { computeContextBudget, type ContextBudget } from "@/lib/context/token-estimate";
import { trimMessagesToBudget } from "@/lib/context/trim";
import type { GuardrailsConfig } from "@/lib/guardrails/types";
import { logAgent } from "@/lib/logger";
import { mergeToolCalls } from "@/lib/tool-call-patch";
import { getToolsForContext } from "@/lib/tools";
import type { useAgenticLoopStore } from "@/stores/agentic-loop-store";
import type { Conversation, Message } from "@/stores/chat-store";

/** Update the last assistant message in a messages array with the given partial updates. */
export function updateLastAssistantMessage(messages: Message[], updates: Partial<Message>): Message[] {
  const result = [...messages];
  const lastIdx = result.length - 1;
  if (lastIdx >= 0 && result[lastIdx].role === "assistant") {
    result[lastIdx] = { ...result[lastIdx], ...updates };
  }
  return result;
}

/**
 * Apply one adapter event to the conversation it belongs to. Returns the
 * conversation unchanged for events that don't affect it. Tool-call progress
 * is not handled here: it reaches the conversation through the loop bus.
 */
export function applyAdapterEvent(c: Conversation, event: AgentLoopEvent, now = new Date()): Conversation {
  switch (event.type) {
    case "assistant_message_started": {
      const lastMsg = c.messages[c.messages.length - 1];
      // A previous turn that produced content or tool calls gets a new message
      // after it. Otherwise this is the first turn, which fills the empty
      // assistant message the caller already added.
      const isFollowUp =
        lastMsg?.role === "assistant" &&
        (lastMsg.content.trim() !== "" || (lastMsg.toolCalls !== undefined && lastMsg.toolCalls.length > 0));
      if (!isFollowUp) return c;
      const newAssistantMessage: Message = { id: event.messageId, role: "assistant", content: "", createdAt: now };
      return { ...c, messages: [...c.messages, newAssistantMessage], updatedAt: now };
    }
    case "text_delta":
      return {
        ...c,
        messages: updateLastAssistantMessage(c.messages, { content: event.fullContent }),
        updatedAt: now,
      };
    case "thinking_completed": {
      const lastIdx = c.messages.length - 1;
      if (lastIdx < 0 || c.messages[lastIdx].role !== "assistant") return c;
      const messages = [...c.messages];
      messages[lastIdx] = {
        ...messages[lastIdx],
        content: event.content,
        ...(event.toolCalls.length > 0
          ? { toolCalls: mergeToolCalls(messages[lastIdx].toolCalls ?? [], event.toolCalls) }
          : {}),
      };
      return { ...c, messages, updatedAt: now };
    }
    case "loop_error": {
      const lastContent = c.messages[c.messages.length - 1]?.content || "";
      return {
        ...c,
        messages: updateLastAssistantMessage(c.messages, { content: `${lastContent}\n\nError: ${event.error}` }),
        updatedAt: now,
      };
    }
    default:
      return c;
  }
}

type LoopStore = Pick<
  ReturnType<typeof useAgenticLoopStore.getState>,
  "getAdapter" | "createAdapter" | "setCurrentLoop" | "releaseAdapter"
>;

export interface RunConversationParams {
  conversationId: string;
  agentId: string | null;
  model: Model<Api>;
  apiKey: string;
  reasoning?: ThinkingLevel;
  systemPrompt: string;
  temperature: number;
  guardrailsConfig: GuardrailsConfig;
  /** Per-agent tool allowlist. Undefined = all tools. */
  allowedTools?: string[];
}

export interface RunConversationDeps {
  loopStore: LoopStore;
  /** The conversation's current messages, read fresh on every call. */
  getMessages: () => Message[];
  updateConversation: (updater: (c: Conversation) => Conversation) => void;
  /** The estimated context budget for this send, reported before the run starts. */
  onContextBudget: (budget: ContextBudget) => void;
  /** Called whenever the sliding window drops older messages. */
  onContextTrimmed: () => void;
}

/**
 * Run a conversation turn through the VerbalisAgentAdapter (tool execution,
 * guardrails, debug logging). History is trimmed to the model's context
 * window; if the provider still reports a context overflow, the run is
 * retried once with a tighter window and a fresh adapter.
 */
export async function runConversation(params: RunConversationParams, deps: RunConversationDeps): Promise<void> {
  const { conversationId, agentId, model, systemPrompt, allowedTools } = params;
  const { loopStore, getMessages, updateConversation } = deps;

  // Sliding-window aggressiveness: tightened on a context-overflow retry.
  let historyBudgetFactor = 1;

  // Stop any loop still running for this conversation before starting a new one.
  loopStore.getAdapter(conversationId)?.stop();
  let adapter = loopStore.createAdapter(conversationId, agentId);

  // Message provider - gets fresh messages each iteration, trimmed to the
  // context budget via a sliding window over message history.
  const messageProvider = () => {
    const trim = trimMessagesToBudget({
      messages: getMessages(),
      systemPrompt,
      tools: getToolsForContext(allowedTools),
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      historyBudgetFactor,
    });
    if (trim.trimmed) {
      deps.onContextTrimmed();
      logAgent("CONTEXT", "Sliding window dropped older messages", {
        droppedCount: trim.droppedCount,
        kept: trim.messages.length,
      });
    }
    return trim.messages;
  };
  adapter.setMessageProvider(messageProvider);

  // Context-overflow retry bookkeeping (see the retry below).
  let retriedContextExceeded = false;
  let pendingContextRetry = false;

  // Event handler for UI sync (reused across a context-overflow retry).
  const onAdapterEvent = (event: AgentLoopEvent) => {
    // If the context overflowed and we can still retry with a tighter window,
    // suppress the error in the UI and let the retry run.
    if (event.type === "loop_error" && event.errorType === "context_exceeded" && !retriedContextExceeded) {
      pendingContextRetry = true;
      return;
    }
    updateConversation((c) => applyAdapterEvent(c, event));
  };

  // Estimate the context-window budget for this send and surface it.
  // Trimming/summarization is layered on top of this in trim.ts.
  const budget = computeContextBudget({
    systemPrompt,
    tools: getToolsForContext(allowedTools),
    messages: getMessages(),
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  });
  deps.onContextBudget(budget);
  if (!budget.withinBudget) {
    logAgent("CONTEXT", "Estimated prompt exceeds context budget", {
      used: budget.used,
      available: budget.available,
      remaining: budget.remaining,
    });
  }

  const adapterConfig: VerbalisAdapterConfig = {
    model,
    systemPrompt,
    apiKey: params.apiKey,
    temperature: params.temperature,
    reasoning: params.reasoning,
    guardrailsConfig: params.guardrailsConfig,
    allowedTools,
    onEvent: () => {}, // Events are handled via the onEvent subscription in runOnce
  };

  // Run the adapter, subscribing the (reusable) event handler each attempt.
  // Tool-call state reaches the conversation via the loop bus, not this handler.
  const runOnce = async () => {
    const runAdapter = adapter;
    const unsub = runAdapter.onEvent(onAdapterEvent);
    loopStore.setCurrentLoop(conversationId);
    try {
      await runAdapter.run(adapterConfig);
    } finally {
      unsub();
      loopStore.releaseAdapter(conversationId, runAdapter);
    }
  };

  await runOnce();

  // If the context overflowed, retry once with a tighter sliding window
  // and a fresh adapter (run() can't be re-entered after it finishes).
  if (pendingContextRetry && !retriedContextExceeded) {
    retriedContextExceeded = true;
    pendingContextRetry = false;
    historyBudgetFactor = 0.5;
    logAgent("CONTEXT", "Context exceeded — retrying with a tighter window");
    adapter = loopStore.createAdapter(conversationId, agentId);
    adapter.setMessageProvider(messageProvider);
    await runOnce();
  }
}
