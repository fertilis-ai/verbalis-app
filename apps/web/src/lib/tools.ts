import { Type, type Static, type TSchema } from "typebox";
import { invoke } from "@tauri-apps/api/core";
import type { Tool, ToolCall } from "@earendil-works/pi-ai";
import type { ToolCategory, RiskLevel } from "./tools/categories";
import {
  WEB_TOOL_DEFINITIONS,
  executeWebTool,
  HttpFetchParams,
  WebSearchParams,
  ScrapeWebpageParams,
} from "./tools/web-tools";
import { resolvePath, type ResolvePathResult } from "./path-resolution";
import { useSettingsStore } from "@/stores/settings-store";
import { getAppDataDir } from "@/lib/storage";
import { executeToolboxTool, TOOLBOX_TOOL_NAMES as TOOLBOX_TOOL_NAME_LIST } from "./tools/toolbox-tools";
import { executeRemember } from "./tools/memory-tools";

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

// Define parameter schemas for each tool
const ReadFileParams = Type.Object({
  path: Type.String({ description: "Path to the file to read" }),
});

const WriteFileParams = Type.Object({
  path: Type.String({ description: "Path to write the file" }),
  content: Type.String({ description: "Content to write" }),
});

const DeletePathParams = Type.Object({
  path: Type.String({ description: "Path to delete (file or directory)" }),
});

const CreateDirectoryParams = Type.Object({
  path: Type.String({ description: "Path to the directory to create" }),
});

const ReadDirectoryParams = Type.Object({
  path: Type.String({ description: "Path to the directory to read" }),
  max_depth: Type.Optional(
    Type.Number({ description: "Maximum depth to recurse (default: 3)" })
  ),
});

const PathExistsParams = Type.Object({
  path: Type.String({ description: "Path to check" }),
});

const ListFilesParams = Type.Object({
  dir: Type.String({ description: "Directory to list files from" }),
  extension: Type.Optional(
    Type.String({ description: "Filter by file extension (e.g., 'md', 'yaml')" })
  ),
});

const RenamePathParams = Type.Object({
  old_path: Type.String({ description: "Current path" }),
  new_path: Type.String({ description: "New path" }),
});

// Self-enhancement (Toolbox CRUD) parameter schemas
const TOOLBOX_CATEGORY_DESC =
  "Toolbox category: prompts, memories, agents, skills, or workflows";

const ListToolboxItemsParams = Type.Object({
  category: Type.Optional(Type.String({ description: `${TOOLBOX_CATEGORY_DESC}. Omit to list all categories.` })),
});

const ReadToolboxItemParams = Type.Object({
  category: Type.String({ description: TOOLBOX_CATEGORY_DESC }),
  name: Type.String({ description: "Item name (without extension)" }),
});

const WriteToolboxItemParams = Type.Object({
  category: Type.String({ description: TOOLBOX_CATEGORY_DESC }),
  name: Type.String({ description: "Item name (without extension)" }),
  content: Type.String({
    description:
      "Full file content. memories/agents/skills are markdown (skills/agents need YAML frontmatter); prompts/workflows are YAML.",
  }),
});

const DeleteToolboxItemParams = Type.Object({
  category: Type.String({ description: TOOLBOX_CATEGORY_DESC }),
  name: Type.String({ description: "Item name (without extension)" }),
});

const RememberParams = Type.Object({
  content: Type.String({ description: "The fact to remember (a short statement)" }),
  name: Type.Optional(
    Type.String({ description: "Memory file to append to (default: 'learned'). Use 'USER' for facts about the user." })
  ),
});

// Tool definitions with metadata (enhanced with categories and risk levels)
interface ToolDefinition<T extends TSchema = TSchema> {
  name: string;
  description: string;
  parameters: T;
  requiresConfirmation: boolean;
  // Enhanced metadata
  category: ToolCategory;
  riskLevel: RiskLevel;
  supportsUndo: boolean;
  requiresNetwork: boolean;
  estimatedDurationMs?: number;
}

export const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  read_file: {
    name: "read_file",
    description: "Read the contents of a file at the specified path",
    parameters: ReadFileParams,
    requiresConfirmation: false,
    category: "file_system",
    riskLevel: "low",
    supportsUndo: false,
    requiresNetwork: false,
    estimatedDurationMs: 100,
  },
  write_file: {
    name: "write_file",
    description: "Write content to a file, creating parent directories if needed",
    parameters: WriteFileParams,
    requiresConfirmation: true,
    category: "file_system",
    riskLevel: "medium",
    supportsUndo: true,
    requiresNetwork: false,
    estimatedDurationMs: 200,
  },
  delete_path: {
    name: "delete_path",
    description: "Delete a file or directory at the specified path",
    parameters: DeletePathParams,
    requiresConfirmation: true,
    category: "file_system",
    riskLevel: "high",
    supportsUndo: true,
    requiresNetwork: false,
    estimatedDurationMs: 100,
  },
  create_directory: {
    name: "create_directory",
    description: "Create a directory at the specified path, including parent directories",
    parameters: CreateDirectoryParams,
    requiresConfirmation: true,
    category: "file_system",
    riskLevel: "medium",
    supportsUndo: true,
    requiresNetwork: false,
    estimatedDurationMs: 50,
  },
  read_directory: {
    name: "read_directory",
    description: "Read the contents of a directory recursively up to a max depth",
    parameters: ReadDirectoryParams,
    requiresConfirmation: false,
    category: "file_system",
    riskLevel: "low",
    supportsUndo: false,
    requiresNetwork: false,
    estimatedDurationMs: 500,
  },
  path_exists: {
    name: "path_exists",
    description: "Check if a file or directory exists at the specified path",
    parameters: PathExistsParams,
    requiresConfirmation: false,
    category: "file_system",
    riskLevel: "low",
    supportsUndo: false,
    requiresNetwork: false,
    estimatedDurationMs: 10,
  },
  list_files: {
    name: "list_files",
    description: "List files in a directory, optionally filtered by extension",
    parameters: ListFilesParams,
    requiresConfirmation: false,
    category: "file_system",
    riskLevel: "low",
    supportsUndo: false,
    requiresNetwork: false,
    estimatedDurationMs: 100,
  },
  rename_path: {
    name: "rename_path",
    description: "Rename or move a file or directory from old_path to new_path",
    parameters: RenamePathParams,
    requiresConfirmation: true,
    category: "file_system",
    riskLevel: "medium",
    supportsUndo: true,
    requiresNetwork: false,
    estimatedDurationMs: 100,
  },
  http_fetch: {
    ...WEB_TOOL_DEFINITIONS.http_fetch,
    parameters: HttpFetchParams,
    requiresConfirmation: true,
  },
  web_search: {
    ...WEB_TOOL_DEFINITIONS.web_search,
    parameters: WebSearchParams,
    requiresConfirmation: false,
  },
  scrape_webpage: {
    ...WEB_TOOL_DEFINITIONS.scrape_webpage,
    parameters: ScrapeWebpageParams,
    requiresConfirmation: false,
  },
  // Self-enhancement tools (only offered when allowSelfEnhancement is enabled)
  list_toolbox_items: {
    name: "list_toolbox_items",
    description: "List the agent's Toolbox items (prompts, memories, agents, skills, workflows)",
    parameters: ListToolboxItemsParams,
    requiresConfirmation: false,
    category: "file_system",
    riskLevel: "low",
    supportsUndo: false,
    requiresNetwork: false,
    estimatedDurationMs: 50,
  },
  read_toolbox_item: {
    name: "read_toolbox_item",
    description: "Read the full content of a Toolbox item by category and name",
    parameters: ReadToolboxItemParams,
    requiresConfirmation: false,
    category: "file_system",
    riskLevel: "low",
    supportsUndo: false,
    requiresNetwork: false,
    estimatedDurationMs: 50,
  },
  write_toolbox_item: {
    name: "write_toolbox_item",
    description:
      "Create or overwrite a Toolbox item (prompt, memory, agent, skill, or workflow). Content is validated against the category schema before saving.",
    parameters: WriteToolboxItemParams,
    requiresConfirmation: true,
    category: "file_system",
    riskLevel: "medium",
    supportsUndo: false,
    requiresNetwork: false,
    estimatedDurationMs: 100,
  },
  delete_toolbox_item: {
    name: "delete_toolbox_item",
    description: "Delete a Toolbox item by category and name",
    parameters: DeleteToolboxItemParams,
    requiresConfirmation: true,
    category: "file_system",
    riskLevel: "high",
    supportsUndo: false,
    requiresNetwork: false,
    estimatedDurationMs: 50,
  },
  remember: {
    name: "remember",
    description:
      "Persist a fact to long-term memory so it is available in future conversations. Use this when you learn something durable about the user or task.",
    parameters: RememberParams,
    requiresConfirmation: false,
    category: "memory",
    riskLevel: "medium",
    supportsUndo: false,
    requiresNetwork: false,
    estimatedDurationMs: 100,
  },
};

// Convert to pi-ai Tool format for context.
// - Self-enhancement (Toolbox CRUD) tools are only included when the
//   allowSelfEnhancement setting is enabled, given the autonomy implications.
// - When `allowedTools` is provided (a per-agent allowlist), only those tools
//   are exposed.
export function getToolsForContext(allowedTools?: string[]): Tool[] {
  const allowSelfEnhancement = useSettingsStore.getState().allowSelfEnhancement;
  const allowSet = allowedTools && allowedTools.length > 0 ? new Set(allowedTools) : null;
  return Object.values(TOOL_DEFINITIONS)
    .filter((def) => allowSelfEnhancement || !TOOLBOX_TOOL_NAMES.has(def.name))
    .filter((def) => !allowSet || allowSet.has(def.name))
    .map((def) => ({
      name: def.name,
      description: def.description,
      parameters: def.parameters as Tool["parameters"],
    }));
}

// Get tool category
export function getToolCategory(toolName: string): ToolCategory {
  return TOOL_DEFINITIONS[toolName]?.category ?? "custom";
}

// Get tool risk level
export function getToolRiskLevel(toolName: string): RiskLevel {
  return TOOL_DEFINITIONS[toolName]?.riskLevel ?? "high";
}

// Check if tool supports undo
export function toolSupportsUndo(toolName: string): boolean {
  return TOOL_DEFINITIONS[toolName]?.supportsUndo ?? false;
}

/** Maps tool names to the argument keys that hold file paths. */
const TOOL_PATH_PARAMS: Record<string, string[]> = {
  read_file: ["path"],
  write_file: ["path"],
  delete_path: ["path"],
  create_directory: ["path"],
  read_directory: ["path"],
  path_exists: ["path"],
  list_files: ["dir"],
  rename_path: ["old_path", "new_path"],
};

/**
 * Resolve path arguments for a tool call using the user's Working Directory
 * and settings directory. Returns the args with resolved paths and a list
 * of resolutions for logging.
 */
async function resolveToolPaths(
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ resolved: Record<string, unknown>; resolutions: ResolvePathResult[] }> {
  const pathKeys = TOOL_PATH_PARAMS[toolName];
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

// Execute a tool call via Tauri invoke
export async function executeTool(toolCall: ToolCall): Promise<ToolResult> {
  const { id, name, arguments: rawArgs } = toolCall;

  try {
    // Resolve relative paths before execution
    const { resolved: args, resolutions } = await resolveToolPaths(
      name,
      rawArgs as Record<string, unknown>,
    );

    let result: unknown;

    switch (name) {
      case "read_file": {
        const params = args as Static<typeof ReadFileParams>;
        result = await invoke("read_file", { path: params.path });
        break;
      }
      case "write_file": {
        const params = args as Static<typeof WriteFileParams>;
        await invoke("write_file", {
          path: params.path,
          content: params.content,
        });
        result = withResolutionNotes(`Successfully wrote to ${params.path}`, resolutions);
        break;
      }
      case "delete_path": {
        const params = args as Static<typeof DeletePathParams>;
        await invoke("delete_path", { path: params.path });
        result = withResolutionNotes(`Successfully deleted ${params.path}`, resolutions);
        break;
      }
      case "create_directory": {
        const params = args as Static<typeof CreateDirectoryParams>;
        await invoke("create_directory", { path: params.path });
        result = withResolutionNotes(`Successfully created directory ${params.path}`, resolutions);
        break;
      }
      case "read_directory": {
        const params = args as Static<typeof ReadDirectoryParams>;
        result = await invoke("read_directory", {
          path: params.path,
          maxDepth: params.max_depth,
        });
        // Format as readable string
        result = JSON.stringify(result, null, 2);
        break;
      }
      case "path_exists": {
        const params = args as Static<typeof PathExistsParams>;
        const exists = await invoke("path_exists", { path: params.path });
        const msg = exists ? `Path exists: ${params.path}` : `Path does not exist: ${params.path}`;
        result = withResolutionNotes(msg, resolutions);
        break;
      }
      case "list_files": {
        const params = args as Static<typeof ListFilesParams>;
        const files = await invoke("list_files", {
          dir: params.dir,
          extension: params.extension,
        });
        result = Array.isArray(files) ? files.join("\n") : String(files);
        break;
      }
      case "rename_path": {
        const params = args as Static<typeof RenamePathParams>;
        await invoke("rename_path", {
          oldPath: params.old_path,
          newPath: params.new_path,
        });
        result = withResolutionNotes(`Successfully renamed ${params.old_path} to ${params.new_path}`, resolutions);
        break;
      }
      case "http_fetch":
      case "web_search":
      case "scrape_webpage": {
        result = await executeWebTool(name, args);
        break;
      }
      case "list_toolbox_items":
      case "read_toolbox_item":
      case "write_toolbox_item":
      case "delete_toolbox_item": {
        result = await executeToolboxTool(name, args as Record<string, unknown>);
        break;
      }
      case "remember": {
        result = await executeRemember(args as Record<string, unknown>);
        break;
      }
      default:
        return {
          toolCallId: id,
          toolName: name,
          status: "error",
          error: `Unknown tool: ${name}`,
        };
    }

    return {
      toolCallId: id,
      toolName: name,
      status: "success",
      result: typeof result === "string" ? result : JSON.stringify(result),
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
