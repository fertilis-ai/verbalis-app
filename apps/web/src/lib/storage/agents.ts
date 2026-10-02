import { Buffer } from "buffer";
import matter from "gray-matter";
import type { Agent } from "@/lib/types/agent";
import { deletePath, getAppDataDirCached, listFiles, pathExists, readFile, writeFile } from "./fs";
import { getSettingsOverlayDir, listOverlayFiles } from "./overlay";

// Polyfill Buffer for browser environment (required by gray-matter)
declare global {
  interface Window {
    Buffer: typeof Buffer;
  }
}
if (typeof window !== "undefined" && !window.Buffer) {
  window.Buffer = Buffer;
}

// Agent storage (markdown with frontmatter)
export async function saveAgent(agent: Agent): Promise<void> {
  const dir = await getAppDataDirCached();
  const path = `${dir}/agents/${agent.name}.md`;
  const frontmatter: Record<string, unknown> = {
    name: agent.name,
    temperature: agent.temperature,
  };
  if (agent.model) {
    frontmatter.model = agent.model;
  }
  if (agent.tools && agent.tools.length > 0) {
    frontmatter.tools = agent.tools;
  }
  const content = matter.stringify(agent.systemPrompt, frontmatter);
  await writeFile(path, content);
}

export async function loadAgent(name: string): Promise<Agent | null> {
  const dir = await getAppDataDirCached();
  let path = `${dir}/agents/${name}.md`;
  if (!(await pathExists(path))) {
    // Fall back to the settings-directory overlay.
    const overlay = await getSettingsOverlayDir();
    if (!overlay) return null;
    path = `${overlay}/agents/${name}.md`;
    if (!(await pathExists(path))) return null;
  }
  const content = await readFile(path);
  const { data, content: systemPrompt } = matter(content);
  const tools = Array.isArray(data.tools)
    ? data.tools.filter((t: unknown): t is string => typeof t === "string")
    : undefined;
  return {
    name: data.name ?? name,
    temperature: data.temperature ?? 0.7,
    systemPrompt: systemPrompt.trim(),
    ...(typeof data.model === "string" ? { model: data.model } : {}),
    ...(tools && tools.length > 0 ? { tools } : {}),
  };
}

export async function listAgents(): Promise<string[]> {
  const dir = await getAppDataDirCached();
  const names = await listFiles(`${dir}/agents`, "md");
  const overlay = await getSettingsOverlayDir();
  if (overlay) {
    const seen = new Set(names);
    for (const name of await listOverlayFiles(`${overlay}/agents`, "md")) {
      if (!seen.has(name)) names.push(name);
    }
  }
  return names;
}

export async function deleteAgent(name: string): Promise<void> {
  const dir = await getAppDataDirCached();
  const canonical = `${dir}/agents/${name}.md`;
  if (await pathExists(canonical)) {
    await deletePath(canonical);
  }
  const overlay = await getSettingsOverlayDir();
  if (overlay) {
    const shadow = `${overlay}/agents/${name}.md`;
    if (await pathExists(shadow)) {
      await deletePath(shadow);
    }
  }
}
