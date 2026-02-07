import { v4 as uuid } from "uuid";
import type { ToolCategory } from "./categories";
import { createSingleton } from "@/lib/utils";

// ============================================================================
// Execution Record Types
// ============================================================================

export type ExecutionStatus =
  | "queued"
  | "pending_confirmation"
  | "executing"
  | "success"
  | "error"
  | "cancelled"
  | "timeout";

export interface ToolExecutionRecord {
  id: string;
  toolName: string;
  category: ToolCategory;
  arguments: Record<string, unknown>;

  // Timing
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;

  // Status
  status: ExecutionStatus;

  // Results
  result: string | null;
  error: string | null;

  // Context
  conversationId: string;
  iterationId: string | null;
  agentId: string | null;

  // Undo
  undoAvailable: boolean;
  undoOperationId: string | null;
}

// ============================================================================
// Execution Tracker
// ============================================================================

class ExecutionTracker {
  private records: Map<string, ToolExecutionRecord> = new Map();
  private maxRecords = 1000; // Keep last 1000 records

  // ============================================================================
  // Record Management
  // ============================================================================

  /**
   * Create a new execution record
   */
  createRecord(params: {
    toolName: string;
    category: ToolCategory;
    arguments: Record<string, unknown>;
    conversationId: string;
    iterationId?: string;
    agentId?: string;
  }): ToolExecutionRecord {
    const id = uuid();
    const now = new Date();

    const record: ToolExecutionRecord = {
      id,
      toolName: params.toolName,
      category: params.category,
      arguments: params.arguments,
      queuedAt: now,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      status: "queued",
      result: null,
      error: null,
      conversationId: params.conversationId,
      iterationId: params.iterationId || null,
      agentId: params.agentId || null,
      undoAvailable: false,
      undoOperationId: null,
    };

    this.records.set(id, record);
    this.pruneOldRecords();

    return record;
  }

  /**
   * Update record status to pending confirmation
   */
  markPendingConfirmation(id: string): void {
    const record = this.records.get(id);
    if (record) {
      record.status = "pending_confirmation";
    }
  }

  /**
   * Update record status to executing
   */
  markExecuting(id: string): void {
    const record = this.records.get(id);
    if (record) {
      record.status = "executing";
      record.startedAt = new Date();
    }
  }

  /**
   * Mark execution as successful
   */
  markSuccess(id: string, result: string): void {
    this.completeRecord(id, "success", { result });
  }

  /**
   * Mark execution as failed
   */
  markError(id: string, error: string): void {
    this.completeRecord(id, "error", { error });
  }

  /**
   * Mark execution as cancelled
   */
  markCancelled(id: string, reason?: string): void {
    this.completeRecord(id, "cancelled", { error: reason || "Cancelled by user" });
  }

  /**
   * Mark execution as timed out
   */
  markTimeout(id: string): void {
    this.completeRecord(id, "timeout", { error: "Execution timed out" });
  }

  private completeRecord(
    id: string,
    status: ExecutionStatus,
    data: { result?: string; error?: string },
  ): void {
    const record = this.records.get(id);
    if (!record) return;
    record.status = status;
    if (data.result !== undefined) record.result = data.result;
    if (data.error !== undefined) record.error = data.error;
    record.completedAt = new Date();
    if (record.startedAt) {
      record.durationMs = record.completedAt.getTime() - record.startedAt.getTime();
    }
  }

  /**
   * Set undo availability
   */
  setUndoAvailable(id: string, undoOperationId: string): void {
    const record = this.records.get(id);
    if (record) {
      record.undoAvailable = true;
      record.undoOperationId = undoOperationId;
    }
  }

  /**
   * Mark undo as no longer available
   */
  clearUndoAvailable(id: string): void {
    const record = this.records.get(id);
    if (record) {
      record.undoAvailable = false;
    }
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get a record by ID
   */
  getRecord(id: string): ToolExecutionRecord | null {
    return this.records.get(id) || null;
  }

  /**
   * Get all records sorted by queuedAt descending
   */
  getAllRecords(): ToolExecutionRecord[] {
    return Array.from(this.records.values())
      .sort((a, b) => b.queuedAt.getTime() - a.queuedAt.getTime());
  }

  private filterRecords(predicate: (r: ToolExecutionRecord) => boolean): ToolExecutionRecord[] {
    const results: ToolExecutionRecord[] = [];
    for (const record of this.records.values()) {
      if (predicate(record)) results.push(record);
    }
    return results.sort((a, b) => b.queuedAt.getTime() - a.queuedAt.getTime());
  }

  /**
   * Get records by conversation
   */
  getByConversation(conversationId: string): ToolExecutionRecord[] {
    return this.filterRecords(r => r.conversationId === conversationId);
  }

  /**
   * Get records by status
   */
  getByStatus(status: ExecutionStatus): ToolExecutionRecord[] {
    return this.filterRecords(r => r.status === status);
  }

  /**
   * Get records by category
   */
  getByCategory(category: ToolCategory): ToolExecutionRecord[] {
    return this.filterRecords(r => r.category === category);
  }

  /**
   * Get records by tool name
   */
  getByToolName(toolName: string): ToolExecutionRecord[] {
    return this.filterRecords(r => r.toolName === toolName);
  }

  /**
   * Get records with undo available
   */
  getUndoAvailable(): ToolExecutionRecord[] {
    return this.filterRecords(r => r.undoAvailable);
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get execution statistics
   */
  getStatistics(): ExecutionStatistics {
    const records = this.getAllRecords();
    const completed = records.filter(r => r.completedAt !== null);
    const durations = completed
      .map(r => r.durationMs)
      .filter((d): d is number => d !== null);

    const byStatus: Record<ExecutionStatus, number> = {
      queued: 0,
      pending_confirmation: 0,
      executing: 0,
      success: 0,
      error: 0,
      cancelled: 0,
      timeout: 0,
    };

    const byCategory: Partial<Record<ToolCategory, number>> = {};
    const byTool: Record<string, number> = {};

    for (const record of records) {
      byStatus[record.status]++;
      byCategory[record.category] = (byCategory[record.category] || 0) + 1;
      byTool[record.toolName] = (byTool[record.toolName] || 0) + 1;
    }

    return {
      total: records.length,
      byStatus,
      byCategory: byCategory as Record<ToolCategory, number>,
      byTool,
      averageDurationMs: durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : null,
      maxDurationMs: durations.length > 0 ? Math.max(...durations) : null,
      minDurationMs: durations.length > 0 ? Math.min(...durations) : null,
      successRate: completed.length > 0
        ? byStatus.success / completed.length
        : null,
    };
  }

  // ============================================================================
  // Export
  // ============================================================================

  /**
   * Export records as JSON
   */
  exportAsJson(records?: ToolExecutionRecord[]): string {
    const data = records || this.getAllRecords();
    return JSON.stringify(data, null, 2);
  }

  /**
   * Export records as CSV
   */
  exportAsCsv(records?: ToolExecutionRecord[]): string {
    const data = records || this.getAllRecords();
    const headers = [
      "id",
      "toolName",
      "category",
      "status",
      "queuedAt",
      "startedAt",
      "completedAt",
      "durationMs",
      "conversationId",
      "agentId",
      "undoAvailable",
    ];

    const rows = data.map(r => [
      r.id,
      r.toolName,
      r.category,
      r.status,
      r.queuedAt.toISOString(),
      r.startedAt?.toISOString() || "",
      r.completedAt?.toISOString() || "",
      r.durationMs?.toString() || "",
      r.conversationId,
      r.agentId || "",
      r.undoAvailable.toString(),
    ]);

    return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  private pruneOldRecords(): void {
    if (this.records.size <= this.maxRecords) return;

    // Find the oldest records to remove without sorting all records.
    // Collect all entries, partial-sort to find the ones to remove.
    const entries = Array.from(this.records.entries());
    // Sort ascending by queuedAt so oldest are first
    entries.sort((a, b) => a[1].queuedAt.getTime() - b[1].queuedAt.getTime());
    const removeCount = entries.length - this.maxRecords;
    for (let i = 0; i < removeCount; i++) {
      this.records.delete(entries[i][0]);
    }
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.records.clear();
  }

  /**
   * Clear records older than a certain date
   */
  clearOlderThan(date: Date): number {
    let count = 0;
    for (const [id, record] of this.records) {
      if (record.queuedAt < date) {
        this.records.delete(id);
        count++;
      }
    }
    return count;
  }
}

// ============================================================================
// Statistics Types
// ============================================================================

export interface ExecutionStatistics {
  total: number;
  byStatus: Record<ExecutionStatus, number>;
  byCategory: Record<ToolCategory, number>;
  byTool: Record<string, number>;
  averageDurationMs: number | null;
  maxDurationMs: number | null;
  minDurationMs: number | null;
  successRate: number | null;
}

// ============================================================================
// Singleton Instance
// ============================================================================

const executionTrackerSingleton = createSingleton(
  () => new ExecutionTracker(),
  (instance) => instance.clear(),
);

export const getExecutionTracker = executionTrackerSingleton.get;
export const resetExecutionTracker = executionTrackerSingleton.reset;

// Export class for testing
export { ExecutionTracker };
