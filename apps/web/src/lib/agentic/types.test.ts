import { describe, it, expect } from "vitest";
import {
  classifyError,
  createInitialLoopContext,
  DEFAULT_LOOP_CONFIG,
  ERROR_STRATEGIES,
} from "./types";
import type { AgentLoopConfig, ErrorType } from "./types";

// ---------------------------------------------------------------------------
// classifyError
// ---------------------------------------------------------------------------

describe("classifyError", () => {
  it("returns 'unknown' for non-Error values", () => {
    expect(classifyError("some string")).toBe("unknown");
    expect(classifyError(42)).toBe("unknown");
    expect(classifyError(null)).toBe("unknown");
    expect(classifyError(undefined)).toBe("unknown");
    expect(classifyError({})).toBe("unknown");
  });

  it("classifies network errors", () => {
    expect(classifyError(new Error("network failure"))).toBe("network_error");
    expect(classifyError(new Error("fetch failed"))).toBe("network_error");
    expect(classifyError(new Error("connection refused"))).toBe("network_error");
  });

  it("classifies rate limit errors", () => {
    expect(classifyError(new Error("rate limit exceeded"))).toBe("rate_limit");
    expect(classifyError(new Error("HTTP 429 response"))).toBe("rate_limit");
    expect(classifyError(new Error("too many requests"))).toBe("rate_limit");
  });

  it("classifies timeout errors", () => {
    expect(classifyError(new Error("timeout reached"))).toBe("tool_timeout");
    expect(classifyError(new Error("request timed out"))).toBe("tool_timeout");
  });

  it("classifies permission errors", () => {
    expect(classifyError(new Error("permission denied"))).toBe("tool_permission");
    expect(classifyError(new Error("access denied"))).toBe("tool_permission");
    expect(classifyError(new Error("operation not allowed"))).toBe("tool_permission");
  });

  it("classifies API errors", () => {
    expect(classifyError(new Error("api returned error"))).toBe("api_error");
    expect(classifyError(new Error("HTTP 400 bad request"))).toBe("api_error");
    expect(classifyError(new Error("HTTP 500 internal server error"))).toBe("api_error");
  });

  it("classifies context-overflow errors before api errors", () => {
    expect(classifyError(new Error("maximum context length is 200000 tokens"))).toBe("context_exceeded");
    expect(classifyError(new Error("prompt is too long: 250000 tokens"))).toBe("context_exceeded");
    expect(classifyError(new Error("This model's context window exceeded"))).toBe("context_exceeded");
    // Even when phrased as a 400, context overflow wins.
    expect(classifyError(new Error("400 context_length_exceeded"))).toBe("context_exceeded");
  });

  it("is case-insensitive", () => {
    expect(classifyError(new Error("NETWORK ERROR"))).toBe("network_error");
    expect(classifyError(new Error("Rate Limit"))).toBe("rate_limit");
    expect(classifyError(new Error("TIMEOUT"))).toBe("tool_timeout");
    expect(classifyError(new Error("Permission Denied"))).toBe("tool_permission");
    expect(classifyError(new Error("API failure"))).toBe("api_error");
  });

  it("returns 'unknown' for unrecognised Error messages", () => {
    expect(classifyError(new Error("something went wrong"))).toBe("unknown");
    expect(classifyError(new Error(""))).toBe("unknown");
  });

  it("uses first matching keyword when message has multiple", () => {
    // "network" appears before "timeout" in the classification chain
    const err = new Error("network timeout occurred");
    expect(classifyError(err)).toBe("network_error");
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_LOOP_CONFIG
// ---------------------------------------------------------------------------

describe("DEFAULT_LOOP_CONFIG", () => {
  it("has expected default values", () => {
    expect(DEFAULT_LOOP_CONFIG).toEqual({
      maxIterations: 25,
      maxConsecutiveErrors: 3,
      timeoutMs: 300000,
      autonomyLevel: "semi_autonomous",
      allowParallelTools: true,
      pauseOnError: true,
    });
  });
});

// ---------------------------------------------------------------------------
// ERROR_STRATEGIES
// ---------------------------------------------------------------------------

describe("ERROR_STRATEGIES", () => {
  it("covers all ErrorType values", () => {
    const expectedTypes: ErrorType[] = [
      "network_error",
      "rate_limit",
      "tool_timeout",
      "tool_permission",
      "tool_execution",
      "api_error",
      "context_exceeded",
      "unknown",
    ];
    for (const t of expectedTypes) {
      expect(ERROR_STRATEGIES[t]).toBeDefined();
      expect(ERROR_STRATEGIES[t].type).toBeDefined();
      expect(typeof ERROR_STRATEGIES[t].maxRetries).toBe("number");
      expect(typeof ERROR_STRATEGIES[t].backoffMs).toBe("number");
    }
  });

  it("uses retry strategy for network_error", () => {
    expect(ERROR_STRATEGIES.network_error).toEqual({
      type: "retry",
      maxRetries: 3,
      backoffMs: 1000,
    });
  });

  it("uses ask_user strategy for unknown errors", () => {
    expect(ERROR_STRATEGIES.unknown).toEqual({
      type: "ask_user",
      maxRetries: 0,
      backoffMs: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// createInitialLoopContext
// ---------------------------------------------------------------------------

describe("createInitialLoopContext", () => {
  it("creates a context with default config", () => {
    const ctx = createInitialLoopContext("conv-1", "agent-1");

    expect(ctx.conversationId).toBe("conv-1");
    expect(ctx.agentId).toBe("agent-1");
    expect(ctx.config).toEqual(DEFAULT_LOOP_CONFIG);
    expect(ctx.iterations).toEqual([]);
    expect(ctx.currentIteration).toBeNull();
    expect(ctx.status).toBe("idle");
    expect(ctx.startedAt).toBeNull();
    expect(ctx.completedAt).toBeNull();
    expect(ctx.consecutiveErrors).toBe(0);
    expect(ctx.totalToolCalls).toBe(0);
    expect(ctx.successfulToolCalls).toBe(0);
    expect(ctx.failedToolCalls).toBe(0);
    expect(ctx.skippedToolCalls).toBe(0);
  });

  it("accepts null agentId", () => {
    const ctx = createInitialLoopContext("conv-2", null);
    expect(ctx.agentId).toBeNull();
  });

  it("merges partial config with defaults", () => {
    const ctx = createInitialLoopContext("conv-3", "a", {
      maxIterations: 5,
      pauseOnError: false,
    });

    expect(ctx.config.maxIterations).toBe(5);
    expect(ctx.config.pauseOnError).toBe(false);
    // rest should be defaults
    expect(ctx.config.maxConsecutiveErrors).toBe(3);
    expect(ctx.config.timeoutMs).toBe(300000);
    expect(ctx.config.autonomyLevel).toBe("semi_autonomous");
    expect(ctx.config.allowParallelTools).toBe(true);
  });

  it("overrides all config fields when fully specified", () => {
    const full: AgentLoopConfig = {
      maxIterations: 10,
      maxConsecutiveErrors: 1,
      timeoutMs: 60000,
      autonomyLevel: "autonomous",
      allowParallelTools: false,
      pauseOnError: false,
    };
    const ctx = createInitialLoopContext("conv-4", null, full);
    expect(ctx.config).toEqual(full);
  });

  it("returns independent objects each call", () => {
    const a = createInitialLoopContext("c1", null);
    const b = createInitialLoopContext("c1", null);
    expect(a).not.toBe(b);
    expect(a.config).not.toBe(b.config);
    expect(a.iterations).not.toBe(b.iterations);
  });
});
