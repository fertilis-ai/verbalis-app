import YAML from "yaml";
import { createDirectory, deletePath, getAppDataDirCached, pathExists, readDirectory, readFile, writeFile } from "./fs";
import { TaskFolderFileSchema, parseLoaded } from "./validate";

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
          const folderData = parseLoaded(TaskFolderFileSchema, content, folderDataPath, YAML.parse) as
            | TaskFolderData
            | null;
          // Skip malformed folder files
          if (!folderData) continue;
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
          // Skip unreadable folder files
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

// Load a task folder. Returns null when the file is missing, unparseable or has the wrong shape.
export async function loadTaskFolder(folderPath: string): Promise<TaskFolderData | null> {
  const path = `${folderPath}/folder.yaml`;
  if (!(await pathExists(path))) return null;
  const content = await readFile(path);
  return parseLoaded(TaskFolderFileSchema, content, path, YAML.parse) as TaskFolderData | null;
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
