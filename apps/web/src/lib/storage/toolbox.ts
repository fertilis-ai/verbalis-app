import { deletePath, getAppDataDirCached, listFiles, pathExists, readFile, writeFile } from "./fs";
import { getSettingsOverlayDir, listOverlayFiles } from "./overlay";

// Generic toolbox item storage (prompts, memories, skills, workflows)
export interface ToolboxItemData {
  name: string;
  category: "prompts" | "memories" | "agents" | "skills" | "workflows";
  content: string;
  updatedAt: string;
}

export function getToolboxExtension(
  category: ToolboxItemData["category"]
): string {
  switch (category) {
    case "prompts":
      return "yaml";
    case "memories":
      return "md";
    case "agents":
      return "md";
    case "skills":
      return "md";
    case "workflows":
      return "yaml";
    default:
      return "txt";
  }
}

export async function saveToolboxItem(item: ToolboxItemData): Promise<void> {
  const dir = await getAppDataDirCached();
  const ext = getToolboxExtension(item.category);
  const path = `${dir}/${item.category}/${item.name}.${ext}`;
  await writeFile(path, item.content);
}

export async function loadToolboxItem(
  category: ToolboxItemData["category"],
  name: string
): Promise<ToolboxItemData | null> {
  const dir = await getAppDataDirCached();
  const ext = getToolboxExtension(category);
  let path = `${dir}/${category}/${name}.${ext}`;
  if (!(await pathExists(path))) {
    // Fall back to the settings-directory overlay.
    const overlay = await getSettingsOverlayDir();
    if (!overlay) return null;
    path = `${overlay}/${category}/${name}.${ext}`;
    if (!(await pathExists(path))) return null;
  }
  const content = await readFile(path);
  return {
    name,
    category,
    content,
    updatedAt: new Date().toISOString(),
  };
}

export async function listToolboxItems(
  category: ToolboxItemData["category"]
): Promise<string[]> {
  const dir = await getAppDataDirCached();
  const ext = getToolboxExtension(category);
  const names = await listFiles(`${dir}/${category}`, ext);
  const overlay = await getSettingsOverlayDir();
  if (overlay) {
    const seen = new Set(names);
    for (const name of await listOverlayFiles(`${overlay}/${category}`, ext)) {
      if (!seen.has(name)) names.push(name);
    }
  }
  return names;
}

export async function deleteToolboxItem(
  category: ToolboxItemData["category"],
  name: string
): Promise<void> {
  const dir = await getAppDataDirCached();
  const ext = getToolboxExtension(category);
  const canonical = `${dir}/${category}/${name}.${ext}`;
  if (await pathExists(canonical)) {
    await deletePath(canonical);
  }
  const overlay = await getSettingsOverlayDir();
  if (overlay) {
    const shadow = `${overlay}/${category}/${name}.${ext}`;
    if (await pathExists(shadow)) {
      await deletePath(shadow);
    }
  }
}

export async function renameToolboxItem(
  category: ToolboxItemData["category"],
  oldName: string,
  newName: string
): Promise<void> {
  const item = await loadToolboxItem(category, oldName);
  if (!item) return;
  await saveToolboxItem({ ...item, name: newName });
  await deleteToolboxItem(category, oldName);
}
