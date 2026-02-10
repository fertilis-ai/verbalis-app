import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

const mockLoadTaskTree = vi.fn().mockResolvedValue([]);
const mockCreateTaskFolder = vi.fn().mockResolvedValue("/mock-data/tasks/new-folder");
const mockDeleteTaskFolder = vi.fn().mockResolvedValue(undefined);
const mockRenameTaskFolder = vi.fn().mockResolvedValue(undefined);
const mockToggleTaskFolderPin = vi.fn().mockResolvedValue(undefined);
const mockLoadTaskFolder = vi.fn().mockResolvedValue(null);
const mockSaveTaskFolder = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/storage", () => ({
  loadTaskTree: (...args: unknown[]) => mockLoadTaskTree(...args),
  createTaskFolder: (...args: unknown[]) => mockCreateTaskFolder(...args),
  deleteTaskFolder: (...args: unknown[]) => mockDeleteTaskFolder(...args),
  renameTaskFolder: (...args: unknown[]) => mockRenameTaskFolder(...args),
  toggleTaskFolderPin: (...args: unknown[]) => mockToggleTaskFolderPin(...args),
  loadTaskFolder: (...args: unknown[]) => mockLoadTaskFolder(...args),
  saveTaskFolder: (...args: unknown[]) => mockSaveTaskFolder(...args),
}));

const mockExecuteTask = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/lib/task-runner", () => ({
  executeTask: (...args: unknown[]) => mockExecuteTask(...args),
}));

const mockStopLoop = vi.fn();
vi.mock("@/stores/agentic-loop-store", () => ({
  useAgenticLoopStore: Object.assign(vi.fn(() => ({})), {
    getState: vi.fn(() => ({
      stopLoop: (...args: unknown[]) => mockStopLoop(...args),
    })),
  }),
}));

// Import store after mocks
import { useTaskStore } from "./task-store";
import type { TaskTreeNode, TaskData, TaskFolderData } from "@/lib/storage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTaskTree(tasks: TaskData[] = []): TaskTreeNode[] {
  return [
    {
      id: "folder-1",
      name: "Test Backlog",
      path: "/mock-data/tasks/folder-1",
      type: "folder" as const,
      isPinned: false,
      tasks,
      updatedAt: "2025-01-01T00:00:00.000Z",
    },
  ];
}

function makeTask(overrides: Partial<TaskData> = {}): TaskData {
  return {
    id: "task-1",
    title: "Test Task",
    description: "A test task",
    agent: "default",
    outputFolder: "",
    resultStatus: null,
    stage: "backlog",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeFolderData(tasks: TaskData[] = []): TaskFolderData {
  return {
    id: "folder-1",
    name: "Test Backlog",
    isPinned: false,
    tasks,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("task-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTaskStore.setState({
      taskTree: [],
      selectedFolderId: null,
      selectedFolderPath: null,
      runningTaskIds: new Set(),
      runningConversations: new Map(),
      taskGenerations: new Map(),
      isTaskModalOpen: false,
      editingTask: null,
      confirmModalAction: null,
    });
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------
  describe("initial state", () => {
    it("starts with empty task tree", () => {
      expect(useTaskStore.getState().taskTree).toEqual([]);
    });

    it("starts with no selected folder", () => {
      const s = useTaskStore.getState();
      expect(s.selectedFolderId).toBeNull();
      expect(s.selectedFolderPath).toBeNull();
    });

    it("starts with no running tasks", () => {
      expect(useTaskStore.getState().runningTaskIds.size).toBe(0);
    });

    it("starts with modal closed", () => {
      expect(useTaskStore.getState().isTaskModalOpen).toBe(false);
      expect(useTaskStore.getState().editingTask).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // loadTasksFromDisk
  // -----------------------------------------------------------------------
  describe("loadTasksFromDisk", () => {
    it("loads tree from disk and sets state", async () => {
      const tree = makeTaskTree();
      mockLoadTaskTree.mockResolvedValueOnce(tree);

      await useTaskStore.getState().loadTasksFromDisk();
      expect(useTaskStore.getState().taskTree).toEqual(tree);
      expect(mockLoadTaskTree).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // selectFolder
  // -----------------------------------------------------------------------
  describe("selectFolder", () => {
    it("sets selectedFolderId and selectedFolderPath", () => {
      useTaskStore.getState().selectFolder("f1", "/path/to/f1");
      const s = useTaskStore.getState();
      expect(s.selectedFolderId).toBe("f1");
      expect(s.selectedFolderPath).toBe("/path/to/f1");
    });
  });

  // -----------------------------------------------------------------------
  // createFolder
  // -----------------------------------------------------------------------
  describe("createFolder", () => {
    it("calls createTaskFolder and reloads", async () => {
      const tree = makeTaskTree();
      mockLoadTaskTree.mockResolvedValue(tree);

      await useTaskStore.getState().createFolder("My Backlog");

      expect(mockCreateTaskFolder).toHaveBeenCalledWith("My Backlog");
      expect(mockLoadTaskTree).toHaveBeenCalled();
    });

    it("auto-selects the newly created folder", async () => {
      mockCreateTaskFolder.mockResolvedValueOnce("/mock-data/tasks/new-folder");
      mockLoadTaskTree.mockResolvedValue([]);

      await useTaskStore.getState().createFolder("New Backlog");

      const s = useTaskStore.getState();
      expect(s.selectedFolderId).toBe("new-folder");
      expect(s.selectedFolderPath).toBe("/mock-data/tasks/new-folder");
    });
  });

  // -----------------------------------------------------------------------
  // renameFolder
  // -----------------------------------------------------------------------
  describe("renameFolder", () => {
    it("renames folder when found in tree", async () => {
      const tree = makeTaskTree();
      useTaskStore.setState({ taskTree: tree });
      mockLoadTaskTree.mockResolvedValue(tree);

      await useTaskStore.getState().renameFolder("folder-1", "Renamed");

      expect(mockRenameTaskFolder).toHaveBeenCalledWith("/mock-data/tasks/folder-1", "Renamed");
    });

    it("does nothing when folder not found", async () => {
      useTaskStore.setState({ taskTree: [] });

      await useTaskStore.getState().renameFolder("nonexistent", "Renamed");

      expect(mockRenameTaskFolder).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // deleteFolder
  // -----------------------------------------------------------------------
  describe("deleteFolder", () => {
    it("deletes folder and reloads tree", async () => {
      const tree = makeTaskTree();
      useTaskStore.setState({ taskTree: tree, selectedFolderId: "folder-1" });
      mockLoadTaskTree.mockResolvedValue([]);

      await useTaskStore.getState().deleteFolder("folder-1");

      expect(mockDeleteTaskFolder).toHaveBeenCalledWith("/mock-data/tasks/folder-1");
      expect(useTaskStore.getState().selectedFolderId).toBeNull();
      expect(useTaskStore.getState().selectedFolderPath).toBeNull();
    });

    it("preserves selection when deleting a different folder", async () => {
      const tree: TaskTreeNode[] = [
        ...makeTaskTree(),
        { id: "folder-2", name: "Other", path: "/mock-data/tasks/folder-2", type: "folder" as const, isPinned: false, tasks: [], updatedAt: "2025-01-01T00:00:00.000Z" },
      ];
      useTaskStore.setState({ taskTree: tree, selectedFolderId: "folder-1" });
      mockLoadTaskTree.mockResolvedValue(tree);

      await useTaskStore.getState().deleteFolder("folder-2");

      expect(useTaskStore.getState().selectedFolderId).toBe("folder-1");
    });
  });

  // -----------------------------------------------------------------------
  // createTask
  // -----------------------------------------------------------------------
  describe("createTask", () => {
    it("creates a task in the selected folder", async () => {
      const folderData = makeFolderData();
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree());

      useTaskStore.setState({ selectedFolderPath: "/mock-data/tasks/folder-1" });

      await useTaskStore.getState().createTask("New Task", "Description", "default", "");

      expect(mockSaveTaskFolder).toHaveBeenCalledTimes(1);
      const savedData = mockSaveTaskFolder.mock.calls[0][0] as TaskFolderData;
      expect(savedData.tasks).toHaveLength(1);
      expect(savedData.tasks[0].title).toBe("New Task");
      expect(savedData.tasks[0].description).toBe("Description");
      expect(savedData.tasks[0].stage).toBe("backlog");
    });

    it("does nothing when no folder is selected", async () => {
      useTaskStore.setState({ selectedFolderPath: null });

      await useTaskStore.getState().createTask("New Task");

      expect(mockLoadTaskFolder).not.toHaveBeenCalled();
      expect(mockSaveTaskFolder).not.toHaveBeenCalled();
    });

    it("does nothing when folder data cannot be loaded", async () => {
      useTaskStore.setState({ selectedFolderPath: "/mock-data/tasks/folder-1" });
      mockLoadTaskFolder.mockResolvedValue(null);

      await useTaskStore.getState().createTask("New Task");

      expect(mockSaveTaskFolder).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // updateTask
  // -----------------------------------------------------------------------
  describe("updateTask", () => {
    it("updates a task in the folder", async () => {
      const task = makeTask({ id: "t1" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));

      useTaskStore.setState({ selectedFolderPath: "/mock-data/tasks/folder-1" });

      await useTaskStore.getState().updateTask("t1", { title: "Updated Title" });

      const savedData = mockSaveTaskFolder.mock.calls[0][0] as TaskFolderData;
      const updatedTask = savedData.tasks.find((t) => t.id === "t1");
      expect(updatedTask?.title).toBe("Updated Title");
    });

    it("does nothing when task is not found", async () => {
      const folderData = makeFolderData([makeTask({ id: "t1" })]);
      mockLoadTaskFolder.mockResolvedValue(folderData);

      useTaskStore.setState({ selectedFolderPath: "/mock-data/tasks/folder-1" });

      await useTaskStore.getState().updateTask("nonexistent", { title: "X" });

      expect(mockSaveTaskFolder).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // deleteTask
  // -----------------------------------------------------------------------
  describe("deleteTask", () => {
    it("removes the task from folder data", async () => {
      const task = makeTask({ id: "t1" });
      const folderData = makeFolderData([task, makeTask({ id: "t2", title: "Keep" })]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue([]);

      useTaskStore.setState({ selectedFolderPath: "/mock-data/tasks/folder-1" });

      await useTaskStore.getState().deleteTask("t1");

      const savedData = mockSaveTaskFolder.mock.calls[0][0] as TaskFolderData;
      expect(savedData.tasks).toHaveLength(1);
      expect(savedData.tasks[0].id).toBe("t2");
    });

    it("closes the modal if the deleted task was being edited", async () => {
      const task = makeTask({ id: "t1" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue([]);

      useTaskStore.setState({
        selectedFolderPath: "/mock-data/tasks/folder-1",
        isTaskModalOpen: true,
        editingTask: task,
      });

      await useTaskStore.getState().deleteTask("t1");

      expect(useTaskStore.getState().isTaskModalOpen).toBe(false);
      expect(useTaskStore.getState().editingTask).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getCurrentFolderTasks / getTasksByStage
  // -----------------------------------------------------------------------
  describe("getCurrentFolderTasks / getTasksByStage", () => {
    it("returns tasks from the selected folder", () => {
      const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2" })];
      const tree = makeTaskTree(tasks);
      useTaskStore.setState({ taskTree: tree, selectedFolderId: "folder-1" });

      expect(useTaskStore.getState().getCurrentFolderTasks()).toHaveLength(2);
    });

    it("returns empty array when no folder is selected", () => {
      useTaskStore.setState({ taskTree: makeTaskTree([makeTask()]), selectedFolderId: null });

      expect(useTaskStore.getState().getCurrentFolderTasks()).toEqual([]);
    });

    it("filters tasks by stage", () => {
      const tasks = [
        makeTask({ id: "t1", stage: "backlog" }),
        makeTask({ id: "t2", stage: "in_progress" }),
        makeTask({ id: "t3", stage: "done" }),
        makeTask({ id: "t4", stage: "backlog" }),
      ];
      const tree = makeTaskTree(tasks);
      useTaskStore.setState({ taskTree: tree, selectedFolderId: "folder-1" });

      expect(useTaskStore.getState().getTasksByStage("backlog")).toHaveLength(2);
      expect(useTaskStore.getState().getTasksByStage("in_progress")).toHaveLength(1);
      expect(useTaskStore.getState().getTasksByStage("done")).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // isTaskRunning
  // -----------------------------------------------------------------------
  describe("isTaskRunning", () => {
    it("returns true for running tasks", () => {
      useTaskStore.setState({ runningTaskIds: new Set(["t1", "t2"]) });
      expect(useTaskStore.getState().isTaskRunning("t1")).toBe(true);
      expect(useTaskStore.getState().isTaskRunning("t2")).toBe(true);
    });

    it("returns false for non-running tasks", () => {
      useTaskStore.setState({ runningTaskIds: new Set(["t1"]) });
      expect(useTaskStore.getState().isTaskRunning("t3")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Modal state
  // -----------------------------------------------------------------------
  describe("modal state", () => {
    it("opens task modal with no editing task", () => {
      useTaskStore.getState().openTaskModal();
      expect(useTaskStore.getState().isTaskModalOpen).toBe(true);
      expect(useTaskStore.getState().editingTask).toBeNull();
    });

    it("opens task modal with a specific task", () => {
      const task = makeTask({ id: "t1" });
      useTaskStore.getState().openTaskModal(task);
      expect(useTaskStore.getState().isTaskModalOpen).toBe(true);
      expect(useTaskStore.getState().editingTask).toEqual(task);
    });

    it("closes task modal", () => {
      useTaskStore.setState({ isTaskModalOpen: true, editingTask: makeTask() });
      useTaskStore.getState().closeTaskModal();
      expect(useTaskStore.getState().isTaskModalOpen).toBe(false);
      expect(useTaskStore.getState().editingTask).toBeNull();
    });

    it("sets confirm modal action", () => {
      useTaskStore.getState().setConfirmModalAction("play");
      expect(useTaskStore.getState().confirmModalAction).toBe("play");

      useTaskStore.getState().setConfirmModalAction(null);
      expect(useTaskStore.getState().confirmModalAction).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // stopTask
  // -----------------------------------------------------------------------
  describe("stopTask", () => {
    it("removes task from running set and updates stage to backlog", async () => {
      const task = makeTask({ id: "t1", stage: "in_progress" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));

      useTaskStore.setState({
        taskTree: makeTaskTree([task]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
        runningTaskIds: new Set(["t1"]),
        runningConversations: new Map([["t1", "conv-1"]]),
      });

      await useTaskStore.getState().stopTask("t1");

      const s = useTaskStore.getState();
      expect(s.runningTaskIds.has("t1")).toBe(false);
      expect(s.runningConversations.has("t1")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // completeTask
  // -----------------------------------------------------------------------
  describe("completeTask", () => {
    it("updates task to done stage with result status", async () => {
      const task = makeTask({ id: "t1", stage: "in_progress" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));

      useTaskStore.setState({
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      await useTaskStore.getState().completeTask("t1", "success");

      const savedData = mockSaveTaskFolder.mock.calls[0][0] as TaskFolderData;
      const updated = savedData.tasks.find((t) => t.id === "t1");
      expect(updated?.stage).toBe("done");
      expect(updated?.resultStatus).toBe("success");
    });
  });

  // -----------------------------------------------------------------------
  // toggleFolderPin
  // -----------------------------------------------------------------------
  describe("toggleFolderPin", () => {
    it("calls toggleTaskFolderPin with correct path", async () => {
      const tree = makeTaskTree();
      useTaskStore.setState({ taskTree: tree });
      mockLoadTaskTree.mockResolvedValue(tree);

      await useTaskStore.getState().toggleFolderPin("folder-1");

      expect(mockToggleTaskFolderPin).toHaveBeenCalledWith("/mock-data/tasks/folder-1");
    });

    it("does nothing for nonexistent folder", async () => {
      useTaskStore.setState({ taskTree: [] });

      await useTaskStore.getState().toggleFolderPin("nonexistent");

      expect(mockToggleTaskFolderPin).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // deleteFolder — additional edge cases
  // -----------------------------------------------------------------------
  describe("deleteFolder (edge cases)", () => {
    it("does nothing when folder is not found in tree", async () => {
      useTaskStore.setState({ taskTree: [], selectedFolderId: "folder-1" });

      await useTaskStore.getState().deleteFolder("nonexistent");

      expect(mockDeleteTaskFolder).not.toHaveBeenCalled();
      // selectedFolderId should remain unchanged
      expect(useTaskStore.getState().selectedFolderId).toBe("folder-1");
    });
  });

  // -----------------------------------------------------------------------
  // updateTask — additional edge cases
  // -----------------------------------------------------------------------
  describe("updateTask (edge cases)", () => {
    it("does nothing when no folder is selected", async () => {
      useTaskStore.setState({ selectedFolderPath: null });

      await useTaskStore.getState().updateTask("t1", { title: "X" });

      expect(mockLoadTaskFolder).not.toHaveBeenCalled();
      expect(mockSaveTaskFolder).not.toHaveBeenCalled();
    });

    it("does nothing when folder data cannot be loaded", async () => {
      useTaskStore.setState({ selectedFolderPath: "/mock-data/tasks/folder-1" });
      mockLoadTaskFolder.mockResolvedValueOnce(null);

      await useTaskStore.getState().updateTask("t1", { title: "X" });

      expect(mockSaveTaskFolder).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // deleteTask — additional edge cases
  // -----------------------------------------------------------------------
  describe("deleteTask (edge cases)", () => {
    it("does nothing when no folder is selected", async () => {
      useTaskStore.setState({ selectedFolderPath: null });

      await useTaskStore.getState().deleteTask("t1");

      expect(mockLoadTaskFolder).not.toHaveBeenCalled();
      expect(mockSaveTaskFolder).not.toHaveBeenCalled();
    });

    it("does nothing when folder data cannot be loaded", async () => {
      useTaskStore.setState({ selectedFolderPath: "/mock-data/tasks/folder-1" });
      mockLoadTaskFolder.mockResolvedValueOnce(null);

      await useTaskStore.getState().deleteTask("t1");

      expect(mockSaveTaskFolder).not.toHaveBeenCalled();
    });

    it("keeps modal open when deleting a task that is not being edited", async () => {
      const editingTask = makeTask({ id: "t1" });
      const otherTask = makeTask({ id: "t2", title: "Other" });
      const folderData = makeFolderData([editingTask, otherTask]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue([]);

      useTaskStore.setState({
        selectedFolderPath: "/mock-data/tasks/folder-1",
        isTaskModalOpen: true,
        editingTask,
      });

      await useTaskStore.getState().deleteTask("t2");

      expect(useTaskStore.getState().isTaskModalOpen).toBe(true);
      expect(useTaskStore.getState().editingTask).toEqual(editingTask);
    });
  });

  // -----------------------------------------------------------------------
  // createTask — default parameters
  // -----------------------------------------------------------------------
  describe("createTask (default parameters)", () => {
    it("uses default values for description, agent, and outputFolder", async () => {
      const folderData = makeFolderData();
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree());

      useTaskStore.setState({ selectedFolderPath: "/mock-data/tasks/folder-1" });

      await useTaskStore.getState().createTask("Minimal Task");

      const savedData = mockSaveTaskFolder.mock.calls[0][0] as TaskFolderData;
      expect(savedData.tasks[0].description).toBe("");
      expect(savedData.tasks[0].agent).toBe("default");
      expect(savedData.tasks[0].outputFolder).toBe("");
      expect(savedData.tasks[0].resultStatus).toBeNull();
      expect(savedData.tasks[0].stage).toBe("backlog");
      expect(savedData.tasks[0].id).toBeDefined();
      expect(savedData.tasks[0].createdAt).toBeDefined();
      expect(savedData.tasks[0].updatedAt).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // startTask
  // -----------------------------------------------------------------------
  describe("startTask", () => {
    it("does nothing when task is not found in current folder", async () => {
      useTaskStore.setState({
        taskTree: makeTaskTree([]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      await useTaskStore.getState().startTask("nonexistent");

      expect(mockExecuteTask).not.toHaveBeenCalled();
    });

    it("updates task to in_progress and adds to running set", async () => {
      const task = makeTask({ id: "t1", stage: "backlog" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));

      useTaskStore.setState({
        taskTree: makeTaskTree([task]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      // Make executeTask hang to check intermediate state
      let resolveExecute!: (v: { success: boolean }) => void;
      mockExecuteTask.mockImplementationOnce(() => new Promise((r) => { resolveExecute = r; }));

      const startPromise = useTaskStore.getState().startTask("t1");

      // Wait a tick for the sync part to complete
      await vi.waitFor(() => {
        expect(useTaskStore.getState().runningTaskIds.has("t1")).toBe(true);
      });

      expect(useTaskStore.getState().taskGenerations.get("t1")).toBe(1);

      // Resolve to let the promise chain complete
      resolveExecute({ success: true });
      await startPromise;
    });

    it("calls executeTask with the task and onConversationCreated callback", async () => {
      const task = makeTask({ id: "t1", stage: "backlog" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));
      mockExecuteTask.mockResolvedValueOnce({ success: true });

      useTaskStore.setState({
        taskTree: makeTaskTree([task]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      await useTaskStore.getState().startTask("t1");

      // Wait for the async executeTask promise chain to settle
      await vi.waitFor(() => {
        expect(mockExecuteTask).toHaveBeenCalledTimes(1);
      });

      const callArgs = mockExecuteTask.mock.calls[0];
      expect(callArgs[0]).toEqual(task);
      expect(callArgs[1]).toHaveProperty("onConversationCreated");
    });

    it("sets running conversation when onConversationCreated is called", async () => {
      const task = makeTask({ id: "t1", stage: "backlog" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));

      let capturedCallback: ((id: string) => void) | undefined;
      let resolveExecute!: (v: { success: boolean }) => void;
      mockExecuteTask.mockImplementationOnce((_task: unknown, options: { onConversationCreated?: (id: string) => void }) => {
        capturedCallback = options?.onConversationCreated;
        return new Promise((r) => { resolveExecute = r; });
      });

      useTaskStore.setState({
        taskTree: makeTaskTree([task]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      const startPromise = useTaskStore.getState().startTask("t1");

      await vi.waitFor(() => {
        expect(capturedCallback).toBeDefined();
      });

      capturedCallback!("conv-123");
      expect(useTaskStore.getState().runningConversations.get("t1")).toBe("conv-123");

      resolveExecute({ success: true });
      await startPromise;
    });

    it("completes task with success when executeTask resolves with success:true", async () => {
      const task = makeTask({ id: "t1", stage: "backlog" });
      const folderData = makeFolderData([task]);
      // updateTask is called multiple times: first for stage change, then for completion
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));
      mockExecuteTask.mockResolvedValueOnce({ success: true });

      useTaskStore.setState({
        taskTree: makeTaskTree([task]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      await useTaskStore.getState().startTask("t1");

      // Wait for the .then chain to complete
      await vi.waitFor(() => {
        // completeTask calls updateTask which calls saveTaskFolder
        // First call: startTask updates to in_progress
        // Second call: completeTask updates to done
        expect(mockSaveTaskFolder.mock.calls.length).toBeGreaterThanOrEqual(2);
      });

      // The second saveTaskFolder call should have stage "done"
      const lastSavedData = mockSaveTaskFolder.mock.calls[mockSaveTaskFolder.mock.calls.length - 1][0] as TaskFolderData;
      const completedTask = lastSavedData.tasks.find((t) => t.id === "t1");
      expect(completedTask?.stage).toBe("done");
      expect(completedTask?.resultStatus).toBe("success");
    });

    it("completes task with incomplete when executeTask resolves with success:false", async () => {
      const task = makeTask({ id: "t1", stage: "backlog" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));
      mockExecuteTask.mockResolvedValueOnce({ success: false });

      useTaskStore.setState({
        taskTree: makeTaskTree([task]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      await useTaskStore.getState().startTask("t1");

      await vi.waitFor(() => {
        expect(mockSaveTaskFolder.mock.calls.length).toBeGreaterThanOrEqual(2);
      });

      const lastSavedData = mockSaveTaskFolder.mock.calls[mockSaveTaskFolder.mock.calls.length - 1][0] as TaskFolderData;
      const completedTask = lastSavedData.tasks.find((t) => t.id === "t1");
      expect(completedTask?.resultStatus).toBe("incomplete");
    });

    it("completes task with incomplete when executeTask rejects", async () => {
      const task = makeTask({ id: "t1", stage: "backlog" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));
      mockExecuteTask.mockRejectedValueOnce(new Error("Agent error"));

      useTaskStore.setState({
        taskTree: makeTaskTree([task]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      await useTaskStore.getState().startTask("t1");

      await vi.waitFor(() => {
        expect(mockSaveTaskFolder.mock.calls.length).toBeGreaterThanOrEqual(2);
      });

      const lastSavedData = mockSaveTaskFolder.mock.calls[mockSaveTaskFolder.mock.calls.length - 1][0] as TaskFolderData;
      const completedTask = lastSavedData.tasks.find((t) => t.id === "t1");
      expect(completedTask?.resultStatus).toBe("incomplete");
    });

    it("cleans up running state in finally block", async () => {
      const task = makeTask({ id: "t1", stage: "backlog" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));
      mockExecuteTask.mockResolvedValueOnce({ success: true });

      useTaskStore.setState({
        taskTree: makeTaskTree([task]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      await useTaskStore.getState().startTask("t1");

      await vi.waitFor(() => {
        expect(useTaskStore.getState().runningTaskIds.has("t1")).toBe(false);
      });

      expect(useTaskStore.getState().runningConversations.has("t1")).toBe(false);
    });

    it("ignores onConversationCreated callback when generation has changed (stale)", async () => {
      const task = makeTask({ id: "t1", stage: "backlog" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));

      let capturedCallback: ((id: string) => void) | undefined;
      let resolveExecute!: (v: { success: boolean }) => void;
      mockExecuteTask.mockImplementationOnce((_task: unknown, options: { onConversationCreated?: (id: string) => void }) => {
        capturedCallback = options?.onConversationCreated;
        return new Promise((r) => { resolveExecute = r; });
      });

      useTaskStore.setState({
        taskTree: makeTaskTree([task]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      const startPromise = useTaskStore.getState().startTask("t1");

      await vi.waitFor(() => {
        expect(capturedCallback).toBeDefined();
      });

      // Simulate generation change (as if another startTask or redoTask was called)
      useTaskStore.setState({
        taskGenerations: new Map([["t1", 999]]),
      });

      capturedCallback!("conv-stale");
      // Should NOT set the conversation because generation changed
      expect(useTaskStore.getState().runningConversations.has("t1")).toBe(false);

      resolveExecute({ success: true });
      await startPromise;
    });

    it("does not complete task when stopped by user before executeTask resolves", async () => {
      const task = makeTask({ id: "t1", stage: "backlog" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));

      let resolveExecute!: (v: { success: boolean }) => void;
      mockExecuteTask.mockImplementationOnce(() => new Promise((r) => { resolveExecute = r; }));

      useTaskStore.setState({
        taskTree: makeTaskTree([task]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      const startPromise = useTaskStore.getState().startTask("t1");

      await vi.waitFor(() => {
        expect(useTaskStore.getState().runningTaskIds.has("t1")).toBe(true);
      });

      // Simulate user stopping the task (removes from running set)
      useTaskStore.setState({
        runningTaskIds: new Set(),
      });

      const saveCallsBefore = mockSaveTaskFolder.mock.calls.length;

      resolveExecute({ success: true });
      await startPromise;

      // Wait a tick and confirm no additional completeTask call was made
      await new Promise((r) => setTimeout(r, 10));
      // The .then guard checks runningTaskIds.has(taskId) - since we removed it, completeTask should NOT be called
      // Only the initial updateTask for stage change should have been saved
      expect(mockSaveTaskFolder.mock.calls.length).toBe(saveCallsBefore);
    });

    it("increments generation counter on each call", async () => {
      const task = makeTask({ id: "t1", stage: "backlog" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));
      mockExecuteTask.mockResolvedValue({ success: true });

      useTaskStore.setState({
        taskTree: makeTaskTree([task]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      await useTaskStore.getState().startTask("t1");
      await vi.waitFor(() => {
        expect(useTaskStore.getState().runningTaskIds.has("t1")).toBe(false);
      });

      expect(useTaskStore.getState().taskGenerations.get("t1")).toBe(1);

      // Start again
      useTaskStore.setState({
        taskTree: makeTaskTree([task]),
      });
      await useTaskStore.getState().startTask("t1");
      await vi.waitFor(() => {
        expect(useTaskStore.getState().runningTaskIds.has("t1")).toBe(false);
      });

      expect(useTaskStore.getState().taskGenerations.get("t1")).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // stopTask — additional edge cases
  // -----------------------------------------------------------------------
  describe("stopTask (edge cases)", () => {
    it("calls stopLoop on agentic loop store when conversation exists", async () => {
      const task = makeTask({ id: "t1", stage: "in_progress" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));

      useTaskStore.setState({
        taskTree: makeTaskTree([task]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
        runningTaskIds: new Set(["t1"]),
        runningConversations: new Map([["t1", "conv-1"]]),
      });

      await useTaskStore.getState().stopTask("t1");

      expect(mockStopLoop).toHaveBeenCalledWith("conv-1");
    });

    it("does not call stopLoop when no conversation exists for the task", async () => {
      const task = makeTask({ id: "t1", stage: "in_progress" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));

      useTaskStore.setState({
        taskTree: makeTaskTree([task]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
        runningTaskIds: new Set(["t1"]),
        runningConversations: new Map(), // No conversation mapped
      });

      await useTaskStore.getState().stopTask("t1");

      expect(mockStopLoop).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // redoTask
  // -----------------------------------------------------------------------
  describe("redoTask", () => {
    it("does nothing when task is not found in current folder", async () => {
      useTaskStore.setState({
        taskTree: makeTaskTree([]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      await useTaskStore.getState().redoTask("nonexistent");

      expect(mockExecuteTask).not.toHaveBeenCalled();
    });

    it("updates task to in_progress with null resultStatus and adds to running set", async () => {
      const task = makeTask({ id: "t1", stage: "done", resultStatus: "success" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));

      let resolveExecute!: (v: { success: boolean }) => void;
      mockExecuteTask.mockImplementationOnce(() => new Promise((r) => { resolveExecute = r; }));

      useTaskStore.setState({
        taskTree: makeTaskTree([task]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      const redoPromise = useTaskStore.getState().redoTask("t1");

      await vi.waitFor(() => {
        expect(useTaskStore.getState().runningTaskIds.has("t1")).toBe(true);
      });

      // Check that updateTask was called with stage: "in_progress" and resultStatus: null
      expect(mockSaveTaskFolder).toHaveBeenCalled();
      const savedData = mockSaveTaskFolder.mock.calls[0][0] as TaskFolderData;
      const updatedTask = savedData.tasks.find((t) => t.id === "t1");
      expect(updatedTask?.stage).toBe("in_progress");
      expect(updatedTask?.resultStatus).toBeNull();

      resolveExecute({ success: true });
      await redoPromise;
    });

    it("completes with success when executeTask resolves successfully", async () => {
      const task = makeTask({ id: "t1", stage: "done", resultStatus: "incomplete" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));
      mockExecuteTask.mockResolvedValueOnce({ success: true });

      useTaskStore.setState({
        taskTree: makeTaskTree([task]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      await useTaskStore.getState().redoTask("t1");

      await vi.waitFor(() => {
        expect(mockSaveTaskFolder.mock.calls.length).toBeGreaterThanOrEqual(2);
      });

      const lastSavedData = mockSaveTaskFolder.mock.calls[mockSaveTaskFolder.mock.calls.length - 1][0] as TaskFolderData;
      const completedTask = lastSavedData.tasks.find((t) => t.id === "t1");
      expect(completedTask?.stage).toBe("done");
      expect(completedTask?.resultStatus).toBe("success");
    });

    it("completes with incomplete when executeTask rejects", async () => {
      const task = makeTask({ id: "t1", stage: "done", resultStatus: "success" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));
      mockExecuteTask.mockRejectedValueOnce(new Error("Failure"));

      useTaskStore.setState({
        taskTree: makeTaskTree([task]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      await useTaskStore.getState().redoTask("t1");

      await vi.waitFor(() => {
        expect(mockSaveTaskFolder.mock.calls.length).toBeGreaterThanOrEqual(2);
      });

      const lastSavedData = mockSaveTaskFolder.mock.calls[mockSaveTaskFolder.mock.calls.length - 1][0] as TaskFolderData;
      const completedTask = lastSavedData.tasks.find((t) => t.id === "t1");
      expect(completedTask?.resultStatus).toBe("incomplete");
    });

    it("cleans up running state after redo completes", async () => {
      const task = makeTask({ id: "t1", stage: "done", resultStatus: "success" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));
      mockExecuteTask.mockResolvedValueOnce({ success: true });

      useTaskStore.setState({
        taskTree: makeTaskTree([task]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      await useTaskStore.getState().redoTask("t1");

      await vi.waitFor(() => {
        expect(useTaskStore.getState().runningTaskIds.has("t1")).toBe(false);
      });

      expect(useTaskStore.getState().runningConversations.has("t1")).toBe(false);
    });

    it("sets running conversation via onConversationCreated callback", async () => {
      const task = makeTask({ id: "t1", stage: "done", resultStatus: "success" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));

      let capturedCallback: ((id: string) => void) | undefined;
      let resolveExecute!: (v: { success: boolean }) => void;
      mockExecuteTask.mockImplementationOnce((_task: unknown, options: { onConversationCreated?: (id: string) => void }) => {
        capturedCallback = options?.onConversationCreated;
        return new Promise((r) => { resolveExecute = r; });
      });

      useTaskStore.setState({
        taskTree: makeTaskTree([task]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      const redoPromise = useTaskStore.getState().redoTask("t1");

      await vi.waitFor(() => {
        expect(capturedCallback).toBeDefined();
      });

      capturedCallback!("conv-redo-123");
      expect(useTaskStore.getState().runningConversations.get("t1")).toBe("conv-redo-123");

      resolveExecute({ success: true });
      await redoPromise;
    });
  });

  // -----------------------------------------------------------------------
  // playAll
  // -----------------------------------------------------------------------
  describe("playAll", () => {
    it("starts all backlog tasks", async () => {
      const t1 = makeTask({ id: "t1", stage: "backlog" });
      const t2 = makeTask({ id: "t2", stage: "backlog" });
      const t3 = makeTask({ id: "t3", stage: "done" });
      const folderData = makeFolderData([t1, t2, t3]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([t1, t2, t3]));
      mockExecuteTask.mockResolvedValue({ success: true });

      useTaskStore.setState({
        taskTree: makeTaskTree([t1, t2, t3]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      await useTaskStore.getState().playAll();

      // Should have called executeTask for both backlog tasks but not the done one
      await vi.waitFor(() => {
        expect(mockExecuteTask).toHaveBeenCalledTimes(2);
      });
    });

    it("does nothing when no backlog tasks exist", async () => {
      const t1 = makeTask({ id: "t1", stage: "done" });
      useTaskStore.setState({
        taskTree: makeTaskTree([t1]),
        selectedFolderId: "folder-1",
      });

      await useTaskStore.getState().playAll();

      expect(mockExecuteTask).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // stopAll
  // -----------------------------------------------------------------------
  describe("stopAll", () => {
    it("stops all in-progress tasks", async () => {
      const t1 = makeTask({ id: "t1", stage: "in_progress" });
      const t2 = makeTask({ id: "t2", stage: "in_progress" });
      const t3 = makeTask({ id: "t3", stage: "backlog" });
      const folderData = makeFolderData([t1, t2, t3]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([t1, t2, t3]));

      useTaskStore.setState({
        taskTree: makeTaskTree([t1, t2, t3]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
        runningTaskIds: new Set(["t1", "t2"]),
        runningConversations: new Map([
          ["t1", "conv-1"],
          ["t2", "conv-2"],
        ]),
      });

      await useTaskStore.getState().stopAll();

      // saveTaskFolder should have been called for each stopped task (updateTask)
      expect(mockSaveTaskFolder).toHaveBeenCalled();

      const s = useTaskStore.getState();
      expect(s.runningTaskIds.has("t1")).toBe(false);
      expect(s.runningTaskIds.has("t2")).toBe(false);
    });

    it("does nothing when no in-progress tasks exist", async () => {
      const t1 = makeTask({ id: "t1", stage: "backlog" });
      useTaskStore.setState({
        taskTree: makeTaskTree([t1]),
        selectedFolderId: "folder-1",
      });

      await useTaskStore.getState().stopAll();

      expect(mockSaveTaskFolder).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // redoAll
  // -----------------------------------------------------------------------
  describe("redoAll", () => {
    it("redoes all done tasks", async () => {
      const t1 = makeTask({ id: "t1", stage: "done", resultStatus: "success" });
      const t2 = makeTask({ id: "t2", stage: "done", resultStatus: "incomplete" });
      const t3 = makeTask({ id: "t3", stage: "backlog" });
      const folderData = makeFolderData([t1, t2, t3]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([t1, t2, t3]));
      mockExecuteTask.mockResolvedValue({ success: true });

      useTaskStore.setState({
        taskTree: makeTaskTree([t1, t2, t3]),
        selectedFolderId: "folder-1",
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      await useTaskStore.getState().redoAll();

      // Should have called executeTask for both done tasks but not the backlog one
      await vi.waitFor(() => {
        expect(mockExecuteTask).toHaveBeenCalledTimes(2);
      });
    });

    it("does nothing when no done tasks exist", async () => {
      const t1 = makeTask({ id: "t1", stage: "backlog" });
      useTaskStore.setState({
        taskTree: makeTaskTree([t1]),
        selectedFolderId: "folder-1",
      });

      await useTaskStore.getState().redoAll();

      expect(mockExecuteTask).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getCurrentFolderTasks — additional edge cases
  // -----------------------------------------------------------------------
  describe("getCurrentFolderTasks (edge cases)", () => {
    it("returns empty array when selected folder id does not match any folder", () => {
      useTaskStore.setState({
        taskTree: makeTaskTree([makeTask()]),
        selectedFolderId: "nonexistent-folder",
      });

      expect(useTaskStore.getState().getCurrentFolderTasks()).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // completeTask — additional statuses
  // -----------------------------------------------------------------------
  describe("completeTask (additional statuses)", () => {
    it("updates task with incomplete status", async () => {
      const task = makeTask({ id: "t1", stage: "in_progress" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));

      useTaskStore.setState({
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      await useTaskStore.getState().completeTask("t1", "incomplete");

      const savedData = mockSaveTaskFolder.mock.calls[0][0] as TaskFolderData;
      const updated = savedData.tasks.find((t) => t.id === "t1");
      expect(updated?.resultStatus).toBe("incomplete");
    });

    it("updates task with bug status", async () => {
      const task = makeTask({ id: "t1", stage: "in_progress" });
      const folderData = makeFolderData([task]);
      mockLoadTaskFolder.mockResolvedValue(folderData);
      mockLoadTaskTree.mockResolvedValue(makeTaskTree([task]));

      useTaskStore.setState({
        selectedFolderPath: "/mock-data/tasks/folder-1",
      });

      await useTaskStore.getState().completeTask("t1", "bug");

      const savedData = mockSaveTaskFolder.mock.calls[0][0] as TaskFolderData;
      const updated = savedData.tasks.find((t) => t.id === "t1");
      expect(updated?.resultStatus).toBe("bug");
    });
  });

  // -----------------------------------------------------------------------
  // modal state — additional
  // -----------------------------------------------------------------------
  describe("modal state (additional)", () => {
    it("sets confirm modal action to stop", () => {
      useTaskStore.getState().setConfirmModalAction("stop");
      expect(useTaskStore.getState().confirmModalAction).toBe("stop");
    });

    it("sets confirm modal action to redo", () => {
      useTaskStore.getState().setConfirmModalAction("redo");
      expect(useTaskStore.getState().confirmModalAction).toBe("redo");
    });
  });
});
