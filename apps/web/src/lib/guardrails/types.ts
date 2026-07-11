import type { ToolCategory, } from "@/lib/tools/categories";

// ============================================================================
// Guardrails Configuration
// ============================================================================

export interface CategoryConfirmationMatrix {
  low: boolean;
  medium: boolean;
  high: boolean;
  critical: boolean;
}

export interface RestrictionConfig {
  allowlist: string[];
  blocklist: string[];
  defaultPolicy: "allow" | "deny";
}

export type PathRestrictions = RestrictionConfig;
export type DomainRestrictions = RestrictionConfig;

export interface ShellCommandRestrictions {
  allowlist: string[];  // Command prefixes
  blocklist: string[];
  defaultPolicy: "deny";  // Default deny for shell
}

export interface RateLimits {
  toolCallsPerMinute: number;
  toolCallsPerHour: number;
  apiCallsPerMinute: number;
  shellCommandsPerMinute: number;
}

export interface SandboxConfig {
  enabled: boolean;
  shellCommands: boolean;
  networkAccess: boolean;
  tempDirectory: string;
}

export interface GuardrailsConfig {
  // Master switch
  enabled: boolean;

  // Per-category confirmation matrix
  categoryConfirmation: Record<ToolCategory, CategoryConfirmationMatrix>;

  // Restrictions
  paths: PathRestrictions;
  domains: DomainRestrictions;
  shellCommands: ShellCommandRestrictions;

  // Rate limiting
  rateLimits: RateLimits;

  // Sandbox
  sandbox: SandboxConfig;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_GUARDRAILS_CONFIG: GuardrailsConfig = {
  enabled: true,

  categoryConfirmation: {
    file_system: { low: false, medium: true, high: true, critical: true },
    web: { low: false, medium: true, high: true, critical: true },
    system: { low: false, medium: true, high: true, critical: true },
    integration: { low: false, medium: true, high: true, critical: true },
    memory: { low: false, medium: false, high: true, critical: true },
    custom: { low: true, medium: true, high: true, critical: true },
  },

  paths: {
    allowlist: [],
    blocklist: [
      "~/.ssh/*",
      "~/.aws/*",
      "~/.config/gcloud/*",
      "~/.gnupg/*",
      "/etc/*",
      "/System/*",
      "/usr/*",
      "/bin/*",
      "/sbin/*",
    ],
    defaultPolicy: "allow",
  },

  domains: {
    allowlist: [],
    blocklist: [
      "*.internal.*",
      "localhost:*",
      "127.0.0.1:*",
      "0.0.0.0:*",
    ],
    defaultPolicy: "allow",
  },

  shellCommands: {
    allowlist: [
      "git *",
      "npm *",
      "bun *",
      "pnpm *",
      "yarn *",
      "node *",
      "python *",
      "python3 *",
      "ls",
      "ls *",
      "cat *",
      "grep *",
      "rg *",
      "find *",
      "head *",
      "tail *",
      "wc *",
      "echo *",
      "pwd",
      "which *",
      "whoami",
      "date",
      "env",
      "printenv",
    ],
    blocklist: [
      "rm -rf *",
      "rm -fr *",
      // Inline-code flags turn allowlisted interpreters into arbitrary-code
      // escape hatches (e.g. `python -c "import os; ..."`)
      "python -c *",
      "python3 -c *",
      "node -e *",
      "node --eval *",
      "node -p *",
      "bun -e *",
      "sudo *",
      "su *",
      "chmod 777 *",
      "chown *",
      "mkfs *",
      "dd *",
      "curl * | sh",
      "curl * | bash",
      "wget * | sh",
      "wget * | bash",
      "> /dev/*",
      ":(){ :|:& };:",
    ],
    defaultPolicy: "deny",
  },

  rateLimits: {
    toolCallsPerMinute: 30,
    toolCallsPerHour: 500,
    apiCallsPerMinute: 10,
    shellCommandsPerMinute: 5,
  },

  sandbox: {
    enabled: true,
    shellCommands: true,
    networkAccess: true,
    tempDirectory: "~/.verbalis/sandbox",
  },
};

// ============================================================================
// Evaluation Types
// ============================================================================

export type ViolationType =
  | "blocked_path"
  | "blocked_domain"
  | "blocked_command"
  | "rate_limit_exceeded";

export interface GuardrailViolation {
  type: ViolationType;
  message: string;
  severity: "warning" | "error" | "critical";
  rule?: string;
  value?: string;
}

export interface GuardrailsEvaluation {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason: string;
  violations: GuardrailViolation[];
  suggestions?: string[];
}

// ============================================================================
// Rate Limit Tracking
// ============================================================================

export interface RateLimitWindow {
  count: number;
  windowStart: Date;
}

export interface RateLimitState {
  toolCallsMinute: RateLimitWindow;
  toolCallsHour: RateLimitWindow;
  apiCallsMinute: RateLimitWindow;
  shellCommandsMinute: RateLimitWindow;
}

export const createInitialRateLimitState = (): RateLimitState => {
  const now = new Date();
  return {
    toolCallsMinute: { count: 0, windowStart: now },
    toolCallsHour: { count: 0, windowStart: now },
    apiCallsMinute: { count: 0, windowStart: now },
    shellCommandsMinute: { count: 0, windowStart: now },
  };
};

// ============================================================================
// Undo Operations
// ============================================================================

export type UndoOperationType =
  | "file_write"
  | "file_delete"
  | "directory_create"
  | "clipboard_write";

export interface UndoOperation {
  id: string;
  toolCallId: string;
  operationType: UndoOperationType;
  undoData: unknown;
  status: "available" | "expired" | "executed" | "failed";
  createdAt: Date;
  expiresAt: Date;  // Default: 1 hour
}

export interface FileWriteUndoData {
  path: string;
  originalContent: string | null;  // null if file didn't exist
}

export interface FileDeleteUndoData {
  originalPath: string;
  trashPath: string;
  wasDirectory: boolean;
}

export interface DirectoryCreateUndoData {
  path: string;
  wasEmpty: boolean;
}

export interface ClipboardWriteUndoData {
  previousContent: string;
}

