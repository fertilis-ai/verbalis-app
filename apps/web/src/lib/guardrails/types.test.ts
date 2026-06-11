import { describe, it, expect } from "vitest";
import {
  createInitialRateLimitState,
  DEFAULT_GUARDRAILS_CONFIG,
} from "./types";
import type {
  ViolationType,
  UndoOperationType,
} from "./types";

describe("createInitialRateLimitState", () => {
  it("should return a RateLimitState with all counts at zero", () => {
    const state = createInitialRateLimitState();
    expect(state.toolCallsMinute.count).toBe(0);
    expect(state.toolCallsHour.count).toBe(0);
    expect(state.apiCallsMinute.count).toBe(0);
    expect(state.shellCommandsMinute.count).toBe(0);
  });

  it("should set all windowStart dates to approximately now", () => {
    const before = new Date();
    const state = createInitialRateLimitState();
    const after = new Date();

    for (const window of [
      state.toolCallsMinute,
      state.toolCallsHour,
      state.apiCallsMinute,
      state.shellCommandsMinute,
    ]) {
      expect(window.windowStart.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(window.windowStart.getTime()).toBeLessThanOrEqual(after.getTime());
    }
  });

  it("should return independent state objects on each call", () => {
    const state1 = createInitialRateLimitState();
    const state2 = createInitialRateLimitState();

    state1.toolCallsMinute.count = 42;
    expect(state2.toolCallsMinute.count).toBe(0);
  });
});

describe("DEFAULT_GUARDRAILS_CONFIG", () => {
  it("should have guardrails enabled by default", () => {
    expect(DEFAULT_GUARDRAILS_CONFIG.enabled).toBe(true);
  });

  it("should define confirmation matrices for all six categories", () => {
    const categories = ["file_system", "web", "system", "integration", "memory", "custom"] as const;
    for (const cat of categories) {
      const matrix = DEFAULT_GUARDRAILS_CONFIG.categoryConfirmation[cat];
      expect(matrix).toBeDefined();
      expect(typeof matrix.low).toBe("boolean");
      expect(typeof matrix.medium).toBe("boolean");
      expect(typeof matrix.high).toBe("boolean");
      expect(typeof matrix.critical).toBe("boolean");
    }
  });

  it("should require confirmation for critical risk across all categories", () => {
    for (const matrix of Object.values(DEFAULT_GUARDRAILS_CONFIG.categoryConfirmation)) {
      expect(matrix.critical).toBe(true);
    }
  });

  it("should never require confirmation for low risk in standard categories", () => {
    const standardCategories = ["file_system", "web", "system", "integration", "memory"] as const;
    for (const cat of standardCategories) {
      expect(DEFAULT_GUARDRAILS_CONFIG.categoryConfirmation[cat].low).toBe(false);
    }
  });

  it("should require confirmation for low risk in custom category", () => {
    expect(DEFAULT_GUARDRAILS_CONFIG.categoryConfirmation.custom.low).toBe(true);
  });

  it("should have paths defaultPolicy as allow", () => {
    expect(DEFAULT_GUARDRAILS_CONFIG.paths.defaultPolicy).toBe("allow");
  });

  it("should block sensitive path patterns by default", () => {
    expect(DEFAULT_GUARDRAILS_CONFIG.paths.blocklist).toContain("~/.ssh/*");
    expect(DEFAULT_GUARDRAILS_CONFIG.paths.blocklist).toContain("~/.aws/*");
    expect(DEFAULT_GUARDRAILS_CONFIG.paths.blocklist).toContain("/etc/*");
  });

  it("should have domains defaultPolicy as allow", () => {
    expect(DEFAULT_GUARDRAILS_CONFIG.domains.defaultPolicy).toBe("allow");
  });

  it("should block localhost domains by default", () => {
    expect(DEFAULT_GUARDRAILS_CONFIG.domains.blocklist).toContain("localhost:*");
    expect(DEFAULT_GUARDRAILS_CONFIG.domains.blocklist).toContain("127.0.0.1:*");
  });

  it("should have shell commands defaultPolicy as deny", () => {
    expect(DEFAULT_GUARDRAILS_CONFIG.shellCommands.defaultPolicy).toBe("deny");
  });

  it("should allowlist common safe shell commands", () => {
    const allowlist = DEFAULT_GUARDRAILS_CONFIG.shellCommands.allowlist;
    expect(allowlist).toContain("git *");
    expect(allowlist).toContain("ls");
    expect(allowlist).toContain("pwd");
    expect(allowlist).toContain("cat *");
  });

  it("should blocklist dangerous shell commands", () => {
    const blocklist = DEFAULT_GUARDRAILS_CONFIG.shellCommands.blocklist;
    expect(blocklist).toContain("rm -rf *");
    expect(blocklist).toContain("sudo *");
    expect(blocklist).toContain(":(){ :|:& };:");
  });

  it("should define reasonable rate limits", () => {
    const { rateLimits } = DEFAULT_GUARDRAILS_CONFIG;
    expect(rateLimits.toolCallsPerMinute).toBe(30);
    expect(rateLimits.toolCallsPerHour).toBe(500);
    expect(rateLimits.apiCallsPerMinute).toBe(10);
    expect(rateLimits.shellCommandsPerMinute).toBe(5);
  });

  it("should have sandbox enabled by default", () => {
    expect(DEFAULT_GUARDRAILS_CONFIG.sandbox.enabled).toBe(true);
    expect(DEFAULT_GUARDRAILS_CONFIG.sandbox.shellCommands).toBe(true);
    expect(DEFAULT_GUARDRAILS_CONFIG.sandbox.networkAccess).toBe(true);
  });
});

describe("type utilities", () => {
  it("ViolationType should be a valid union member", () => {
    const types: ViolationType[] = [
      "blocked_path",
      "blocked_domain",
      "blocked_command",
      "rate_limit_exceeded",
    ];
    expect(types).toHaveLength(4);
  });

  it("UndoOperationType should be a valid union member", () => {
    const types: UndoOperationType[] = [
      "file_write",
      "file_delete",
      "directory_create",
      "clipboard_write",
    ];
    expect(types).toHaveLength(4);
  });
});
