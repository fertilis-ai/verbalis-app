import { create } from "zustand";
import cronstrue from "cronstrue";
import CronExpressionParser from "cron-parser";
import {
  loadSchedulerTree,
  createSchedulerFolder,
  deleteSchedulerFolder,
  renameSchedulerFolder,
  toggleSchedulerFolderPin,
  saveSchedule,
  loadSchedule,
  deleteScheduleByPath,
  getAppDataDir,
  type ScheduleData,
  type SchedulerTreeNode,
} from "@/lib/storage";
import { runScheduleNow as runScheduleNowByPath } from "@/lib/scheduler-runner";
import { useChatStore, type Message } from "@/stores/chat-store";
import { useAgenticLoopStore } from "@/stores/agentic-loop-store";
import { findNodeInTree, getUniqueName, getSiblingFolderNames } from "@/lib/tree-utils";

export type { ScheduleData, SchedulerTreeNode };

interface SchedulerState {
  // Tree structure (recursive, like chat tree)
  schedulerTree: SchedulerTreeNode[];

  // In-memory schedules (for immediate UI feedback before disk sync)
  schedules: ScheduleData[];

  // Selection
  selectedScheduleId: string | null;

  // UI state
  expandedFolders: Set<string>;

  // Running state
  runningScheduleId: string | null;
  runningConversationId: string | null;
  schedulerLog: string;
  schedulerLogScheduleId: string | null;

  // Folder operations
  loadSchedulersFromDisk: () => Promise<void>;
  createFolder: (name: string, parentFolderId?: string) => Promise<void>;
  renameFolder: (folderId: string, newName: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  toggleFolderPin: (folderId: string) => Promise<void>;
  toggleFolderExpansion: (folderId: string) => void;

  // Schedule operations
  createSchedule: (name: string, folderId?: string) => Promise<void>;
  updateSchedule: (scheduleId: string, updates: Partial<ScheduleData>) => Promise<void>;
  deleteSchedule: (scheduleId: string) => Promise<void>;
  renameSchedule: (scheduleId: string, newName: string) => Promise<void>;
  selectSchedule: (scheduleId: string | null) => void;
  runScheduleNow: (scheduleId: string) => Promise<void>;
  stopScheduleRun: () => void;

  // Helper to get selected schedule
  getSelectedSchedule: () => ScheduleData | null;
}

// Helper to collect all schedule paths from tree
function collectSchedulePathsFromTree(tree: SchedulerTreeNode[]): string[] {
  const paths: string[] = [];

  const traverse = (nodes: SchedulerTreeNode[]) => {
    for (const node of nodes) {
      if (node.type === "schedule") {
        paths.push(node.path);
      }
      if (node.type === "folder" && node.children) {
        traverse(node.children);
      }
    }
  };

  traverse(tree);
  return paths;
}

// Helper to load full schedule data from disk
async function loadAllSchedulesFromTree(tree: SchedulerTreeNode[]): Promise<ScheduleData[]> {
  const paths = collectSchedulePathsFromTree(tree);
  const schedules: ScheduleData[] = [];

  for (const path of paths) {
    const schedule = await loadSchedule(path);
    if (schedule) {
      schedules.push(schedule);
    }
  }

  return schedules;
}

function formatSchedulerLog(messages: Message[]): string {
  const lines: string[] = [];
  for (const msg of messages) {
    if (msg.role === "assistant" && msg.content) {
      lines.push(msg.content);
    }
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      for (const tc of msg.toolCalls) {
        const status = tc.status === "success" ? "ok" : tc.status;
        lines.push(`[tool: ${tc.name}] ${status}`);
        if (tc.error) {
          lines.push(`  error: ${tc.error}`);
        }
      }
    }
  }
  return lines.join("\n");
}

export const useSchedulerStore = create<SchedulerState>((set, get) => ({
  schedulerTree: [],
  schedules: [],
  selectedScheduleId: null,
  expandedFolders: new Set<string>(),
  runningScheduleId: null,
  runningConversationId: null,
  schedulerLog: "",
  schedulerLogScheduleId: null,

  loadSchedulersFromDisk: async () => {
    const tree = await loadSchedulerTree();
    // Load full schedule data from disk
    const schedules = await loadAllSchedulesFromTree(tree);
    set({ schedulerTree: tree, schedules });
  },

  createFolder: async (name, parentFolderId) => {
    try {
      const existingNames = getSiblingFolderNames(get().schedulerTree, parentFolderId);
      const uniqueName = getUniqueName(name, existingNames);
      let parentPath: string | undefined;
      if (parentFolderId) {
        const parentNode = findNodeInTree(get().schedulerTree, parentFolderId);
        parentPath = parentNode?.path;
      }
      await createSchedulerFolder(uniqueName, parentPath);
      await get().loadSchedulersFromDisk();
    } catch (error) {
      console.error("[scheduler-store] Failed to create folder:", error);
    }
  },

  renameFolder: async (folderId, newName) => {
    const node = findNodeInTree(get().schedulerTree, folderId);
    if (node?.path && node.type === "folder") {
      await renameSchedulerFolder(node.path, newName);
      await get().loadSchedulersFromDisk();
    }
  },

  deleteFolder: async (folderId) => {
    const node = findNodeInTree(get().schedulerTree, folderId);
    if (node?.path && node.type === "folder") {
      await deleteSchedulerFolder(node.path);
      await get().loadSchedulersFromDisk();
    }
  },

  toggleFolderPin: async (folderId) => {
    const node = findNodeInTree(get().schedulerTree, folderId);
    if (node?.path && node.type === "folder") {
      await toggleSchedulerFolderPin(node.path);
      await get().loadSchedulersFromDisk();
    }
  },

  toggleFolderExpansion: (folderId) => {
    const { expandedFolders } = get();
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    set({ expandedFolders: newExpanded });
  },

  createSchedule: async (name, folderId) => {
    const dir = await getAppDataDir();
    let folderPath: string | undefined;

    if (folderId) {
      const folderNode = findNodeInTree(get().schedulerTree, folderId);
      folderPath = folderNode?.path;
    }

    const now = new Date().toISOString();
    const schedule: ScheduleData = {
      id: crypto.randomUUID(),
      name,
      cron: "0 9 * * *", // Default: 9 AM daily
      agentId: "Assistant",
      prompt: "",
      enabled: false,
      hasError: false,
      lastRun: null,
      nextRun: null,
      createdAt: now,
      updatedAt: now,
    };

    // Add to in-memory schedules first for immediate UI feedback
    set((state) => ({
      schedules: [...state.schedules, schedule],
      selectedScheduleId: schedule.id,
    }));

    // Save to disk
    const basePath = folderPath || `${dir}/scheduler`;
    await saveSchedule(schedule, basePath);

    // Reload from disk to sync
    await get().loadSchedulersFromDisk();

    // Keep selection
    set({ selectedScheduleId: schedule.id });
  },

  updateSchedule: async (scheduleId, updates) => {
    // Find the schedule in tree to get its path
    const node = findNodeInTree(get().schedulerTree, scheduleId);
    if (!node || node.type !== "schedule") return;

    // Load full schedule data from disk
    const schedule = await loadSchedule(node.path);
    if (!schedule) return;

    // Calculate nextRun when enabled or cron changes
    const newEnabled = updates.enabled ?? schedule.enabled;
    const newCron = updates.cron ?? schedule.cron;

    if (newEnabled) {
      try {
        const interval = CronExpressionParser.parse(newCron);
        updates.nextRun = interval.next().toISOString();
      } catch {
        updates.nextRun = null;
      }
    } else {
      updates.nextRun = null;
    }

    // Update schedule
    const updatedSchedule: ScheduleData = {
      ...schedule,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Get folder path from schedule path
    const folderPath = node.path.substring(0, node.path.lastIndexOf("/"));
    await saveSchedule(updatedSchedule, folderPath);

    // Update in-memory schedules immediately for UI responsiveness
    set((state) => ({
      schedules: state.schedules.map((s) =>
        s.id === scheduleId ? updatedSchedule : s
      ),
    }));

    // Don't reload from disk on every update - let the sidebar's polling handle sync
    // This prevents the bounce-back issue where polling resets local state
  },

  deleteSchedule: async (scheduleId) => {
    const { selectedScheduleId } = get();
    const node = findNodeInTree(get().schedulerTree, scheduleId);
    if (!node || node.type !== "schedule") return;

    await deleteScheduleByPath(node.path);

    // Update in-memory schedules
    set((state) => ({
      schedules: state.schedules.filter((s) => s.id !== scheduleId),
      selectedScheduleId: selectedScheduleId === scheduleId ? null : selectedScheduleId,
    }));

    await get().loadSchedulersFromDisk();
  },

  renameSchedule: async (scheduleId, newName) => {
    await get().updateSchedule(scheduleId, { name: newName });
  },

  selectSchedule: (scheduleId) => {
    set({ selectedScheduleId: scheduleId });
  },

  runScheduleNow: async (scheduleId) => {
    if (get().runningScheduleId) return;

    const node = findNodeInTree(get().schedulerTree, scheduleId);
    if (!node || node.type !== "schedule") return;

    set({
      runningScheduleId: scheduleId,
      runningConversationId: null,
      schedulerLog: "",
      schedulerLogScheduleId: scheduleId,
    });

    try {
      const result = await runScheduleNowByPath(node.path, {
        onConversationCreated: (id) => set({ runningConversationId: id }),
      });

      if (result?.conversationId) {
        const conversation = useChatStore
          .getState()
          .conversations.find((c) => c.id === result.conversationId);
        if (conversation) {
          set({ schedulerLog: formatSchedulerLog(conversation.messages) });
        }
      }
    } finally {
      set({ runningScheduleId: null, runningConversationId: null });
      await get().loadSchedulersFromDisk();
    }
  },

  stopScheduleRun: () => {
    const { runningConversationId } = get();
    if (runningConversationId) {
      useAgenticLoopStore.getState().stopLoop(runningConversationId);
    }
  },

  getSelectedSchedule: () => {
    const { selectedScheduleId, schedules, schedulerTree } = get();
    if (!selectedScheduleId) return null;

    // First check in-memory schedules
    const inMemory = schedules.find((s) => s.id === selectedScheduleId);
    if (inMemory) return inMemory;

    // Fallback: find in tree (for basic display, but won't have full data)
    const node = findNodeInTree(schedulerTree, selectedScheduleId);
    if (node && node.type === "schedule") {
      return {
        id: node.id,
        name: node.name,
        cron: node.cron ?? "0 9 * * *",
        agentId: "Assistant",
        prompt: "",
        enabled: node.enabled ?? false,
        hasError: node.hasError ?? false,
        lastRun: null,
        nextRun: null,
        createdAt: node.updatedAt ?? new Date().toISOString(),
        updatedAt: node.updatedAt ?? new Date().toISOString(),
      };
    }

    return null;
  },
}));

export function describeCron(cron: string): string {
  try {
    return cronstrue.toString(cron);
  } catch {
    return "Invalid cron expression";
  }
}
