import type { GuardrailsConfig } from "./types";
import { DEFAULT_GUARDRAILS_CONFIG } from "./types";

// ============================================================================
// User Mode Presets
// ============================================================================

/**
 * Normal Mode - Safe defaults for regular users
 * Identical to DEFAULT_GUARDRAILS_CONFIG (guardrails ON, confirm medium+,
 * sandbox enabled, shell allowlist, strict rate limits).
 */
export const NORMAL_MODE_CONFIG: GuardrailsConfig = DEFAULT_GUARDRAILS_CONFIG;

/**
 * Advanced Mode - More freedom for power users
 * - Guardrails ON
 * - Only confirm high, critical risk operations
 * - Sandbox optional
 * - Shell commands still require allowlist
 * - Relaxed rate limits
 */
export const ADVANCED_MODE_CONFIG: GuardrailsConfig = {
  ...DEFAULT_GUARDRAILS_CONFIG,
  enabled: true,
  categoryConfirmation: {
    file_system: { low: false, medium: false, high: true, critical: true },
    web: { low: false, medium: false, high: true, critical: true },
    system: { low: false, medium: false, high: true, critical: true },
    integration: { low: false, medium: false, high: true, critical: true },
    memory: { low: false, medium: false, high: false, critical: true },
    custom: { low: false, medium: true, high: true, critical: true },
  },
  sandbox: {
    enabled: false,
    shellCommands: false,
    networkAccess: true,
    tempDirectory: "~/.verbalis/sandbox",
  },
  shellCommands: {
    ...DEFAULT_GUARDRAILS_CONFIG.shellCommands,
    defaultPolicy: "deny",
  },
  rateLimits: {
    toolCallsPerMinute: 60,
    toolCallsPerHour: 1000,
    apiCallsPerMinute: 30,
    shellCommandsPerMinute: 15,
  },
};

/**
 * YOLO Mode - Maximum freedom (expert only)
 * - Guardrails OFF
 * - No confirmations required
 * - No sandbox
 * - Shell commands allowed by default
 * - No rate limits
 */
export const YOLO_MODE_CONFIG: GuardrailsConfig = {
  ...DEFAULT_GUARDRAILS_CONFIG,
  enabled: false,
  categoryConfirmation: {
    file_system: { low: false, medium: false, high: false, critical: false },
    web: { low: false, medium: false, high: false, critical: false },
    system: { low: false, medium: false, high: false, critical: false },
    integration: { low: false, medium: false, high: false, critical: false },
    memory: { low: false, medium: false, high: false, critical: false },
    custom: { low: false, medium: false, high: false, critical: false },
  },
  sandbox: {
    enabled: false,
    shellCommands: false,
    networkAccess: true,
    tempDirectory: "~/.verbalis/sandbox",
  },
  paths: {
    allowlist: [],
    blocklist: [], // Still keep some critical blocklist items
    defaultPolicy: "allow",
  },
  domains: {
    allowlist: [],
    blocklist: [],
    defaultPolicy: "allow",
  },
  shellCommands: {
    allowlist: ["*"],
    blocklist: [
      // Keep only the most dangerous commands blocked
      ":(){ :|:& };:",  // Fork bomb
      "rm -rf /",
      "rm -rf /*",
      "> /dev/sda",
      "mkfs /dev/*",
    ],
    defaultPolicy: "deny" as const, // Overridden by "*" allowlist
  },
  rateLimits: {
    toolCallsPerMinute: 999999,
    toolCallsPerHour: 999999,
    apiCallsPerMinute: 999999,
    shellCommandsPerMinute: 999999,
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

export type UserModePreset = "normal" | "advanced" | "yolo";

export function getPresetConfig(preset: UserModePreset): GuardrailsConfig {
  switch (preset) {
    case "normal":
      return NORMAL_MODE_CONFIG;
    case "advanced":
      return ADVANCED_MODE_CONFIG;
    case "yolo":
      return YOLO_MODE_CONFIG;
    default:
      return NORMAL_MODE_CONFIG;
  }
}

export function detectPreset(config: GuardrailsConfig): UserModePreset | "custom" {
  // Quick check for YOLO mode
  if (!config.enabled) {
    return "yolo";
  }

  // Check if it matches advanced mode
  const advancedConfirm = config.categoryConfirmation.file_system;
  if (!advancedConfirm.low && !advancedConfirm.medium && advancedConfirm.high && advancedConfirm.critical) {
    // Could be advanced mode
    if (config.rateLimits.toolCallsPerMinute >= 60) {
      return "advanced";
    }
  }

  // Check if it matches normal mode
  const normalConfirm = config.categoryConfirmation.file_system;
  if (!normalConfirm.low && normalConfirm.medium && normalConfirm.high && normalConfirm.critical) {
    if (config.rateLimits.toolCallsPerMinute <= 30 && config.sandbox.enabled) {
      return "normal";
    }
  }

  return "custom";
}

export const PRESET_LABELS: Record<UserModePreset, { label: string; description: string; color: string }> = {
  normal: {
    label: "Normal",
    description: "Safe defaults with confirmations for risky actions",
    color: "text-green-600 dark:text-green-400",
  },
  advanced: {
    label: "Advanced",
    description: "More freedom with confirmations for high-risk only",
    color: "text-yellow-600 dark:text-yellow-400",
  },
  yolo: {
    label: "YOLO",
    description: "No restrictions - for experts only",
    color: "text-red-600 dark:text-red-400",
  },
};
