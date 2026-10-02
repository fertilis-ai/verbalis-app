import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  isLoggingEnabled: vi.fn(() => false),
}));

// Mock chat store
const mockCreateConversationInBackground = vi.fn();
const mockSendMessageToConversation = vi.fn();

vi.mock("@/stores/chat-store", () => ({
  useChatStore: {
    getState: vi.fn(() => ({
      createConversationInBackground: mockCreateConversationInBackground,
      sendMessageToConversation: mockSendMessageToConversation,
    })),
  },
}));

import { executeTask } from "./task-runner";
import type { TaskData } from "@/lib/storage";
import { isLoggingEnabled } from "@/lib/logger";
import { invoke, isTauri } from "@tauri-apps/api/core";

const mockIsLoggingEnabled = vi.mocked(isLoggingEnabled);
const mockIsTauri = vi.mocked(isTauri);

function makeTask(overrides?: Partial<TaskData>): TaskData {
  return {
    id: "task-1",
    title: "Test Task",
    description: "Do something useful",
    agent: "default",
    outputFolder: "/output",
    resultStatus: null,
    stage: "queued",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  } as TaskData;
}

describe("task-runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoggingEnabled.mockReturnValue(false);
    mockIsTauri.mockReturnValue(false);
    mockCreateConversationInBackground.mockResolvedValue({ id: "conv-123", title: "Task Run", messages: [], createdAt: new Date(), updatedAt: new Date() });
    mockSendMessageToConversation.mockResolvedValue(undefined);
  });

  describe("executeTask", () => {
    it("creates a conversation and sends the task description as a message", async () => {
      const task = makeTask();
      const result = await executeTask(task);

      expect(result).toEqual({ conversationId: "conv-123", success: true });
      expect(mockCreateConversationInBackground).toHaveBeenCalledWith({
        title: "Test Task",
      });
      expect(mockSendMessageToConversation).toHaveBeenCalledWith(
        "conv-123",
        "Do something useful",
        expect.objectContaining({ agentId: "default", allowAutoRename: false, setStreaming: false })
      );
    });

    it("returns failure for empty description", async () => {
      const task = makeTask({ description: "" });
      const result = await executeTask(task);

      expect(result).toEqual({ conversationId: null, success: false });
      expect(mockCreateConversationInBackground).not.toHaveBeenCalled();
    });

    it("returns failure for whitespace-only description", async () => {
      const task = makeTask({ description: "   " });
      const result = await executeTask(task);

      expect(result).toEqual({ conversationId: null, success: false });
      expect(mockCreateConversationInBackground).not.toHaveBeenCalled();
    });

    it("returns failure for undefined description", async () => {
      const task = makeTask({ description: undefined as unknown as string });
      const result = await executeTask(task);

      expect(result).toEqual({ conversationId: null, success: false });
    });

    it("uses task title as conversation title", async () => {
      const task = makeTask({ title: "My Custom Task" });
      await executeTask(task);

      expect(mockCreateConversationInBackground).toHaveBeenCalledWith({
        title: "My Custom Task",
      });
    });

    it("falls back to 'Task Run' when title is empty", async () => {
      const task = makeTask({ title: "" });
      await executeTask(task);

      expect(mockCreateConversationInBackground).toHaveBeenCalledWith({
        title: "Task Run",
      });
    });

    it("calls onConversationCreated callback with conversation id", async () => {
      const task = makeTask();
      const onCreated = vi.fn();

      await executeTask(task, { onConversationCreated: onCreated });

      expect(onCreated).toHaveBeenCalledWith("conv-123");
    });

    it("works without options", async () => {
      const task = makeTask();
      const result = await executeTask(task);

      expect(result.success).toBe(true);
    });

    it("passes agent id from task to sendMessageToConversation", async () => {
      const task = makeTask({ agent: "code-agent" });
      await executeTask(task);

      expect(mockSendMessageToConversation).toHaveBeenCalledWith(
        "conv-123",
        "Do something useful",
        expect.objectContaining({ agentId: "code-agent" })
      );
    });

    it("returns failure when createConversationInBackground throws", async () => {
      mockCreateConversationInBackground.mockRejectedValueOnce(new Error("Storage full"));

      const task = makeTask();
      const result = await executeTask(task);

      expect(result).toEqual({ conversationId: null, success: false });
    });

    it("returns failure when sendMessageToConversation throws", async () => {
      mockSendMessageToConversation.mockRejectedValueOnce(new Error("LLM timeout"));

      const task = makeTask();
      const result = await executeTask(task);

      expect(result).toEqual({ conversationId: null, success: false });
    });

    it("trims whitespace from description before sending", async () => {
      const task = makeTask({ description: "  trimmed message  " });
      await executeTask(task);

      expect(mockSendMessageToConversation).toHaveBeenCalledWith(
        "conv-123",
        "trimmed message",
        expect.any(Object)
      );
    });
  });

  describe("logging", () => {
    it("does not log when logging is disabled", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      mockIsLoggingEnabled.mockReturnValue(false);

      const task = makeTask();
      await executeTask(task);

      expect(invoke).not.toHaveBeenCalled();
    });

    it("does not log when not in Tauri", async () => {
      mockIsLoggingEnabled.mockReturnValue(true);
      mockIsTauri.mockReturnValue(false);

      const task = makeTask();
      await executeTask(task);

      expect(invoke).not.toHaveBeenCalled();
    });

    it("writes the start and completion lines to tasks.txt", async () => {
      mockIsLoggingEnabled.mockReturnValue(true);
      mockIsTauri.mockReturnValue(true);
      vi.mocked(invoke).mockResolvedValue(undefined);

      await executeTask(makeTask());

      expect(vi.mocked(invoke).mock.calls).toEqual([
        ["append_log_file", { filename: "tasks.txt", line: expect.stringMatching(/^\[.+\] Starting task "Test Task" \(task-1\)$/) }],
        ["append_log_file", { filename: "tasks.txt", line: expect.stringMatching(/^\[.+\] Completed task "Test Task" \(task-1\)$/) }],
      ]);
    });

    it("writes the error line when the run fails", async () => {
      mockIsLoggingEnabled.mockReturnValue(true);
      mockIsTauri.mockReturnValue(true);
      vi.mocked(invoke).mockResolvedValue(undefined);
      mockSendMessageToConversation.mockRejectedValue(new Error("boom"));

      await executeTask(makeTask());

      expect(vi.mocked(invoke)).toHaveBeenLastCalledWith("append_log_file", {
        filename: "tasks.txt",
        line: expect.stringMatching(/^\[.+\] Error in task "Test Task": Error: boom$/),
      });
    });

    it("logs a skipped task with an empty description", async () => {
      mockIsLoggingEnabled.mockReturnValue(true);
      mockIsTauri.mockReturnValue(true);
      vi.mocked(invoke).mockResolvedValue(undefined);

      await executeTask(makeTask({ description: "  " }));

      expect(vi.mocked(invoke)).toHaveBeenCalledWith("append_log_file", {
        filename: "tasks.txt",
        line: expect.stringMatching(/^\[.+\] Skipped task "Test Task" \(task-1\) - empty description$/),
      });
    });
  });
});
