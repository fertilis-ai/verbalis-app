import { create } from "zustand";
import {
  loadTaskTree,
  createTaskFolder,
  deleteTaskFolder,
  renameTaskFolder,
  toggleTaskFolderPin,
  loadTaskFolder,
  saveTaskFolder,
  type TaskData,
  type TaskTreeNode,
  type TaskResultStatus,
  type TaskStage,
  type TaskFolderData,
} from "@/lib/storage";
import { executeTask } from "@/lib/task-runner";
import { useAgenticLoopStore } from "@/stores/agentic-loop-store";
import { basename } from "@/lib/path-resolution";
import { findNodeInTree } from "@/lib/tree-utils";
import { createFolderActions } from "./folder-tree-slice";

export type { TaskData, TaskTreeNode, TaskResultStatus, TaskStage, TaskFolderData };

interface TaskState {
  // Tree structure (flat list of folders)
  taskTree: TaskTreeNode[];

  // Selection (selected folder = selected backlog, since folders ARE backlogs)
  selectedFolderId: string | null;
  selectedFolderPath: string | null;

  // Execution state
  runningTaskIds: Set<string>;
  runningConversations: Map<string, string>; // taskId → conversationId
  taskGenerations: Map<string, number>; // taskId → generation counter (to invalidate stale promises)

  // UI state
  isTaskModalOpen: boolean;
  editingTask: TaskData | null;
  confirmModalAction: "play" | "stop" | "redo" | null;

  // Folder operations (folders = backlogs)
  loadTasksFromDisk: () => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  renameFolder: (folderId: string, newName: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  toggleFolderPin: (folderId: string) => Promise<void>;
  selectFolder: (folderId: string, path: string) => void;

  // Task operations (tasks within selected folder)
  createTask: (title: string, description?: string, agent?: string, outputFolder?: string) => Promise<void>;
  updateTask: (taskId: string, updates: Partial<TaskData>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;

  // Stage transitions (button-based)
  startTask: (taskId: string) => Promise<void>;     // backlog → in_progress (executes agent)
  stopTask: (taskId: string) => Promise<void>;      // in_progress → backlog (stops agent)
  completeTask: (taskId: string, status: TaskResultStatus) => Promise<void>; // → done
  redoTask: (taskId: string) => Promise<void>;      // done → in_progress (re-executes agent)

  // Bulk actions
  playAll: () => Promise<void>;   // all backlog → execute
  stopAll: () => Promise<void>;   // all in_progress → stop + backlog
  redoAll: () => Promise<void>;   // all done → re-execute

  // Modal state
  openTaskModal: (task?: TaskData) => void;
  closeTaskModal: () => void;
  setConfirmModalAction: (action: "play" | "stop" | "redo" | null) => void;

  // Helpers
  getCurrentFolderTasks: () => TaskData[];
  getTasksByStage: (stage: TaskStage) => TaskData[];
  isTaskRunning: (taskId: string) => boolean;
}

export const useTaskStore = create<TaskState>((set, get) => {
  const folderActions = createFolderActions({
    logPrefix: "task-store",
    getTree: () => get().taskTree,
    reload: () => get().loadTasksFromDisk(),
    storage: {
      rename: renameTaskFolder,
      remove: deleteTaskFolder,
      togglePin: toggleTaskFolderPin,
    },
  });

  return {
    taskTree: [],
    selectedFolderId: null,
    selectedFolderPath: null,
    runningTaskIds: new Set(),
    runningConversations: new Map(),
    taskGenerations: new Map(),
    isTaskModalOpen: false,
    editingTask: null,
    confirmModalAction: null,

    loadTasksFromDisk: async () => {
      const tree = await loadTaskTree();
      set({ taskTree: tree });
    },

    // Task folders are backlogs: a new one is selected, and names may repeat.
    createFolder: async (name) => {
      try {
        const path = await createTaskFolder(name);
        await get().loadTasksFromDisk();
        set({ selectedFolderId: basename(path), selectedFolderPath: path });
      } catch (error) {
        console.error("[task-store] Failed to create folder:", error);
      }
    },

    renameFolder: folderActions.renameFolder,

    deleteFolder: async (folderId) => {
      const wasSelected = get().selectedFolderId === folderId;
      await folderActions.deleteFolder(folderId);
      // Clear the selection only once the folder is really gone.
      if (wasSelected && !findNodeInTree(get().taskTree, folderId)) {
        set({ selectedFolderId: null, selectedFolderPath: null });
      }
    },

    toggleFolderPin: folderActions.toggleFolderPin,

    selectFolder: (folderId, path) => {
      set({ selectedFolderId: folderId, selectedFolderPath: path });
    },

    createTask: async (title, description = "", agent = "default", outputFolder = "") => {
      const { selectedFolderPath } = get();
      if (!selectedFolderPath) return;

      const folderData = await loadTaskFolder(selectedFolderPath);
      if (!folderData) return;

      const now = new Date().toISOString();
      const task: TaskData = {
        id: crypto.randomUUID(),
        title,
        description,
        agent,
        outputFolder,
        resultStatus: null,
        stage: "backlog",
        createdAt: now,
        updatedAt: now,
      };

      folderData.tasks.push(task);
      folderData.updatedAt = now;
      await saveTaskFolder(folderData, selectedFolderPath);
      await get().loadTasksFromDisk();
    },

    updateTask: async (taskId, updates) => {
      const { selectedFolderPath } = get();
      if (!selectedFolderPath) return;

      const folderData = await loadTaskFolder(selectedFolderPath);
      if (!folderData) return;

      const taskIndex = folderData.tasks.findIndex((t) => t.id === taskId);
      if (taskIndex === -1) return;

      folderData.tasks[taskIndex] = {
        ...folderData.tasks[taskIndex],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      folderData.updatedAt = new Date().toISOString();
      await saveTaskFolder(folderData, selectedFolderPath);
      await get().loadTasksFromDisk();
    },

    deleteTask: async (taskId) => {
      const { selectedFolderPath, editingTask } = get();
      if (!selectedFolderPath) return;

      const folderData = await loadTaskFolder(selectedFolderPath);
      if (!folderData) return;

      folderData.tasks = folderData.tasks.filter((t) => t.id !== taskId);
      folderData.updatedAt = new Date().toISOString();
      await saveTaskFolder(folderData, selectedFolderPath);
      await get().loadTasksFromDisk();

      if (editingTask?.id === taskId) {
        set({ isTaskModalOpen: false, editingTask: null });
      }
    },

    startTask: async (taskId) => {
      const tasks = get().getCurrentFolderTasks();
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      // Update stage and track running state
      await get().updateTask(taskId, { stage: "in_progress", resultStatus: null });

      // Increment generation to invalidate any prior executeTask promise
      const gen = (get().taskGenerations.get(taskId) ?? 0) + 1;
      set((state) => {
        const newRunning = new Set(state.runningTaskIds);
        newRunning.add(taskId);
        const newGens = new Map(state.taskGenerations);
        newGens.set(taskId, gen);
        return { runningTaskIds: newRunning, taskGenerations: newGens };
      });

      // Execute agent in background
      executeTask(task, {
        onConversationCreated: (conversationId) => {
          if (get().taskGenerations.get(taskId) !== gen) return;
          set((state) => {
            const newConvos = new Map(state.runningConversations);
            newConvos.set(taskId, conversationId);
            return { runningConversations: newConvos };
          });
        },
      })
        .then((result) => {
          // Only complete if still running (not stopped by user) and generation matches
          if (get().runningTaskIds.has(taskId) && get().taskGenerations.get(taskId) === gen) {
            get().completeTask(taskId, result.success ? "success" : "incomplete");
          }
        })
        .catch(() => {
          if (get().runningTaskIds.has(taskId) && get().taskGenerations.get(taskId) === gen) {
            get().completeTask(taskId, "incomplete");
          }
        })
        .finally(() => {
          if (get().taskGenerations.get(taskId) !== gen) return;
          set((state) => {
            const newRunning = new Set(state.runningTaskIds);
            newRunning.delete(taskId);
            const newConvos = new Map(state.runningConversations);
            newConvos.delete(taskId);
            return { runningTaskIds: newRunning, runningConversations: newConvos };
          });
        });
    },

    stopTask: async (taskId) => {
      // Stop the running agent loop if there's an active conversation
      const conversationId = get().runningConversations.get(taskId);
      if (conversationId) {
        useAgenticLoopStore.getState().stopLoop(conversationId);
      }

      // Remove from running tracking
      set((state) => {
        const newRunning = new Set(state.runningTaskIds);
        newRunning.delete(taskId);
        const newConvos = new Map(state.runningConversations);
        newConvos.delete(taskId);
        return { runningTaskIds: newRunning, runningConversations: newConvos };
      });

      // Move back to backlog
      await get().updateTask(taskId, { stage: "backlog" });
    },

    completeTask: async (taskId, status) => {
      await get().updateTask(taskId, { stage: "done", resultStatus: status });
    },

    redoTask: async (taskId) => {
      const tasks = get().getCurrentFolderTasks();
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      // Update stage, clear result, and execute
      await get().updateTask(taskId, { stage: "in_progress", resultStatus: null });

      // Increment generation to invalidate any prior executeTask promise
      const gen = (get().taskGenerations.get(taskId) ?? 0) + 1;
      set((state) => {
        const newRunning = new Set(state.runningTaskIds);
        newRunning.add(taskId);
        const newGens = new Map(state.taskGenerations);
        newGens.set(taskId, gen);
        return { runningTaskIds: newRunning, taskGenerations: newGens };
      });

      // Execute agent in background (same logic as startTask)
      executeTask(task, {
        onConversationCreated: (conversationId) => {
          if (get().taskGenerations.get(taskId) !== gen) return;
          set((state) => {
            const newConvos = new Map(state.runningConversations);
            newConvos.set(taskId, conversationId);
            return { runningConversations: newConvos };
          });
        },
      })
        .then((result) => {
          if (get().runningTaskIds.has(taskId) && get().taskGenerations.get(taskId) === gen) {
            get().completeTask(taskId, result.success ? "success" : "incomplete");
          }
        })
        .catch(() => {
          if (get().runningTaskIds.has(taskId) && get().taskGenerations.get(taskId) === gen) {
            get().completeTask(taskId, "incomplete");
          }
        })
        .finally(() => {
          if (get().taskGenerations.get(taskId) !== gen) return;
          set((state) => {
            const newRunning = new Set(state.runningTaskIds);
            newRunning.delete(taskId);
            const newConvos = new Map(state.runningConversations);
            newConvos.delete(taskId);
            return { runningTaskIds: newRunning, runningConversations: newConvos };
          });
        });
    },

    playAll: async () => {
      const backlogTasks = get().getTasksByStage("backlog");
      for (const task of backlogTasks) {
        await get().startTask(task.id);
      }
    },

    stopAll: async () => {
      const inProgressTasks = get().getTasksByStage("in_progress");
      for (const task of inProgressTasks) {
        await get().stopTask(task.id);
      }
    },

    redoAll: async () => {
      const doneTasks = get().getTasksByStage("done");
      for (const task of doneTasks) {
        await get().redoTask(task.id);
      }
    },

    openTaskModal: (task) => {
      set({ isTaskModalOpen: true, editingTask: task ?? null });
    },

    closeTaskModal: () => {
      set({ isTaskModalOpen: false, editingTask: null });
    },

    setConfirmModalAction: (action) => {
      set({ confirmModalAction: action });
    },

    getCurrentFolderTasks: () => {
      const { taskTree, selectedFolderId } = get();
      const folder = findNodeInTree(taskTree, selectedFolderId ?? "");
      return folder?.tasks ?? [];
    },

    getTasksByStage: (stage) => {
      return get().getCurrentFolderTasks().filter((t) => t.stage === stage);
    },

    isTaskRunning: (taskId) => {
      return get().runningTaskIds.has(taskId);
    },
  };
});
