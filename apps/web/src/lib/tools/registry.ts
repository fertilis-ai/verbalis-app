/**
 * The single list of tools the agent can call. Each entry carries the schema
 * the model sees, the guardrail metadata, and the executor (see `ToolSpec`).
 *
 * Order matters: it is the order tools are offered to the model.
 */

import type { RiskLevel, ToolCategory, ToolSpec } from "./categories";
import { FS_TOOLS } from "./fs-tools";
import { GENERATE_IMAGE_TOOL } from "./image-tools";
import { REMEMBER_TOOL } from "./memory-tools";
import { TOOLBOX_TOOLS } from "./toolbox-tools";
import { WEB_TOOLS } from "./web-tools";

let registry: readonly ToolSpec[] | undefined;
let toolsByName: Map<string, ToolSpec> | undefined;

// Built on first use, not at load: toolbox-schemas imports this module and is
// itself imported by toolbox-tools and memory-tools, so when one of those loads
// first their specs do not exist yet while this module is evaluated.
export function getToolRegistry(): readonly ToolSpec[] {
  registry ??= [...FS_TOOLS, ...WEB_TOOLS, GENERATE_IMAGE_TOOL, ...TOOLBOX_TOOLS, REMEMBER_TOOL];
  return registry;
}

export function getToolNames(): string[] {
  return getToolRegistry().map((tool) => tool.name);
}

export function getToolSpec(toolName: string): ToolSpec | undefined {
  toolsByName ??= new Map(getToolRegistry().map((tool) => [tool.name, tool]));
  return toolsByName.get(toolName);
}

/** Unknown tools are "custom". */
export function getToolCategory(toolName: string): ToolCategory {
  return getToolSpec(toolName)?.category ?? "custom";
}

/** Unknown tools are treated as high risk. */
export function getToolRiskLevel(toolName: string): RiskLevel {
  return getToolSpec(toolName)?.riskLevel ?? "high";
}

export function toolSupportsUndo(toolName: string): boolean {
  return getToolSpec(toolName)?.supportsUndo ?? false;
}
