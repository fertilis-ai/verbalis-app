import {
  DEFAULT_TOOLBOX_ITEMS,
  SUPERSEDED_TOOLBOX_DEFAULTS,
  TOOLBOX_DEFAULTS_VERSION,
} from "@/lib/toolbox/toolbox-defaults";
import { getAppDataDirCached, pathExists, readFile, writeFile } from "./fs";
import { getToolboxExtension } from "./toolbox";

const SOUL_TEMPLATE = `---
alwaysInclude: true
---

# Soul

Your enduring identity, values, and voice. This is always included in the
agent's system prompt. Describe who the assistant is and how it should behave.
`;

const USER_TEMPLATE = `---
alwaysInclude: true
---

# User

Durable facts about the user (preferences, context, goals). This is always
included in the agent's system prompt and is where the \`remember\` tool can
record what it learns over time.
`;

/**
 * Seed the well-known SOUL and USER memory files in the canonical memories
 * store if they don't already exist, so they surface as editable items in the
 * Toolbox. Safe to call on every startup — it only writes missing files.
 */
export async function ensureWellKnownMemories(): Promise<void> {
  const dir = await getAppDataDirCached();
  const seed = async (name: string, template: string) => {
    const path = `${dir}/memories/${name}.md`;
    if (!(await pathExists(path))) {
      await writeFile(path, template);
    }
  };
  await seed("SOUL", SOUL_TEMPLATE);
  await seed("USER", USER_TEMPLATE);
}

/**
 * Seed the default Toolbox items (starter prompts, skills, agents, workflows,
 * and memory templates from toolbox-defaults.ts) without overwriting existing
 * files. Guarded by a version marker so items a user deletes stay deleted;
 * bumping TOOLBOX_DEFAULTS_VERSION seeds newly added defaults on next launch.
 */
export async function ensureDefaultToolboxItems(): Promise<void> {
  const dir = await getAppDataDirCached();
  const markerPath = `${dir}/toolbox-defaults-version`;

  // Upgrade untouched copies of defaults that have since changed. Not gated by
  // the version marker, so it needs no bump (which would resurrect deleted items).
  for (const { category, name, previous } of SUPERSEDED_TOOLBOX_DEFAULTS) {
    const path = `${dir}/${category}/${name}.${getToolboxExtension(category)}`;
    if (!(await pathExists(path))) continue;
    if (!previous.includes(await readFile(path))) continue;
    const current = DEFAULT_TOOLBOX_ITEMS.find((i) => i.category === category && i.name === name);
    if (current) await writeFile(path, current.content);
  }

  let seededVersion = 0;
  if (await pathExists(markerPath)) {
    seededVersion = Number.parseInt(await readFile(markerPath), 10) || 0;
  }
  if (seededVersion >= TOOLBOX_DEFAULTS_VERSION) return;

  for (const item of DEFAULT_TOOLBOX_ITEMS) {
    const ext = getToolboxExtension(item.category);
    const path = `${dir}/${item.category}/${item.name}.${ext}`;
    if (!(await pathExists(path))) {
      await writeFile(path, item.content);
    }
  }
  await writeFile(markerPath, String(TOOLBOX_DEFAULTS_VERSION));
}
