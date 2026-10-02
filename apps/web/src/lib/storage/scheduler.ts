import YAML from "yaml";
import type { FileNode } from "@/lib/tauri/commands";
import { deletePath, getAppDataDirCached, pathExists, readFile, writeFile } from "./fs";
import {
  createItemFolder,
  deleteFolder,
  loadFolderMeta,
  loadTreeRecursive,
  renameFolder,
  saveFolderMeta,
  toggleFolderPin,
} from "./tree";
import { ScheduleFileSchema, parseLoaded } from "./validate";

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
      const schedule = parseLoaded(ScheduleFileSchema, content, entry.path, YAML.parse);
      if (!schedule) return null;
      return {
        type: "schedule",
        id: schedule.id,
        name: schedule.name ?? "",
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

// Load a schedule by path. Returns null when the file is missing, unparseable or has the wrong shape.
export async function loadSchedule(path: string): Promise<ScheduleData | null> {
  if (!(await pathExists(path))) return null;
  const content = await readFile(path);
  return parseLoaded(ScheduleFileSchema, content, path, YAML.parse) as ScheduleData | null;
}

// Delete a schedule by path
export async function deleteScheduleByPath(schedulePath: string): Promise<void> {
  await deletePath(schedulePath);
}

// Folder operations (shared with chats)
export const deleteSchedulerFolder = deleteFolder;
export const renameSchedulerFolder = renameFolder;
export const toggleSchedulerFolderPin = toggleFolderPin;
