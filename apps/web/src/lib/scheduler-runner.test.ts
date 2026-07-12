import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockInvoke = vi.fn();
const mockIsTauri = vi.fn(() => false);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  isTauri: () => mockIsTauri(),
}));

const mockLoadSchedulerTree = vi.fn();
const mockLoadSchedule = vi.fn();
const mockSaveSchedule = vi.fn();

vi.mock("@/lib/storage", () => ({
  loadSchedulerTree: (...args: unknown[]) => mockLoadSchedulerTree(...args),
  loadSchedule: (...args: unknown[]) => mockLoadSchedule(...args),
  saveSchedule: (...args: unknown[]) => mockSaveSchedule(...args),
}));

const mockListWorkflows = vi.fn();
const mockLoadWorkflow = vi.fn();
const mockRunWorkflow = vi.fn();

vi.mock("@/lib/workflows/run-workflow", () => ({
  listWorkflows: (...args: unknown[]) => mockListWorkflows(...args),
  loadWorkflow: (...args: unknown[]) => mockLoadWorkflow(...args),
  runWorkflow: (...args: unknown[]) => mockRunWorkflow(...args),
}));

const mockCreateConversationInBackground = vi.fn();
const mockSendMessageToConversation = vi.fn();

vi.mock("@/stores/chat-store", () => ({
  useChatStore: {
    getState: () => ({
      createConversationInBackground: mockCreateConversationInBackground,
      sendMessageToConversation: mockSendMessageToConversation,
    }),
  },
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------

import {
  startSchedulerRunner,
  stopSchedulerRunner,
  runScheduleNow,
} from "./scheduler-runner";
import type { ScheduleData, SchedulerTreeNode } from "@/lib/storage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSchedule(overrides: Partial<ScheduleData> = {}): ScheduleData {
  return {
    id: "sched-1",
    name: "Test Schedule",
    cron: "0 * * * *", // every hour
    agentId: "agent-1",
    prompt: "Do something",
    enabled: true,
    hasError: false,
    lastRun: null,
    nextRun: new Date(Date.now() - 60_000).toISOString(), // 1 min in the past
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTree(nodes: SchedulerTreeNode[]): SchedulerTreeNode[] {
  return nodes;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("scheduler-runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockIsTauri.mockReturnValue(false);
    mockInvoke.mockResolvedValue(undefined);
    mockSaveSchedule.mockResolvedValue(undefined);
    mockCreateConversationInBackground.mockResolvedValue({ id: "conv-1" });
    mockSendMessageToConversation.mockResolvedValue(undefined);
    mockListWorkflows.mockResolvedValue([]);
    mockLoadWorkflow.mockResolvedValue(null);
    mockRunWorkflow.mockResolvedValue({ stepOutputs: [] });
  });

  afterEach(() => {
    stopSchedulerRunner();
    vi.useRealTimers();
  });

  // =========================================================================
  // Scheduled workflow discovery
  // =========================================================================
  describe("scheduled workflow discovery", () => {
    it("picks up a newly saved workflow without a restart and runs it when due", async () => {
      vi.setSystemTime(new Date("2026-07-11T08:00:30Z"));
      mockLoadSchedulerTree.mockResolvedValue([]);

      startSchedulerRunner(60_000);
      // Initial tick: toolbox has no workflows yet.
      await vi.advanceTimersByTimeAsync(0);
      expect(mockRunWorkflow).not.toHaveBeenCalled();

      // A workflow with an every-minute cron is written between ticks
      // (e.g. by the agent's write_toolbox_item) — no restart happens.
      const workflow = {
        name: "brief",
        trigger: { schedule: "* * * * *" },
        steps: [{ prompt: "go" }],
      };
      mockListWorkflows.mockResolvedValue(["brief"]);
      mockLoadWorkflow.mockResolvedValue(workflow);

      // Next tick: first sighting seeds nextRun but must not fire immediately.
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockRunWorkflow).not.toHaveBeenCalled();

      // Following tick: the seeded cron time has passed — the workflow runs.
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockRunWorkflow).toHaveBeenCalledWith(workflow);
    });

    it("ignores workflows without a trigger.schedule", async () => {
      mockLoadSchedulerTree.mockResolvedValue([]);
      mockListWorkflows.mockResolvedValue(["manual"]);
      mockLoadWorkflow.mockResolvedValue({ name: "manual", steps: [{ prompt: "go" }] });

      startSchedulerRunner(60_000);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(120_000);

      expect(mockRunWorkflow).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // startSchedulerRunner / stopSchedulerRunner
  // =========================================================================
  describe("startSchedulerRunner / stopSchedulerRunner", () => {
    it("should set up a repeating interval and fire an initial tick", () => {
      mockLoadSchedulerTree.mockResolvedValue([]);

      startSchedulerRunner(5000);

      // The initial tick should have been called
      expect(mockLoadSchedulerTree).toHaveBeenCalledTimes(1);
    });

    it("should not create multiple intervals when called twice", () => {
      mockLoadSchedulerTree.mockResolvedValue([]);

      startSchedulerRunner(5000);
      startSchedulerRunner(5000);

      // Only one initial tick
      expect(mockLoadSchedulerTree).toHaveBeenCalledTimes(1);
    });

    it("stopSchedulerRunner should stop the timer so future ticks do not fire", async () => {
      mockLoadSchedulerTree.mockResolvedValue([]);

      startSchedulerRunner(1000);
      // Flush the initial tick's promise
      await vi.advanceTimersByTimeAsync(0);

      stopSchedulerRunner();

      mockLoadSchedulerTree.mockClear();
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockLoadSchedulerTree).not.toHaveBeenCalled();
    });

    it("stopSchedulerRunner is safe to call when not started", () => {
      expect(() => stopSchedulerRunner()).not.toThrow();
    });

    it("should fire tick on each interval", async () => {
      mockLoadSchedulerTree.mockResolvedValue([]);

      startSchedulerRunner(1000);
      // Flush the initial immediate tick
      await vi.advanceTimersByTimeAsync(0);
      expect(mockLoadSchedulerTree).toHaveBeenCalledTimes(1);

      // After 1s, the interval fires again
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockLoadSchedulerTree).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // runScheduleNow
  // =========================================================================
  describe("runScheduleNow", () => {
    it("should return null if schedule not found", async () => {
      mockLoadSchedule.mockResolvedValue(null);

      const result = await runScheduleNow("/path/to/schedule.yaml");
      expect(result).toBeNull();
    });

    it("should execute schedule and return result with conversationId", async () => {
      const schedule = makeSchedule();
      mockLoadSchedule.mockResolvedValue(schedule);

      const result = await runScheduleNow("/scheduler/sched-1.yaml");

      expect(result).not.toBeNull();
      expect(result!.conversationId).toBe("conv-1");
      expect(typeof result!.startedAt).toBe("string");
    });

    it("should call createConversationInBackground with schedule name as title", async () => {
      const schedule = makeSchedule({ name: "My Schedule" });
      mockLoadSchedule.mockResolvedValue(schedule);

      await runScheduleNow("/scheduler/sched-1.yaml");

      expect(mockCreateConversationInBackground).toHaveBeenCalledWith({
        title: "My Schedule",
      });
    });

    it("should use default title if schedule name is empty/blank", async () => {
      const schedule = makeSchedule({ name: "   " });
      mockLoadSchedule.mockResolvedValue(schedule);

      await runScheduleNow("/scheduler/sched-1.yaml");

      expect(mockCreateConversationInBackground).toHaveBeenCalledWith({
        title: "Scheduled Run",
      });
    });

    it("should send the prompt to the conversation", async () => {
      const schedule = makeSchedule({ prompt: "Run my report" });
      mockLoadSchedule.mockResolvedValue(schedule);

      await runScheduleNow("/scheduler/sched-1.yaml");

      expect(mockSendMessageToConversation).toHaveBeenCalledWith(
        "conv-1",
        "Run my report",
        expect.objectContaining({
          agentId: "agent-1",
          allowAutoRename: false,
          setStreaming: false,
        })
      );
    });

    it("should invoke onConversationCreated callback", async () => {
      const schedule = makeSchedule();
      mockLoadSchedule.mockResolvedValue(schedule);
      const onCreated = vi.fn();

      await runScheduleNow("/scheduler/sched-1.yaml", {
        onConversationCreated: onCreated,
      });

      expect(onCreated).toHaveBeenCalledWith("conv-1");
    });

    it("should return null conversationId when prompt is empty (manual run)", async () => {
      const schedule = makeSchedule({ prompt: "   " });
      mockLoadSchedule.mockResolvedValue(schedule);

      const result = await runScheduleNow("/scheduler/sched-1.yaml");

      expect(result).not.toBeNull();
      expect(result!.conversationId).toBeNull();
      // Should not call markScheduleError for manual runs with empty prompt
      // Only non-manual runs set errors for empty prompts
    });

    it("should save updated schedule with lastRun and nextRun", async () => {
      const schedule = makeSchedule({ enabled: true });
      mockLoadSchedule.mockResolvedValue(schedule);

      await runScheduleNow("/scheduler/sched-1.yaml");

      expect(mockSaveSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          lastRun: expect.any(String),
          hasError: false,
        }),
        "/scheduler"
      );
    });

    it("should handle errors from sendMessageToConversation gracefully", async () => {
      const schedule = makeSchedule();
      mockLoadSchedule.mockResolvedValue(schedule);
      mockSendMessageToConversation.mockRejectedValue(new Error("Send failed"));

      const result = await runScheduleNow("/scheduler/sched-1.yaml");

      expect(result).not.toBeNull();
      expect(result!.conversationId).toBeNull();
      // Should have saved error state
      expect(mockSaveSchedule).toHaveBeenCalledTimes(2); // initial save + error save
    });
  });

  // =========================================================================
  // runSchedulerTick (tested indirectly through startSchedulerRunner)
  // =========================================================================
  describe("scheduler tick logic", () => {
    it("should execute schedules that are due", async () => {
      const schedule = makeSchedule({
        nextRun: new Date(Date.now() - 1000).toISOString(),
      });
      const tree: SchedulerTreeNode[] = [
        { type: "schedule", id: "sched-1", name: "Test", path: "/scheduler/sched-1.yaml", isPinned: false },
      ];

      mockLoadSchedulerTree.mockResolvedValue(tree);
      mockLoadSchedule.mockResolvedValue(schedule);

      startSchedulerRunner(60000);
      // Flush the tick
      await vi.advanceTimersByTimeAsync(0);
      // Allow promises in the tick to resolve
      await vi.advanceTimersByTimeAsync(0);

      expect(mockCreateConversationInBackground).toHaveBeenCalled();
    });

    it("should not execute schedules that are not yet due", async () => {
      const schedule = makeSchedule({
        nextRun: new Date(Date.now() + 3600_000).toISOString(), // 1 hour from now
      });
      const tree: SchedulerTreeNode[] = [
        { type: "schedule", id: "sched-1", name: "Test", path: "/scheduler/sched-1.yaml", isPinned: false },
      ];

      mockLoadSchedulerTree.mockResolvedValue(tree);
      mockLoadSchedule.mockResolvedValue(schedule);

      startSchedulerRunner(60000);
      await vi.advanceTimersByTimeAsync(0);

      expect(mockCreateConversationInBackground).not.toHaveBeenCalled();
    });

    it("should skip null schedules", async () => {
      const tree: SchedulerTreeNode[] = [
        { type: "schedule", id: "sched-1", name: "Test", path: "/scheduler/sched-1.yaml", isPinned: false },
      ];

      mockLoadSchedulerTree.mockResolvedValue(tree);
      mockLoadSchedule.mockResolvedValue(null);

      startSchedulerRunner(60000);
      await vi.advanceTimersByTimeAsync(0);

      expect(mockCreateConversationInBackground).not.toHaveBeenCalled();
    });

    it("should handle disabled schedules by normalizing them", async () => {
      const schedule = makeSchedule({
        enabled: false,
        nextRun: "2025-01-01T00:00:00.000Z",
      });
      const tree: SchedulerTreeNode[] = [
        { type: "schedule", id: "sched-1", name: "Test", path: "/scheduler/sched-1.yaml", isPinned: false },
      ];

      mockLoadSchedulerTree.mockResolvedValue(tree);
      mockLoadSchedule.mockResolvedValue(schedule);

      startSchedulerRunner(60000);
      await vi.advanceTimersByTimeAsync(0);

      // It should save with nextRun set to null (normalizing disabled schedule)
      expect(mockSaveSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ nextRun: null }),
        "/scheduler"
      );
      expect(mockCreateConversationInBackground).not.toHaveBeenCalled();
    });

    it("should normalize enabled schedules with no nextRun", async () => {
      const schedule = makeSchedule({
        enabled: true,
        nextRun: null,
      });
      const tree: SchedulerTreeNode[] = [
        { type: "schedule", id: "sched-1", name: "Test", path: "/scheduler/sched-1.yaml", isPinned: false },
      ];

      mockLoadSchedulerTree.mockResolvedValue(tree);
      mockLoadSchedule.mockResolvedValue(schedule);

      startSchedulerRunner(60000);
      await vi.advanceTimersByTimeAsync(0);

      // normalizeSchedule should have computed nextRun and saved
      expect(mockSaveSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          nextRun: expect.any(String),
        }),
        "/scheduler"
      );
    });

    it("should walk nested folders to find schedules", async () => {
      const schedule = makeSchedule({
        nextRun: new Date(Date.now() - 1000).toISOString(),
      });

      const tree: SchedulerTreeNode[] = [
        {
          type: "folder",
          id: "folder-1",
          name: "MyFolder",
          path: "/scheduler/folder-1",
          isPinned: false,
          children: [
            {
              type: "schedule",
              id: "sched-1",
              name: "Nested",
              path: "/scheduler/folder-1/sched-1.yaml",
              isPinned: false,
            },
          ],
        },
      ];

      mockLoadSchedulerTree.mockResolvedValue(tree);
      mockLoadSchedule.mockResolvedValue(schedule);

      startSchedulerRunner(60000);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      expect(mockLoadSchedule).toHaveBeenCalledWith("/scheduler/folder-1/sched-1.yaml");
    });

    it("should mark error for invalid nextRun timestamp", async () => {
      const schedule = makeSchedule({
        enabled: true,
        nextRun: "invalid-date",
      });
      const tree: SchedulerTreeNode[] = [
        { type: "schedule", id: "sched-1", name: "Test", path: "/scheduler/sched-1.yaml", isPinned: false },
      ];

      mockLoadSchedulerTree.mockResolvedValue(tree);
      mockLoadSchedule.mockResolvedValue(schedule);

      startSchedulerRunner(60000);
      await vi.advanceTimersByTimeAsync(0);

      // normalizeSchedule should be called since nextRun is invalid
      // It will compute a new nextRun
      expect(mockSaveSchedule).toHaveBeenCalled();
    });

    it("should handle tick errors gracefully", async () => {
      mockLoadSchedulerTree.mockRejectedValue(new Error("Tree load failed"));

      startSchedulerRunner(60000);
      // Should not throw, just log
      await vi.advanceTimersByTimeAsync(0);

      // Can still fire subsequent ticks
      mockLoadSchedulerTree.mockResolvedValue([]);
      await vi.advanceTimersByTimeAsync(60000);
      expect(mockLoadSchedulerTree).toHaveBeenCalledTimes(2);
    });

    it("should mark schedule error for auto-run with empty prompt", async () => {
      const schedule = makeSchedule({
        prompt: "",
        nextRun: new Date(Date.now() - 1000).toISOString(),
      });
      const tree: SchedulerTreeNode[] = [
        { type: "schedule", id: "sched-1", name: "Test", path: "/scheduler/sched-1.yaml", isPinned: false },
      ];

      mockLoadSchedulerTree.mockResolvedValue(tree);
      mockLoadSchedule.mockResolvedValue(schedule);

      startSchedulerRunner(60000);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      // Should have saved error state for empty prompt on auto (non-manual) run
      expect(mockSaveSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ hasError: true }),
        "/scheduler"
      );
    });

    it("should not mark error for invalid cron on manual run", async () => {
      const schedule = makeSchedule({
        enabled: true,
        cron: "invalid-cron",
      });
      mockLoadSchedule.mockResolvedValue(schedule);

      // Manual run via runScheduleNow
      const result = await runScheduleNow("/scheduler/sched-1.yaml");

      // Manual run with invalid cron should still proceed
      // (computeNextRun returns null, but manual runs don't care)
      expect(result).not.toBeNull();
    });

    it("should mark error for invalid cron on auto run", async () => {
      const schedule = makeSchedule({
        enabled: true,
        cron: "invalid-cron",
        nextRun: new Date(Date.now() - 1000).toISOString(),
      });
      const tree: SchedulerTreeNode[] = [
        { type: "schedule", id: "sched-1", name: "Test", path: "/scheduler/sched-1.yaml", isPinned: false },
      ];

      mockLoadSchedulerTree.mockResolvedValue(tree);
      mockLoadSchedule.mockResolvedValue(schedule);

      startSchedulerRunner(60000);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      // Should have saved schedule with hasError: true for invalid cron
      expect(mockSaveSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ hasError: true }),
        "/scheduler"
      );
    });
  });

  // =========================================================================
  // appendSchedulerLog
  // =========================================================================
  describe("appendSchedulerLog (via execution)", () => {
    it("should call invoke to append log when in Tauri", async () => {
      mockIsTauri.mockReturnValue(true);
      const schedule = makeSchedule();
      mockLoadSchedule.mockResolvedValue(schedule);

      await runScheduleNow("/scheduler/sched-1.yaml");

      expect(mockInvoke).toHaveBeenCalledWith(
        "append_log_file",
        expect.objectContaining({ filename: "scheduler.txt" })
      );
    });

    it("should not call invoke when not in Tauri", async () => {
      mockIsTauri.mockReturnValue(false);
      const schedule = makeSchedule();
      mockLoadSchedule.mockResolvedValue(schedule);

      await runScheduleNow("/scheduler/sched-1.yaml");

      expect(mockInvoke).not.toHaveBeenCalledWith(
        "append_log_file",
        expect.anything()
      );
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe("edge cases", () => {
    it("collectSchedulePaths handles empty tree", async () => {
      mockLoadSchedulerTree.mockResolvedValue([]);

      startSchedulerRunner(60000);
      await vi.advanceTimersByTimeAsync(0);

      expect(mockLoadSchedule).not.toHaveBeenCalled();
    });

    it("collectSchedulePaths ignores folders with no children", async () => {
      const tree: SchedulerTreeNode[] = [
        {
          type: "folder",
          id: "folder-1",
          name: "Empty",
          path: "/scheduler/folder-1",
          isPinned: false,
          // No children property
        },
      ];

      mockLoadSchedulerTree.mockResolvedValue(tree);

      startSchedulerRunner(60000);
      await vi.advanceTimersByTimeAsync(0);

      expect(mockLoadSchedule).not.toHaveBeenCalled();
    });

    it("disabled schedule with null nextRun does not save unnecessarily", async () => {
      const schedule = makeSchedule({
        enabled: false,
        nextRun: null,
      });
      const tree: SchedulerTreeNode[] = [
        { type: "schedule", id: "sched-1", name: "Test", path: "/scheduler/sched-1.yaml", isPinned: false },
      ];

      mockLoadSchedulerTree.mockResolvedValue(tree);
      mockLoadSchedule.mockResolvedValue(schedule);

      startSchedulerRunner(60000);
      await vi.advanceTimersByTimeAsync(0);

      // nextRun is already null, so normalizeSchedule should not save
      expect(mockSaveSchedule).not.toHaveBeenCalled();
    });
  });
});
