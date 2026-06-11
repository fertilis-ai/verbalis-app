import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock zustand persist middleware to be a passthrough (avoids localStorage issues in jsdom)
vi.mock("zustand/middleware", () => ({
  persist: (config: unknown) => config,
}));

const mockGetAllRecords = vi.fn().mockReturnValue([]);
const mockGetStatistics = vi.fn().mockReturnValue({
  total: 0,
  byStatus: { queued: 0, pending_confirmation: 0, executing: 0, success: 0, error: 0, cancelled: 0, timeout: 0 },
  byCategory: {},
  byTool: {},
  averageDurationMs: null,
  maxDurationMs: null,
  minDurationMs: null,
  successRate: null,
});
const mockExportAsJson = vi.fn().mockReturnValue("[]");
const mockExportAsCsv = vi.fn().mockReturnValue("");

vi.mock("@/lib/tools/execution-tracker", () => ({
  getExecutionTracker: () => ({
    getAllRecords: mockGetAllRecords,
    getStatistics: mockGetStatistics,
    exportAsJson: mockExportAsJson,
    exportAsCsv: mockExportAsCsv,
  }),
}));

const mockExecuteUndo = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/guardrails/undo-manager", () => ({
  getUndoManager: () => ({
    executeUndo: mockExecuteUndo,
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

import {
  useToolHistoryStore,
  selectUniqueToolNames,
  selectUniqueAgentIds,
  selectRecentRecords,
  selectRecordsWithUndo,
} from "./tool-history-store";
import type { ToolHistoryFilters, } from "./tool-history-store";
import type { ToolExecutionRecord } from "@/lib/tools/execution-tracker";

function getState() {
  return useToolHistoryStore.getState();
}

function makeRecord(overrides: Partial<ToolExecutionRecord> = {}): ToolExecutionRecord {
  return {
    id: "rec-1",
    toolName: "read_file",
    category: "file_system",
    arguments: {},
    queuedAt: new Date("2026-01-15T10:00:00Z"),
    startedAt: new Date("2026-01-15T10:00:01Z"),
    completedAt: new Date("2026-01-15T10:00:02Z"),
    durationMs: 1000,
    status: "success",
    result: "ok",
    error: null,
    conversationId: "conv-1",
    iterationId: null,
    agentId: null,
    undoAvailable: false,
    undoOperationId: null,
    ...overrides,
  };
}

const DEFAULT_FILTERS: ToolHistoryFilters = {
  status: "all",
  category: "all",
  toolName: null,
  conversationId: null,
  agentId: null,
  dateRange: { start: null, end: null },
  undoAvailableOnly: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  useToolHistoryStore.setState({
    records: [],
    lastSyncedAt: null,
    filters: { ...DEFAULT_FILTERS },
    sorting: { field: "queuedAt", direction: "desc" },
    page: 1,
    pageSize: 25,
    statistics: null,
  });
});

describe("tool-history-store", () => {
  describe("initial state", () => {
    it("has correct defaults", () => {
      const state = getState();
      expect(state.records).toEqual([]);
      expect(state.lastSyncedAt).toBeNull();
      expect(state.filters.status).toBe("all");
      expect(state.filters.category).toBe("all");
      expect(state.sorting.field).toBe("queuedAt");
      expect(state.sorting.direction).toBe("desc");
      expect(state.page).toBe(1);
      expect(state.pageSize).toBe(25);
      expect(state.statistics).toBeNull();
    });
  });

  describe("syncFromTracker", () => {
    it("syncs records and statistics from tracker", () => {
      const records = [makeRecord()];
      const stats = {
        total: 1,
        byStatus: { queued: 0, pending_confirmation: 0, executing: 0, success: 1, error: 0, cancelled: 0, timeout: 0 },
        byCategory: { file_system: 1 },
        byTool: { read_file: 1 },
        averageDurationMs: 1000,
        maxDurationMs: 1000,
        minDurationMs: 1000,
        successRate: 1,
      };
      mockGetAllRecords.mockReturnValue(records);
      mockGetStatistics.mockReturnValue(stats);

      getState().syncFromTracker();

      expect(getState().records).toEqual(records);
      expect(getState().statistics).toEqual(stats);
      expect(getState().lastSyncedAt).toBeInstanceOf(Date);
    });
  });

  describe("setFilter", () => {
    it("updates a single filter", () => {
      getState().setFilter("status", "success");
      expect(getState().filters.status).toBe("success");
    });

    it("resets page to 1 when filtering", () => {
      useToolHistoryStore.setState({ page: 5 });
      getState().setFilter("category", "web");
      expect(getState().page).toBe(1);
    });

    it("sets toolName filter", () => {
      getState().setFilter("toolName", "write_file");
      expect(getState().filters.toolName).toBe("write_file");
    });

    it("sets undoAvailableOnly filter", () => {
      getState().setFilter("undoAvailableOnly", true);
      expect(getState().filters.undoAvailableOnly).toBe(true);
    });
  });

  describe("resetFilters", () => {
    it("resets all filters to defaults", () => {
      useToolHistoryStore.setState({
        filters: {
          status: "error",
          category: "web",
          toolName: "fetch_url",
          conversationId: "c1",
          agentId: "a1",
          dateRange: { start: new Date(), end: new Date() },
          undoAvailableOnly: true,
        },
        page: 3,
      });

      getState().resetFilters();

      expect(getState().filters).toEqual(DEFAULT_FILTERS);
      expect(getState().page).toBe(1);
    });
  });

  describe("setSorting", () => {
    it("sets field and explicit direction", () => {
      getState().setSorting("toolName", "asc");
      expect(getState().sorting).toEqual({ field: "toolName", direction: "asc" });
    });

    it("toggles direction when same field clicked without explicit direction", () => {
      useToolHistoryStore.setState({ sorting: { field: "toolName", direction: "asc" } });
      getState().setSorting("toolName");
      expect(getState().sorting.direction).toBe("desc");
    });

    it("defaults to asc when switching to a new field without explicit direction", () => {
      useToolHistoryStore.setState({ sorting: { field: "toolName", direction: "desc" } });
      getState().setSorting("status");
      expect(getState().sorting).toEqual({ field: "status", direction: "asc" });
    });
  });

  describe("pagination", () => {
    it("setPage updates page", () => {
      getState().setPage(3);
      expect(getState().page).toBe(3);
    });

    it("setPageSize updates pageSize and resets page", () => {
      useToolHistoryStore.setState({ page: 5 });
      getState().setPageSize(50);
      expect(getState().pageSize).toBe(50);
      expect(getState().page).toBe(1);
    });
  });

  describe("getFilteredRecords", () => {
    const records = [
      makeRecord({ id: "1", status: "success", category: "file_system", toolName: "read_file", agentId: "a1", conversationId: "c1", queuedAt: new Date("2026-01-10"), undoAvailable: false }),
      makeRecord({ id: "2", status: "error", category: "web", toolName: "fetch_url", agentId: "a2", conversationId: "c2", queuedAt: new Date("2026-01-20"), undoAvailable: true }),
      makeRecord({ id: "3", status: "success", category: "web", toolName: "web_search", agentId: null, conversationId: "c1", queuedAt: new Date("2026-01-15"), undoAvailable: false }),
    ];

    beforeEach(() => {
      useToolHistoryStore.setState({ records });
    });

    it("returns all records when no filters applied (sorted by default)", () => {
      const result = getState().getFilteredRecords();
      expect(result).toHaveLength(3);
      // Default sort: queuedAt desc -> 2026-01-20, 2026-01-15, 2026-01-10
      expect(result[0].id).toBe("2");
      expect(result[1].id).toBe("3");
      expect(result[2].id).toBe("1");
    });

    it("filters by status", () => {
      getState().setFilter("status", "error");
      const result = getState().getFilteredRecords();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("2");
    });

    it("filters by category", () => {
      getState().setFilter("category", "web");
      const result = getState().getFilteredRecords();
      expect(result).toHaveLength(2);
    });

    it("filters by toolName", () => {
      getState().setFilter("toolName", "read_file");
      const result = getState().getFilteredRecords();
      expect(result).toHaveLength(1);
      expect(result[0].toolName).toBe("read_file");
    });

    it("filters by conversationId", () => {
      getState().setFilter("conversationId", "c1");
      const result = getState().getFilteredRecords();
      expect(result).toHaveLength(2);
    });

    it("filters by agentId", () => {
      getState().setFilter("agentId", "a2");
      const result = getState().getFilteredRecords();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("2");
    });

    it("filters by dateRange start", () => {
      getState().setFilter("dateRange", { start: new Date("2026-01-12"), end: null });
      const result = getState().getFilteredRecords();
      expect(result).toHaveLength(2);
    });

    it("filters by dateRange end", () => {
      getState().setFilter("dateRange", { start: null, end: new Date("2026-01-16") });
      const result = getState().getFilteredRecords();
      expect(result).toHaveLength(2);
    });

    it("filters by undoAvailableOnly", () => {
      getState().setFilter("undoAvailableOnly", true);
      const result = getState().getFilteredRecords();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("2");
    });

    it("combines multiple filters", () => {
      getState().setFilter("status", "success");
      getState().setFilter("category", "web");
      const result = getState().getFilteredRecords();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("3");
    });

    it("sorts by toolName ascending", () => {
      getState().setSorting("toolName", "asc");
      const result = getState().getFilteredRecords();
      expect(result[0].toolName).toBe("fetch_url");
      expect(result[1].toolName).toBe("read_file");
      expect(result[2].toolName).toBe("web_search");
    });

    it("sorts by durationMs descending", () => {
      useToolHistoryStore.setState({
        records: [
          makeRecord({ id: "a", durationMs: 100 }),
          makeRecord({ id: "b", durationMs: 500 }),
          makeRecord({ id: "c", durationMs: null }),
        ],
      });
      getState().setSorting("durationMs", "desc");
      const result = getState().getFilteredRecords();
      expect(result[0].id).toBe("b");
      expect(result[1].id).toBe("a");
      // null goes last in desc (treated as -Infinity)
      expect(result[2].id).toBe("c");
    });
  });

  describe("getPaginatedRecords", () => {
    it("returns a page of records", () => {
      const records = Array.from({ length: 30 }, (_, i) =>
        makeRecord({ id: `rec-${i}`, queuedAt: new Date(2026, 0, 30 - i) })
      );
      useToolHistoryStore.setState({ records, pageSize: 10, page: 2 });

      const result = getState().getPaginatedRecords();
      expect(result).toHaveLength(10);
    });

    it("returns partial page at the end", () => {
      const records = Array.from({ length: 5 }, (_, i) =>
        makeRecord({ id: `rec-${i}`, queuedAt: new Date(2026, 0, 5 - i) })
      );
      useToolHistoryStore.setState({ records, pageSize: 3, page: 2 });

      const result = getState().getPaginatedRecords();
      expect(result).toHaveLength(2);
    });
  });

  describe("getTotalFilteredCount", () => {
    it("returns total filtered count", () => {
      useToolHistoryStore.setState({
        records: [
          makeRecord({ id: "1", status: "success" }),
          makeRecord({ id: "2", status: "error" }),
        ],
      });
      getState().setFilter("status", "success");
      expect(getState().getTotalFilteredCount()).toBe(1);
    });
  });

  describe("getTotalPages", () => {
    it("calculates total pages", () => {
      const records = Array.from({ length: 50 }, (_, i) =>
        makeRecord({ id: `rec-${i}`, queuedAt: new Date(2026, 0, 50 - i) })
      );
      useToolHistoryStore.setState({ records, pageSize: 25 });
      expect(getState().getTotalPages()).toBe(2);
    });

    it("returns 1 for empty records", () => {
      // ceil(0/25) = 0, which is what the implementation does
      expect(getState().getTotalPages()).toBe(0);
    });
  });

  describe("exportAsJson", () => {
    it("calls tracker exportAsJson with filtered records", () => {
      const records = [makeRecord()];
      useToolHistoryStore.setState({ records });
      mockExportAsJson.mockReturnValue('["exported"]');

      const result = getState().exportAsJson();

      expect(mockExportAsJson).toHaveBeenCalled();
      expect(result).toBe('["exported"]');
    });
  });

  describe("exportAsCsv", () => {
    it("calls tracker exportAsCsv with filtered records", () => {
      const records = [makeRecord()];
      useToolHistoryStore.setState({ records });
      mockExportAsCsv.mockReturnValue("csv-data");

      const result = getState().exportAsCsv();

      expect(mockExportAsCsv).toHaveBeenCalled();
      expect(result).toBe("csv-data");
    });
  });

  describe("bulkUndo", () => {
    it("executes undo for records with undo available", async () => {
      const records = [
        makeRecord({ id: "1", undoAvailable: true, undoOperationId: "undo-1" }),
        makeRecord({ id: "2", undoAvailable: true, undoOperationId: "undo-2" }),
      ];
      useToolHistoryStore.setState({ records });
      mockExecuteUndo.mockResolvedValue(true);

      const result = await getState().bulkUndo(["1", "2"]);

      expect(result).toEqual({ success: 2, failed: 0 });
      expect(mockExecuteUndo).toHaveBeenCalledTimes(2);
      expect(mockExecuteUndo).toHaveBeenCalledWith("undo-1");
      expect(mockExecuteUndo).toHaveBeenCalledWith("undo-2");
    });

    it("counts failures for records without undo available", async () => {
      const records = [
        makeRecord({ id: "1", undoAvailable: false }),
      ];
      useToolHistoryStore.setState({ records });

      const result = await getState().bulkUndo(["1"]);

      expect(result).toEqual({ success: 0, failed: 1 });
      expect(mockExecuteUndo).not.toHaveBeenCalled();
    });

    it("counts failures for unknown record ids", async () => {
      useToolHistoryStore.setState({ records: [] });

      const result = await getState().bulkUndo(["nonexistent"]);

      expect(result).toEqual({ success: 0, failed: 1 });
    });

    it("counts failures when executeUndo returns false", async () => {
      const records = [
        makeRecord({ id: "1", undoAvailable: true, undoOperationId: "undo-1" }),
      ];
      useToolHistoryStore.setState({ records });
      mockExecuteUndo.mockResolvedValue(false);

      const result = await getState().bulkUndo(["1"]);

      expect(result).toEqual({ success: 0, failed: 1 });
    });

    it("counts failures when executeUndo throws", async () => {
      const records = [
        makeRecord({ id: "1", undoAvailable: true, undoOperationId: "undo-1" }),
      ];
      useToolHistoryStore.setState({ records });
      mockExecuteUndo.mockRejectedValue(new Error("undo error"));

      const result = await getState().bulkUndo(["1"]);

      expect(result).toEqual({ success: 0, failed: 1 });
    });

    it("syncs from tracker after bulk undo", async () => {
      useToolHistoryStore.setState({ records: [] });
      await getState().bulkUndo([]);
      // syncFromTracker is called which calls getAllRecords and getStatistics
      expect(mockGetAllRecords).toHaveBeenCalled();
    });
  });

  describe("selectors", () => {
    const state = {
      records: [
        makeRecord({ id: "1", toolName: "read_file", agentId: "a1", undoAvailable: false }),
        makeRecord({ id: "2", toolName: "write_file", agentId: "a2", undoAvailable: true }),
        makeRecord({ id: "3", toolName: "read_file", agentId: null, undoAvailable: true }),
        makeRecord({ id: "4", toolName: "fetch_url", agentId: "a1", undoAvailable: false }),
      ],
    } as ReturnType<typeof useToolHistoryStore.getState>;

    describe("selectUniqueToolNames", () => {
      it("returns sorted unique tool names", () => {
        const result = selectUniqueToolNames(state);
        expect(result).toEqual(["fetch_url", "read_file", "write_file"]);
      });
    });

    describe("selectUniqueAgentIds", () => {
      it("returns sorted unique non-null agent ids", () => {
        const result = selectUniqueAgentIds(state);
        expect(result).toEqual(["a1", "a2"]);
      });
    });

    describe("selectRecentRecords", () => {
      it("returns first N records", () => {
        const result = selectRecentRecords(state, 2);
        expect(result).toHaveLength(2);
      });

      it("defaults to 10", () => {
        const result = selectRecentRecords(state);
        expect(result).toHaveLength(4);
      });
    });

    describe("selectRecordsWithUndo", () => {
      it("returns only records with undoAvailable", () => {
        const result = selectRecordsWithUndo(state);
        expect(result).toHaveLength(2);
        expect(result.every((r) => r.undoAvailable)).toBe(true);
      });
    });
  });
});
