import type { Static, TSchema } from "typebox";

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
// Tool Spec
// ============================================================================

export interface ToolContext {
  /** Appends `(resolved "x" → "y")` for each path argument that was resolved. */
  withResolutionNotes(message: string): string;
}

/**
 * One tool in the registry (`tools/registry.ts`): what the model sees, the
 * guardrail metadata, and the executor. Whether a call needs confirmation is
 * decided by the guardrails matrix from `category` and `riskLevel`.
 */
export interface ToolSpec<T extends TSchema = TSchema> {
  name: string;
  description: string;
  parameters: T;
  category: ToolCategory;
  riskLevel: RiskLevel;
  supportsUndo: boolean;
  /** Argument keys holding file paths, resolved against the Working Directory before `execute`. */
  pathParams?: readonly string[];
  /** Receives arguments already validated against `parameters`. */
  execute(args: Static<T>, ctx: ToolContext): Promise<string>;
}

/** Identity helper that types `execute`'s arguments from `parameters`. */
export function defineTool<T extends TSchema>(spec: ToolSpec<T>): ToolSpec {
  return spec as unknown as ToolSpec;
}

export function compareRiskLevels(a: RiskLevel, b: RiskLevel): number {
  const order: RiskLevel[] = ["low", "medium", "high", "critical"];
  return order.indexOf(a) - order.indexOf(b);
}
