import type { Tool, ToolCall } from "@earendil-works/pi-ai";
import { validateToolArguments } from "@earendil-works/pi-ai";
import type { ToolCategory, RiskLevel } from "./tools/categories";
import { getToolRegistry, getToolSpec } from "./tools/registry";
import { TOOLBOX_TOOL_NAMES as TOOLBOX_TOOL_NAME_LIST } from "./tools/toolbox-tools";
import { resolvePath, type ResolvePathResult } from "./path-resolution";
import { useSettingsStore } from "@/stores/settings-store";
import { getAppDataDir, isTauri } from "@/lib/storage";

export { getToolCategory, getToolRiskLevel, toolSupportsUndo } from "./tools/registry";

const TOOLBOX_TOOL_NAMES = new Set<string>(TOOLBOX_TOOL_NAME_LIST);

// Tool result returned after execution
export interface ToolResult {
  toolCallId: string;
  toolName: string;
  status: "success" | "error";
  result?: string;
  error?: string;
}

// Tool call state for UI tracking
export type ToolCallStatus =
  | "pending"
  | "pending_confirmation"
  | "executing"
  | "success"
  | "error"
  | "cancelled"
  | "timeout"
  | "stopped";

export interface ToolCallState {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
  result?: string;
  error?: string;
  // Enhanced tracking
  queuedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  category?: ToolCategory;
  riskLevel?: RiskLevel;
  undoAvailable?: boolean;
  // Guardrail context
  guardrailReason?: string;
  guardrailViolations?: Array<{ type: string; message: string; severity: string }>;
}

/**
 * Normalize persisted/legacy statuses to the current ToolCallStatus union.
 * Falls back to "stopped" for unknown values to avoid misleading loading spinners.
 */
export function normalizeToolCallStatus(status: string | null | undefined): ToolCallStatus {
  switch (status) {
    case "pending":
    case "pending_confirmation":
    case "executing":
    case "success":
    case "error":
    case "cancelled":
    case "timeout":
    case "stopped":
      return status;
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "queued":
      return "pending";
    case "awaiting_approval":
      return "pending_confirmation";
    default:
      return "stopped";
  }
}

// Convert to pi-ai Tool format for context.
// - Self-enhancement (Toolbox CRUD) tools are only included when the
//   allowSelfEnhancement setting is enabled, given the autonomy implications.
// - generate_image is only included when an OpenRouter key and image model
//   are configured (desktop only).
// - When `allowedTools` is provided (a per-agent allowlist), only those tools
//   are exposed.
export function getToolsForContext(allowedTools?: string[]): Tool[] {
  const { allowSelfEnhancement, apiKeys, imageModel } = useSettingsStore.getState();
  const imageToolEnabled = isTauri() && !!apiKeys.openrouter.trim() && !!imageModel;
  const allowSet = allowedTools && allowedTools.length > 0 ? new Set(allowedTools) : null;
  return getToolRegistry()
    .filter((def) => allowSelfEnhancement || !TOOLBOX_TOOL_NAMES.has(def.name))
    .filter((def) => def.name !== "generate_image" || imageToolEnabled)
    .filter((def) => !allowSet || allowSet.has(def.name))
    .map((def) => ({
      name: def.name,
      description: def.description,
      parameters: def.parameters as Tool["parameters"],
    }));
}

/**
 * Resolve path arguments for a tool call using the user's Working Directory
 * and settings directory. Returns the args with resolved paths and a list
 * of resolutions for logging.
 */
async function resolveToolPaths(
  pathKeys: readonly string[] | undefined,
  args: Record<string, unknown>,
): Promise<{ resolved: Record<string, unknown>; resolutions: ResolvePathResult[] }> {
  if (!pathKeys) return { resolved: args, resolutions: [] };

  const settings = useSettingsStore.getState();
  const settingsDir = await getAppDataDir();

  const resolved = { ...args };
  const resolutions: ResolvePathResult[] = [];

  for (const key of pathKeys) {
    const raw = args[key];
    if (typeof raw !== "string") continue;

    const result = resolvePath(raw, settings.workingDirectory, settingsDir, settings.homeDir);
    if (result.resolvedPath !== result.originalPath.trim()) {
      resolutions.push(result);
    }
    resolved[key] = result.resolvedPath;
  }

  return { resolved, resolutions };
}

/** Append "(resolved from ...)" notes to a result string. */
function withResolutionNotes(message: string, resolutions: ResolvePathResult[]): string {
  if (resolutions.length === 0) return message;
  const notes = resolutions
    .map((r) => `(resolved "${r.originalPath.trim()}" → "${r.resolvedPath}")`)
    .join(" ");
  return `${message} ${notes}`;
}

/**
 * Execute a tool call from the model. Arguments are validated (and coerced,
 * e.g. "3" → 3) against the tool's schema before its executor runs; a
 * validation failure comes back as an error result the model can correct.
 * The pi agent loop has already validated calls it hands the adapter; this
 * repeats it so executors never depend on the caller having done so.
 */
export async function executeTool(toolCall: ToolCall): Promise<ToolResult> {
  const { id, name } = toolCall;

  const spec = getToolSpec(name);
  if (!spec) {
    return {
      toolCallId: id,
      toolName: name,
      status: "error",
      error: `Unknown tool: ${name}`,
    };
  }

  try {
    const validArgs = validateToolArguments(spec, toolCall) as Record<string, unknown>;
    // Resolve relative paths before execution
    const { resolved: args, resolutions } = await resolveToolPaths(spec.pathParams, validArgs);

    const result = await spec.execute(args, {
      withResolutionNotes: (message) => withResolutionNotes(message, resolutions),
    });

    return {
      toolCallId: id,
      toolName: name,
      status: "success",
      result,
    };
  } catch (error) {
    return {
      toolCallId: id,
      toolName: name,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
