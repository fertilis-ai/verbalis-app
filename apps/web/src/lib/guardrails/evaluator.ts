import { minimatch } from "minimatch";
import type { ToolCategory, RiskLevel } from "@/lib/tools/categories";
import { getToolCategory, getToolRiskLevel } from "@/lib/tools/categories";
import type {
  GuardrailsConfig,
  GuardrailsEvaluation,
  GuardrailViolation,
  RateLimitState,
  RestrictionConfig,
  ViolationType,
} from "./types";
import { createInitialRateLimitState } from "./types";

// ============================================================================
// Guardrails Evaluator
// ============================================================================

export class GuardrailsEvaluator {
  private config: GuardrailsConfig;
  private rateLimitState: RateLimitState;

  constructor(config: GuardrailsConfig) {
    this.config = config;
    this.rateLimitState = createInitialRateLimitState();
  }

  updateConfig(config: GuardrailsConfig) {
    this.config = config;
  }

  /**
   * Main evaluation method
   * Evaluation order:
   * 1. Check if guardrails enabled (YOLO mode bypasses)
   * 2. Check blocklists (paths, domains, commands)
   * 3. Check rate limits
   * 4. Determine confirmation requirement from category matrix
   */
  evaluate(
    toolName: string,
    args: Record<string, unknown>
  ): GuardrailsEvaluation {
    const violations: GuardrailViolation[] = [];
    const suggestions: string[] = [];

    // 1. Check if guardrails are disabled (YOLO mode)
    if (!this.config.enabled) {
      return {
        allowed: true,
        requiresConfirmation: false,
        reason: "Guardrails disabled (YOLO mode)",
        violations: [],
      };
    }

    const category = getToolCategory(toolName);
    const riskLevel = getToolRiskLevel(toolName);

    // 2. Check blocklists based on tool type
    const blocklistViolations = this.checkBlocklists(toolName, args, category);
    violations.push(...blocklistViolations);

    if (blocklistViolations.some(v => v.severity === "critical" || v.severity === "error")) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: "Blocked by guardrails policy",
        violations,
        suggestions,
      };
    }

    // 3. Check rate limits
    const rateLimitViolation = this.checkRateLimits(toolName, category);
    if (rateLimitViolation) {
      violations.push(rateLimitViolation);
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: "Rate limit exceeded",
        violations,
        suggestions: ["Wait for the rate limit window to reset"],
      };
    }

    // 4. Determine confirmation requirement
    const requiresConfirmation = this.checkConfirmationRequired(category, riskLevel);

    return {
      allowed: true,
      requiresConfirmation,
      reason: requiresConfirmation
        ? `Confirmation required for ${riskLevel} risk ${category} tool`
        : "Tool execution allowed",
      violations,
      suggestions,
    };
  }

  // ============================================================================
  // Blocklist Checking
  // ============================================================================

  private checkBlocklists(
    toolName: string,
    args: Record<string, unknown>,
    category: ToolCategory
  ): GuardrailViolation[] {
    const violations: GuardrailViolation[] = [];

    // Check path-based blocklists for file system tools
    if (category === "file_system") {
      const pathArgs = this.extractPaths(args);
      for (const path of pathArgs) {
        const pathViolation = this.checkPathAllowed(path);
        if (pathViolation) {
          violations.push(pathViolation);
        }
      }
    }

    // Check domain blocklists for web tools
    if (category === "web") {
      const urls = this.extractUrls(args);
      for (const url of urls) {
        const domainViolation = this.checkDomainAllowed(url);
        if (domainViolation) {
          violations.push(domainViolation);
        }
      }
    }

    // Check shell command blocklists for system tools
    if (toolName === "shell_execute") {
      const command = args.command as string | undefined;
      if (command) {
        const commandViolation = this.checkCommandAllowed(command);
        if (commandViolation) {
          violations.push(commandViolation);
        }
      }
    }

    return violations;
  }

  private extractStringArgs(args: Record<string, unknown>, keys: string[]): string[] {
    const result: string[] = [];
    for (const key of keys) {
      if (typeof args[key] === "string") {
        result.push(args[key] as string);
      }
    }
    return result;
  }

  private extractPaths(args: Record<string, unknown>): string[] {
    return this.extractStringArgs(args, ["path", "old_path", "new_path", "dir", "source", "destination"]);
  }

  private extractUrls(args: Record<string, unknown>): string[] {
    return this.extractStringArgs(args, ["url", "endpoint", "uri"]);
  }

  private checkRestriction(
    value: string,
    matchValue: string,
    restriction: RestrictionConfig,
    violationType: ViolationType,
  ): GuardrailViolation | null {
    for (const pattern of restriction.blocklist) {
      if (this.matchGlob(matchValue, pattern)) {
        return {
          type: violationType,
          message: `"${matchValue}" matches blocked pattern "${pattern}"`,
          severity: "error",
          rule: pattern,
          value,
        };
      }
    }

    if (restriction.defaultPolicy === "deny") {
      const allowed = restriction.allowlist.some(pattern =>
        this.matchGlob(matchValue, pattern)
      );
      if (!allowed) {
        return {
          type: violationType,
          message: `"${matchValue}" is not in allowlist`,
          severity: "error",
          value,
        };
      }
    }

    return null;
  }

  private checkPathAllowed(path: string): GuardrailViolation | null {
    return this.checkRestriction(path, path, this.config.paths, "blocked_path");
  }

  private checkDomainAllowed(url: string): GuardrailViolation | null {
    let domain: string;
    try {
      const parsed = new URL(url);
      domain = parsed.hostname + (parsed.port ? `:${parsed.port}` : "");
    } catch {
      domain = url.replace(/^https?:\/\//, "").split("/")[0];
    }
    return this.checkRestriction(url, domain, this.config.domains, "blocked_domain");
  }

  private checkCommandAllowed(command: string): GuardrailViolation | null {
    const { shellCommands } = this.config;
    const normalizedCommand = command.trim();

    // Check blocklist first (always)
    for (const pattern of shellCommands.blocklist) {
      if (this.matchCommandPattern(normalizedCommand, pattern)) {
        return {
          type: "blocked_command",
          message: `Command matches blocked pattern "${pattern}"`,
          severity: "critical",
          rule: pattern,
          value: command,
        };
      }
    }

    // Check allowlist if default policy is deny
    if (shellCommands.defaultPolicy === "deny") {
      const allowed = shellCommands.allowlist.some(pattern =>
        this.matchCommandPattern(normalizedCommand, pattern)
      );

      if (!allowed) {
        return {
          type: "blocked_command",
          message: `Command "${normalizedCommand.slice(0, 50)}..." is not in allowlist`,
          severity: "error",
          value: command,
        };
      }
    }

    return null;
  }

  // ============================================================================
  // Rate Limit Checking
  // ============================================================================

  private checkRateLimits(
    toolName: string,
    category: ToolCategory
  ): GuardrailViolation | null {
    const now = new Date();
    const { rateLimits } = this.config;

    // Reset windows if expired
    this.resetExpiredWindows(now);

    // Check tool calls per minute
    if (this.rateLimitState.toolCallsMinute.count >= rateLimits.toolCallsPerMinute) {
      return {
        type: "rate_limit_exceeded",
        message: `Tool call rate limit exceeded (${rateLimits.toolCallsPerMinute}/min)`,
        severity: "error",
      };
    }

    // Check tool calls per hour
    if (this.rateLimitState.toolCallsHour.count >= rateLimits.toolCallsPerHour) {
      return {
        type: "rate_limit_exceeded",
        message: `Tool call rate limit exceeded (${rateLimits.toolCallsPerHour}/hour)`,
        severity: "error",
      };
    }

    // Check shell commands per minute
    if (toolName === "shell_execute") {
      if (this.rateLimitState.shellCommandsMinute.count >= rateLimits.shellCommandsPerMinute) {
        return {
          type: "rate_limit_exceeded",
          message: `Shell command rate limit exceeded (${rateLimits.shellCommandsPerMinute}/min)`,
          severity: "error",
        };
      }
    }

    // Check API calls per minute for web tools
    if (category === "web") {
      if (this.rateLimitState.apiCallsMinute.count >= rateLimits.apiCallsPerMinute) {
        return {
          type: "rate_limit_exceeded",
          message: `API call rate limit exceeded (${rateLimits.apiCallsPerMinute}/min)`,
          severity: "error",
        };
      }
    }

    return null;
  }

  private resetExpiredWindows(now: Date) {
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    if (this.rateLimitState.toolCallsMinute.windowStart < oneMinuteAgo) {
      this.rateLimitState.toolCallsMinute = { count: 0, windowStart: now };
    }

    if (this.rateLimitState.toolCallsHour.windowStart < oneHourAgo) {
      this.rateLimitState.toolCallsHour = { count: 0, windowStart: now };
    }

    if (this.rateLimitState.apiCallsMinute.windowStart < oneMinuteAgo) {
      this.rateLimitState.apiCallsMinute = { count: 0, windowStart: now };
    }

    if (this.rateLimitState.shellCommandsMinute.windowStart < oneMinuteAgo) {
      this.rateLimitState.shellCommandsMinute = { count: 0, windowStart: now };
    }
  }

  /**
   * Record a tool execution for rate limiting
   */
  recordExecution(toolName: string, category: ToolCategory) {
    this.rateLimitState.toolCallsMinute.count++;
    this.rateLimitState.toolCallsHour.count++;

    if (toolName === "shell_execute") {
      this.rateLimitState.shellCommandsMinute.count++;
    }

    if (category === "web") {
      this.rateLimitState.apiCallsMinute.count++;
    }
  }

  // ============================================================================
  // Confirmation Checking
  // ============================================================================

  private checkConfirmationRequired(
    category: ToolCategory,
    riskLevel: RiskLevel
  ): boolean {
    const categoryConfig = this.config.categoryConfirmation[category];
    if (!categoryConfig) {
      // Default to requiring confirmation for unknown categories
      return true;
    }

    return categoryConfig[riskLevel];
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private matchGlob(value: string, pattern: string): boolean {
    return minimatch(value, pattern, {
      matchBase: true,
      dot: true,
      nocase: process.platform === "darwin" || process.platform === "win32",
    });
  }

  private matchCommandPattern(command: string, pattern: string): boolean {
    // Handle wildcard patterns like "git *"
    if (pattern === "*") {
      return true;
    }

    if (pattern.endsWith(" *")) {
      const prefix = pattern.slice(0, -2);
      return command === prefix || command.startsWith(prefix + " ");
    }

    // Exact match
    return command === pattern || command.startsWith(pattern + " ");
  }

  // ============================================================================
  // State Access
  // ============================================================================

  getRateLimitState(): RateLimitState {
    return { ...this.rateLimitState };
  }

  resetRateLimits() {
    this.rateLimitState = createInitialRateLimitState();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let evaluatorInstance: GuardrailsEvaluator | null = null;

export function getGuardrailsEvaluator(config: GuardrailsConfig): GuardrailsEvaluator {
  if (!evaluatorInstance) {
    evaluatorInstance = new GuardrailsEvaluator(config);
  } else {
    evaluatorInstance.updateConfig(config);
  }
  return evaluatorInstance;
}

export function resetGuardrailsEvaluator() {
  evaluatorInstance = null;
}
