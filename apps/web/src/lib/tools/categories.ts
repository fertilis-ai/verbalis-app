import type { TSchema } from "typebox";
import { WEB_TOOL_DEFINITIONS } from "./web-tools";
import { SYSTEM_TOOL_DEFINITIONS } from "./system-tools";

// ============================================================================
// Tool Categories
// ============================================================================

export type ToolCategory =
  | "file_system"   // Existing: read/write/delete files
  | "web"           // HTTP requests, web search
  | "system"        // Shell, clipboard, notifications
  | "integration"   // MCP servers, external services
  | "memory"        // RAG, embeddings, recall
  | "custom";       // User-defined tools

export type RiskLevel = "low" | "medium" | "high" | "critical";

// ============================================================================
// Risk Level Styling
// ============================================================================

export const RISK_LEVEL_CONFIG: Record<RiskLevel, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
}> = {
  low: {
    label: "Low Risk",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
    icon: "shield-check",
  },
  medium: {
    label: "Medium Risk",
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
    icon: "shield",
  },
  high: {
    label: "High Risk",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    icon: "shield-alert",
  },
  critical: {
    label: "Critical Risk",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    icon: "shield-x",
  },
};

// ============================================================================
// Category Styling
// ============================================================================

export const CATEGORY_CONFIG: Record<ToolCategory, {
  label: string;
  icon: string;
  description: string;
}> = {
  file_system: {
    label: "File System",
    icon: "folder",
    description: "Read, write, and manage files on disk",
  },
  web: {
    label: "Web",
    icon: "globe",
    description: "HTTP requests, web search, and scraping",
  },
  system: {
    label: "System",
    icon: "terminal",
    description: "Shell commands, clipboard, and notifications",
  },
  integration: {
    label: "Integration",
    icon: "plug",
    description: "MCP servers and external services",
  },
  memory: {
    label: "Memory",
    icon: "brain",
    description: "RAG, embeddings, and knowledge recall",
  },
  custom: {
    label: "Custom",
    icon: "puzzle",
    description: "User-defined tools",
  },
};

// ============================================================================
// Enhanced Tool Definition
// ============================================================================

export interface ToolDefinitionV2<T extends TSchema = TSchema> {
  name: string;
  description: string;
  category: ToolCategory;
  riskLevel: RiskLevel;
  parameters: T;

  // Metadata
  estimatedDurationMs?: number;
  requiresNetwork: boolean;
  supportsUndo: boolean;
  confirmationOverride?: "always" | "never" | "use_category_default";

  // Execution
  execute?: (args: Record<string, unknown>) => Promise<string>;
}

// ============================================================================
// Tool Inventory
// ============================================================================

export interface ToolInventoryItem {
  name: string;
  category: ToolCategory;
  riskLevel: RiskLevel;
  supportsUndo: boolean;
  description: string;
}

export const FILE_SYSTEM_TOOLS: ToolInventoryItem[] = [
  { name: "read_file", category: "file_system", riskLevel: "low", supportsUndo: false, description: "Read file contents" },
  { name: "write_file", category: "file_system", riskLevel: "medium", supportsUndo: true, description: "Write content to file" },
  { name: "delete_path", category: "file_system", riskLevel: "high", supportsUndo: true, description: "Delete file or directory" },
  { name: "create_directory", category: "file_system", riskLevel: "medium", supportsUndo: true, description: "Create a directory" },
  { name: "read_directory", category: "file_system", riskLevel: "low", supportsUndo: false, description: "List directory contents" },
  { name: "path_exists", category: "file_system", riskLevel: "low", supportsUndo: false, description: "Check if path exists" },
  { name: "list_files", category: "file_system", riskLevel: "low", supportsUndo: false, description: "List files with filter" },
  { name: "rename_path", category: "file_system", riskLevel: "medium", supportsUndo: true, description: "Rename/move file or directory" },
];

function toInventoryItem(def: ToolDefinitionV2): ToolInventoryItem {
  return {
    name: def.name,
    category: def.category,
    riskLevel: def.riskLevel,
    supportsUndo: def.supportsUndo,
    description: def.description,
  };
}

// Self-enhancement (Toolbox CRUD) tools. Classified as file_system so the
// confirmation matrix gates writes (medium) and deletes (high) while leaving
// read/list (low) un-prompted.
export const TOOLBOX_TOOLS: ToolInventoryItem[] = [
  { name: "list_toolbox_items", category: "file_system", riskLevel: "low", supportsUndo: false, description: "List Toolbox items" },
  { name: "read_toolbox_item", category: "file_system", riskLevel: "low", supportsUndo: false, description: "Read a Toolbox item" },
  { name: "write_toolbox_item", category: "file_system", riskLevel: "medium", supportsUndo: false, description: "Create/overwrite a Toolbox item" },
  { name: "delete_toolbox_item", category: "file_system", riskLevel: "high", supportsUndo: false, description: "Delete a Toolbox item" },
  // `remember` is a memory-category append; medium risk so it learns without
  // a confirmation prompt on every fact (memory matrix only gates high+).
  { name: "remember", category: "memory", riskLevel: "medium", supportsUndo: false, description: "Persist a fact to long-term memory" },
];

export const WEB_TOOLS: ToolInventoryItem[] =
  Object.values(WEB_TOOL_DEFINITIONS).map(toInventoryItem);

export const SYSTEM_TOOLS: ToolInventoryItem[] =
  Object.values(SYSTEM_TOOL_DEFINITIONS).map(toInventoryItem);

export const ALL_TOOLS: ToolInventoryItem[] = [
  ...FILE_SYSTEM_TOOLS,
  ...TOOLBOX_TOOLS,
  ...WEB_TOOLS,
  ...SYSTEM_TOOLS,
];

// ============================================================================
// Helper Functions
// ============================================================================

const TOOL_LOOKUP: Map<string, ToolInventoryItem> = new Map(
  ALL_TOOLS.map(t => [t.name, t])
);

export function getToolCategory(toolName: string): ToolCategory {
  return TOOL_LOOKUP.get(toolName)?.category ?? "custom";
}

export function getToolRiskLevel(toolName: string): RiskLevel {
  return TOOL_LOOKUP.get(toolName)?.riskLevel ?? "high"; // Default to high for unknown tools
}

export function getToolSupportsUndo(toolName: string): boolean {
  return TOOL_LOOKUP.get(toolName)?.supportsUndo ?? false;
}

export function compareRiskLevels(a: RiskLevel, b: RiskLevel): number {
  const order: RiskLevel[] = ["low", "medium", "high", "critical"];
  return order.indexOf(a) - order.indexOf(b);
}
