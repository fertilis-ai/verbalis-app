import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ExecutionTracker,
  getExecutionTracker,
  resetExecutionTracker,
} from "./execution-tracker";

describe("ExecutionTracker", () => {
  let tracker: ExecutionTracker;

  beforeEach(() => {
    tracker = new ExecutionTracker();
  });

  // ============================================================================
  // createRecord
  // ============================================================================

  describe("createRecord", () => {
    it("creates a record with queued status", () => {
      const record = tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: { path: "/tmp/test.txt" },
        conversationId: "conv-1",
      });

      expect(record.status).toBe("queued");
      expect(record.toolName).toBe("read_file");
      expect(record.category).toBe("file_system");
      expect(record.arguments).toEqual({ path: "/tmp/test.txt" });
      expect(record.conversationId).toBe("conv-1");
    });

    it("generates a unique id for each record", () => {
      const r1 = tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });
      const r2 = tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      expect(r1.id).not.toBe(r2.id);
    });

    it("initializes timing fields correctly", () => {
      const record = tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      expect(record.queuedAt).toBeInstanceOf(Date);
      expect(record.startedAt).toBeNull();
      expect(record.completedAt).toBeNull();
      expect(record.durationMs).toBeNull();
    });

    it("initializes result fields as null", () => {
      const record = tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      expect(record.result).toBeNull();
      expect(record.error).toBeNull();
    });

    it("sets optional fields to null when not provided", () => {
      const record = tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      expect(record.iterationId).toBeNull();
      expect(record.agentId).toBeNull();
    });

    it("sets optional fields when provided", () => {
      const record = tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
        iterationId: "iter-1",
        agentId: "agent-1",
      });

      expect(record.iterationId).toBe("iter-1");
      expect(record.agentId).toBe("agent-1");
    });

    it("initializes undo fields as false/null", () => {
      const record = tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      expect(record.undoAvailable).toBe(false);
      expect(record.undoOperationId).toBeNull();
    });
  });

  // ============================================================================
  // Status transitions
  // ============================================================================

  describe("status transitions", () => {
    it("transitions from queued to pending_confirmation", () => {
      const record = tracker.createRecord({
        toolName: "write_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      tracker.markPendingConfirmation(record.id);
      const updated = tracker.getRecord(record.id);
      expect(updated?.status).toBe("pending_confirmation");
    });

    it("transitions from queued to executing", () => {
      const record = tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      tracker.markExecuting(record.id);
      const updated = tracker.getRecord(record.id);
      expect(updated?.status).toBe("executing");
      expect(updated?.startedAt).toBeInstanceOf(Date);
    });

    it("transitions to success with result", () => {
      const record = tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      tracker.markExecuting(record.id);
      tracker.markSuccess(record.id, "file contents here");

      const updated = tracker.getRecord(record.id);
      expect(updated?.status).toBe("success");
      expect(updated?.result).toBe("file contents here");
      expect(updated?.completedAt).toBeInstanceOf(Date);
      expect(updated?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("transitions to error with error message", () => {
      const record = tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      tracker.markExecuting(record.id);
      tracker.markError(record.id, "File not found");

      const updated = tracker.getRecord(record.id);
      expect(updated?.status).toBe("error");
      expect(updated?.error).toBe("File not found");
      expect(updated?.completedAt).toBeInstanceOf(Date);
    });

    it("transitions to cancelled with default reason", () => {
      const record = tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      tracker.markCancelled(record.id);
      const updated = tracker.getRecord(record.id);
      expect(updated?.status).toBe("cancelled");
      expect(updated?.error).toBe("Cancelled by user");
    });

    it("transitions to cancelled with custom reason", () => {
      const record = tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      tracker.markCancelled(record.id, "Guardrail blocked");
      const updated = tracker.getRecord(record.id);
      expect(updated?.status).toBe("cancelled");
      expect(updated?.error).toBe("Guardrail blocked");
    });

    it("transitions to timeout", () => {
      const record = tracker.createRecord({
        toolName: "shell_execute",
        category: "system",
        arguments: {},
        conversationId: "conv-1",
      });

      tracker.markExecuting(record.id);
      tracker.markTimeout(record.id);

      const updated = tracker.getRecord(record.id);
      expect(updated?.status).toBe("timeout");
      expect(updated?.error).toBe("Execution timed out");
    });

    it("calculates durationMs when startedAt is set", () => {
      const record = tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      tracker.markExecuting(record.id);
      // Small delay to ensure measurable duration
      tracker.markSuccess(record.id, "ok");

      const updated = tracker.getRecord(record.id);
      expect(updated?.durationMs).not.toBeNull();
      expect(typeof updated?.durationMs).toBe("number");
    });

    it("durationMs is null when completed without startedAt", () => {
      const record = tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      // Complete without first marking as executing (no startedAt)
      tracker.markCancelled(record.id);

      const updated = tracker.getRecord(record.id);
      expect(updated?.durationMs).toBeNull();
    });

    it("ignores operations on non-existent record IDs", () => {
      // These should not throw
      tracker.markPendingConfirmation("non-existent");
      tracker.markExecuting("non-existent");
      tracker.markSuccess("non-existent", "result");
      tracker.markError("non-existent", "error");
      tracker.markCancelled("non-existent");
      tracker.markTimeout("non-existent");
    });
  });

  // ============================================================================
  // Undo management
  // ============================================================================

  describe("undo management", () => {
    it("sets undo available with operation ID", () => {
      const record = tracker.createRecord({
        toolName: "write_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      tracker.setUndoAvailable(record.id, "undo-op-1");

      const updated = tracker.getRecord(record.id);
      expect(updated?.undoAvailable).toBe(true);
      expect(updated?.undoOperationId).toBe("undo-op-1");
    });

    it("clears undo availability", () => {
      const record = tracker.createRecord({
        toolName: "write_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      tracker.setUndoAvailable(record.id, "undo-op-1");
      tracker.clearUndoAvailable(record.id);

      const updated = tracker.getRecord(record.id);
      expect(updated?.undoAvailable).toBe(false);
    });

    it("ignores undo operations on non-existent IDs", () => {
      tracker.setUndoAvailable("non-existent", "op-1");
      tracker.clearUndoAvailable("non-existent");
      // Should not throw
    });
  });

  // ============================================================================
  // Query methods
  // ============================================================================

  describe("getRecord", () => {
    it("returns record by ID", () => {
      const record = tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      expect(tracker.getRecord(record.id)).toBe(record);
    });

    it("returns null for non-existent ID", () => {
      expect(tracker.getRecord("non-existent")).toBeNull();
    });
  });

  describe("getAllRecords", () => {
    it("returns empty array when no records exist", () => {
      expect(tracker.getAllRecords()).toEqual([]);
    });

    it("returns all records sorted by queuedAt descending", () => {
      const r1 = tracker.createRecord({
        toolName: "tool_a",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });
      const r2 = tracker.createRecord({
        toolName: "tool_b",
        category: "web",
        arguments: {},
        conversationId: "conv-1",
      });

      const all = tracker.getAllRecords();
      expect(all.length).toBe(2);
      // Most recent first
      expect(all[0].queuedAt.getTime()).toBeGreaterThanOrEqual(all[1].queuedAt.getTime());
    });
  });

  describe("getByConversation", () => {
    it("filters records by conversation ID", () => {
      tracker.createRecord({
        toolName: "tool_a",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });
      tracker.createRecord({
        toolName: "tool_b",
        category: "file_system",
        arguments: {},
        conversationId: "conv-2",
      });
      tracker.createRecord({
        toolName: "tool_c",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      const results = tracker.getByConversation("conv-1");
      expect(results.length).toBe(2);
      expect(results.every(r => r.conversationId === "conv-1")).toBe(true);
    });

    it("returns empty array for unknown conversation", () => {
      expect(tracker.getByConversation("unknown")).toEqual([]);
    });
  });

  describe("getByStatus", () => {
    it("filters records by status", () => {
      const r1 = tracker.createRecord({
        toolName: "tool_a",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });
      tracker.createRecord({
        toolName: "tool_b",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      tracker.markExecuting(r1.id);

      const executing = tracker.getByStatus("executing");
      expect(executing.length).toBe(1);
      expect(executing[0].id).toBe(r1.id);

      const queued = tracker.getByStatus("queued");
      expect(queued.length).toBe(1);
    });
  });

  describe("getByCategory", () => {
    it("filters records by category", () => {
      tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });
      tracker.createRecord({
        toolName: "http_fetch",
        category: "web",
        arguments: {},
        conversationId: "conv-1",
      });

      expect(tracker.getByCategory("file_system").length).toBe(1);
      expect(tracker.getByCategory("web").length).toBe(1);
      expect(tracker.getByCategory("system").length).toBe(0);
    });
  });

  describe("getByToolName", () => {
    it("filters records by tool name", () => {
      tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });
      tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-2",
      });
      tracker.createRecord({
        toolName: "write_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      expect(tracker.getByToolName("read_file").length).toBe(2);
      expect(tracker.getByToolName("write_file").length).toBe(1);
      expect(tracker.getByToolName("delete_path").length).toBe(0);
    });
  });

  describe("getUndoAvailable", () => {
    it("returns only records with undo available", () => {
      const r1 = tracker.createRecord({
        toolName: "write_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });
      tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      tracker.setUndoAvailable(r1.id, "undo-op-1");

      const undoable = tracker.getUndoAvailable();
      expect(undoable.length).toBe(1);
      expect(undoable[0].id).toBe(r1.id);
    });
  });

  // ============================================================================
  // Statistics
  // ============================================================================

  describe("getStatistics", () => {
    it("returns zeroed stats when no records exist", () => {
      const stats = tracker.getStatistics();

      expect(stats.total).toBe(0);
      expect(stats.byStatus.queued).toBe(0);
      expect(stats.byStatus.success).toBe(0);
      expect(stats.averageDurationMs).toBeNull();
      expect(stats.maxDurationMs).toBeNull();
      expect(stats.minDurationMs).toBeNull();
      expect(stats.successRate).toBeNull();
    });

    it("counts records by status correctly", () => {
      const r1 = tracker.createRecord({
        toolName: "tool_a",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });
      const r2 = tracker.createRecord({
        toolName: "tool_b",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });
      tracker.createRecord({
        toolName: "tool_c",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      tracker.markExecuting(r1.id);
      tracker.markSuccess(r1.id, "ok");

      tracker.markExecuting(r2.id);
      tracker.markError(r2.id, "fail");

      const stats = tracker.getStatistics();
      expect(stats.total).toBe(3);
      expect(stats.byStatus.success).toBe(1);
      expect(stats.byStatus.error).toBe(1);
      expect(stats.byStatus.queued).toBe(1);
    });

    it("counts records by category", () => {
      tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });
      tracker.createRecord({
        toolName: "http_fetch",
        category: "web",
        arguments: {},
        conversationId: "conv-1",
      });
      tracker.createRecord({
        toolName: "shell_execute",
        category: "system",
        arguments: {},
        conversationId: "conv-1",
      });

      const stats = tracker.getStatistics();
      expect(stats.byCategory.file_system).toBe(1);
      expect(stats.byCategory.web).toBe(1);
      expect(stats.byCategory.system).toBe(1);
    });

    it("counts records by tool name", () => {
      tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });
      tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      const stats = tracker.getStatistics();
      expect(stats.byTool["read_file"]).toBe(2);
    });

    it("calculates success rate correctly", () => {
      const r1 = tracker.createRecord({
        toolName: "tool_a",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });
      const r2 = tracker.createRecord({
        toolName: "tool_b",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });
      const r3 = tracker.createRecord({
        toolName: "tool_c",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      tracker.markExecuting(r1.id);
      tracker.markSuccess(r1.id, "ok");

      tracker.markExecuting(r2.id);
      tracker.markSuccess(r2.id, "ok");

      tracker.markExecuting(r3.id);
      tracker.markError(r3.id, "fail");

      const stats = tracker.getStatistics();
      // 2 success out of 3 completed
      expect(stats.successRate).toBeCloseTo(2 / 3);
    });

    it("calculates duration statistics", () => {
      const r1 = tracker.createRecord({
        toolName: "tool_a",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      tracker.markExecuting(r1.id);
      tracker.markSuccess(r1.id, "ok");

      const stats = tracker.getStatistics();
      expect(stats.averageDurationMs).not.toBeNull();
      expect(stats.maxDurationMs).not.toBeNull();
      expect(stats.minDurationMs).not.toBeNull();
      expect(typeof stats.averageDurationMs).toBe("number");
    });
  });

  // ============================================================================
  // Export methods
  // ============================================================================

  describe("exportAsJson", () => {
    it("exports empty array when no records", () => {
      const json = tracker.exportAsJson();
      expect(JSON.parse(json)).toEqual([]);
    });

    it("exports all records as valid JSON", () => {
      tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: { path: "/test" },
        conversationId: "conv-1",
      });

      const json = tracker.exportAsJson();
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].toolName).toBe("read_file");
    });

    it("exports only provided records when specified", () => {
      const r1 = tracker.createRecord({
        toolName: "tool_a",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });
      tracker.createRecord({
        toolName: "tool_b",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      const json = tracker.exportAsJson([r1]);
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].toolName).toBe("tool_a");
    });
  });

  describe("exportAsCsv", () => {
    it("exports header row when no records", () => {
      const csv = tracker.exportAsCsv();
      const lines = csv.split("\n");
      expect(lines.length).toBe(1);
      expect(lines[0]).toContain("id");
      expect(lines[0]).toContain("toolName");
      expect(lines[0]).toContain("status");
    });

    it("exports records as CSV rows", () => {
      tracker.createRecord({
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      const csv = tracker.exportAsCsv();
      const lines = csv.split("\n");
      expect(lines.length).toBe(2); // header + 1 data row
      expect(lines[1]).toContain("read_file");
      expect(lines[1]).toContain("file_system");
      expect(lines[1]).toContain("queued");
    });
  });

  // ============================================================================
  // Cleanup
  // ============================================================================

  describe("clear", () => {
    it("removes all records", () => {
      tracker.createRecord({
        toolName: "tool_a",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });
      tracker.createRecord({
        toolName: "tool_b",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      tracker.clear();
      expect(tracker.getAllRecords()).toEqual([]);
    });
  });

  describe("clearOlderThan", () => {
    it("removes records older than the given date", () => {
      const r1 = tracker.createRecord({
        toolName: "tool_a",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      // Create a cutoff date slightly in the future
      const cutoff = new Date(Date.now() + 100);

      const removed = tracker.clearOlderThan(cutoff);
      expect(removed).toBe(1);
      expect(tracker.getRecord(r1.id)).toBeNull();
    });

    it("keeps records newer than the given date", () => {
      const cutoff = new Date(Date.now() - 100);

      tracker.createRecord({
        toolName: "tool_a",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      const removed = tracker.clearOlderThan(cutoff);
      expect(removed).toBe(0);
      expect(tracker.getAllRecords().length).toBe(1);
    });

    it("returns count of removed records", () => {
      tracker.createRecord({
        toolName: "tool_a",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });
      tracker.createRecord({
        toolName: "tool_b",
        category: "file_system",
        arguments: {},
        conversationId: "conv-1",
      });

      const cutoff = new Date(Date.now() + 100);
      const removed = tracker.clearOlderThan(cutoff);
      expect(removed).toBe(2);
    });
  });

  // ============================================================================
  // Pruning
  // ============================================================================

  describe("pruning", () => {
    it("limits records to maxRecords (1000)", () => {
      // Create 1005 records
      for (let i = 0; i < 1005; i++) {
        tracker.createRecord({
          toolName: `tool_${i}`,
          category: "file_system",
          arguments: {},
          conversationId: "conv-1",
        });
      }

      expect(tracker.getAllRecords().length).toBe(1000);
    });
  });
});

// ============================================================================
// Singleton exports
// ============================================================================

describe("singleton exports", () => {
  beforeEach(() => {
    resetExecutionTracker();
  });

  it("getExecutionTracker returns an ExecutionTracker instance", () => {
    const tracker = getExecutionTracker();
    expect(tracker).toBeInstanceOf(ExecutionTracker);
  });

  it("getExecutionTracker returns the same instance on subsequent calls", () => {
    const t1 = getExecutionTracker();
    const t2 = getExecutionTracker();
    expect(t1).toBe(t2);
  });

  it("resetExecutionTracker clears and creates a new instance", () => {
    const t1 = getExecutionTracker();
    t1.createRecord({
      toolName: "test",
      category: "file_system",
      arguments: {},
      conversationId: "conv-1",
    });

    resetExecutionTracker();
    const t2 = getExecutionTracker();
    expect(t2).not.toBe(t1);
    expect(t2.getAllRecords()).toEqual([]);
  });
});
