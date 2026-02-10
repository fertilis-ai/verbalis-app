import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockRecords = [
  {
    id: "rec-1",
    toolName: "read_file",
    category: "file_system" as const,
    arguments: {},
    queuedAt: new Date("2025-01-01T10:00:00Z"),
    startedAt: new Date("2025-01-01T10:00:01Z"),
    completedAt: new Date("2025-01-01T10:00:02Z"),
    durationMs: 1000,
    status: "success" as const,
    result: "ok",
    error: null,
    conversationId: "conv-1",
    iterationId: null,
    agentId: null,
    undoAvailable: false,
    undoOperationId: null,
  },
  {
    id: "rec-2",
    toolName: "write_file",
    category: "file_system" as const,
    arguments: {},
    queuedAt: new Date("2025-01-01T10:01:00Z"),
    startedAt: new Date("2025-01-01T10:01:01Z"),
    completedAt: new Date("2025-01-01T10:01:02Z"),
    durationMs: 500,
    status: "error" as const,
    result: null,
    error: "permission denied",
    conversationId: "conv-1",
    iterationId: null,
    agentId: null,
    undoAvailable: true,
    undoOperationId: "undo-1",
  },
  {
    id: "rec-3",
    toolName: "shell_command",
    category: "system" as const,
    arguments: {},
    queuedAt: new Date("2025-01-01T10:02:00Z"),
    startedAt: null,
    completedAt: null,
    durationMs: null,
    status: "executing" as const,
    result: null,
    error: null,
    conversationId: "conv-2",
    iterationId: null,
    agentId: null,
    undoAvailable: false,
    undoOperationId: null,
  },
];

const mockStatistics = {
  total: 3,
  byStatus: {
    queued: 0,
    pending_confirmation: 0,
    executing: 1,
    success: 1,
    error: 1,
    cancelled: 0,
    timeout: 0,
  },
  byCategory: {
    file_system: 2,
    web: 0,
    system: 1,
    integration: 0,
    memory: 0,
    custom: 0,
  },
  byTool: { read_file: 1, write_file: 1, shell_command: 1 },
  averageDurationMs: 750 as number | null,
  maxDurationMs: 1000,
  minDurationMs: 500,
  successRate: 0.5 as number | null,
};

const mockHistoryStore = {
  filters: {
    status: "all" as const,
    category: "all" as const,
    toolName: null,
    conversationId: null,
    agentId: null,
    dateRange: { start: null, end: null },
    undoAvailableOnly: false,
  },
  sorting: { field: "queuedAt" as const, direction: "desc" as const },
  page: 1,
  pageSize: 25,
  statistics: mockStatistics as typeof mockStatistics | null,
  setFilter: vi.fn(),
  resetFilters: vi.fn(),
  setSorting: vi.fn(),
  setPage: vi.fn(),
  syncFromTracker: vi.fn(),
  exportAsJson: vi.fn(() => '[]'),
  exportAsCsv: vi.fn(() => ''),
  getPaginatedRecords: vi.fn(() => mockRecords),
  getTotalFilteredCount: vi.fn(() => 3),
  getTotalPages: vi.fn(() => 1),
  bulkUndo: vi.fn().mockResolvedValue({ success: 1, failed: 0 }),
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/stores/tool-history-store", () => ({
  useToolHistoryStore: (selector?: any) => {
    if (typeof selector === "function") {
      return selector({ records: mockRecords });
    }
    return mockHistoryStore;
  },
  selectUniqueToolNames: () => ["read_file", "write_file", "shell_command"],
  selectRecordsWithUndo: () => mockRecords.filter((r) => r.undoAvailable),
}));

vi.mock("@/lib/tools/categories", () => ({
  CATEGORY_CONFIG: {
    file_system: { label: "File System", icon: "folder", description: "" },
    web: { label: "Web", icon: "globe", description: "" },
    system: { label: "System", icon: "terminal", description: "" },
    integration: { label: "Integration", icon: "plug", description: "" },
    memory: { label: "Memory", icon: "brain", description: "" },
    custom: { label: "Custom", icon: "puzzle", description: "" },
  },
}));

vi.mock("lucide-react", () =>
  new Proxy(
    {},
    {
      get: (_, name) => {
        if (name === "__esModule") return true;
        if (typeof name === "symbol" || name === "then") return undefined;
        return (props: any) => (
          <div data-testid={`icon-${String(name)}`} {...props} />
        );
      },
      has: () => true,
    }
  )
);

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, title, variant, size, ...rest }: any) => (
    <button onClick={onClick} disabled={disabled} title={title} data-variant={variant} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

import { ExecutionHistory } from "./execution-history";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExecutionHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHistoryStore.getPaginatedRecords.mockReturnValue(mockRecords);
    mockHistoryStore.getTotalFilteredCount.mockReturnValue(3);
    mockHistoryStore.getTotalPages.mockReturnValue(1);
    mockHistoryStore.statistics = mockStatistics;
    mockHistoryStore.page = 1;
    mockHistoryStore.filters = {
      status: "all",
      category: "all",
      toolName: null,
      conversationId: null,
      agentId: null,
      dateRange: { start: null, end: null },
      undoAvailableOnly: false,
    };
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  describe("rendering", () => {
    it("renders the header", () => {
      render(<ExecutionHistory />);
      expect(screen.getByText("Execution History")).toBeInTheDocument();
    });

    it("calls syncFromTracker on mount", () => {
      render(<ExecutionHistory />);
      expect(mockHistoryStore.syncFromTracker).toHaveBeenCalled();
    });

    it("renders filter dropdowns", () => {
      render(<ExecutionHistory />);
      expect(screen.getByText("All Statuses")).toBeInTheDocument();
      expect(screen.getByText("All Categories")).toBeInTheDocument();
      expect(screen.getByText("All Tools")).toBeInTheDocument();
    });

    it("renders the undo checkbox filter", () => {
      render(<ExecutionHistory />);
      expect(screen.getByText("Undo available only")).toBeInTheDocument();
    });

    it("renders the clear filters button", () => {
      render(<ExecutionHistory />);
      expect(screen.getByText("Clear filters")).toBeInTheDocument();
    });

    it("renders statistics", () => {
      render(<ExecutionHistory />);
      expect(screen.getByText("Total: 3")).toBeInTheDocument();
      expect(screen.getByText("Success: 1")).toBeInTheDocument();
      expect(screen.getByText("Error: 1")).toBeInTheDocument();
      expect(screen.getByText("Avg: 750ms")).toBeInTheDocument();
      expect(screen.getByText("Rate: 50%")).toBeInTheDocument();
    });

    it("renders record durations", () => {
      render(<ExecutionHistory />);
      expect(screen.getByText("1000ms")).toBeInTheDocument();
      expect(screen.getByText("500ms")).toBeInTheDocument();
    });

    it("renders dash for null duration", () => {
      render(<ExecutionHistory />);
      // rec-3 has null durationMs
      const dashes = screen.getAllByText("-");
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });

    it("renders undo button for records with undoAvailable", () => {
      render(<ExecutionHistory />);
      // rec-2 has undoAvailable=true, so we should see an undo icon
      const undoIcons = screen.getAllByTestId("icon-Undo2");
      expect(undoIcons.length).toBeGreaterThanOrEqual(1);
    });

    it("renders export buttons", () => {
      render(<ExecutionHistory />);
      expect(screen.getByText("JSON")).toBeInTheDocument();
      expect(screen.getByText("CSV")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  describe("empty state", () => {
    it("shows empty message when no records", () => {
      mockHistoryStore.getPaginatedRecords.mockReturnValue([]);
      mockHistoryStore.getTotalFilteredCount.mockReturnValue(0);
      render(<ExecutionHistory />);
      expect(screen.getByText("No execution records found")).toBeInTheDocument();
    });

    it("shows 0 records in pagination when empty", () => {
      mockHistoryStore.getPaginatedRecords.mockReturnValue([]);
      mockHistoryStore.getTotalFilteredCount.mockReturnValue(0);
      render(<ExecutionHistory />);
      expect(screen.getByText("0 records")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  describe("filters", () => {
    it("calls setFilter when status filter changes", () => {
      render(<ExecutionHistory />);
      const statusSelect = screen.getByDisplayValue("All Statuses");
      fireEvent.change(statusSelect, { target: { value: "success" } });
      expect(mockHistoryStore.setFilter).toHaveBeenCalledWith("status", "success");
    });

    it("calls setFilter when category filter changes", () => {
      render(<ExecutionHistory />);
      const categorySelect = screen.getByDisplayValue("All Categories");
      fireEvent.change(categorySelect, { target: { value: "web" } });
      expect(mockHistoryStore.setFilter).toHaveBeenCalledWith("category", "web");
    });

    it("calls setFilter when tool name filter changes", () => {
      render(<ExecutionHistory />);
      const toolSelect = screen.getByDisplayValue("All Tools");
      fireEvent.change(toolSelect, { target: { value: "read_file" } });
      expect(mockHistoryStore.setFilter).toHaveBeenCalledWith("toolName", "read_file");
    });

    it("calls setFilter when undo checkbox changes", () => {
      render(<ExecutionHistory />);
      const checkbox = screen.getByRole("checkbox", { name: /undo available only/i });
      fireEvent.click(checkbox);
      expect(mockHistoryStore.setFilter).toHaveBeenCalledWith("undoAvailableOnly", true);
    });

    it("calls resetFilters when clear filters button clicked", () => {
      render(<ExecutionHistory />);
      fireEvent.click(screen.getByText("Clear filters"));
      expect(mockHistoryStore.resetFilters).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Sorting
  // -------------------------------------------------------------------------

  describe("sorting", () => {
    it("calls setSorting when Tool header clicked", () => {
      render(<ExecutionHistory />);
      fireEvent.click(screen.getByText(/^Tool/));
      expect(mockHistoryStore.setSorting).toHaveBeenCalledWith("toolName");
    });

    it("calls setSorting when Status header clicked", () => {
      render(<ExecutionHistory />);
      fireEvent.click(screen.getByText(/^Status/));
      expect(mockHistoryStore.setSorting).toHaveBeenCalledWith("status");
    });

    it("calls setSorting when Duration header clicked", () => {
      render(<ExecutionHistory />);
      fireEvent.click(screen.getByText(/^Duration/));
      expect(mockHistoryStore.setSorting).toHaveBeenCalledWith("durationMs");
    });

  });

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------

  describe("selection", () => {
    it("shows undo selected button when items selected", () => {
      render(<ExecutionHistory />);
      const checkboxes = screen.getAllByRole("checkbox");
      fireEvent.click(checkboxes[1]);
      expect(screen.getByText("Undo Selected")).toBeInTheDocument();
    });

    it("does not show undo selected button when nothing selected", () => {
      render(<ExecutionHistory />);
      expect(screen.queryByText("Undo Selected")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  describe("pagination", () => {
    it("shows pagination text", () => {
      render(<ExecutionHistory />);
      expect(screen.getByText("1-3 of 3")).toBeInTheDocument();
    });

    it("disables previous page button on first page", () => {
      render(<ExecutionHistory />);
      const prevButton = screen.getByTestId("icon-ChevronLeft").closest("button")!;
      expect(prevButton).toBeDisabled();
    });

    it("disables next page button on last page", () => {
      render(<ExecutionHistory />);
      const nextButton = screen.getByTestId("icon-ChevronRight").closest("button")!;
      expect(nextButton).toBeDisabled();
    });

    it("calls setPage when next page button clicked", () => {
      mockHistoryStore.getTotalPages.mockReturnValue(3);
      render(<ExecutionHistory />);
      const nextButton = screen.getByTestId("icon-ChevronRight").closest("button")!;
      fireEvent.click(nextButton);
      expect(mockHistoryStore.setPage).toHaveBeenCalledWith(2);
    });
  });

});
