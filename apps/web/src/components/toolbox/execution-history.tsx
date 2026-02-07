import * as React from "react";
import {
  Filter,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Undo2,
  Check,
  X,
  Clock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useToolHistoryStore,
  selectUniqueToolNames,
  selectRecordsWithUndo,
  type SortField,
} from "@/stores/tool-history-store";
import type { ExecutionStatus } from "@/lib/tools/execution-tracker";
import type { ToolCategory } from "@/lib/tools/categories";
import { CATEGORY_CONFIG } from "@/lib/tools/categories";

// ============================================================================
// Status Icons
// ============================================================================

const STATUS_ICONS: Record<ExecutionStatus, React.ElementType> = {
  queued: Clock,
  pending_confirmation: AlertCircle,
  executing: Loader2,
  success: CheckCircle2,
  error: XCircle,
  cancelled: X,
  timeout: Clock,
};

const STATUS_COLORS: Record<ExecutionStatus, string> = {
  queued: "text-muted-foreground",
  pending_confirmation: "text-amber-500",
  executing: "text-blue-500",
  success: "text-green-500",
  error: "text-red-500",
  cancelled: "text-muted-foreground",
  timeout: "text-orange-500",
};

// ============================================================================
// Component
// ============================================================================

export function ExecutionHistory() {
  const {
    filters,
    sorting,
    page,
    pageSize,
    statistics,
    setFilter,
    resetFilters,
    setSorting,
    setPage,
    syncFromTracker,
    exportAsJson,
    exportAsCsv,
    getPaginatedRecords,
    getTotalFilteredCount,
    getTotalPages,
    bulkUndo,
  } = useToolHistoryStore();

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = React.useState(false);
  const [isBulkUndoing, setIsBulkUndoing] = React.useState(false);

  const records = getPaginatedRecords();
  const totalCount = getTotalFilteredCount();
  const totalPages = getTotalPages();
  const uniqueToolNames = useToolHistoryStore(selectUniqueToolNames);
  const recordsWithUndo = useToolHistoryStore(selectRecordsWithUndo);

  // Sync on mount
  React.useEffect(() => {
    syncFromTracker();
  }, [syncFromTracker]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleExport = (format: "json" | "csv") => {
    setIsExporting(true);
    try {
      const content = format === "json" ? exportAsJson() : exportAsCsv();
      const blob = new Blob([content], {
        type: format === "json" ? "application/json" : "text/csv",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tool-history.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const handleBulkUndo = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkUndoing(true);
    try {
      const result = await bulkUndo(Array.from(selectedIds));
      alert(`Undo complete: ${result.success} successful, ${result.failed} failed`);
      setSelectedIds(new Set());
    } finally {
      setIsBulkUndoing(false);
    }
  };

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(records.map((r) => r.id)));
    }
  };

  const handleSort = (field: SortField) => {
    setSorting(field);
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-3">
        <h2 className="text-sm font-medium">Execution History</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => syncFromTracker()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="border-b border-border p-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          {/* Status filter */}
          <select
            value={filters.status}
            onChange={(e) => setFilter("status", e.target.value as ExecutionStatus | "all")}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
            <option value="cancelled">Cancelled</option>
            <option value="timeout">Timeout</option>
            <option value="executing">Executing</option>
            <option value="pending_confirmation">Pending</option>
          </select>

          {/* Category filter */}
          <select
            value={filters.category}
            onChange={(e) => setFilter("category", e.target.value as ToolCategory | "all")}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            <option value="all">All Categories</option>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label}
              </option>
            ))}
          </select>

          {/* Tool name filter */}
          <select
            value={filters.toolName || ""}
            onChange={(e) => setFilter("toolName", e.target.value || null)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            <option value="">All Tools</option>
            {uniqueToolNames.map((name) => (
              <option key={name} value={name}>
                {name.replace(/_/g, " ")}
              </option>
            ))}
          </select>

          {/* Undo available filter */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.undoAvailableOnly}
              onChange={(e) => setFilter("undoAvailableOnly", e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Undo available only
          </label>

          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Clear filters
          </Button>
        </div>

        {/* Statistics */}
        {statistics && (
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Total: {statistics.total}</span>
            <span className="text-green-500">
              Success: {statistics.byStatus.success}
            </span>
            <span className="text-red-500">
              Error: {statistics.byStatus.error}
            </span>
            {statistics.averageDurationMs && (
              <span>Avg: {Math.round(statistics.averageDurationMs)}ms</span>
            )}
            {statistics.successRate !== null && (
              <span>Rate: {Math.round(statistics.successRate * 100)}%</span>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background border-b">
            <tr>
              <th className="p-2 text-left w-8">
                <input
                  type="checkbox"
                  checked={selectedIds.size === records.length && records.length > 0}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-input"
                />
              </th>
              <th
                className="p-2 text-left cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("toolName")}
              >
                Tool {sorting.field === "toolName" && (sorting.direction === "asc" ? "↑" : "↓")}
              </th>
              <th
                className="p-2 text-left cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("status")}
              >
                Status {sorting.field === "status" && (sorting.direction === "asc" ? "↑" : "↓")}
              </th>
              <th
                className="p-2 text-left cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("durationMs")}
              >
                Duration {sorting.field === "durationMs" && (sorting.direction === "asc" ? "↑" : "↓")}
              </th>
              <th
                className="p-2 text-left cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("queuedAt")}
              >
                Time {sorting.field === "queuedAt" && (sorting.direction === "asc" ? "↑" : "↓")}
              </th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => {
              const StatusIcon = STATUS_ICONS[record.status];
              return (
                <tr
                  key={record.id}
                  className={cn(
                    "border-b hover:bg-muted/50 transition-colors",
                    selectedIds.has(record.id) && "bg-primary/5"
                  )}
                >
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(record.id)}
                      onChange={() => toggleSelection(record.id)}
                      className="h-4 w-4 rounded border-input"
                    />
                  </td>
                  <td className="p-2">
                    <div className="font-medium">
                      {record.toolName.replace(/_/g, " ")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {CATEGORY_CONFIG[record.category]?.label || record.category}
                    </div>
                  </td>
                  <td className="p-2">
                    <div className={cn("flex items-center gap-1", STATUS_COLORS[record.status])}>
                      <StatusIcon className={cn("h-4 w-4", record.status === "executing" && "animate-spin")} />
                      <span className="capitalize">{record.status.replace(/_/g, " ")}</span>
                    </div>
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {record.durationMs ? `${record.durationMs}ms` : "-"}
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {new Date(record.queuedAt).toLocaleTimeString()}
                  </td>
                  <td className="p-2">
                    {record.undoAvailable && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => bulkUndo([record.id])}
                      >
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {records.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  No execution records found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="border-t border-border p-3 flex items-center justify-between">
        {/* Bulk actions */}
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <span className="text-sm text-muted-foreground">
                {selectedIds.size} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkUndo}
                disabled={isBulkUndoing}
              >
                {isBulkUndoing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Undo2 className="h-4 w-4 mr-2" />
                )}
                Undo Selected
              </Button>
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("json")}
            disabled={isExporting}
          >
            <Download className="h-4 w-4 mr-2" />
            JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("csv")}
            disabled={isExporting}
          >
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
        </div>

        {/* Pagination */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {totalCount > 0
              ? `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, totalCount)} of ${totalCount}`
              : "0 records"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
