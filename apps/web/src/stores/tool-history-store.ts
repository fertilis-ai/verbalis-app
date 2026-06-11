import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ToolExecutionRecord, ExecutionStatus, ExecutionStatistics } from "@/lib/tools/execution-tracker";
import { getExecutionTracker } from "@/lib/tools/execution-tracker";
import type { ToolCategory } from "@/lib/tools/categories";

// ============================================================================
// Filter Types
// ============================================================================

export interface ToolHistoryFilters {
  status: ExecutionStatus | "all";
  category: ToolCategory | "all";
  toolName: string | null;
  conversationId: string | null;
  agentId: string | null;
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  undoAvailableOnly: boolean;
}

export type SortField = "queuedAt" | "completedAt" | "durationMs" | "toolName" | "status";
export type SortDirection = "asc" | "desc";

export interface ToolHistorySorting {
  field: SortField;
  direction: SortDirection;
}

// ============================================================================
// State Types
// ============================================================================

interface ToolHistoryState {
  // Cached records (synced from tracker)
  records: ToolExecutionRecord[];
  lastSyncedAt: Date | null;

  // Filters
  filters: ToolHistoryFilters;
  sorting: ToolHistorySorting;

  // Pagination
  page: number;
  pageSize: number;

  // Statistics
  statistics: ExecutionStatistics | null;

  // Actions - Sync
  syncFromTracker: () => void;

  // Actions - Filters
  setFilter: <K extends keyof ToolHistoryFilters>(key: K, value: ToolHistoryFilters[K]) => void;
  resetFilters: () => void;

  // Actions - Sorting
  setSorting: (field: SortField, direction?: SortDirection) => void;

  // Actions - Pagination
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;

  // Actions - Export
  exportAsJson: () => string;
  exportAsCsv: () => string;

  // Computed - Filtered Records
  getFilteredRecords: () => ToolExecutionRecord[];
  getPaginatedRecords: () => ToolExecutionRecord[];
  getTotalFilteredCount: () => number;
  getTotalPages: () => number;

  // Actions - Bulk Undo
  bulkUndo: (recordIds: string[]) => Promise<{ success: number; failed: number }>;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_FILTERS: ToolHistoryFilters = {
  status: "all",
  category: "all",
  toolName: null,
  conversationId: null,
  agentId: null,
  dateRange: {
    start: null,
    end: null,
  },
  undoAvailableOnly: false,
};

const DEFAULT_SORTING: ToolHistorySorting = {
  field: "queuedAt",
  direction: "desc",
};

// ============================================================================
// Store Implementation
// ============================================================================

export const useToolHistoryStore = create<ToolHistoryState>()(
  persist(
    (set, get) => ({
      records: [],
      lastSyncedAt: null,
      filters: DEFAULT_FILTERS,
      sorting: DEFAULT_SORTING,
      page: 1,
      pageSize: 25,
      statistics: null,

      // ============================================================================
      // Sync
      // ============================================================================

      syncFromTracker: () => {
        const tracker = getExecutionTracker();
        const records = tracker.getAllRecords();
        const statistics = tracker.getStatistics();

        set({
          records,
          statistics,
          lastSyncedAt: new Date(),
        });
      },

      // ============================================================================
      // Filters
      // ============================================================================

      setFilter: (key, value) => {
        set((state) => ({
          filters: { ...state.filters, [key]: value },
          page: 1, // Reset to first page when filtering
        }));
      },

      resetFilters: () => {
        set({
          filters: DEFAULT_FILTERS,
          page: 1,
        });
      },

      // ============================================================================
      // Sorting
      // ============================================================================

      setSorting: (field, direction) => {
        set((state) => ({
          sorting: {
            field,
            direction: direction ?? (state.sorting.field === field && state.sorting.direction === "asc" ? "desc" : "asc"),
          },
        }));
      },

      // ============================================================================
      // Pagination
      // ============================================================================

      setPage: (page) => set({ page }),
      setPageSize: (pageSize) => set({ pageSize, page: 1 }),

      // ============================================================================
      // Export
      // ============================================================================

      exportAsJson: () => {
        const tracker = getExecutionTracker();
        return tracker.exportAsJson(get().getFilteredRecords());
      },

      exportAsCsv: () => {
        const tracker = getExecutionTracker();
        return tracker.exportAsCsv(get().getFilteredRecords());
      },

      // ============================================================================
      // Computed
      // ============================================================================

      getFilteredRecords: () => {
        const { records, filters, sorting } = get();

        const filtered = records.filter((record) => {
          // Status filter
          if (filters.status !== "all" && record.status !== filters.status) {
            return false;
          }

          // Category filter
          if (filters.category !== "all" && record.category !== filters.category) {
            return false;
          }

          // Tool name filter
          if (filters.toolName && record.toolName !== filters.toolName) {
            return false;
          }

          // Conversation filter
          if (filters.conversationId && record.conversationId !== filters.conversationId) {
            return false;
          }

          // Agent filter
          if (filters.agentId && record.agentId !== filters.agentId) {
            return false;
          }

          // Date range filter
          if (filters.dateRange.start && record.queuedAt < filters.dateRange.start) {
            return false;
          }
          if (filters.dateRange.end && record.queuedAt > filters.dateRange.end) {
            return false;
          }

          // Undo available filter
          if (filters.undoAvailableOnly && !record.undoAvailable) {
            return false;
          }

          return true;
        });

        // Sort
        filtered.sort((a, b) => {
          let aVal: unknown = a[sorting.field as keyof ToolExecutionRecord];
          let bVal: unknown = b[sorting.field as keyof ToolExecutionRecord];

          // Handle null/undefined
          if (aVal === null || aVal === undefined) aVal = sorting.direction === "asc" ? Infinity : -Infinity;
          if (bVal === null || bVal === undefined) bVal = sorting.direction === "asc" ? Infinity : -Infinity;

          // Handle dates
          if (aVal instanceof Date) aVal = aVal.getTime();
          if (bVal instanceof Date) bVal = bVal.getTime();

          // Compare
          if (typeof aVal === "string" && typeof bVal === "string") {
            return sorting.direction === "asc"
              ? aVal.localeCompare(bVal)
              : bVal.localeCompare(aVal);
          }

          if (typeof aVal === "number" && typeof bVal === "number") {
            return sorting.direction === "asc" ? aVal - bVal : bVal - aVal;
          }

          return 0;
        });

        return filtered;
      },

      getPaginatedRecords: () => {
        const { page, pageSize } = get();
        const filtered = get().getFilteredRecords();
        const start = (page - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
      },

      getTotalFilteredCount: () => {
        return get().getFilteredRecords().length;
      },

      getTotalPages: () => {
        const { pageSize } = get();
        const count = get().getTotalFilteredCount();
        return Math.ceil(count / pageSize);
      },

      // ============================================================================
      // Bulk Undo
      // ============================================================================

      bulkUndo: async (recordIds) => {
        const { records } = get();
        const { getUndoManager } = await import("@/lib/guardrails/undo-manager");
        const undoManager = getUndoManager();

        let success = 0;
        let failed = 0;

        for (const recordId of recordIds) {
          const record = records.find((r) => r.id === recordId);
          if (!record?.undoAvailable || !record.undoOperationId) {
            failed++;
            continue;
          }

          try {
            const result = await undoManager.executeUndo(record.undoOperationId);
            if (result) {
              success++;
            } else {
              failed++;
            }
          } catch {
            failed++;
          }
        }

        // Sync after bulk undo
        get().syncFromTracker();

        return { success, failed };
      },
    }),
    {
      name: "sapio-tool-history",
      partialize: (state) => ({
        // Only persist filters and sorting, not the actual records
        filters: state.filters,
        sorting: state.sorting,
        pageSize: state.pageSize,
      }),
    }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const selectUniqueToolNames = (state: ToolHistoryState): string[] => {
  const names = new Set(state.records.map((r) => r.toolName));
  return Array.from(names).sort();
};

export const selectUniqueAgentIds = (state: ToolHistoryState): string[] => {
  const ids = new Set(state.records.map((r) => r.agentId).filter((id): id is string => id !== null));
  return Array.from(ids).sort();
};

export const selectRecentRecords = (state: ToolHistoryState, limit = 10): ToolExecutionRecord[] => {
  return state.records.slice(0, limit);
};

export const selectRecordsWithUndo = (state: ToolHistoryState): ToolExecutionRecord[] => {
  return state.records.filter((r) => r.undoAvailable);
};
