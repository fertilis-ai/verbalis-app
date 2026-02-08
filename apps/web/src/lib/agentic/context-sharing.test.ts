import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the execution-tracker dependency before importing the module under test
vi.mock("@/lib/tools/execution-tracker", () => ({
  getExecutionTracker: vi.fn(() => ({
    getAllRecords: vi.fn(() => []),
  })),
}));

import {
  getSharedContextManager,
  resetSharedContextManager,
  syncContextFromTracker,
} from "./context-sharing";
import { getExecutionTracker } from "@/lib/tools/execution-tracker";

beforeEach(() => {
  resetSharedContextManager();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Singleton behaviour
// ---------------------------------------------------------------------------

describe("getSharedContextManager / resetSharedContextManager", () => {
  it("returns the same instance on subsequent calls", () => {
    const a = getSharedContextManager();
    const b = getSharedContextManager();
    expect(a).toBe(b);
  });

  it("returns a fresh instance after reset", () => {
    const a = getSharedContextManager();
    a.recordFileOperation({ path: "/tmp/x", operation: "read", agentId: null });
    resetSharedContextManager();
    const b = getSharedContextManager();
    expect(b.getSharedContext().recentFiles).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// recordFileOperation
// ---------------------------------------------------------------------------

describe("recordFileOperation", () => {
  it("adds a file operation to the context", () => {
    const mgr = getSharedContextManager();
    mgr.recordFileOperation({ path: "/a.txt", operation: "write", agentId: "ag1" });

    const ctx = mgr.getSharedContext();
    expect(ctx.recentFiles).toHaveLength(1);
    expect(ctx.recentFiles[0]).toMatchObject({
      path: "/a.txt",
      operation: "write",
      agentId: "ag1",
    });
    expect(ctx.recentFiles[0].timestamp).toBeInstanceOf(Date);
  });

  it("truncates content to 1000 chars", () => {
    const mgr = getSharedContextManager();
    const longContent = "x".repeat(2000);
    mgr.recordFileOperation({
      path: "/big.txt",
      operation: "read",
      agentId: null,
      content: longContent,
    });

    const file = mgr.getSharedContext().recentFiles[0];
    expect(file.content).toHaveLength(1000);
  });

  it("prepends new items (most recent first)", () => {
    const mgr = getSharedContextManager();
    mgr.recordFileOperation({ path: "/first.txt", operation: "read", agentId: null });
    mgr.recordFileOperation({ path: "/second.txt", operation: "write", agentId: null });

    const files = mgr.getSharedContext().recentFiles;
    expect(files[0].path).toBe("/second.txt");
    expect(files[1].path).toBe("/first.txt");
  });

  it("caps at maxItems (50)", () => {
    const mgr = getSharedContextManager();
    for (let i = 0; i < 55; i++) {
      mgr.recordFileOperation({ path: `/f${i}.txt`, operation: "read", agentId: null });
    }
    expect(mgr.getSharedContext().recentFiles).toHaveLength(50);
    // most recent should be f54
    expect(mgr.getSharedContext().recentFiles[0].path).toBe("/f54.txt");
  });
});

// ---------------------------------------------------------------------------
// recordFetchedUrl
// ---------------------------------------------------------------------------

describe("recordFetchedUrl", () => {
  it("adds a fetched URL to context", () => {
    const mgr = getSharedContextManager();
    mgr.recordFetchedUrl({ url: "https://example.com", contentSummary: "homepage", agentId: "a1" });

    const urls = mgr.getSharedContext().fetchedUrls;
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatchObject({ url: "https://example.com", agentId: "a1" });
  });

  it("truncates contentSummary to 500 chars", () => {
    const mgr = getSharedContextManager();
    mgr.recordFetchedUrl({
      url: "https://long.com",
      contentSummary: "y".repeat(1000),
      agentId: null,
    });
    expect(mgr.getSharedContext().fetchedUrls[0].contentSummary).toHaveLength(500);
  });

  it("caps at maxItems", () => {
    const mgr = getSharedContextManager();
    for (let i = 0; i < 55; i++) {
      mgr.recordFetchedUrl({ url: `https://${i}.com`, contentSummary: "", agentId: null });
    }
    expect(mgr.getSharedContext().fetchedUrls).toHaveLength(50);
  });
});

// ---------------------------------------------------------------------------
// recordShellOutput
// ---------------------------------------------------------------------------

describe("recordShellOutput", () => {
  it("adds a shell output record", () => {
    const mgr = getSharedContextManager();
    mgr.recordShellOutput({ command: "ls", output: "file.txt", agentId: null, exitCode: 0 });

    const shells = mgr.getSharedContext().shellOutputs;
    expect(shells).toHaveLength(1);
    expect(shells[0]).toMatchObject({ command: "ls", exitCode: 0 });
  });

  it("truncates output to 2000 chars", () => {
    const mgr = getSharedContextManager();
    mgr.recordShellOutput({
      command: "cat big",
      output: "z".repeat(5000),
      agentId: null,
      exitCode: 0,
    });
    expect(mgr.getSharedContext().shellOutputs[0].output).toHaveLength(2000);
  });

  it("caps at maxItems", () => {
    const mgr = getSharedContextManager();
    for (let i = 0; i < 55; i++) {
      mgr.recordShellOutput({ command: `cmd${i}`, output: "", agentId: null, exitCode: 0 });
    }
    expect(mgr.getSharedContext().shellOutputs).toHaveLength(50);
  });
});

// ---------------------------------------------------------------------------
// Query methods
// ---------------------------------------------------------------------------

describe("query methods", () => {
  it("getRecentFileByPath returns matching file or undefined", () => {
    const mgr = getSharedContextManager();
    mgr.recordFileOperation({ path: "/a.txt", operation: "read", agentId: null });
    mgr.recordFileOperation({ path: "/b.txt", operation: "write", agentId: null });

    expect(mgr.getRecentFileByPath("/a.txt")?.path).toBe("/a.txt");
    expect(mgr.getRecentFileByPath("/missing.txt")).toBeUndefined();
  });

  it("getRecentFilesForAgent filters by agentId", () => {
    const mgr = getSharedContextManager();
    mgr.recordFileOperation({ path: "/a.txt", operation: "read", agentId: "ag1" });
    mgr.recordFileOperation({ path: "/b.txt", operation: "write", agentId: "ag2" });
    mgr.recordFileOperation({ path: "/c.txt", operation: "read", agentId: "ag1" });

    const ag1Files = mgr.getRecentFilesForAgent("ag1");
    expect(ag1Files).toHaveLength(2);
    expect(ag1Files.every(f => f.agentId === "ag1")).toBe(true);
  });

  it("getFetchedUrlsForAgent filters by agentId", () => {
    const mgr = getSharedContextManager();
    mgr.recordFetchedUrl({ url: "https://a.com", contentSummary: "", agentId: "x" });
    mgr.recordFetchedUrl({ url: "https://b.com", contentSummary: "", agentId: "y" });

    expect(mgr.getFetchedUrlsForAgent("x")).toHaveLength(1);
    expect(mgr.getFetchedUrlsForAgent("z")).toHaveLength(0);
  });

  it("getShellOutputsForAgent filters by agentId", () => {
    const mgr = getSharedContextManager();
    mgr.recordShellOutput({ command: "ls", output: "", agentId: "a1", exitCode: 0 });
    mgr.recordShellOutput({ command: "pwd", output: "", agentId: "a2", exitCode: 0 });

    expect(mgr.getShellOutputsForAgent("a1")).toHaveLength(1);
    expect(mgr.getShellOutputsForAgent("a1")[0].command).toBe("ls");
  });

  it("getSharedContext returns copies of arrays", () => {
    const mgr = getSharedContextManager();
    mgr.recordFileOperation({ path: "/x", operation: "read", agentId: null });

    const ctx1 = mgr.getSharedContext();
    const ctx2 = mgr.getSharedContext();
    expect(ctx1.recentFiles).not.toBe(ctx2.recentFiles);
  });
});

// ---------------------------------------------------------------------------
// getContextSummaryForLLM
// ---------------------------------------------------------------------------

describe("getContextSummaryForLLM", () => {
  it("returns empty string when no data recorded", () => {
    const mgr = getSharedContextManager();
    expect(mgr.getContextSummaryForLLM()).toBe("");
  });

  it("includes file operations section", () => {
    const mgr = getSharedContextManager();
    mgr.recordFileOperation({ path: "/hello.txt", operation: "read", agentId: null });
    const summary = mgr.getContextSummaryForLLM();
    expect(summary).toContain("## Recent File Operations");
    expect(summary).toContain("read: /hello.txt");
  });

  it("includes web requests section", () => {
    const mgr = getSharedContextManager();
    mgr.recordFetchedUrl({ url: "https://test.dev", contentSummary: "test page", agentId: null });
    const summary = mgr.getContextSummaryForLLM();
    expect(summary).toContain("## Recent Web Requests");
    expect(summary).toContain("https://test.dev");
  });

  it("includes shell commands section", () => {
    const mgr = getSharedContextManager();
    mgr.recordShellOutput({ command: "echo hi", output: "hi", agentId: null, exitCode: 0 });
    const summary = mgr.getContextSummaryForLLM();
    expect(summary).toContain("## Recent Shell Commands");
    expect(summary).toContain("`echo hi`");
    expect(summary).toContain("exit: 0");
  });

  it("filters by agentId when provided", () => {
    const mgr = getSharedContextManager();
    mgr.recordFileOperation({ path: "/agent-a.txt", operation: "read", agentId: "agA" });
    mgr.recordFileOperation({ path: "/agent-b.txt", operation: "write", agentId: "agB" });

    const summary = mgr.getContextSummaryForLLM("agA");
    expect(summary).toContain("/agent-a.txt");
    expect(summary).not.toContain("/agent-b.txt");
  });

  it("includes items with null agentId when filtering", () => {
    const mgr = getSharedContextManager();
    mgr.recordFileOperation({ path: "/shared.txt", operation: "read", agentId: null });
    mgr.recordFileOperation({ path: "/mine.txt", operation: "read", agentId: "me" });

    const summary = mgr.getContextSummaryForLLM("me");
    expect(summary).toContain("/shared.txt");
    expect(summary).toContain("/mine.txt");
  });

  it("truncates output to maxChars", () => {
    const mgr = getSharedContextManager();
    // Add many items to produce a long summary
    for (let i = 0; i < 50; i++) {
      mgr.recordFileOperation({
        path: `/some/very/long/path/to/file-number-${i}.txt`,
        operation: "read",
        agentId: null,
      });
    }
    const summary = mgr.getContextSummaryForLLM(undefined, 200);
    expect(summary.length).toBeLessThanOrEqual(200 + 20); // allow for "... (truncated)"
    expect(summary).toContain("... (truncated)");
  });

  it("shows null exitCode as N/A", () => {
    const mgr = getSharedContextManager();
    mgr.recordShellOutput({ command: "broken", output: "", agentId: null, exitCode: null });
    const summary = mgr.getContextSummaryForLLM();
    expect(summary).toContain("exit: N/A");
  });
});

// ---------------------------------------------------------------------------
// Cleanup methods
// ---------------------------------------------------------------------------

describe("cleanup methods", () => {
  it("clear() removes all data", () => {
    const mgr = getSharedContextManager();
    mgr.recordFileOperation({ path: "/a", operation: "read", agentId: null });
    mgr.recordFetchedUrl({ url: "https://b", contentSummary: "", agentId: null });
    mgr.recordShellOutput({ command: "c", output: "", agentId: null, exitCode: 0 });

    mgr.clear();
    const ctx = mgr.getSharedContext();
    expect(ctx.recentFiles).toHaveLength(0);
    expect(ctx.fetchedUrls).toHaveLength(0);
    expect(ctx.shellOutputs).toHaveLength(0);
  });

  it("clearForAgent() removes only that agent's data", () => {
    const mgr = getSharedContextManager();
    mgr.recordFileOperation({ path: "/a", operation: "read", agentId: "keep" });
    mgr.recordFileOperation({ path: "/b", operation: "write", agentId: "remove" });
    mgr.recordFetchedUrl({ url: "https://keep", contentSummary: "", agentId: "keep" });
    mgr.recordFetchedUrl({ url: "https://remove", contentSummary: "", agentId: "remove" });
    mgr.recordShellOutput({ command: "keep", output: "", agentId: "keep", exitCode: 0 });
    mgr.recordShellOutput({ command: "remove", output: "", agentId: "remove", exitCode: 0 });

    mgr.clearForAgent("remove");

    const ctx = mgr.getSharedContext();
    expect(ctx.recentFiles).toHaveLength(1);
    expect(ctx.recentFiles[0].agentId).toBe("keep");
    expect(ctx.fetchedUrls).toHaveLength(1);
    expect(ctx.fetchedUrls[0].agentId).toBe("keep");
    expect(ctx.shellOutputs).toHaveLength(1);
    expect(ctx.shellOutputs[0].agentId).toBe("keep");
  });

  it("clearOlderThan() removes items before the cutoff date", () => {
    const mgr = getSharedContextManager();

    // Record items, then manipulate timestamps via getSharedContext
    mgr.recordFileOperation({ path: "/old", operation: "read", agentId: null });
    mgr.recordShellOutput({ command: "old-cmd", output: "", agentId: null, exitCode: 0 });

    // These will have recent timestamps. Let's add newer ones after a small gap.
    mgr.recordFileOperation({ path: "/new", operation: "write", agentId: null });

    // The cutoff is "now", so everything recorded before now should be kept
    // (they were all just created). To test properly, set cutoff in the future.
    const futureDate = new Date(Date.now() + 100000);
    mgr.clearOlderThan(futureDate);

    const ctx = mgr.getSharedContext();
    expect(ctx.recentFiles).toHaveLength(0);
    expect(ctx.shellOutputs).toHaveLength(0);
  });

  it("clearOlderThan() keeps items at or after the cutoff date", () => {
    const mgr = getSharedContextManager();
    mgr.recordFileOperation({ path: "/recent", operation: "read", agentId: null });

    // cutoff in the past should keep everything
    const pastDate = new Date(Date.now() - 100000);
    mgr.clearOlderThan(pastDate);

    expect(mgr.getSharedContext().recentFiles).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// syncContextFromTracker
// ---------------------------------------------------------------------------

describe("syncContextFromTracker", () => {
  it("populates context from tracker records", () => {
    const now = new Date();
    const mockRecords = [
      {
        id: "r1",
        toolName: "read_file",
        category: "file_system",
        arguments: { path: "/synced.txt" },
        queuedAt: now,
        status: "success",
        result: "synced content",
        agentId: "sync-agent",
      },
      {
        id: "r2",
        toolName: "http_fetch",
        category: "web",
        arguments: { url: "https://synced.dev" },
        queuedAt: now,
        status: "success",
        result: "page content",
        agentId: null,
      },
      {
        id: "r3",
        toolName: "shell_execute",
        category: "system",
        arguments: { command: "echo synced" },
        queuedAt: now,
        status: "success",
        result: "synced output\nExit code: 0",
        agentId: null,
      },
    ];

    vi.mocked(getExecutionTracker).mockReturnValue({
      getAllRecords: vi.fn(() => mockRecords),
    } as unknown as ReturnType<typeof getExecutionTracker>);

    syncContextFromTracker();

    const mgr = getSharedContextManager();
    const ctx = mgr.getSharedContext();

    expect(ctx.recentFiles).toHaveLength(1);
    expect(ctx.recentFiles[0]).toMatchObject({ path: "/synced.txt", operation: "read" });

    expect(ctx.fetchedUrls).toHaveLength(1);
    expect(ctx.fetchedUrls[0]).toMatchObject({ url: "https://synced.dev" });

    expect(ctx.shellOutputs).toHaveLength(1);
    expect(ctx.shellOutputs[0]).toMatchObject({ command: "echo synced", exitCode: 0 });
  });

  it("skips records older than 24 hours", () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const mockRecords = [
      {
        id: "old",
        toolName: "read_file",
        category: "file_system",
        arguments: { path: "/old.txt" },
        queuedAt: oldDate,
        status: "success",
        result: "old",
        agentId: null,
      },
    ];

    vi.mocked(getExecutionTracker).mockReturnValue({
      getAllRecords: vi.fn(() => mockRecords),
    } as unknown as ReturnType<typeof getExecutionTracker>);

    syncContextFromTracker();
    expect(getSharedContextManager().getSharedContext().recentFiles).toHaveLength(0);
  });

  it("skips records that are not successful", () => {
    const mockRecords = [
      {
        id: "err",
        toolName: "read_file",
        category: "file_system",
        arguments: { path: "/err.txt" },
        queuedAt: new Date(),
        status: "error",
        result: null,
        agentId: null,
      },
    ];

    vi.mocked(getExecutionTracker).mockReturnValue({
      getAllRecords: vi.fn(() => mockRecords),
    } as unknown as ReturnType<typeof getExecutionTracker>);

    syncContextFromTracker();
    expect(getSharedContextManager().getSharedContext().recentFiles).toHaveLength(0);
  });

  it("maps write_file and delete_path correctly", () => {
    const now = new Date();
    const mockRecords = [
      {
        id: "w",
        toolName: "write_file",
        category: "file_system",
        arguments: { path: "/w.txt" },
        queuedAt: now,
        status: "success",
        result: "ok",
        agentId: null,
      },
      {
        id: "d",
        toolName: "delete_path",
        category: "file_system",
        arguments: { path: "/d.txt" },
        queuedAt: now,
        status: "success",
        result: "ok",
        agentId: null,
      },
    ];

    vi.mocked(getExecutionTracker).mockReturnValue({
      getAllRecords: vi.fn(() => mockRecords),
    } as unknown as ReturnType<typeof getExecutionTracker>);

    syncContextFromTracker();

    const files = getSharedContextManager().getSharedContext().recentFiles;
    expect(files).toHaveLength(2);
    const ops = files.map(f => f.operation).sort();
    expect(ops).toEqual(["delete", "write"]);
  });

  it("parses exit code from shell output", () => {
    const mockRecords = [
      {
        id: "s1",
        toolName: "shell_execute",
        category: "system",
        arguments: { command: "fail" },
        queuedAt: new Date(),
        status: "success",
        result: "error output\nExit code: 1",
        agentId: null,
      },
      {
        id: "s2",
        toolName: "shell_execute",
        category: "system",
        arguments: { command: "na" },
        queuedAt: new Date(),
        status: "success",
        result: "no exit\nExit code: N/A",
        agentId: null,
      },
    ];

    vi.mocked(getExecutionTracker).mockReturnValue({
      getAllRecords: vi.fn(() => mockRecords),
    } as unknown as ReturnType<typeof getExecutionTracker>);

    syncContextFromTracker();

    const shells = getSharedContextManager().getSharedContext().shellOutputs;
    expect(shells).toHaveLength(2);
    // Most recent first (unshift)
    const failShell = shells.find(s => s.command === "fail");
    const naShell = shells.find(s => s.command === "na");
    expect(failShell?.exitCode).toBe(1);
    expect(naShell?.exitCode).toBeNull();
  });

  it("skips file_system records without a path argument", () => {
    const mockRecords = [
      {
        id: "nopath",
        toolName: "read_file",
        category: "file_system",
        arguments: {},
        queuedAt: new Date(),
        status: "success",
        result: "ok",
        agentId: null,
      },
    ];

    vi.mocked(getExecutionTracker).mockReturnValue({
      getAllRecords: vi.fn(() => mockRecords),
    } as unknown as ReturnType<typeof getExecutionTracker>);

    syncContextFromTracker();
    expect(getSharedContextManager().getSharedContext().recentFiles).toHaveLength(0);
  });
});
