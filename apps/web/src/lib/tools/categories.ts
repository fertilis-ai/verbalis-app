import type { TSchema } from "@sinclair/typebox";

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

export const WEB_TOOLS: ToolInventoryItem[] = [
  { name: "http_fetch", category: "web", riskLevel: "medium", supportsUndo: false, description: "Make HTTP request" },
  { name: "web_search", category: "web", riskLevel: "low", supportsUndo: false, description: "Search the web" },
  { name: "scrape_webpage", category: "web", riskLevel: "low", supportsUndo: false, description: "Extract text from URL" },
];

export const SYSTEM_TOOLS: ToolInventoryItem[] = [
  { name: "shell_execute", category: "system", riskLevel: "critical", supportsUndo: false, description: "Execute shell command" },
  { name: "clipboard_read", category: "system", riskLevel: "low", supportsUndo: false, description: "Read clipboard" },
  { name: "clipboard_write", category: "system", riskLevel: "medium", supportsUndo: true, description: "Write to clipboard" },
  { name: "notification_send", category: "system", riskLevel: "low", supportsUndo: false, description: "Send system notification" },
];

export const ALL_TOOLS: ToolInventoryItem[] = [
  ...FILE_SYSTEM_TOOLS,
  ...WEB_TOOLS,
  ...SYSTEM_TOOLS,
];

// ============================================================================
// Helper Functions
// ============================================================================

export function getToolCategory(toolName: string): ToolCategory {
  const tool = ALL_TOOLS.find(t => t.name === toolName);
  return tool?.category ?? "custom";
}

export function getToolRiskLevel(toolName: string): RiskLevel {
  const tool = ALL_TOOLS.find(t => t.name === toolName);
  return tool?.riskLevel ?? "high"; // Default to high for unknown tools
}

export function getToolSupportsUndo(toolName: string): boolean {
  const tool = ALL_TOOLS.find(t => t.name === toolName);
  return tool?.supportsUndo ?? false;
}

export function getToolsByCategory(category: ToolCategory): ToolInventoryItem[] {
  return ALL_TOOLS.filter(t => t.category === category);
}

export function getToolsByRiskLevel(riskLevel: RiskLevel): ToolInventoryItem[] {
  return ALL_TOOLS.filter(t => t.riskLevel === riskLevel);
}

export function isRiskLevelAtLeast(level: RiskLevel, threshold: RiskLevel): boolean {
  const order: RiskLevel[] = ["low", "medium", "high", "critical"];
  return order.indexOf(level) >= order.indexOf(threshold);
}

export function compareRiskLevels(a: RiskLevel, b: RiskLevel): number {
  const order: RiskLevel[] = ["low", "medium", "high", "critical"];
  return order.indexOf(a) - order.indexOf(b);
}
