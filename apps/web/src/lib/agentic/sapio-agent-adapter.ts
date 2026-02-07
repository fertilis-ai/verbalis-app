/**
 * SapioAgentAdapter - Wraps pi-agent-core's agentLoop() with Sapio-specific features
 *
 * This adapter provides:
 * - Tool approval workflow (pending confirmation)
 * - Guardrails evaluation before tool execution
 * - Execution tracking metrics
 * - Undo capability for file operations
 * - Event translation (AgentEvent → AgentLoopEvent)
 */

import { v4 as uuid } from "uuid";
import {
  agentLoop,
  type AgentContext,
  type AgentLoopConfig,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
  type AgentToolResult,
  type AgentToolUpdateCallback,
} from "@mariozechner/pi-agent-core";
import {
  type Message as PiMessage,
  type Model,
  type Api,
  type Tool,
  type ToolCall,
} from "@mariozechner/pi-ai";
import type { Static, TSchema } from "@sinclair/typebox";
import type { GuardrailsConfig } from "@/lib/guardrails/types";
import { getGuardrailsEvaluator } from "@/lib/guardrails/evaluator";
import { getUndoManager } from "@/lib/guardrails/undo-manager";
import { getExecutionTracker } from "@/lib/tools/execution-tracker";
import {
  executeTool,
  getToolCategory,
  getToolRiskLevel,
  getToolsForContext,
  toolSupportsUndo,
  TOOL_DEFINITIONS,
  type ToolCallState,
  type ToolCallStatus,
} from "@/lib/tools";
import type { Message } from "@/stores/chat-store";
import { buildEmptyUsage, messagesToPiMessages } from "@/lib/message-conversion";
import type {
  AgentLoopEvent,
  AgentLoopStatus,
  LoopIteration,
  LoopContext,
  StopReason,
  AgentLoopConfig as SapioLoopConfig,
} from "./types";
import {
  DEFAULT_LOOP_CONFIG,
  createInitialLoopContext,
  classifyError,
  ERROR_STRATEGIES,
} from "./types";
import { parseProtocolMarkers, stripProtocolMarkers } from "@/lib/protocol-parser";
import { isTauri } from "@/lib/storage";
import { logAgent } from "@/lib/logger";

// ============================================================================
// Types
// ============================================================================

export interface SapioAdapterConfig {
  /** The model to use for LLM calls */
  model: Model<Api>;
  /** System prompt to use */
  systemPrompt: string;
  /** API key for the model provider */
  apiKey: string;
  /** Temperature for LLM calls */
  temperature?: number;
  /** Whether this is a local model */
  isLocal?: boolean;
  /** Guardrails configuration */
  guardrailsConfig: GuardrailsConfig;
  /** Loop configuration */
  loopConfig?: Partial<SapioLoopConfig>;
  /** Callback for events */
  onEvent: (event: AgentLoopEvent) => void;
}

// ============================================================================
// Helper Functions
// ============================================================================


function toolCallToState(toolCall: ToolCall): ToolCallState {
  return {
    id: toolCall.id,
    name: toolCall.name,
    arguments: toolCall.arguments,
    status: "pending",
    category: getToolCategory(toolCall.name),
    riskLevel: getToolRiskLevel(toolCall.name),
    queuedAt: new Date(),
  };
}

// ============================================================================
// SapioAgentAdapter
// ============================================================================

export class SapioAgentAdapter {
  private abortController: AbortController | null = null;
  private pendingToolConfirmations: Map<string, { resolve: () => void; reject: (reason: string) => void }> = new Map();
  private loopContext: LoopContext;
  private config: SapioAdapterConfig | null = null;
  private getMessagesCallback: (() => Message[]) | null = null;
  private isPausedFlag = false;
  private resumeResolver: (() => void) | null = null;

  constructor(
    private conversationId: string,
    private agentId: string | null,
    guardrailsConfig: GuardrailsConfig,
    loopConfig: Partial<SapioLoopConfig> = {}
  ) {
    this.loopContext = createInitialLoopContext(conversationId, agentId, loopConfig);
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  setMessageProvider(getMessages: () => Message[]): void {
    this.getMessagesCallback = getMessages;
  }

  // ============================================================================
  // Control Methods
  // ============================================================================

  async run(adapterConfig: SapioAdapterConfig): Promise<Message[]> {
    if (this.loopContext.status !== "idle") {
      throw new Error("Adapter already running");
    }

    if (!this.getMessagesCallback) {
      throw new Error("Message provider not set. Use setMessageProvider() first.");
    }

    this.config = adapterConfig;
    this.abortController = new AbortController();
    this.loopContext.status = "thinking";
    this.loopContext.startedAt = new Date();

    logAgent("ADAPTER", `Adapter started for conversation ${this.conversationId}`, {
      agentId: this.agentId,
      model: adapterConfig.model.id,
      temperature: adapterConfig.temperature,
    });

    this.emit({ type: "loop_started", context: this.loopContext });

    try {
      return await this.runLoop();
    } catch (error) {
      if (this.abortController?.signal.aborted) {
        this.loopContext.status = "aborted";
        logAgent("ADAPTER", "Adapter aborted by user");
        this.emit({ type: "loop_aborted" });
      } else {
        const errorType = classifyError(error);
        this.loopContext.status = "error";
        logAgent("ADAPTER", `Adapter error: ${error instanceof Error ? error.message : String(error)}`, { errorType });
        this.emit({
          type: "loop_error",
          error: error instanceof Error ? error.message : String(error),
          errorType,
        });
      }
      return this.getMessagesCallback();
    } finally {
      this.loopContext.completedAt = new Date();
      logAgent("ADAPTER", `Adapter completed for conversation ${this.conversationId}`, {
        status: this.loopContext.status,
        totalToolCalls: this.loopContext.totalToolCalls,
        successfulToolCalls: this.loopContext.successfulToolCalls,
        failedToolCalls: this.loopContext.failedToolCalls,
      });
      this.config = null;
    }
  }

  pause(): void {
    if (this.loopContext.status === "thinking" || this.loopContext.status === "tool_executing") {
      this.isPausedFlag = true;
      this.loopContext.status = "paused";
      this.emit({ type: "loop_paused" });
    }
  }

  resume(): void {
    if (this.loopContext.status === "paused" && this.isPausedFlag) {
      this.isPausedFlag = false;
      if (this.resumeResolver) {
        this.resumeResolver();
        this.resumeResolver = null;
      }
      this.emit({ type: "loop_resumed" });
    }
  }

  stop(): void {
    this.loopContext.status = "completed";
    this.abortController?.abort();
    this.rejectAllPendingConfirmations("Loop stopped by user");
  }

  abort(): void {
    this.loopContext.status = "aborted";
    this.abortController?.abort();
    this.rejectAllPendingConfirmations("Loop aborted by user");
    this.emit({ type: "loop_aborted" });
  }

  // ============================================================================
  // Tool Approval
  // ============================================================================

  async confirmTool(toolCallId: string): Promise<void> {
    const pending = this.pendingToolConfirmations.get(toolCallId);
    if (pending) {
      this.emit({ type: "tool_confirmed", toolCallId });
      pending.resolve();
      this.pendingToolConfirmations.delete(toolCallId);
    }
  }

  async confirmAllPending(): Promise<void> {
    for (const [toolCallId, pending] of this.pendingToolConfirmations) {
      this.emit({ type: "tool_confirmed", toolCallId });
      pending.resolve();
    }
    this.pendingToolConfirmations.clear();
  }

  rejectTool(toolCallId: string, reason?: string): void {
    const pending = this.pendingToolConfirmations.get(toolCallId);
    if (pending) {
      this.emit({ type: "tool_rejected", toolCallId, reason });
      pending.reject(reason || "Rejected by user");
      this.pendingToolConfirmations.delete(toolCallId);
    }
  }

  rejectAllPending(reason?: string): void {
    for (const [toolCallId, pending] of this.pendingToolConfirmations) {
      this.emit({ type: "tool_rejected", toolCallId, reason });
      pending.reject(reason || "Rejected by user");
    }
    this.pendingToolConfirmations.clear();
  }

  private rejectAllPendingConfirmations(reason: string): void {
    for (const [, pending] of this.pendingToolConfirmations) {
      pending.reject(reason);
    }
    this.pendingToolConfirmations.clear();
  }

  // ============================================================================
  // State Access
  // ============================================================================

  getContext(): LoopContext {
    return { ...this.loopContext };
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  private eventHandlers: Array<(event: AgentLoopEvent) => void> = [];

  onEvent(handler: (event: AgentLoopEvent) => void): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index > -1) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  private emit(event: AgentLoopEvent): void {
    // Log non-streaming events only (skip text_delta/response_complete to reduce noise)
    if (event.type !== "text_delta" && event.type !== "response_complete") {
      logAgent("EVENT", `${event.type}`, this.getEventLogData(event));
    }

    // Emit to external config callback
    if (this.config?.onEvent) {
      try {
        this.config.onEvent(event);
      } catch (error) {
        console.error("[SapioAgentAdapter] External event handler error:", error);
      }
    }

    // Emit to registered handlers
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error("[SapioAgentAdapter] Event handler error:", error);
      }
    }
  }

  private getEventLogData(event: AgentLoopEvent): Record<string, unknown> | undefined {
    switch (event.type) {
      case "tool_pending":
      case "tool_executing":
      case "tool_completed":
      case "tool_failed":
        return { toolName: event.toolCall.name, toolCallId: event.toolCall.id };
      case "thinking_completed":
        return { contentLength: event.content.length, toolCallCount: event.toolCalls.length };
      case "loop_error":
        return { error: event.error };
      default:
        return undefined;
    }
  }

  // ============================================================================
  // Main Loop
  // ============================================================================

  private async runLoop(): Promise<Message[]> {
    const config = this.config!;
    const messages = this.getMessagesCallback!();

    logAgent("LLM_CALL", `Starting agentLoop with ${messages.length} messages`);

    // Build wrapped tools with Sapio's guardrails, confirmation, and undo support
    const wrappedTools = this.buildWrappedTools();

    // Convert Sapio messages to pi-ai messages for the initial context
    const initialPiMessages = messagesToPiMessages(
      messages,
      config.model.api,
      config.model.provider,
      config.model.id
    );

    // Build initial context WITH existing messages
    const context: AgentContext = {
      systemPrompt: config.systemPrompt,
      messages: initialPiMessages, // Include conversation history
      tools: wrappedTools,
    };

    // Build loop config for pi-agent-core
    const loopConfig: AgentLoopConfig = {
      model: config.model,
      apiKey: config.apiKey,
      temperature: config.temperature ?? 0.7,
      convertToLlm: (agentMessages: AgentMessage[]): PiMessage[] => {
        // Convert AgentMessage[] to PiMessage[] for the LLM
        // AgentMessage is a union of PiMessage | CustomMessages, so we filter to valid LLM messages
        return agentMessages.filter((msg): msg is PiMessage => {
          return "role" in msg && (
            msg.role === "user" ||
            msg.role === "assistant" ||
            msg.role === "toolResult"
          );
        });
      },
    };

    // No prompts needed - messages are already in context
    const prompts: AgentMessage[] = [];

    // Create iteration tracking
    const iteration = this.createIteration();
    this.loopContext.currentIteration = iteration;
    this.emit({ type: "iteration_started", iteration });

    // Run the agent loop
    const eventStream = agentLoop(prompts, context, loopConfig, this.abortController?.signal);

    let currentAssistantContent = "";
    const toolCallsInIteration: ToolCallState[] = [];

    try {
      for await (const event of eventStream) {
        // Check for abort
        if (this.abortController?.signal.aborted) {
          break;
        }

        // Check for pause
        await this.checkPause();

        // Translate pi-agent-core events to Sapio events
        await this.handleAgentEvent(
          event,
          iteration,
          (content) => { currentAssistantContent = content; },
          toolCallsInIteration
        );
      }

      // Get final result
      const result = await eventStream.result;

      // Complete iteration
      iteration.status = "completed";
      iteration.completedAt = new Date();
      this.loopContext.iterations.push(iteration);
      this.emit({ type: "iteration_completed", iteration });

      // Determine completion reason
      const stopReason: StopReason = "natural_completion";

      this.loopContext.status = "completed";
      this.loopContext.completedAt = new Date();
      this.emit({
        type: "loop_completed",
        context: this.loopContext,
        reason: stopReason,
      });

      return this.getMessagesCallback!();
    } catch (error) {
      this.loopContext.consecutiveErrors++;
      iteration.status = "error";
      iteration.error = error instanceof Error ? error.message : String(error);
      iteration.completedAt = new Date();
      this.loopContext.iterations.push(iteration);

      const errorType = classifyError(error);
      const strategy = ERROR_STRATEGIES[errorType];

      if (strategy.type === "abort" || this.loopContext.consecutiveErrors >= this.loopContext.config.maxConsecutiveErrors) {
        throw error;
      }

      return this.getMessagesCallback!();
    }
  }

  // ============================================================================
  // Event Translation
  // ============================================================================

  private async handleAgentEvent(
    event: AgentEvent,
    iteration: LoopIteration,
    setContent: (content: string) => void,
    toolCalls: ToolCallState[]
  ): Promise<void> {

    switch (event.type) {
      case "agent_start":
        // Already emitted loop_started
        break;

      case "turn_start":
        this.loopContext.status = "thinking";
        this.emit({ type: "thinking_started" });
        break;

      case "message_start":
        // Only emit for assistant messages, not tool results or user messages
        if ("role" in event.message && event.message.role === "assistant") {
          this.emit({
            type: "assistant_message_started",
            messageId: uuid(),
            iterationId: iteration.id,
          });
        }
        break;

      case "message_update": {
        // Handle streaming text deltas
        const assistantEvent = event.assistantMessageEvent;
        if (assistantEvent.type === "text_delta") {
          const fullContent = this.extractTextFromMessage(event.message);
          setContent(fullContent);

          // Parse protocol markers for local models
          const parseResult = parseProtocolMarkers(fullContent);

          this.emit({
            type: "text_delta",
            delta: assistantEvent.delta,
            fullContent: parseResult.cleanText,
            iterationId: iteration.id,
          });
        }
        break;
      }

      case "message_end": {
        // Only process assistant messages for thinking/tool-call events
        if (!("role" in event.message) || event.message.role !== "assistant") {
          break;
        }

        // Message streaming complete
        const content = this.extractTextFromMessage(event.message);
        const cleanContent = stripProtocolMarkers(content);

        // Extract tool calls from the message if present
        const messageToolCalls = this.extractToolCallsFromMessage(event.message);
        const toolCallStates = messageToolCalls.map(tc => toolCallToState(tc));

        toolCalls.push(...toolCallStates);
        iteration.toolCalls = toolCalls;

        this.emit({
          type: "thinking_completed",
          content: cleanContent,
          toolCalls: toolCallStates,
        });

        this.emit({
          type: "response_complete",
          content: cleanContent,
          toolCalls: toolCallStates,
          stopReason: messageToolCalls.length > 0 ? "toolUse" : "stop",
          iterationId: iteration.id,
        });
        break;
      }

      case "tool_execution_start":
        // Tool events are handled in createWrappedExecute where we have
        // Sapio-specific logic (guardrails, confirmation, undo)
        // Events emitted there: tool_pending, tool_executing, tool_completed, tool_failed
        break;

      case "tool_execution_update":
        // Progressive tool updates (e.g., long-running operations)
        break;

      case "tool_execution_end":
        // Tool completion is handled in createWrappedExecute
        // Statistics are updated there to avoid double-counting
        break;

      case "turn_end":
        // Turn complete, may have more turns if tool results need processing
        break;

      case "agent_end":
        // Agent finished all processing
        break;
    }
  }

  private extractTextFromMessage(message: AgentMessage): string {
    if ("role" in message && message.role === "assistant" && "content" in message) {
      const content = message.content;
      if (Array.isArray(content)) {
        return content
          .filter((block): block is { type: "text"; text: string } => block.type === "text")
          .map(block => block.text)
          .join("");
      }
    }
    return "";
  }

  private extractToolCallsFromMessage(message: AgentMessage): ToolCall[] {
    if (!("role" in message) || message.role !== "assistant" || !("content" in message)) {
      return [];
    }
    const content = message.content;
    if (!Array.isArray(content)) {
      return [];
    }
    return content
      .filter((block): block is ToolCall => block.type === "toolCall")
      .map(block => ({
        type: "toolCall" as const,
        id: block.id,
        name: block.name,
        arguments: block.arguments as Record<string, unknown>,
      }));
  }

  // ============================================================================
  // Tool Wrapping
  // ============================================================================

  private buildWrappedTools(): AgentTool<TSchema>[] {
    if (!isTauri()) {
      return []; // No tools in web-only mode
    }

    const piTools = getToolsForContext();

    return piTools.map((tool): AgentTool<TSchema> => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      label: tool.name.replace(/_/g, " "),
      execute: this.createWrappedExecute(tool),
    }));
  }

  private createWrappedExecute(tool: Tool): AgentTool<TSchema>["execute"] {
    return async (
      toolCallId: string,
      params: Static<TSchema>,
      signal?: AbortSignal,
      onUpdate?: AgentToolUpdateCallback
    ): Promise<AgentToolResult<unknown>> => {
      const config = this.config!;
      const evaluator = getGuardrailsEvaluator(config.guardrailsConfig);
      const tracker = getExecutionTracker();
      const undoManager = getUndoManager();

      // Create execution record
      const record = tracker.createRecord({
        toolName: tool.name,
        category: getToolCategory(tool.name),
        arguments: params as Record<string, unknown>,
        conversationId: this.conversationId,
        iterationId: this.loopContext.currentIteration?.id,
        agentId: this.agentId || undefined,
      });

      // Create tool call state for events
      const tcState: ToolCallState = {
        id: toolCallId,
        name: tool.name,
        arguments: params as Record<string, unknown>,
        status: "pending",
        category: getToolCategory(tool.name),
        riskLevel: getToolRiskLevel(tool.name),
        queuedAt: new Date(),
      };

      // Evaluate guardrails
      const evaluation = evaluator.evaluate(tool.name, params as Record<string, unknown>);

      if (!evaluation.allowed) {
        logAgent("TOOL", `Tool ${tool.name} - blocked by guardrails`, { reason: evaluation.reason });
        tcState.status = "error";
        tcState.error = evaluation.reason;
        tracker.markError(record.id, evaluation.reason);
        this.loopContext.failedToolCalls++;
        this.emit({ type: "tool_failed", toolCall: tcState, error: evaluation.reason });
        return {
          content: [{ type: "text", text: `Error: ${evaluation.reason}` }],
          details: { isError: true },
        };
      }

      // Handle confirmation requirement
      if (evaluation.requiresConfirmation) {
        logAgent("TOOL", `Tool ${tool.name} - pending confirmation`);
        tcState.status = "pending_confirmation";
        tcState.guardrailReason = evaluation.reason;
        tcState.guardrailViolations = evaluation.violations.map(v => ({
          type: v.type, message: v.message, severity: v.severity,
        }));
        tracker.markPendingConfirmation(record.id);
        this.loopContext.status = "tool_pending";
        this.emit({ type: "tool_pending", toolCall: tcState });

        try {
          await this.waitForConfirmation(toolCallId);
          logAgent("TOOL", `Tool ${tool.name} - confirmed by user`);
        } catch (rejectReason) {
          logAgent("TOOL", `Tool ${tool.name} - rejected by user`, { reason: rejectReason });
          tcState.status = "cancelled";
          tcState.error = typeof rejectReason === "string" ? rejectReason : "Rejected by user";
          tracker.markCancelled(record.id, tcState.error);
          this.loopContext.skippedToolCalls++;
          return {
            content: [{ type: "text", text: `Tool execution rejected: ${tcState.error}` }],
            details: { isError: true, cancelled: true },
          };
        }
      }

      // Prepare undo data if supported
      let undoOperationId: string | null = null;
      if (toolSupportsUndo(tool.name)) {
        try {
          if (tool.name === "write_file") {
            const undoData = await undoManager.prepareFileWriteUndo((params as { path: string }).path);
            undoOperationId = await undoManager.registerUndo(toolCallId, "file_write", undoData);
          } else if (tool.name === "delete_path") {
            const undoData = await undoManager.prepareFileDeleteUndo((params as { path: string }).path);
            if (undoData) {
              undoOperationId = await undoManager.registerUndo(toolCallId, "file_delete", undoData);
            }
          } else if (tool.name === "create_directory") {
            const undoData = await undoManager.prepareDirectoryCreateUndo((params as { path: string }).path);
            if (undoData) {
              undoOperationId = await undoManager.registerUndo(toolCallId, "directory_create", undoData);
            }
          }
        } catch (error) {
          console.warn("[SapioAgentAdapter] Failed to prepare undo:", error);
        }
      }

      // Execute tool
      logAgent("TOOL", `Tool ${tool.name} - executing`, { toolCallId, params });
      tcState.status = "executing";
      tcState.startedAt = new Date();
      tracker.markExecuting(record.id);
      this.loopContext.status = "tool_executing";
      this.emit({ type: "tool_executing", toolCall: tcState });

      try {
        const piToolCall: ToolCall = {
          type: "toolCall",
          id: toolCallId,
          name: tool.name,
          arguments: params as Record<string, unknown>,
        };

        const result = await executeTool(piToolCall);

        tcState.completedAt = new Date();
        tcState.durationMs = tcState.completedAt.getTime() - tcState.startedAt.getTime();

        if (result.status === "success") {
          logAgent("TOOL", `Tool ${tool.name} - success`, { durationMs: tcState.durationMs });
          tcState.status = "success";
          tcState.result = result.result;
          tracker.markSuccess(record.id, result.result || "");
          this.loopContext.successfulToolCalls++;

          if (undoOperationId) {
            tracker.setUndoAvailable(record.id, undoOperationId);
            tcState.undoAvailable = true;
          }

          this.emit({ type: "tool_completed", toolCall: tcState });

          // Record for rate limiting
          evaluator.recordExecution(tool.name, getToolCategory(tool.name));
          this.loopContext.totalToolCalls++;

          return {
            content: [{ type: "text", text: result.result || "Success" }],
            details: { result: result.result },
          };
        } else {
          logAgent("TOOL", `Tool ${tool.name} - error`, { error: result.error });
          tcState.status = "error";
          tcState.error = result.error;
          tracker.markError(record.id, result.error || "Unknown error");
          this.loopContext.failedToolCalls++;
          this.emit({ type: "tool_failed", toolCall: tcState, error: result.error || "Unknown error" });

          return {
            content: [{ type: "text", text: `Error: ${result.error || "Unknown error"}` }],
            details: { isError: true },
          };
        }
      } catch (error) {
        tcState.completedAt = new Date();
        tcState.durationMs = tcState.startedAt
          ? tcState.completedAt.getTime() - tcState.startedAt.getTime()
          : undefined;
        tcState.status = "error";
        tcState.error = error instanceof Error ? error.message : String(error);
        logAgent("TOOL", `Tool ${tool.name} - exception`, { error: tcState.error });
        tracker.markError(record.id, tcState.error);
        this.loopContext.failedToolCalls++;
        this.emit({ type: "tool_failed", toolCall: tcState, error: tcState.error });

        return {
          content: [{ type: "text", text: `Error: ${tcState.error}` }],
          details: { isError: true },
        };
      }
    };
  }

  private waitForConfirmation(toolCallId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pendingToolConfirmations.set(toolCallId, { resolve, reject });
    });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private createIteration(): LoopIteration {
    return {
      id: uuid(),
      stepNumber: this.loopContext.iterations.length + 1,
      status: "thinking",
      toolCalls: [],
      startedAt: new Date(),
    };
  }

  private async checkPause(): Promise<void> {
    if (this.isPausedFlag) {
      await new Promise<void>(resolve => {
        this.resumeResolver = resolve;
      });
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSapioAdapter(
  conversationId: string,
  agentId: string | null,
  guardrailsConfig: GuardrailsConfig,
  config?: Partial<SapioLoopConfig>
): SapioAgentAdapter {
  return new SapioAgentAdapter(conversationId, agentId, guardrailsConfig, config);
}
