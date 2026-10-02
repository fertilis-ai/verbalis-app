import { resolveMemories, type ResolvedMemory } from "@/lib/memory/resolve-memories";
import { resolveSkills, renderSkillsForPrompt } from "@/lib/skills/resolve-skills";
import { buildToolboxInventory } from "@/lib/toolbox/toolbox-inventory";
import { renderToolboxFormatReference } from "@/lib/toolbox/toolbox-schemas";
import type { Agent } from "@/stores/agent-store";
import type { ContextFile } from "@/stores/chat-store";

export const DEFAULT_SYSTEM_PROMPT = "You are a helpful AI assistant.";

/** The Toolbox-derived parts of the system prompt, which need disk reads. */
export interface ToolboxPromptSections {
  memories: Pick<ResolvedMemory, "heading" | "body">[];
  /** Rendered skill index and matched skill bodies; "" when skills failed to load. */
  skills: string;
  /** Rendered Toolbox inventory; "" when it failed to build. */
  toolboxInventory: string;
}

/**
 * Load the Toolbox-derived sections for a message. A memory failure throws;
 * skills and the inventory are optional and fall back to "" with a warning.
 */
export async function loadToolboxPromptSections(params: {
  settingsDir: string;
  userMessage: string;
}): Promise<ToolboxPromptSections> {
  // Load persistent memories. Canonical store is the app-data memories dir
  // (Toolbox "memories"); SOUL/USER and any `alwaysInclude` memory are
  // injected, bounded in size, with a legacy read of settingsDir/memories/.
  const memories = await resolveMemories({ settingsDir: params.settingsDir });

  // Skill index (always) + matched skill bodies (by trigger).
  let skills = "";
  try {
    skills = renderSkillsForPrompt(await resolveSkills(params.userMessage));
  } catch (error) {
    console.warn("[system-prompt] Failed to resolve skills:", error);
  }

  // Toolbox awareness: compact inventory of every category so the agent
  // knows what exists without a list_toolbox_items round-trip. Always
  // injected (read-only), independent of allowSelfEnhancement.
  let toolboxInventory = "";
  try {
    toolboxInventory = await buildToolboxInventory();
  } catch (error) {
    console.warn("[system-prompt] Failed to build toolbox inventory:", error);
  }

  return { memories, skills, toolboxInventory };
}

/** Assemble the system prompt for a chat turn. Pure: every input is passed in. */
export function buildSystemPrompt(params: {
  agent?: Pick<Agent, "name" | "model" | "temperature" | "systemPrompt">;
  sections: ToolboxPromptSections;
  contextFiles: Pick<ContextFile, "name" | "content">[];
  workingDirectory?: string;
  allowSelfEnhancement: boolean;
  /** True when image generation is configured (an OpenRouter key and an image model). */
  imageGeneration: boolean;
}): string {
  const { agent, sections, contextFiles, workingDirectory, allowSelfEnhancement, imageGeneration } = params;
  let systemPrompt = agent?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  for (const mem of sections.memories) {
    systemPrompt += `\n\n## ${mem.heading}\n${mem.body}`;
  }
  systemPrompt += sections.skills;
  systemPrompt += sections.toolboxInventory;

  // Current agent context
  if (agent) {
    systemPrompt += `\n\n## Current Agent\nName: ${agent.name}${agent.model ? `\nModel: ${agent.model}` : ""}\nTemperature: ${agent.temperature}`;
  }

  // Attached file context
  if (contextFiles.length > 0) {
    const fileContext = contextFiles
      .map((f) => `### ${f.name}\n\`\`\`\n${f.content}\n\`\`\``)
      .join("\n\n");
    systemPrompt += `\n\n## File Context\nThe user has attached the following files for reference:\n\n${fileContext}`;
  }

  if (workingDirectory) {
    systemPrompt += `\n\n## Working Directory\nThe user's current working directory is: ${workingDirectory}\n- Relative paths in file tools (read_file, write_file, etc.) automatically resolve to this directory.\n- Paths starting with agents/, prompts/, memories/, skills/, workflows/ automatically resolve to the Verbalis data directory.`;
  }

  // Memory / self-enhancement guidance
  systemPrompt += `\n\n## Memory\nUse the \`remember\` tool to persist durable facts about the user or task so they are available in future sessions. Don't remember trivial or ephemeral details.`;
  if (allowSelfEnhancement) {
    systemPrompt += `\n\n## Self-Enhancement\nYou may improve your own Toolbox using \`list_toolbox_items\`, \`read_toolbox_item\`, \`write_toolbox_item\`, \`edit_toolbox_item\`, and \`delete_toolbox_item\` (categories: prompts, memories, agents, skills, workflows). Writes and deletes require user confirmation. Prefer \`edit_toolbox_item\` for small changes and \`write_toolbox_item\` for new items or rewrites. Create referenced agents before workflows that name them.\n\n${renderToolboxFormatReference()}`;
  }
  if (imageGeneration) {
    systemPrompt += `\n\n## Image Generation\nWhen the user asks you to create, draw, or generate an image or picture, use the \`generate_image\` tool. To edit or vary a previously generated image, pass its file path (the "Saved to:" line of the earlier tool result) as \`source_image\`. Generated images are saved to ~/.verbalis/images and shown to the user automatically — after the tool succeeds, just briefly describe the image; never embed image data in your reply.`;
  }

  return systemPrompt;
}
