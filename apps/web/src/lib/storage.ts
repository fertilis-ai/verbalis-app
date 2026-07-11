import { invoke, isTauri } from "@tauri-apps/api/core";
import YAML from "yaml";
import { Buffer } from "buffer";
import matter from "gray-matter";

// Polyfill Buffer for browser environment (required by gray-matter)
declare global {
  interface Window {
    Buffer: typeof Buffer;
  }
}
if (typeof window !== "undefined" && !window.Buffer) {
  window.Buffer = Buffer;
}

// ============================================================================
// LocalStorage-based fallback for web browser (non-Tauri)
// ============================================================================

const STORAGE_PREFIX = "verbalis:";

const DEFAULT_AGENT_FILE = `---
name: default
model: claude-sonnet-4-20250514
temperature: 0.3
---

You are the default orchestration agent for chat. Your job is to coordinate tool use and reasoning to solve user requests efficiently, safely, and transparently.

Core behavior:
- Be tool-first when tools are available and likely to reduce uncertainty or effort.
- Keep plans concise and in-line unless the user explicitly wants a longer plan.
- Ask a brief clarifying question only when it materially reduces risk or rework.
- If multiple paths exist, present 2-3 options with a clear recommendation.

Tool use policy:
- Prefer precise tools over speculation. Use search, file inspection, or commands to verify.
- Use the minimum number of tools needed to reach a reliable answer.
- For potentially destructive actions (delete, overwrite, reset, install system-wide), ask for confirmation first.
- When using shell commands:
  - Prefer read-only commands first (rg, ls, cat) before edits.
  - Avoid long-running or noisy commands unless necessary.
  - Summarize results and show key outputs.

Execution strategy:
1. Restate the goal briefly.
2. Decide whether tools are required.
3. Execute tools in a safe, incremental order.
4. Summarize findings and propose next steps.
5. Confirm before any risky changes.

Quality and safety:
- Never assume facts that can be quickly verified.
- Preserve user data and existing project structure.
- Avoid unnecessary edits or churn.
- If uncertain, be explicit and offer a safe fallback.

Response style:
- Be warm, direct, and collaborative.
- Keep responses focused and actionable.
- Use clear formatting for commands and file paths.
- End with suggested next steps when appropriate.
`;

// Virtual file system stored in localStorage
// Structure: { [path: string]: { isDir: boolean, content?: string } }
function getVirtualFS(): Record<string, { isDir: boolean; content?: string }> {
  const stored = localStorage.getItem(`${STORAGE_PREFIX}vfs`);
  return stored ? JSON.parse(stored) : {};
}

function setVirtualFS(vfs: Record<string, { isDir: boolean; content?: string }>): void {
  localStorage.setItem(`${STORAGE_PREFIX}vfs`, JSON.stringify(vfs));
}

function webCreateDirectory(path: string): void {
  const vfs = getVirtualFS();
  // Create all parent directories
  const parts = path.split("/").filter(Boolean);
  let currentPath = "";
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
    if (!vfs[currentPath]) {
      vfs[currentPath] = { isDir: true };
    }
  }
  setVirtualFS(vfs);
}

function webWriteFile(path: string, content: string): void {
  const vfs = getVirtualFS();
  // Ensure parent directory exists
  const parentPath = path.substring(0, path.lastIndexOf("/"));
  if (parentPath && !vfs[parentPath]) {
    webCreateDirectory(parentPath);
  }
  const updatedVfs = getVirtualFS(); // Re-read after creating dirs
  updatedVfs[path] = { isDir: false, content };
  setVirtualFS(updatedVfs);
}

function webReadFile(path: string): string {
  const vfs = getVirtualFS();
  const entry = vfs[path];
  if (!entry || entry.isDir) {
    throw new Error(`File not found: ${path}`);
  }
  return entry.content ?? "";
}

function webPathExists(path: string): boolean {
  const vfs = getVirtualFS();
  return !!vfs[path];
}

function webDeletePath(path: string): void {
  const vfs = getVirtualFS();
  // Delete the path and all children (for directories)
  const keysToDelete = Object.keys(vfs).filter(
    (key) => key === path || key.startsWith(`${path}/`)
  );
  for (const key of keysToDelete) {
    delete vfs[key];
  }
  setVirtualFS(vfs);
}

function webRenamePath(oldPath: string, newPath: string): void {
  const vfs = getVirtualFS();
  // Find all entries that start with oldPath
  const entries = Object.entries(vfs).filter(
    ([key]) => key === oldPath || key.startsWith(`${oldPath}/`)
  );

  for (const [key, value] of entries) {
    const newKey = key === oldPath ? newPath : key.replace(oldPath, newPath);
    vfs[newKey] = value;
    delete vfs[key];
  }
  setVirtualFS(vfs);
}

interface WebFileNode {
  name: string;
  path: string;
  is_directory: boolean;
}

function webReadDirectory(dirPath: string): WebFileNode[] {
  const vfs = getVirtualFS();
  const normalizedDir = dirPath.endsWith("/") ? dirPath.slice(0, -1) : dirPath;
  const results: WebFileNode[] = [];
  const seen = new Set<string>();

  for (const [path, entry] of Object.entries(vfs)) {
    // Check if this path is a direct child of dirPath
    if (path.startsWith(`${normalizedDir}/`)) {
      const relativePath = path.substring(normalizedDir.length + 1);
      const firstSlash = relativePath.indexOf("/");
      const childName = firstSlash === -1 ? relativePath : relativePath.substring(0, firstSlash);
      const childPath = `${normalizedDir}/${childName}`;

      if (!seen.has(childPath)) {
        seen.add(childPath);
        // Determine if it's a directory by checking if the exact path entry is a dir
        // or if there are deeper paths
        const isDir = vfs[childPath]?.isDir || firstSlash !== -1;
        results.push({
          name: childName,
          path: childPath,
          is_directory: isDir,
        });
      }
    }
  }

  return results;
}

function webListFiles(dir: string, extension?: string): string[] {
  const entries = webReadDirectory(dir);
  return entries
    .filter((e) => !e.is_directory && (!extension || e.name.endsWith(`.${extension}`)))
    .map((e) => e.name.replace(`.${extension}`, ""));
}

// ============================================================================
// Original types and exports
// ============================================================================

// Folder metadata (shared by chats, scheduler, etc.)
export interface FolderMeta {
  isPinned: boolean;
  createdAt: string;
}

// Backward-compatible aliases
export type ChatFolderMeta = FolderMeta;
export type SchedulerFolderMeta = FolderMeta;

// Chat tree node (folder or chat)
export interface ChatTreeNode {
  type: "folder" | "chat";
  id: string;
  name: string;
  path: string;
  isPinned: boolean;
  children?: ChatTreeNode[];
  // For chats only
  title?: string;
  updatedAt?: string;
}

// Types for file system operations
export interface FileNode {
  name: string;
  path: string;
  is_directory: boolean;
  children?: FileNode[];
}

// Re-export isTauri from @tauri-apps/api/core for convenience
export { isTauri };

// File System Commands
export async function getAppDataDir(): Promise<string> {
  if (!isTauri()) {
    return "/verbalis-data";  // Virtual path for localStorage
  }
  return invoke<string>("get_app_data_dir");
}

let appDataDirPromise: Promise<string> | null = null;
function getAppDataDirCached(): Promise<string> {
  if (!appDataDirPromise) appDataDirPromise = getAppDataDir();
  return appDataDirPromise;
}

export async function initAppDataDir(): Promise<void> {
  if (!isTauri()) {
    // Initialize default directories in virtual FS
    webCreateDirectory("/verbalis-data/chats");
    webCreateDirectory("/verbalis-data/tasks");
    webCreateDirectory("/verbalis-data/agents");
    webCreateDirectory("/verbalis-data/scheduler");
    webCreateDirectory("/verbalis-data/prompts");
    webCreateDirectory("/verbalis-data/memories");
    webCreateDirectory("/verbalis-data/skills");
    webCreateDirectory("/verbalis-data/workflows");
    webCreateDirectory("/verbalis-data/logs");
    if (!webPathExists("/verbalis-data/agents/default.md")) {
      webWriteFile("/verbalis-data/agents/default.md", DEFAULT_AGENT_FILE);
    }
    return;
  }
  return invoke("init_app_data_dir");
}

export async function readDirectory(
  path: string,
  _maxDepth?: number
): Promise<FileNode[]> {
  if (!isTauri()) {
    return webReadDirectory(path);
  }
  return invoke<FileNode[]>("read_directory", { path, max_depth: _maxDepth });
}

export async function readFile(path: string): Promise<string> {
  if (!isTauri()) {
    return webReadFile(path);
  }
  return invoke<string>("read_file", { path });
}

export async function writeFile(path: string, content: string): Promise<void> {
  if (!isTauri()) {
    webWriteFile(path, content);
    return;
  }
  return invoke("write_file", { path, content });
}

export async function deletePath(path: string): Promise<void> {
  if (!isTauri()) {
    webDeletePath(path);
    return;
  }
  return invoke("delete_path", { path });
}

export async function createDirectory(path: string): Promise<void> {
  if (!isTauri()) {
    webCreateDirectory(path);
    return;
  }
  return invoke("create_directory", { path });
}

export async function pathExists(path: string): Promise<boolean> {
  if (!isTauri()) {
    return webPathExists(path);
  }
  return invoke<boolean>("path_exists", { path });
}

export async function listFiles(
  dir: string,
  extension?: string
): Promise<string[]> {
  if (!isTauri()) {
    return webListFiles(dir, extension);
  }
  return invoke<string[]>("list_files", { dir, extension });
}

// Higher-level storage operations

// Chat storage
export interface ChatData {
  id: string;
  title: string;
  model: string;
  agentId: string | null;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
      status: string;
      result?: string;
      error?: string;
      durationMs?: number;
    }>;
  }>;
  createdAt: string;
  updatedAt: string;
}

// Load a chat directly by its file path (supports nested folders)
export async function loadChatByPath(path: string): Promise<ChatData | null> {
  if (!(await pathExists(path))) return null;
  try {
    const content = await readFile(path);
    return path.endsWith(".yaml") ? YAML.parse(content) : JSON.parse(content);
  } catch {
    return null;
  }
}

// Rename/move a file or directory
export async function renamePath(oldPath: string, newPath: string): Promise<void> {
  if (!isTauri()) {
    webRenamePath(oldPath, newPath);
    return;
  }
  return invoke("rename_path", { oldPath, newPath });
}

// Generic folder creation for any storage section (chats, scheduler, etc.)
async function createItemFolder(sectionDir: string, name: string, parentPath?: string): Promise<string> {
  // Ensure base directory exists before creating subfolder
  if (!(await pathExists(sectionDir))) {
    await createDirectory(sectionDir);
  }

  const basePath = parentPath ? `${parentPath}/${name}` : `${sectionDir}/${name}`;
  await createDirectory(basePath);

  // Create folder metadata
  const meta: FolderMeta = {
    isPinned: false,
    createdAt: new Date().toISOString(),
  };
  await writeFile(`${basePath}/_meta.yaml`, YAML.stringify(meta));

  return basePath;
}

// Chat folder operations
export async function createChatFolder(name: string, parentPath?: string): Promise<string> {
  const dir = await getAppDataDirCached();
  return createItemFolder(`${dir}/chats`, name, parentPath);
}

export async function saveFolderMeta(folderPath: string, meta: FolderMeta): Promise<void> {
  await writeFile(`${folderPath}/_meta.yaml`, YAML.stringify(meta));
}

export async function loadFolderMeta(folderPath: string): Promise<FolderMeta | null> {
  const metaPath = `${folderPath}/_meta.yaml`;
  if (!(await pathExists(metaPath))) return null;
  const content = await readFile(metaPath);
  return YAML.parse(content);
}

// Save chat to a specific folder (or root if no folderId)
export async function saveChatToFolder(chat: ChatData, folderPath?: string): Promise<void> {
  const dir = await getAppDataDirCached();
  const basePath = folderPath || `${dir}/chats`;
  const path = `${basePath}/${chat.id}.json`;
  await writeFile(path, JSON.stringify(chat, null, 2));
}

// Generic recursive tree loader for any folder-based storage section.
// `parseLeafEntry` converts a non-directory file entry into a leaf node, or returns null to skip.
// `folderType` is the type string used for folder nodes (e.g. "folder").
// `TNode` must have at minimum: type, id, name, path, isPinned, and optional children.
interface TreeNodeBase {
  type: string;
  id: string;
  name: string;
  path: string;
  isPinned: boolean;
  children?: TreeNodeBase[];
  updatedAt?: string;
}

async function loadTreeRecursive<TNode extends TreeNodeBase>(
  dirPath: string,
  folderType: string,
  parseLeafEntry: (entry: FileNode) => Promise<TNode | null>,
): Promise<TNode[]> {
  const nodes: TNode[] = [];
  const entries = await readDirectory(dirPath, 1);

  for (const entry of entries) {
    if (entry.is_directory) {
      const meta = await loadFolderMeta(entry.path);
      const children = await loadTreeRecursive<TNode>(entry.path, folderType, parseLeafEntry);
      const maxChildUpdated = children.reduce((max, c) => {
        return c.updatedAt && c.updatedAt > (max ?? "") ? c.updatedAt : max;
      }, undefined as string | undefined);
      nodes.push({
        type: folderType,
        id: entry.name,
        name: entry.name,
        path: entry.path,
        isPinned: meta?.isPinned ?? false,
        children,
        updatedAt: maxChildUpdated,
      } as unknown as TNode);
    } else {
      const leaf = await parseLeafEntry(entry);
      if (leaf) nodes.push(leaf);
    }
  }

  // Sort: pinned first, folders before leaves, then most recent first
  nodes.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (a.type !== b.type) return a.type === folderType ? -1 : 1;
    if (a.updatedAt || b.updatedAt) {
      return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    }
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

// Parse a file entry as a ChatTreeNode (JSON or legacy YAML)
async function parseChatEntry(entry: FileNode): Promise<ChatTreeNode | null> {
  if (entry.name.endsWith(".json") && entry.name !== "_meta.json") {
    try {
      const content = await readFile(entry.path);
      const chat: ChatData = JSON.parse(content);
      return {
        type: "chat",
        id: chat.id,
        name: entry.name.replace(".json", ""),
        path: entry.path,
        isPinned: false,
        title: chat.title,
        updatedAt: chat.updatedAt,
      };
    } catch {
      return null;
    }
  }
  if (entry.name.endsWith(".yaml") && entry.name !== "_meta.yaml") {
    try {
      const content = await readFile(entry.path);
      const chat: ChatData = YAML.parse(content);
      return {
        type: "chat",
        id: chat.id,
        name: entry.name.replace(".yaml", ""),
        path: entry.path,
        isPinned: false,
        title: chat.title,
        updatedAt: chat.updatedAt,
      };
    } catch {
      return null;
    }
  }
  return null;
}

// Load entire chat tree from disk
export async function loadChatTree(): Promise<ChatTreeNode[]> {
  const dir = await getAppDataDirCached();
  const chatsDir = `${dir}/chats`;

  if (!(await pathExists(chatsDir))) {
    return [];
  }

  const result = await loadTreeRecursive<ChatTreeNode>(chatsDir, "folder", parseChatEntry);
  return result;
}

// Delete a chat by path (works for nested chats)
export async function deleteChatByPath(chatPath: string): Promise<void> {
  await deletePath(chatPath);
}

// Delete a folder and all its contents
export async function deleteChatFolder(folderPath: string): Promise<void> {
  await deletePath(folderPath);
}

// Rename a chat file
export async function renameChat(oldPath: string, newId: string): Promise<string> {
  const dir = oldPath.substring(0, oldPath.lastIndexOf("/"));
  const newPath = `${dir}/${newId}.json`;
  await renamePath(oldPath, newPath);
  return newPath;
}

// Rename a folder
export async function renameChatFolder(oldPath: string, newName: string): Promise<string> {
  const parentDir = oldPath.substring(0, oldPath.lastIndexOf("/"));
  const newPath = `${parentDir}/${newName}`;
  await renamePath(oldPath, newPath);
  return newPath;
}

// Agent storage (markdown with frontmatter)
export interface AgentData {
  name: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  /** Optional per-agent tool allowlist (tool names). Undefined = all tools. */
  tools?: string[];
}

export async function saveAgent(agent: AgentData): Promise<void> {
  const dir = await getAppDataDirCached();
  const path = `${dir}/agents/${agent.name}.md`;
  const frontmatter: Record<string, unknown> = {
    name: agent.name,
    model: agent.model,
    temperature: agent.temperature,
  };
  if (agent.tools && agent.tools.length > 0) {
    frontmatter.tools = agent.tools;
  }
  const content = matter.stringify(agent.systemPrompt, frontmatter);
  await writeFile(path, content);
}

export async function loadAgent(name: string): Promise<AgentData | null> {
  const dir = await getAppDataDirCached();
  const path = `${dir}/agents/${name}.md`;
  if (!(await pathExists(path))) return null;
  const content = await readFile(path);
  const { data, content: systemPrompt } = matter(content);
  const tools = Array.isArray(data.tools)
    ? data.tools.filter((t: unknown): t is string => typeof t === "string")
    : undefined;
  return {
    name: data.name ?? name,
    model: data.model ?? "claude-sonnet-4-20250514",
    temperature: data.temperature ?? 0.7,
    systemPrompt: systemPrompt.trim(),
    ...(tools && tools.length > 0 ? { tools } : {}),
  };
}

export async function listAgents(): Promise<string[]> {
  const dir = await getAppDataDirCached();
  return listFiles(`${dir}/agents`, "md");
}

export async function deleteAgent(name: string): Promise<void> {
  const dir = await getAppDataDirCached();
  await deletePath(`${dir}/agents/${name}.md`);
}

// Task storage
//
// Architecture: Folders ARE backlogs. Each folder contains tasks directly.
// No nested backlog concept - just folders with tasks.

// Task result status (shown as colored dots)
export type TaskResultStatus = "success" | "bug" | "incomplete";

// Task stage in kanban workflow
export type TaskStage = "backlog" | "in_progress" | "done";

export interface TaskData {
  id: string;
  title: string;
  description: string;
  agent: string;
  outputFolder: string;
  resultStatus: TaskResultStatus | null;  // null until completed
  stage: TaskStage;
  createdAt: string;
  updatedAt: string;
}

// Task folder data (folder = backlog, contains tasks directly)
export interface TaskFolderData {
  id: string;
  name: string;
  isPinned: boolean;
  tasks: TaskData[];
  createdAt: string;
  updatedAt: string;
}

// Task tree node (folders only, each folder has tasks)
export interface TaskTreeNode {
  type: "folder";
  id: string;
  name: string;
  path: string;
  isPinned: boolean;
  tasks: TaskData[];
  updatedAt: string;
}

// Load entire task tree from disk (flat list of folders)
export async function loadTaskTree(): Promise<TaskTreeNode[]> {
  const dir = await getAppDataDirCached();
  const tasksDir = `${dir}/tasks`;

  if (!(await pathExists(tasksDir))) {
    return [];
  }

  const nodes: TaskTreeNode[] = [];
  const entries = await readDirectory(tasksDir, 1);

  for (const entry of entries) {
    if (entry.is_directory) {
      const folderDataPath = `${entry.path}/folder.yaml`;
      if (await pathExists(folderDataPath)) {
        try {
          const content = await readFile(folderDataPath);
          const folderData: TaskFolderData = YAML.parse(content);
          nodes.push({
            type: "folder",
            id: folderData.id,
            name: folderData.name,
            path: entry.path,
            isPinned: folderData.isPinned,
            tasks: folderData.tasks ?? [],
            updatedAt: folderData.updatedAt,
          });
        } catch {
          // Skip malformed folder files
        }
      }
    }
  }

  // Sort: pinned first, then most recent first
  nodes.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  });

  return nodes;
}

// Create a task folder (which is also the backlog)
export async function createTaskFolder(name: string): Promise<string> {
  const dir = await getAppDataDirCached();
  const id = crypto.randomUUID();
  const basePath = `${dir}/tasks/${id}`;
  await createDirectory(basePath);

  const now = new Date().toISOString();
  const folderData: TaskFolderData = {
    id,
    name,
    isPinned: false,
    tasks: [],
    createdAt: now,
    updatedAt: now,
  };
  await writeFile(`${basePath}/folder.yaml`, YAML.stringify(folderData));

  return basePath;
}

// Save a task folder
export async function saveTaskFolder(folderData: TaskFolderData, folderPath: string): Promise<void> {
  await writeFile(`${folderPath}/folder.yaml`, YAML.stringify(folderData));
}

// Load a task folder
export async function loadTaskFolder(folderPath: string): Promise<TaskFolderData | null> {
  const path = `${folderPath}/folder.yaml`;
  if (!(await pathExists(path))) return null;
  const content = await readFile(path);
  return YAML.parse(content);
}

// Delete a task folder and all its contents
export async function deleteTaskFolder(folderPath: string): Promise<void> {
  await deletePath(folderPath);
}

// Rename a task folder
export async function renameTaskFolder(folderPath: string, newName: string): Promise<void> {
  const folderData = await loadTaskFolder(folderPath);
  if (folderData) {
    folderData.name = newName;
    folderData.updatedAt = new Date().toISOString();
    await saveTaskFolder(folderData, folderPath);
  }
}

// Toggle folder pin status
export async function toggleTaskFolderPin(folderPath: string): Promise<void> {
  const folderData = await loadTaskFolder(folderPath);
  if (folderData) {
    folderData.isPinned = !folderData.isPinned;
    folderData.updatedAt = new Date().toISOString();
    await saveTaskFolder(folderData, folderPath);
  }
}

// Schedule storage
//
// Architecture: Mirrors chat storage - folders with _meta.yaml, individual schedule files.

export interface ScheduleData {
  id: string;
  name: string;
  cron: string;
  agentId: string;
  prompt: string;
  enabled: boolean;
  hasError: boolean;  // True if last execution had an error
  lastRun: string | null;
  nextRun: string | null;
  createdAt: string;
  updatedAt: string;
}

// Scheduler tree node (folder or schedule) - mirrors ChatTreeNode
export interface SchedulerTreeNode {
  type: "folder" | "schedule";
  id: string;
  name: string;
  path: string;
  isPinned: boolean;
  children?: SchedulerTreeNode[];  // For folders
  // Schedule-specific fields:
  cron?: string;
  enabled?: boolean;
  hasError?: boolean;
  updatedAt?: string;
}

// Parse a file entry as a SchedulerTreeNode
async function parseScheduleEntry(entry: FileNode): Promise<SchedulerTreeNode | null> {
  if (entry.name.endsWith(".yaml") && entry.name !== "_meta.yaml") {
    try {
      const content = await readFile(entry.path);
      const schedule: ScheduleData = YAML.parse(content);
      return {
        type: "schedule",
        id: schedule.id,
        name: schedule.name,
        path: entry.path,
        isPinned: false,
        cron: schedule.cron,
        enabled: schedule.enabled,
        hasError: schedule.hasError,
        updatedAt: schedule.updatedAt,
      };
    } catch {
      return null;
    }
  }
  return null;
}

// Load entire scheduler tree from disk (recursive, mirrors chat tree)
export async function loadSchedulerTree(): Promise<SchedulerTreeNode[]> {
  const dir = await getAppDataDirCached();
  const schedulerDir = `${dir}/scheduler`;

  if (!(await pathExists(schedulerDir))) {
    return [];
  }

  return loadTreeRecursive<SchedulerTreeNode>(schedulerDir, "folder", parseScheduleEntry);
}

// Scheduler folder meta operations delegate to generic versions
export const loadSchedulerFolderMeta = loadFolderMeta;
export const saveSchedulerFolderMeta = saveFolderMeta;

// Create a scheduler folder
export async function createSchedulerFolder(name: string, parentPath?: string): Promise<string> {
  const dir = await getAppDataDirCached();
  return createItemFolder(`${dir}/scheduler`, name, parentPath);
}

// Save a schedule to an individual file
export async function saveSchedule(schedule: ScheduleData, folderPath?: string): Promise<string> {
  const dir = await getAppDataDirCached();
  const basePath = folderPath || `${dir}/scheduler`;
  const path = `${basePath}/${schedule.id}.yaml`;
  const yaml = YAML.stringify(schedule);
  await writeFile(path, yaml);
  return path;
}

// Load a schedule by path
export async function loadSchedule(path: string): Promise<ScheduleData | null> {
  if (!(await pathExists(path))) return null;
  const content = await readFile(path);
  return YAML.parse(content);
}

// Delete a schedule by path
export async function deleteScheduleByPath(schedulePath: string): Promise<void> {
  await deletePath(schedulePath);
}

// Delete a scheduler folder and all its contents
export async function deleteSchedulerFolder(folderPath: string): Promise<void> {
  await deletePath(folderPath);
}

// Rename a scheduler folder (directory rename)
export async function renameSchedulerFolder(oldPath: string, newName: string): Promise<string> {
  const parentDir = oldPath.substring(0, oldPath.lastIndexOf("/"));
  const newPath = `${parentDir}/${newName}`;
  await renamePath(oldPath, newPath);
  return newPath;
}

// Toggle scheduler folder pin status
export async function toggleSchedulerFolderPin(folderPath: string): Promise<void> {
  const meta = await loadSchedulerFolderMeta(folderPath);
  if (meta) {
    meta.isPinned = !meta.isPinned;
    await saveSchedulerFolderMeta(folderPath, meta);
  } else {
    // Create meta if it doesn't exist
    const newMeta: SchedulerFolderMeta = {
      isPinned: true,
      createdAt: new Date().toISOString(),
    };
    await saveSchedulerFolderMeta(folderPath, newMeta);
  }
}

// Generic toolbox item storage (prompts, memories, skills, workflows)
export interface ToolboxItemData {
  name: string;
  category: "prompts" | "memories" | "agents" | "skills" | "workflows";
  content: string;
  updatedAt: string;
}

function getToolboxExtension(
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
  const path = `${dir}/${category}/${name}.${ext}`;
  if (!(await pathExists(path))) return null;
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
  return listFiles(`${dir}/${category}`, ext);
}

export async function deleteToolboxItem(
  category: ToolboxItemData["category"],
  name: string
): Promise<void> {
  const dir = await getAppDataDirCached();
  const ext = getToolboxExtension(category);
  await deletePath(`${dir}/${category}/${name}.${ext}`);
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
