import type { ToolCallState } from "@/lib/tools";

// ============================================================================
// Loop State Machine
// ============================================================================

export type AgentLoopStatus =
  | "idle"              // No active loop
  | "thinking"          // LLM generating response
  | "tool_pending"      // Tool waiting for confirmation
  | "tool_executing"    // Tool currently running
  | "awaiting_user"     // Needs user input
  | "paused"            // User paused execution
  | "completed"         // Task finished successfully
  | "error"             // Recoverable error state
  | "aborted";          // User stopped execution

export interface LoopIteration {
  id: string;
  stepNumber: number;
  status: AgentLoopStatus;
  reasoning?: string;           // LLM's reasoning for this step
  toolCalls: ToolCallState[];
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface AgentLoopConfig {
  maxIterations: number;        // Default: 25
  maxConsecutiveErrors: number; // Default: 3
  timeoutMs: number;            // Default: 300000 (5 min)
  autonomyLevel: "supervised" | "semi_autonomous" | "autonomous";
  allowParallelTools: boolean;  // Default: true
  pauseOnError: boolean;        // Default: true
}

export const DEFAULT_LOOP_CONFIG: AgentLoopConfig = {
  maxIterations: 25,
  maxConsecutiveErrors: 3,
  timeoutMs: 300000,
  autonomyLevel: "semi_autonomous",
  allowParallelTools: true,
  pauseOnError: true,
};

// ============================================================================
// Loop Context
// ============================================================================

export interface LoopContext {
  conversationId: string;
  agentId: string | null;
  config: AgentLoopConfig;
  iterations: LoopIteration[];
  currentIteration: LoopIteration | null;
  status: AgentLoopStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  consecutiveErrors: number;

  // Statistics
  totalToolCalls: number;
  successfulToolCalls: number;
  failedToolCalls: number;
  skippedToolCalls: number;
}

export const createInitialLoopContext = (
  conversationId: string,
  agentId: string | null,
  config: Partial<AgentLoopConfig> = {}
): LoopContext => ({
  conversationId,
  agentId,
  config: { ...DEFAULT_LOOP_CONFIG, ...config },
  iterations: [],
  currentIteration: null,
  status: "idle",
  startedAt: null,
  completedAt: null,
  consecutiveErrors: 0,
  totalToolCalls: 0,
  successfulToolCalls: 0,
  failedToolCalls: 0,
  skippedToolCalls: 0,
});

// ============================================================================
// Loop Controller Interface
// ============================================================================

export interface LoopController {
  // Control
  start(initialPrompt: string): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  abort(): void;

  // Tool approval
  confirmTool(toolCallId: string): Promise<void>;
  confirmAllPending(): Promise<void>;
  rejectTool(toolCallId: string, reason?: string): void;
  rejectAllPending(reason?: string): void;

  // State
  getContext(): LoopContext;
  getCurrentIteration(): LoopIteration | null;
  isRunning(): boolean;
  isPaused(): boolean;
}

// ============================================================================
// Stop Conditions
// ============================================================================

export type StopReason =
  | "natural_completion"    // LLM signals task complete (no tool calls, final response)
  | "iteration_limit"       // maxIterations reached
  | "error_limit"          // maxConsecutiveErrors consecutive failures
  | "timeout"              // Total time exceeds timeoutMs
  | "user_stop"            // Manual stop
  | "user_abort"           // Manual abort (immediate)
  | "critical_error";      // Unrecoverable system failure

export interface StopConditionResult {
  shouldStop: boolean;
  reason?: StopReason;
  message?: string;
}

// ============================================================================
// Error Recovery
// ============================================================================

export type ErrorType =
  | "network_error"
  | "rate_limit"
  | "tool_timeout"
  | "tool_permission"
  | "tool_execution"
  | "api_error"
  | "unknown";

export interface ErrorRecoveryStrategy {
  type: "retry" | "skip" | "abort" | "ask_user";
  maxRetries: number;
  backoffMs: number;
}

export const ERROR_STRATEGIES: Record<ErrorType, ErrorRecoveryStrategy> = {
  network_error: { type: "retry", maxRetries: 3, backoffMs: 1000 },
  rate_limit: { type: "retry", maxRetries: 5, backoffMs: 5000 },
  tool_timeout: { type: "ask_user", maxRetries: 1, backoffMs: 0 },
  tool_permission: { type: "skip", maxRetries: 0, backoffMs: 0 },
  tool_execution: { type: "retry", maxRetries: 2, backoffMs: 500 },
  api_error: { type: "retry", maxRetries: 3, backoffMs: 2000 },
  unknown: { type: "ask_user", maxRetries: 0, backoffMs: 0 },
};

export function classifyError(error: unknown): ErrorType {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("network") || message.includes("fetch") || message.includes("connection")) {
      return "network_error";
    }
    if (message.includes("rate limit") || message.includes("429") || message.includes("too many requests")) {
      return "rate_limit";
    }
    if (message.includes("timeout") || message.includes("timed out")) {
      return "tool_timeout";
    }
    if (message.includes("permission") || message.includes("denied") || message.includes("not allowed")) {
      return "tool_permission";
    }
    if (message.includes("api") || message.includes("400") || message.includes("500")) {
      return "api_error";
    }
  }

  return "unknown";
}

// ============================================================================
// Events
// ============================================================================

export type AgentLoopEvent =
  | { type: "loop_started"; context: LoopContext }
  | { type: "iteration_started"; iteration: LoopIteration }
  | { type: "iteration_completed"; iteration: LoopIteration }
  | { type: "thinking_started" }
  | { type: "thinking_completed"; content: string; toolCalls: ToolCallState[] }
  | { type: "tool_pending"; toolCall: ToolCallState }
  | { type: "tool_confirmed"; toolCallId: string }
  | { type: "tool_rejected"; toolCallId: string; reason?: string }
  | { type: "tool_executing"; toolCall: ToolCallState }
  | { type: "tool_completed"; toolCall: ToolCallState }
  | { type: "tool_failed"; toolCall: ToolCallState; error: string }
  | { type: "loop_paused" }
  | { type: "loop_resumed" }
  | { type: "loop_completed"; context: LoopContext; reason: StopReason }
  | { type: "loop_error"; error: string; errorType: ErrorType }
  | { type: "loop_aborted" }
  // New events for direct LLM handling
  | { type: "text_delta"; delta: string; fullContent: string; iterationId: string }
  | { type: "response_complete"; content: string; toolCalls: ToolCallState[]; stopReason: string; iterationId: string }
  | { type: "assistant_message_started"; messageId: string; iterationId: string };

export type AgentLoopEventHandler = (event: AgentLoopEvent) => void;

// Note: LLMConfig has been replaced by SapioAdapterConfig in sapio-agent-adapter.ts
