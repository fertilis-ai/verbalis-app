
import { getExecutionTracker } from "@/lib/tools/execution-tracker";

// ============================================================================
// Shared Tool Context Types
// ============================================================================

export interface RecentFileOperation {
  path: string;
  operation: "read" | "write" | "delete";
  timestamp: Date;
  agentId: string | null;
  content?: string; // Only for reads, truncated
}

export interface FetchedUrl {
  url: string;
  contentSummary: string;
  timestamp: Date;
  agentId: string | null;
}

export interface ShellOutput {
  command: string;
  output: string;
  timestamp: Date;
  agentId: string | null;
  exitCode: number | null;
}

export interface SharedToolContext {
  recentFiles: RecentFileOperation[];
  fetchedUrls: FetchedUrl[];
  shellOutputs: ShellOutput[];
}

// ============================================================================
// Context Manager
// ============================================================================

class SharedContextManager {
  private maxItems = 50;
  private recentFiles: RecentFileOperation[] = [];
  private fetchedUrls: FetchedUrl[] = [];
  private shellOutputs: ShellOutput[] = [];

  // ============================================================================
  // Recording Operations
  // ============================================================================

  recordFileOperation(params: {
    path: string;
    operation: "read" | "write" | "delete";
    agentId: string | null;
    content?: string;
  }) {
    this.recentFiles.unshift({
      path: params.path,
      operation: params.operation,
      timestamp: new Date(),
      agentId: params.agentId,
      content: params.content?.slice(0, 1000), // Truncate content
    });

    // Keep max items
    if (this.recentFiles.length > this.maxItems) {
      this.recentFiles.pop();
    }
  }

  recordFetchedUrl(params: {
    url: string;
    contentSummary: string;
    agentId: string | null;
  }) {
    this.fetchedUrls.unshift({
      url: params.url,
      contentSummary: params.contentSummary.slice(0, 500), // Truncate
      timestamp: new Date(),
      agentId: params.agentId,
    });

    if (this.fetchedUrls.length > this.maxItems) {
      this.fetchedUrls.pop();
    }
  }

  recordShellOutput(params: {
    command: string;
    output: string;
    agentId: string | null;
    exitCode: number | null;
  }) {
    this.shellOutputs.unshift({
      command: params.command,
      output: params.output.slice(0, 2000), // Truncate
      timestamp: new Date(),
      agentId: params.agentId,
      exitCode: params.exitCode,
    });

    if (this.shellOutputs.length > this.maxItems) {
      this.shellOutputs.pop();
    }
  }

  // ============================================================================
  // Querying Context
  // ============================================================================

  getSharedContext(): SharedToolContext {
    return {
      recentFiles: [...this.recentFiles],
      fetchedUrls: [...this.fetchedUrls],
      shellOutputs: [...this.shellOutputs],
    };
  }

  getRecentFileByPath(path: string): RecentFileOperation | undefined {
    return this.recentFiles.find(f => f.path === path);
  }

  getRecentFilesForAgent(agentId: string): RecentFileOperation[] {
    return this.recentFiles.filter(f => f.agentId === agentId);
  }

  getFetchedUrlsForAgent(agentId: string): FetchedUrl[] {
    return this.fetchedUrls.filter(f => f.agentId === agentId);
  }

  getShellOutputsForAgent(agentId: string): ShellOutput[] {
    return this.shellOutputs.filter(s => s.agentId === agentId);
  }

  // Get context summary for LLM
  getContextSummaryForLLM(agentId?: string, maxChars = 4000): string {
    const context = this.getSharedContext();
    const lines: string[] = [];

    // Recent files
    const files = agentId
      ? context.recentFiles.filter(f => f.agentId === agentId || !f.agentId)
      : context.recentFiles;

    if (files.length > 0) {
      lines.push("## Recent File Operations");
      for (const file of files.slice(0, 10)) {
        lines.push(`- ${file.operation}: ${file.path} (${this.timeAgo(file.timestamp)})`);
      }
    }

    // Fetched URLs
    const urls = agentId
      ? context.fetchedUrls.filter(f => f.agentId === agentId || !f.agentId)
      : context.fetchedUrls;

    if (urls.length > 0) {
      lines.push("\n## Recent Web Requests");
      for (const url of urls.slice(0, 5)) {
        lines.push(`- ${url.url}`);
        lines.push(`  ${url.contentSummary.slice(0, 100)}...`);
      }
    }

    // Shell outputs
    const shells = agentId
      ? context.shellOutputs.filter(s => s.agentId === agentId || !s.agentId)
      : context.shellOutputs;

    if (shells.length > 0) {
      lines.push("\n## Recent Shell Commands");
      for (const shell of shells.slice(0, 5)) {
        lines.push(`- \`${shell.command}\` (exit: ${shell.exitCode ?? "N/A"})`);
        if (shell.output.length > 0) {
          lines.push(`  Output: ${shell.output.slice(0, 100)}...`);
        }
      }
    }

    const result = lines.join("\n");
    if (result.length > maxChars) {
      return `${result.slice(0, maxChars)}\n... (truncated)`;
    }
    return result;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  clear() {
    this.recentFiles = [];
    this.fetchedUrls = [];
    this.shellOutputs = [];
  }

  clearForAgent(agentId: string) {
    this.recentFiles = this.recentFiles.filter(f => f.agentId !== agentId);
    this.fetchedUrls = this.fetchedUrls.filter(f => f.agentId !== agentId);
    this.shellOutputs = this.shellOutputs.filter(s => s.agentId !== agentId);
  }

  clearOlderThan(date: Date) {
    this.recentFiles = this.recentFiles.filter(f => f.timestamp >= date);
    this.fetchedUrls = this.fetchedUrls.filter(f => f.timestamp >= date);
    this.shellOutputs = this.shellOutputs.filter(s => s.timestamp >= date);
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private timeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let contextManagerInstance: SharedContextManager | null = null;

export function getSharedContextManager(): SharedContextManager {
  if (!contextManagerInstance) {
    contextManagerInstance = new SharedContextManager();
  }
  return contextManagerInstance;
}

export function resetSharedContextManager() {
  if (contextManagerInstance) {
    contextManagerInstance.clear();
  }
  contextManagerInstance = null;
}

// ============================================================================
// Sync from Execution Tracker
// ============================================================================

/**
 * Populate shared context from execution tracker records
 * Useful for restoring state after app restart
 */
export function syncContextFromTracker() {
  const tracker = getExecutionTracker();
  const manager = getSharedContextManager();
  const records = tracker.getAllRecords();

  // Only sync records from last 24 hours
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  for (const record of records) {
    if (record.queuedAt < cutoff) continue;
    if (record.status !== "success") continue;

    // File operations
    if (record.category === "file_system") {
      const path = record.arguments.path as string | undefined;
      if (!path) continue;

      let operation: "read" | "write" | "delete" | undefined;
      if (record.toolName === "read_file") operation = "read";
      else if (record.toolName === "write_file") operation = "write";
      else if (record.toolName === "delete_path") operation = "delete";

      if (operation) {
        manager.recordFileOperation({
          path,
          operation,
          agentId: record.agentId,
          content: operation === "read" ? record.result?.slice(0, 1000) : undefined,
        });
      }
    }

    // Web operations
    if (record.category === "web" && record.toolName === "http_fetch") {
      const url = record.arguments.url as string | undefined;
      if (url && record.result) {
        manager.recordFetchedUrl({
          url,
          contentSummary: record.result.slice(0, 500),
          agentId: record.agentId,
        });
      }
    }

    // Shell operations
    if (record.toolName === "shell_execute") {
      const command = record.arguments.command as string | undefined;
      if (command && record.result) {
        // Parse exit code from result
        const exitCodeMatch = record.result.match(/Exit code: (\d+|-?\d+|N\/A)/);
        const exitCode = exitCodeMatch && exitCodeMatch[1] !== "N/A"
          ? parseInt(exitCodeMatch[1], 10)
          : null;

        manager.recordShellOutput({
          command,
          output: record.result,
          agentId: record.agentId,
          exitCode,
        });
      }
    }
  }
}
