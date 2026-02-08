import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

const mockLoadSchedulerTree = vi.fn().mockResolvedValue([]);
const mockCreateSchedulerFolder = vi.fn().mockResolvedValue("/mock-data/scheduler/folder");
const mockDeleteSchedulerFolder = vi.fn().mockResolvedValue(undefined);
const mockRenameSchedulerFolder = vi.fn().mockResolvedValue(undefined);
const mockToggleSchedulerFolderPin = vi.fn().mockResolvedValue(undefined);
const mockSaveSchedule = vi.fn().mockResolvedValue("/mock-data/scheduler/id.yaml");
const mockLoadSchedule = vi.fn().mockResolvedValue(null);
const mockDeleteScheduleByPath = vi.fn().mockResolvedValue(undefined);
const mockGetAppDataDir = vi.fn().mockResolvedValue("/mock-data");

vi.mock("@/lib/storage", () => ({
  loadSchedulerTree: (...args: unknown[]) => mockLoadSchedulerTree(...args),
  createSchedulerFolder: (...args: unknown[]) => mockCreateSchedulerFolder(...args),
  deleteSchedulerFolder: (...args: unknown[]) => mockDeleteSchedulerFolder(...args),
  renameSchedulerFolder: (...args: unknown[]) => mockRenameSchedulerFolder(...args),
  toggleSchedulerFolderPin: (...args: unknown[]) => mockToggleSchedulerFolderPin(...args),
  saveSchedule: (...args: unknown[]) => mockSaveSchedule(...args),
  loadSchedule: (...args: unknown[]) => mockLoadSchedule(...args),
  deleteScheduleByPath: (...args: unknown[]) => mockDeleteScheduleByPath(...args),
  getAppDataDir: (...args: unknown[]) => mockGetAppDataDir(...args),
}));

const mockRunScheduleNow = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/scheduler-runner", () => ({
  runScheduleNow: (...args: unknown[]) => mockRunScheduleNow(...args),
}));

vi.mock("cronstrue", () => ({
  default: {
    toString: vi.fn((cron: string) => {
      if (cron === "0 9 * * *") return "At 09:00 AM";
      if (cron === "invalid") throw new Error("Invalid cron");
      return `Cron: ${cron}`;
    }),
  },
}));

const mockCronParse = vi.fn(() => ({
  next: () => ({ toISOString: () => "2025-06-01T09:00:00.000Z" }),
}));
vi.mock("cron-parser", () => ({
  default: {
    parse: (...args: unknown[]) => mockCronParse(...args),
  },
}));

const mockChatStoreGetState = vi.fn(() => ({ conversations: [] }));
vi.mock("@/stores/chat-store", () => ({
  useChatStore: Object.assign(vi.fn(() => ({})), {
    getState: (...args: unknown[]) => mockChatStoreGetState(...args),
  }),
}));

const mockStopLoop = vi.fn();
vi.mock("@/stores/agentic-loop-store", () => ({
  useAgenticLoopStore: Object.assign(vi.fn(() => ({})), {
    getState: vi.fn(() => ({
      stopLoop: (...args: unknown[]) => mockStopLoop(...args),
    })),
  }),
}));

import { useSchedulerStore, describeCron } from "./scheduler-store";
import type { SchedulerTreeNode, ScheduleData } from "./scheduler-store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScheduleNode(overrides: Partial<SchedulerTreeNode> = {}): SchedulerTreeNode {
  return {
    id: "sched-1",
    name: "My Schedule",
    path: "/mock-data/scheduler/sched-1.yaml",
    type: "schedule" as const,
    cron: "0 9 * * *",
    enabled: false,
    hasError: false,
    ...overrides,
  };
}

function makeSchedule(overrides: Partial<ScheduleData> = {}): ScheduleData {
  return {
    id: "sched-1",
    name: "My Schedule",
    cron: "0 9 * * *",
    agentId: "Assistant",
    prompt: "Run daily check",
    enabled: false,
    hasError: false,
    lastRun: null,
    nextRun: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeFolderNode(children: SchedulerTreeNode[] = []): SchedulerTreeNode {
  return {
    id: "folder-1",
    name: "My Folder",
    path: "/mock-data/scheduler/folder-1",
    type: "folder" as const,
    isPinned: false,
    children,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("scheduler-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSchedulerStore.setState({
      schedulerTree: [],
      schedules: [],
      selectedScheduleId: null,
      expandedFolders: new Set(),
      runningScheduleId: null,
      runningConversationId: null,
      schedulerLog: "",
      schedulerLogScheduleId: null,
    });
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------
  describe("initial state", () => {
    it("starts with empty scheduler tree", () => {
      expect(useSchedulerStore.getState().schedulerTree).toEqual([]);
    });

    it("starts with no selected schedule", () => {
      expect(useSchedulerStore.getState().selectedScheduleId).toBeNull();
    });

    it("starts with no running schedule", () => {
      expect(useSchedulerStore.getState().runningScheduleId).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // loadSchedulersFromDisk
  // -----------------------------------------------------------------------
  describe("loadSchedulersFromDisk", () => {
    it("loads tree and schedules from disk", async () => {
      const node = makeScheduleNode();
      mockLoadSchedulerTree.mockResolvedValueOnce([node]);
      const sched = makeSchedule();
      mockLoadSchedule.mockResolvedValueOnce(sched);

      await useSchedulerStore.getState().loadSchedulersFromDisk();

      expect(useSchedulerStore.getState().schedulerTree).toEqual([node]);
      expect(useSchedulerStore.getState().schedules).toEqual([sched]);
    });

    it("skips schedules that fail to load", async () => {
      const node = makeScheduleNode();
      mockLoadSchedulerTree.mockResolvedValueOnce([node]);
      mockLoadSchedule.mockResolvedValueOnce(null);

      await useSchedulerStore.getState().loadSchedulersFromDisk();

      expect(useSchedulerStore.getState().schedules).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // selectSchedule
  // -----------------------------------------------------------------------
  describe("selectSchedule", () => {
    it("sets selected schedule id", () => {
      useSchedulerStore.getState().selectSchedule("sched-1");
      expect(useSchedulerStore.getState().selectedScheduleId).toBe("sched-1");
    });

    it("deselects when null", () => {
      useSchedulerStore.setState({ selectedScheduleId: "sched-1" });
      useSchedulerStore.getState().selectSchedule(null);
      expect(useSchedulerStore.getState().selectedScheduleId).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // toggleFolderExpansion
  // -----------------------------------------------------------------------
  describe("toggleFolderExpansion", () => {
    it("adds folder to expanded set", () => {
      useSchedulerStore.getState().toggleFolderExpansion("f1");
      expect(useSchedulerStore.getState().expandedFolders.has("f1")).toBe(true);
    });

    it("removes folder on second toggle", () => {
      useSchedulerStore.getState().toggleFolderExpansion("f1");
      useSchedulerStore.getState().toggleFolderExpansion("f1");
      expect(useSchedulerStore.getState().expandedFolders.has("f1")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // createFolder
  // -----------------------------------------------------------------------
  describe("createFolder", () => {
    it("creates a folder and reloads", async () => {
      mockLoadSchedulerTree.mockResolvedValue([]);

      await useSchedulerStore.getState().createFolder("New Folder");

      expect(mockCreateSchedulerFolder).toHaveBeenCalledWith("New Folder", undefined);
      expect(mockLoadSchedulerTree).toHaveBeenCalled();
    });

    it("passes parent path when creating nested folder", async () => {
      const folder = makeFolderNode();
      useSchedulerStore.setState({ schedulerTree: [folder] });
      mockLoadSchedulerTree.mockResolvedValue([folder]);

      await useSchedulerStore.getState().createFolder("Nested", "folder-1");

      expect(mockCreateSchedulerFolder).toHaveBeenCalledWith("Nested", "/mock-data/scheduler/folder-1");
    });
  });

  // -----------------------------------------------------------------------
  // renameFolder
  // -----------------------------------------------------------------------
  describe("renameFolder", () => {
    it("renames folder by path", async () => {
      const folder = makeFolderNode();
      useSchedulerStore.setState({ schedulerTree: [folder] });
      mockLoadSchedulerTree.mockResolvedValue([folder]);

      await useSchedulerStore.getState().renameFolder("folder-1", "Renamed");

      expect(mockRenameSchedulerFolder).toHaveBeenCalledWith("/mock-data/scheduler/folder-1", "Renamed");
    });

    it("does nothing for nonexistent folder", async () => {
      useSchedulerStore.setState({ schedulerTree: [] });

      await useSchedulerStore.getState().renameFolder("nonexistent", "Renamed");

      expect(mockRenameSchedulerFolder).not.toHaveBeenCalled();
    });

    it("does nothing for schedule nodes", async () => {
      const node = makeScheduleNode({ id: "sched-1" });
      useSchedulerStore.setState({ schedulerTree: [node] });

      await useSchedulerStore.getState().renameFolder("sched-1", "Renamed");

      expect(mockRenameSchedulerFolder).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // deleteFolder
  // -----------------------------------------------------------------------
  describe("deleteFolder", () => {
    it("deletes folder and reloads", async () => {
      const folder = makeFolderNode();
      useSchedulerStore.setState({ schedulerTree: [folder] });
      mockLoadSchedulerTree.mockResolvedValue([]);

      await useSchedulerStore.getState().deleteFolder("folder-1");

      expect(mockDeleteSchedulerFolder).toHaveBeenCalledWith("/mock-data/scheduler/folder-1");
    });
  });

  // -----------------------------------------------------------------------
  // deleteSchedule
  // -----------------------------------------------------------------------
  describe("deleteSchedule", () => {
    it("deletes schedule from disk and in-memory", async () => {
      const node = makeScheduleNode({ id: "sched-1" });
      const sched = makeSchedule({ id: "sched-1" });
      useSchedulerStore.setState({
        schedulerTree: [node],
        schedules: [sched],
        selectedScheduleId: "sched-1",
      });
      mockLoadSchedulerTree.mockResolvedValue([]);

      await useSchedulerStore.getState().deleteSchedule("sched-1");

      expect(mockDeleteScheduleByPath).toHaveBeenCalledWith("/mock-data/scheduler/sched-1.yaml");
      expect(useSchedulerStore.getState().schedules).toEqual([]);
      expect(useSchedulerStore.getState().selectedScheduleId).toBeNull();
    });

    it("preserves selection when deleting a different schedule", async () => {
      const n1 = makeScheduleNode({ id: "s1", path: "/mock-data/scheduler/s1.yaml" });
      const n2 = makeScheduleNode({ id: "s2", path: "/mock-data/scheduler/s2.yaml" });
      useSchedulerStore.setState({
        schedulerTree: [n1, n2],
        schedules: [makeSchedule({ id: "s1" }), makeSchedule({ id: "s2" })],
        selectedScheduleId: "s1",
      });
      mockLoadSchedulerTree.mockResolvedValue([n1]);

      await useSchedulerStore.getState().deleteSchedule("s2");

      expect(useSchedulerStore.getState().selectedScheduleId).toBe("s1");
    });
  });

  // -----------------------------------------------------------------------
  // getSelectedSchedule
  // -----------------------------------------------------------------------
  describe("getSelectedSchedule", () => {
    it("returns null when nothing is selected", () => {
      expect(useSchedulerStore.getState().getSelectedSchedule()).toBeNull();
    });

    it("returns in-memory schedule by id", () => {
      const sched = makeSchedule({ id: "s1" });
      useSchedulerStore.setState({ schedules: [sched], selectedScheduleId: "s1" });

      expect(useSchedulerStore.getState().getSelectedSchedule()).toEqual(sched);
    });

    it("falls back to tree node when not in memory", () => {
      const node = makeScheduleNode({ id: "s1", name: "Fallback" });
      useSchedulerStore.setState({
        schedulerTree: [node],
        schedules: [],
        selectedScheduleId: "s1",
      });

      const result = useSchedulerStore.getState().getSelectedSchedule();
      expect(result).not.toBeNull();
      expect(result!.id).toBe("s1");
      expect(result!.name).toBe("Fallback");
    });

    it("returns null when id not found anywhere", () => {
      useSchedulerStore.setState({
        schedulerTree: [],
        schedules: [],
        selectedScheduleId: "missing",
      });

      expect(useSchedulerStore.getState().getSelectedSchedule()).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // updateSchedule
  // -----------------------------------------------------------------------
  describe("updateSchedule", () => {
    it("updates schedule on disk and in memory", async () => {
      const node = makeScheduleNode({ id: "s1" });
      const sched = makeSchedule({ id: "s1" });
      useSchedulerStore.setState({
        schedulerTree: [node],
        schedules: [sched],
      });
      mockLoadSchedule.mockResolvedValueOnce(sched);

      await useSchedulerStore.getState().updateSchedule("s1", { prompt: "Updated prompt" });

      expect(mockSaveSchedule).toHaveBeenCalledTimes(1);
      const savedSchedule = mockSaveSchedule.mock.calls[0][0] as ScheduleData;
      expect(savedSchedule.prompt).toBe("Updated prompt");

      const inMemory = useSchedulerStore.getState().schedules.find((s) => s.id === "s1");
      expect(inMemory?.prompt).toBe("Updated prompt");
    });

    it("does nothing when node is not found", async () => {
      useSchedulerStore.setState({ schedulerTree: [] });

      await useSchedulerStore.getState().updateSchedule("missing", { prompt: "X" });

      expect(mockLoadSchedule).not.toHaveBeenCalled();
      expect(mockSaveSchedule).not.toHaveBeenCalled();
    });

    it("does nothing for folder nodes", async () => {
      const folder = makeFolderNode();
      useSchedulerStore.setState({ schedulerTree: [folder] });

      await useSchedulerStore.getState().updateSchedule("folder-1", { prompt: "X" });

      expect(mockLoadSchedule).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // stopScheduleRun
  // -----------------------------------------------------------------------
  describe("stopScheduleRun", () => {
    it("does nothing when no running conversation", () => {
      useSchedulerStore.setState({ runningConversationId: null });
      // Should not throw
      useSchedulerStore.getState().stopScheduleRun();
      expect(mockStopLoop).not.toHaveBeenCalled();
    });

    it("calls stopLoop with conversationId when running", () => {
      useSchedulerStore.setState({ runningConversationId: "conv-42" });
      useSchedulerStore.getState().stopScheduleRun();
      expect(mockStopLoop).toHaveBeenCalledWith("conv-42");
    });
  });

  // -----------------------------------------------------------------------
  // createSchedule
  // -----------------------------------------------------------------------
  describe("createSchedule", () => {
    it("creates a schedule with default cron and selects it", async () => {
      mockLoadSchedulerTree.mockResolvedValue([]);

      await useSchedulerStore.getState().createSchedule("Daily Check");

      expect(mockSaveSchedule).toHaveBeenCalledTimes(1);
      const savedSchedule = mockSaveSchedule.mock.calls[0][0] as ScheduleData;
      expect(savedSchedule.name).toBe("Daily Check");
      expect(savedSchedule.cron).toBe("0 9 * * *");
      expect(savedSchedule.enabled).toBe(false);
    });

    it("saves to default scheduler base path when no folderId", async () => {
      mockLoadSchedulerTree.mockResolvedValue([]);

      await useSchedulerStore.getState().createSchedule("My Schedule");

      expect(mockSaveSchedule).toHaveBeenCalledTimes(1);
      const basePath = mockSaveSchedule.mock.calls[0][1] as string;
      expect(basePath).toBe("/mock-data/scheduler");
    });

    it("saves to folder path when folderId is provided", async () => {
      const folder = makeFolderNode();
      useSchedulerStore.setState({ schedulerTree: [folder] });
      mockLoadSchedulerTree.mockResolvedValue([folder]);

      await useSchedulerStore.getState().createSchedule("Nested Schedule", "folder-1");

      expect(mockSaveSchedule).toHaveBeenCalledTimes(1);
      const basePath = mockSaveSchedule.mock.calls[0][1] as string;
      expect(basePath).toBe("/mock-data/scheduler/folder-1");
    });

    it("adds schedule to in-memory schedules immediately", async () => {
      mockLoadSchedulerTree.mockResolvedValue([]);

      await useSchedulerStore.getState().createSchedule("Immediate");

      // After disk reload, selectedScheduleId should be set
      const s = useSchedulerStore.getState();
      expect(s.selectedScheduleId).toBeDefined();
      expect(s.selectedScheduleId).not.toBeNull();
    });

    it("creates schedule with default field values", async () => {
      mockLoadSchedulerTree.mockResolvedValue([]);

      await useSchedulerStore.getState().createSchedule("Defaults Check");

      const savedSchedule = mockSaveSchedule.mock.calls[0][0] as ScheduleData;
      expect(savedSchedule.agentId).toBe("Assistant");
      expect(savedSchedule.prompt).toBe("");
      expect(savedSchedule.hasError).toBe(false);
      expect(savedSchedule.lastRun).toBeNull();
      expect(savedSchedule.nextRun).toBeNull();
      expect(savedSchedule.id).toBeDefined();
      expect(savedSchedule.createdAt).toBeDefined();
      expect(savedSchedule.updatedAt).toBeDefined();
    });

    it("falls back to default path when folderId node is not found", async () => {
      useSchedulerStore.setState({ schedulerTree: [] });
      mockLoadSchedulerTree.mockResolvedValue([]);

      await useSchedulerStore.getState().createSchedule("Orphan", "nonexistent-folder");

      const basePath = mockSaveSchedule.mock.calls[0][1] as string;
      expect(basePath).toBe("/mock-data/scheduler");
    });
  });

  // -----------------------------------------------------------------------
  // loadSchedulersFromDisk — nested folders
  // -----------------------------------------------------------------------
  describe("loadSchedulersFromDisk (nested)", () => {
    it("loads schedules from nested folder structures", async () => {
      const innerSchedule = makeScheduleNode({ id: "s-inner", path: "/mock-data/scheduler/folder-1/s-inner.yaml" });
      const folder = makeFolderNode([innerSchedule]);
      const topSchedule = makeScheduleNode({ id: "s-top", path: "/mock-data/scheduler/s-top.yaml" });

      mockLoadSchedulerTree.mockResolvedValueOnce([folder, topSchedule]);
      const sInner = makeSchedule({ id: "s-inner" });
      const sTop = makeSchedule({ id: "s-top" });
      mockLoadSchedule
        .mockResolvedValueOnce(sInner)  // for s-inner path
        .mockResolvedValueOnce(sTop);    // for s-top path

      await useSchedulerStore.getState().loadSchedulersFromDisk();

      expect(useSchedulerStore.getState().schedules).toHaveLength(2);
      expect(mockLoadSchedule).toHaveBeenCalledWith("/mock-data/scheduler/folder-1/s-inner.yaml");
      expect(mockLoadSchedule).toHaveBeenCalledWith("/mock-data/scheduler/s-top.yaml");
    });

    it("handles empty tree", async () => {
      mockLoadSchedulerTree.mockResolvedValueOnce([]);

      await useSchedulerStore.getState().loadSchedulersFromDisk();

      expect(useSchedulerStore.getState().schedulerTree).toEqual([]);
      expect(useSchedulerStore.getState().schedules).toEqual([]);
      expect(mockLoadSchedule).not.toHaveBeenCalled();
    });

    it("handles tree with only folders (no schedules)", async () => {
      const folder = makeFolderNode([]);
      mockLoadSchedulerTree.mockResolvedValueOnce([folder]);

      await useSchedulerStore.getState().loadSchedulersFromDisk();

      expect(useSchedulerStore.getState().schedules).toEqual([]);
      expect(mockLoadSchedule).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // createFolder — unique name deduplication and error handling
  // -----------------------------------------------------------------------
  describe("createFolder (edge cases)", () => {
    it("deduplicates folder names at root level", async () => {
      const existing = makeFolderNode();
      existing.name = "New Folder";
      useSchedulerStore.setState({ schedulerTree: [existing] });
      mockLoadSchedulerTree.mockResolvedValue([existing]);

      await useSchedulerStore.getState().createFolder("New Folder");

      expect(mockCreateSchedulerFolder).toHaveBeenCalledWith("New Folder 2", undefined);
    });

    it("deduplicates folder names with multiple collisions", async () => {
      const f1: SchedulerTreeNode = { ...makeFolderNode(), id: "f1", name: "Test" };
      const f2: SchedulerTreeNode = { ...makeFolderNode(), id: "f2", name: "Test 2" };
      useSchedulerStore.setState({ schedulerTree: [f1, f2] });
      mockLoadSchedulerTree.mockResolvedValue([f1, f2]);

      await useSchedulerStore.getState().createFolder("Test");

      expect(mockCreateSchedulerFolder).toHaveBeenCalledWith("Test 3", undefined);
    });

    it("deduplicates names inside parent folder", async () => {
      const child: SchedulerTreeNode = { ...makeFolderNode(), id: "child-1", name: "Sub", path: "/mock-data/scheduler/folder-1/child-1" };
      const parent = makeFolderNode([child]);
      useSchedulerStore.setState({ schedulerTree: [parent] });
      mockLoadSchedulerTree.mockResolvedValue([parent]);

      await useSchedulerStore.getState().createFolder("Sub", "folder-1");

      expect(mockCreateSchedulerFolder).toHaveBeenCalledWith("Sub 2", "/mock-data/scheduler/folder-1");
    });

    it("handles error during folder creation gracefully", async () => {
      mockCreateSchedulerFolder.mockRejectedValueOnce(new Error("Disk full"));
      mockLoadSchedulerTree.mockResolvedValue([]);

      // Should not throw
      await useSchedulerStore.getState().createFolder("Failing Folder");

      // loadSchedulersFromDisk should not have been called since the creation failed
      // But the error was caught, so no exception
    });

    it("returns empty sibling names when parentFolderId does not exist", async () => {
      useSchedulerStore.setState({ schedulerTree: [] });
      mockLoadSchedulerTree.mockResolvedValue([]);

      await useSchedulerStore.getState().createFolder("Orphan", "nonexistent-parent");

      // Since parent is not found, parentPath is undefined
      expect(mockCreateSchedulerFolder).toHaveBeenCalledWith("Orphan", undefined);
    });
  });

  // -----------------------------------------------------------------------
  // updateSchedule — nextRun calculation and edge cases
  // -----------------------------------------------------------------------
  describe("updateSchedule (nextRun and edge cases)", () => {
    it("calculates nextRun when enabling a schedule", async () => {
      const node = makeScheduleNode({ id: "s1" });
      const sched = makeSchedule({ id: "s1", enabled: false });
      useSchedulerStore.setState({
        schedulerTree: [node],
        schedules: [sched],
      });
      mockLoadSchedule.mockResolvedValueOnce(sched);

      await useSchedulerStore.getState().updateSchedule("s1", { enabled: true });

      const savedSchedule = mockSaveSchedule.mock.calls[0][0] as ScheduleData;
      expect(savedSchedule.nextRun).toBe("2025-06-01T09:00:00.000Z");
      expect(savedSchedule.enabled).toBe(true);
    });

    it("sets nextRun to null when disabling a schedule", async () => {
      const node = makeScheduleNode({ id: "s1" });
      const sched = makeSchedule({ id: "s1", enabled: true, nextRun: "2025-06-01T09:00:00.000Z" });
      useSchedulerStore.setState({
        schedulerTree: [node],
        schedules: [sched],
      });
      mockLoadSchedule.mockResolvedValueOnce(sched);

      await useSchedulerStore.getState().updateSchedule("s1", { enabled: false });

      const savedSchedule = mockSaveSchedule.mock.calls[0][0] as ScheduleData;
      expect(savedSchedule.nextRun).toBeNull();
      expect(savedSchedule.enabled).toBe(false);
    });

    it("recalculates nextRun when cron changes while enabled", async () => {
      const node = makeScheduleNode({ id: "s1" });
      const sched = makeSchedule({ id: "s1", enabled: true, cron: "0 9 * * *" });
      useSchedulerStore.setState({
        schedulerTree: [node],
        schedules: [sched],
      });
      mockLoadSchedule.mockResolvedValueOnce(sched);

      await useSchedulerStore.getState().updateSchedule("s1", { cron: "0 12 * * *" });

      expect(mockCronParse).toHaveBeenCalledWith("0 12 * * *");
      const savedSchedule = mockSaveSchedule.mock.calls[0][0] as ScheduleData;
      expect(savedSchedule.nextRun).toBe("2025-06-01T09:00:00.000Z");
    });

    it("sets nextRun to null when cron expression is invalid", async () => {
      const node = makeScheduleNode({ id: "s1" });
      const sched = makeSchedule({ id: "s1", enabled: true });
      useSchedulerStore.setState({
        schedulerTree: [node],
        schedules: [sched],
      });
      mockLoadSchedule.mockResolvedValueOnce(sched);
      mockCronParse.mockImplementationOnce(() => { throw new Error("Invalid cron"); });

      await useSchedulerStore.getState().updateSchedule("s1", { cron: "bad cron" });

      const savedSchedule = mockSaveSchedule.mock.calls[0][0] as ScheduleData;
      expect(savedSchedule.nextRun).toBeNull();
    });

    it("does nothing when schedule cannot be loaded from disk", async () => {
      const node = makeScheduleNode({ id: "s1" });
      useSchedulerStore.setState({
        schedulerTree: [node],
        schedules: [makeSchedule({ id: "s1" })],
      });
      mockLoadSchedule.mockResolvedValueOnce(null);

      await useSchedulerStore.getState().updateSchedule("s1", { prompt: "X" });

      expect(mockSaveSchedule).not.toHaveBeenCalled();
    });

    it("extracts folder path correctly from schedule node path", async () => {
      const node = makeScheduleNode({ id: "s1", path: "/mock-data/scheduler/deep/folder/s1.yaml" });
      const sched = makeSchedule({ id: "s1" });
      useSchedulerStore.setState({
        schedulerTree: [node],
        schedules: [sched],
      });
      mockLoadSchedule.mockResolvedValueOnce(sched);

      await useSchedulerStore.getState().updateSchedule("s1", { name: "Renamed" });

      const folderPath = mockSaveSchedule.mock.calls[0][1] as string;
      expect(folderPath).toBe("/mock-data/scheduler/deep/folder");
    });

    it("updates updatedAt timestamp", async () => {
      const node = makeScheduleNode({ id: "s1" });
      const sched = makeSchedule({ id: "s1", updatedAt: "2020-01-01T00:00:00.000Z" });
      useSchedulerStore.setState({
        schedulerTree: [node],
        schedules: [sched],
      });
      mockLoadSchedule.mockResolvedValueOnce(sched);

      await useSchedulerStore.getState().updateSchedule("s1", { prompt: "New" });

      const savedSchedule = mockSaveSchedule.mock.calls[0][0] as ScheduleData;
      expect(savedSchedule.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
    });
  });

  // -----------------------------------------------------------------------
  // renameSchedule
  // -----------------------------------------------------------------------
  describe("renameSchedule", () => {
    it("delegates to updateSchedule with name update", async () => {
      const node = makeScheduleNode({ id: "s1" });
      const sched = makeSchedule({ id: "s1" });
      useSchedulerStore.setState({
        schedulerTree: [node],
        schedules: [sched],
      });
      mockLoadSchedule.mockResolvedValueOnce(sched);

      await useSchedulerStore.getState().renameSchedule("s1", "New Name");

      const savedSchedule = mockSaveSchedule.mock.calls[0][0] as ScheduleData;
      expect(savedSchedule.name).toBe("New Name");
    });
  });

  // -----------------------------------------------------------------------
  // deleteSchedule — additional edge cases
  // -----------------------------------------------------------------------
  describe("deleteSchedule (edge cases)", () => {
    it("does nothing when node is not found", async () => {
      useSchedulerStore.setState({ schedulerTree: [] });

      await useSchedulerStore.getState().deleteSchedule("nonexistent");

      expect(mockDeleteScheduleByPath).not.toHaveBeenCalled();
    });

    it("does nothing for folder nodes", async () => {
      const folder = makeFolderNode();
      useSchedulerStore.setState({ schedulerTree: [folder] });

      await useSchedulerStore.getState().deleteSchedule("folder-1");

      expect(mockDeleteScheduleByPath).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // deleteFolder — additional edge cases
  // -----------------------------------------------------------------------
  describe("deleteFolder (edge cases)", () => {
    it("does nothing for nonexistent folder", async () => {
      useSchedulerStore.setState({ schedulerTree: [] });

      await useSchedulerStore.getState().deleteFolder("nonexistent");

      expect(mockDeleteSchedulerFolder).not.toHaveBeenCalled();
    });

    it("does nothing for schedule nodes", async () => {
      const schedNode = makeScheduleNode({ id: "s1" });
      useSchedulerStore.setState({ schedulerTree: [schedNode] });

      await useSchedulerStore.getState().deleteFolder("s1");

      expect(mockDeleteSchedulerFolder).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // toggleFolderPin — additional edge cases
  // -----------------------------------------------------------------------
  describe("toggleFolderPin", () => {
    it("calls toggleSchedulerFolderPin with correct path", async () => {
      const folder = makeFolderNode();
      useSchedulerStore.setState({ schedulerTree: [folder] });
      mockLoadSchedulerTree.mockResolvedValue([folder]);

      await useSchedulerStore.getState().toggleFolderPin("folder-1");

      expect(mockToggleSchedulerFolderPin).toHaveBeenCalledWith("/mock-data/scheduler/folder-1");
    });

    it("does nothing for nonexistent node", async () => {
      useSchedulerStore.setState({ schedulerTree: [] });

      await useSchedulerStore.getState().toggleFolderPin("nonexistent");

      expect(mockToggleSchedulerFolderPin).not.toHaveBeenCalled();
    });

    it("does nothing for schedule nodes", async () => {
      const schedNode = makeScheduleNode({ id: "s1" });
      useSchedulerStore.setState({ schedulerTree: [schedNode] });

      await useSchedulerStore.getState().toggleFolderPin("s1");

      expect(mockToggleSchedulerFolderPin).not.toHaveBeenCalled();
    });

    it("reloads tree after toggling pin", async () => {
      const folder = makeFolderNode();
      useSchedulerStore.setState({ schedulerTree: [folder] });
      mockLoadSchedulerTree.mockResolvedValue([folder]);

      await useSchedulerStore.getState().toggleFolderPin("folder-1");

      expect(mockLoadSchedulerTree).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // runScheduleNow
  // -----------------------------------------------------------------------
  describe("runScheduleNow", () => {
    it("does nothing when another schedule is already running", async () => {
      useSchedulerStore.setState({ runningScheduleId: "other" });

      await useSchedulerStore.getState().runScheduleNow("s1");

      expect(mockRunScheduleNow).not.toHaveBeenCalled();
    });

    it("does nothing when node is not found", async () => {
      useSchedulerStore.setState({ schedulerTree: [] });

      await useSchedulerStore.getState().runScheduleNow("nonexistent");

      expect(mockRunScheduleNow).not.toHaveBeenCalled();
    });

    it("does nothing for folder nodes", async () => {
      const folder = makeFolderNode();
      useSchedulerStore.setState({ schedulerTree: [folder] });

      await useSchedulerStore.getState().runScheduleNow("folder-1");

      expect(mockRunScheduleNow).not.toHaveBeenCalled();
    });

    it("sets running state and calls runScheduleNow with node path", async () => {
      const node = makeScheduleNode({ id: "s1" });
      useSchedulerStore.setState({ schedulerTree: [node] });
      mockRunScheduleNow.mockResolvedValueOnce(null);
      mockLoadSchedulerTree.mockResolvedValue([node]);

      await useSchedulerStore.getState().runScheduleNow("s1");

      expect(mockRunScheduleNow).toHaveBeenCalledWith(
        "/mock-data/scheduler/sched-1.yaml",
        expect.objectContaining({ onConversationCreated: expect.any(Function) }),
      );
    });

    it("sets schedulerLogScheduleId during run", async () => {
      const node = makeScheduleNode({ id: "s1" });
      useSchedulerStore.setState({ schedulerTree: [node] });

      let resolveRunner!: (v: unknown) => void;
      mockRunScheduleNow.mockImplementationOnce(() => new Promise((r) => { resolveRunner = r; }));
      mockLoadSchedulerTree.mockResolvedValue([node]);

      const runPromise = useSchedulerStore.getState().runScheduleNow("s1");

      await vi.waitFor(() => {
        expect(useSchedulerStore.getState().runningScheduleId).toBe("s1");
      });
      expect(useSchedulerStore.getState().schedulerLogScheduleId).toBe("s1");

      resolveRunner(null);
      await runPromise;
    });

    it("clears running state in finally block", async () => {
      const node = makeScheduleNode({ id: "s1" });
      useSchedulerStore.setState({ schedulerTree: [node] });
      mockRunScheduleNow.mockResolvedValueOnce(null);
      mockLoadSchedulerTree.mockResolvedValue([node]);

      await useSchedulerStore.getState().runScheduleNow("s1");

      expect(useSchedulerStore.getState().runningScheduleId).toBeNull();
      expect(useSchedulerStore.getState().runningConversationId).toBeNull();
    });

    it("clears running state even when runner throws", async () => {
      const node = makeScheduleNode({ id: "s1" });
      useSchedulerStore.setState({ schedulerTree: [node] });
      mockRunScheduleNow.mockRejectedValueOnce(new Error("Runner failed"));
      mockLoadSchedulerTree.mockResolvedValue([node]);

      // The error propagates (no catch in the store), but finally still runs
      await expect(useSchedulerStore.getState().runScheduleNow("s1")).rejects.toThrow("Runner failed");

      expect(useSchedulerStore.getState().runningScheduleId).toBeNull();
      expect(useSchedulerStore.getState().runningConversationId).toBeNull();
    });

    it("sets onConversationCreated callback that updates runningConversationId", async () => {
      const node = makeScheduleNode({ id: "s1" });
      useSchedulerStore.setState({ schedulerTree: [node] });

      let capturedCallback: ((id: string) => void) | undefined;
      let resolveRunner!: (v: unknown) => void;
      mockRunScheduleNow.mockImplementationOnce((_path: string, options: { onConversationCreated?: (id: string) => void }) => {
        capturedCallback = options?.onConversationCreated;
        return new Promise((r) => { resolveRunner = r; });
      });
      mockLoadSchedulerTree.mockResolvedValue([node]);

      const runPromise = useSchedulerStore.getState().runScheduleNow("s1");

      await vi.waitFor(() => {
        expect(capturedCallback).toBeDefined();
      });

      capturedCallback!("conv-99");
      expect(useSchedulerStore.getState().runningConversationId).toBe("conv-99");

      resolveRunner(null);
      await runPromise;
    });

    it("formats scheduler log from conversation messages", async () => {
      const node = makeScheduleNode({ id: "s1" });
      useSchedulerStore.setState({ schedulerTree: [node] });
      mockRunScheduleNow.mockResolvedValueOnce({ conversationId: "conv-1" });
      mockLoadSchedulerTree.mockResolvedValue([node]);

      mockChatStoreGetState.mockReturnValueOnce({
        conversations: [
          {
            id: "conv-1",
            title: "Test",
            messages: [
              { id: "m1", role: "assistant", content: "Starting task", toolCalls: [], createdAt: new Date() },
              {
                id: "m2",
                role: "assistant",
                content: "",
                toolCalls: [
                  { id: "tc1", name: "search", status: "success", args: "{}", result: "found", error: undefined },
                ],
                createdAt: new Date(),
              },
            ],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      await useSchedulerStore.getState().runScheduleNow("s1");

      const log = useSchedulerStore.getState().schedulerLog;
      expect(log).toContain("Starting task");
      expect(log).toContain("[tool: search] ok");
    });

    it("formats scheduler log with tool errors", async () => {
      const node = makeScheduleNode({ id: "s1" });
      useSchedulerStore.setState({ schedulerTree: [node] });
      mockRunScheduleNow.mockResolvedValueOnce({ conversationId: "conv-1" });
      mockLoadSchedulerTree.mockResolvedValue([node]);

      mockChatStoreGetState.mockReturnValueOnce({
        conversations: [
          {
            id: "conv-1",
            title: "Test",
            messages: [
              {
                id: "m1",
                role: "assistant",
                content: "",
                toolCalls: [
                  { id: "tc1", name: "writeFile", status: "error", args: "{}", result: "", error: "Permission denied" },
                ],
                createdAt: new Date(),
              },
            ],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      await useSchedulerStore.getState().runScheduleNow("s1");

      const log = useSchedulerStore.getState().schedulerLog;
      expect(log).toContain("[tool: writeFile] error");
      expect(log).toContain("error: Permission denied");
    });

    it("handles run result without conversationId", async () => {
      const node = makeScheduleNode({ id: "s1" });
      useSchedulerStore.setState({ schedulerTree: [node] });
      mockRunScheduleNow.mockResolvedValueOnce({ conversationId: null });
      mockLoadSchedulerTree.mockResolvedValue([node]);

      await useSchedulerStore.getState().runScheduleNow("s1");

      expect(useSchedulerStore.getState().schedulerLog).toBe("");
    });

    it("handles run result with conversationId that has no matching conversation", async () => {
      const node = makeScheduleNode({ id: "s1" });
      useSchedulerStore.setState({ schedulerTree: [node] });
      mockRunScheduleNow.mockResolvedValueOnce({ conversationId: "conv-missing" });
      mockLoadSchedulerTree.mockResolvedValue([node]);

      mockChatStoreGetState.mockReturnValueOnce({
        conversations: [],
      });

      await useSchedulerStore.getState().runScheduleNow("s1");

      expect(useSchedulerStore.getState().schedulerLog).toBe("");
    });

    it("reloads from disk after run completes", async () => {
      const node = makeScheduleNode({ id: "s1" });
      useSchedulerStore.setState({ schedulerTree: [node] });
      mockRunScheduleNow.mockResolvedValueOnce(null);
      mockLoadSchedulerTree.mockResolvedValue([node]);

      await useSchedulerStore.getState().runScheduleNow("s1");

      expect(mockLoadSchedulerTree).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getSelectedSchedule — additional edge cases
  // -----------------------------------------------------------------------
  describe("getSelectedSchedule (edge cases)", () => {
    it("uses default cron when tree node has no cron field", () => {
      const node: SchedulerTreeNode = {
        id: "s1",
        name: "No Cron",
        path: "/mock-data/scheduler/s1.yaml",
        type: "schedule",
        isPinned: false,
        // cron omitted
      };
      useSchedulerStore.setState({
        schedulerTree: [node],
        schedules: [],
        selectedScheduleId: "s1",
      });

      const result = useSchedulerStore.getState().getSelectedSchedule();
      expect(result?.cron).toBe("0 9 * * *");
    });

    it("uses default enabled=false when tree node has no enabled field", () => {
      const node: SchedulerTreeNode = {
        id: "s1",
        name: "No Enabled",
        path: "/mock-data/scheduler/s1.yaml",
        type: "schedule",
        isPinned: false,
        // enabled omitted
      };
      useSchedulerStore.setState({
        schedulerTree: [node],
        schedules: [],
        selectedScheduleId: "s1",
      });

      const result = useSchedulerStore.getState().getSelectedSchedule();
      expect(result?.enabled).toBe(false);
    });

    it("uses default hasError=false when tree node has no hasError field", () => {
      const node: SchedulerTreeNode = {
        id: "s1",
        name: "No Error",
        path: "/mock-data/scheduler/s1.yaml",
        type: "schedule",
        isPinned: false,
        // hasError omitted
      };
      useSchedulerStore.setState({
        schedulerTree: [node],
        schedules: [],
        selectedScheduleId: "s1",
      });

      const result = useSchedulerStore.getState().getSelectedSchedule();
      expect(result?.hasError).toBe(false);
    });

    it("uses current date when tree node has no updatedAt", () => {
      const node: SchedulerTreeNode = {
        id: "s1",
        name: "No Date",
        path: "/mock-data/scheduler/s1.yaml",
        type: "schedule",
        isPinned: false,
        // updatedAt omitted
      };
      useSchedulerStore.setState({
        schedulerTree: [node],
        schedules: [],
        selectedScheduleId: "s1",
      });

      const result = useSchedulerStore.getState().getSelectedSchedule();
      expect(result?.createdAt).toBeDefined();
      expect(result?.updatedAt).toBeDefined();
    });

    it("uses updatedAt from tree node for both createdAt and updatedAt", () => {
      const node = makeScheduleNode({ id: "s1", updatedAt: "2025-03-15T12:00:00.000Z" });
      useSchedulerStore.setState({
        schedulerTree: [node],
        schedules: [],
        selectedScheduleId: "s1",
      });

      const result = useSchedulerStore.getState().getSelectedSchedule();
      expect(result?.createdAt).toBe("2025-03-15T12:00:00.000Z");
      expect(result?.updatedAt).toBe("2025-03-15T12:00:00.000Z");
    });

    it("returns null for folder node when looking for schedule", () => {
      const folder = makeFolderNode();
      useSchedulerStore.setState({
        schedulerTree: [folder],
        schedules: [],
        selectedScheduleId: "folder-1",
      });

      // findNodeInTree finds it, but type is "folder" not "schedule"
      const result = useSchedulerStore.getState().getSelectedSchedule();
      expect(result).toBeNull();
    });

    it("finds schedule in nested folder", () => {
      const innerSchedule = makeScheduleNode({ id: "s-inner", name: "Deep" });
      const folder = makeFolderNode([innerSchedule]);
      const inMemory = makeSchedule({ id: "s-inner", name: "Deep" });
      useSchedulerStore.setState({
        schedulerTree: [folder],
        schedules: [inMemory],
        selectedScheduleId: "s-inner",
      });

      const result = useSchedulerStore.getState().getSelectedSchedule();
      expect(result).not.toBeNull();
      expect(result?.name).toBe("Deep");
    });
  });

  // -----------------------------------------------------------------------
  // toggleFolderExpansion — additional
  // -----------------------------------------------------------------------
  describe("toggleFolderExpansion (additional)", () => {
    it("can manage multiple expanded folders", () => {
      useSchedulerStore.getState().toggleFolderExpansion("f1");
      useSchedulerStore.getState().toggleFolderExpansion("f2");
      useSchedulerStore.getState().toggleFolderExpansion("f3");

      const expanded = useSchedulerStore.getState().expandedFolders;
      expect(expanded.has("f1")).toBe(true);
      expect(expanded.has("f2")).toBe(true);
      expect(expanded.has("f3")).toBe(true);

      useSchedulerStore.getState().toggleFolderExpansion("f2");
      const after = useSchedulerStore.getState().expandedFolders;
      expect(after.has("f1")).toBe(true);
      expect(after.has("f2")).toBe(false);
      expect(after.has("f3")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // initial state — additional
  // -----------------------------------------------------------------------
  describe("initial state (additional)", () => {
    it("starts with empty expanded folders set", () => {
      expect(useSchedulerStore.getState().expandedFolders.size).toBe(0);
    });

    it("starts with empty scheduler log", () => {
      expect(useSchedulerStore.getState().schedulerLog).toBe("");
    });

    it("starts with null schedulerLogScheduleId", () => {
      expect(useSchedulerStore.getState().schedulerLogScheduleId).toBeNull();
    });

    it("starts with null runningConversationId", () => {
      expect(useSchedulerStore.getState().runningConversationId).toBeNull();
    });

    it("starts with empty schedules array", () => {
      expect(useSchedulerStore.getState().schedules).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// describeCron (exported pure function)
// ---------------------------------------------------------------------------

describe("describeCron", () => {
  it("returns human-readable description for valid cron", () => {
    const result = describeCron("0 9 * * *");
    expect(result).toBe("At 09:00 AM");
  });

  it("returns error message for invalid cron", () => {
    const result = describeCron("invalid");
    expect(result).toBe("Invalid cron expression");
  });

  it("returns description for other valid cron expressions", () => {
    const result = describeCron("*/5 * * * *");
    expect(result).toBe("Cron: */5 * * * *");
  });
});
