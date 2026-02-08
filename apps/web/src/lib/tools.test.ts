import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

// Mock web-tools
vi.mock("./tools/web-tools", () => ({
  WEB_TOOL_DEFINITIONS: {
    http_fetch: {
      name: "http_fetch",
      description: "Make an HTTP request",
      category: "web",
      riskLevel: "medium",
      requiresNetwork: true,
      supportsUndo: false,
      estimatedDurationMs: 2000,
    },
    web_search: {
      name: "web_search",
      description: "Search the web",
      category: "web",
      riskLevel: "low",
      requiresNetwork: true,
      supportsUndo: false,
      estimatedDurationMs: 3000,
    },
    scrape_webpage: {
      name: "scrape_webpage",
      description: "Scrape a webpage",
      category: "web",
      riskLevel: "low",
      requiresNetwork: true,
      supportsUndo: false,
      estimatedDurationMs: 3000,
    },
  },
  executeWebTool: vi.fn(),
  HttpFetchParams: {},
  WebSearchParams: {},
  ScrapeWebpageParams: {},
}));

import { invoke } from "@tauri-apps/api/core";
import { executeWebTool } from "./tools/web-tools";
import {
  TOOL_DEFINITIONS,
  getToolsForContext,
  getToolCategory,
  getToolRiskLevel,
  toolSupportsUndo,
  executeTool,
} from "./tools";

const mockInvoke = vi.mocked(invoke);
const mockExecuteWebTool = vi.mocked(executeWebTool);

describe("tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("TOOL_DEFINITIONS", () => {
    it("includes all expected file system tools", () => {
      const fsTools = ["read_file", "write_file", "delete_path", "create_directory", "read_directory", "path_exists", "list_files", "rename_path"];
      for (const name of fsTools) {
        expect(TOOL_DEFINITIONS[name]).toBeDefined();
        expect(TOOL_DEFINITIONS[name].name).toBe(name);
        expect(TOOL_DEFINITIONS[name].category).toBe("file_system");
      }
    });

    it("includes web tools", () => {
      const webTools = ["http_fetch", "web_search", "scrape_webpage"];
      for (const name of webTools) {
        expect(TOOL_DEFINITIONS[name]).toBeDefined();
        expect(TOOL_DEFINITIONS[name].name).toBe(name);
      }
    });

    it("marks destructive tools as requiring confirmation", () => {
      expect(TOOL_DEFINITIONS.write_file.requiresConfirmation).toBe(true);
      expect(TOOL_DEFINITIONS.delete_path.requiresConfirmation).toBe(true);
      expect(TOOL_DEFINITIONS.create_directory.requiresConfirmation).toBe(true);
      expect(TOOL_DEFINITIONS.rename_path.requiresConfirmation).toBe(true);
    });

    it("marks read-only tools as not requiring confirmation", () => {
      expect(TOOL_DEFINITIONS.read_file.requiresConfirmation).toBe(false);
      expect(TOOL_DEFINITIONS.read_directory.requiresConfirmation).toBe(false);
      expect(TOOL_DEFINITIONS.path_exists.requiresConfirmation).toBe(false);
      expect(TOOL_DEFINITIONS.list_files.requiresConfirmation).toBe(false);
    });

    it("assigns correct risk levels", () => {
      expect(TOOL_DEFINITIONS.read_file.riskLevel).toBe("low");
      expect(TOOL_DEFINITIONS.write_file.riskLevel).toBe("medium");
      expect(TOOL_DEFINITIONS.delete_path.riskLevel).toBe("high");
    });
  });

  describe("getToolsForContext", () => {
    it("returns an array of tool objects with name, description, and parameters", () => {
      const tools = getToolsForContext();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(Object.keys(TOOL_DEFINITIONS).length);

      for (const tool of tools) {
        expect(tool).toHaveProperty("name");
        expect(tool).toHaveProperty("description");
        expect(tool).toHaveProperty("parameters");
      }
    });

    it("returns tools with correct names", () => {
      const tools = getToolsForContext();
      const names = tools.map((t) => t.name);
      expect(names).toContain("read_file");
      expect(names).toContain("write_file");
      expect(names).toContain("http_fetch");
    });
  });

  describe("getToolCategory", () => {
    it("returns file_system for file tools", () => {
      expect(getToolCategory("read_file")).toBe("file_system");
      expect(getToolCategory("write_file")).toBe("file_system");
    });

    it("returns custom for unknown tools", () => {
      expect(getToolCategory("nonexistent_tool")).toBe("custom");
    });
  });

  describe("getToolRiskLevel", () => {
    it("returns correct risk levels for known tools", () => {
      expect(getToolRiskLevel("read_file")).toBe("low");
      expect(getToolRiskLevel("delete_path")).toBe("high");
    });

    it("returns high for unknown tools", () => {
      expect(getToolRiskLevel("nonexistent_tool")).toBe("high");
    });
  });

  describe("toolSupportsUndo", () => {
    it("returns true for tools that support undo", () => {
      expect(toolSupportsUndo("write_file")).toBe(true);
      expect(toolSupportsUndo("delete_path")).toBe(true);
      expect(toolSupportsUndo("rename_path")).toBe(true);
    });

    it("returns false for read-only tools", () => {
      expect(toolSupportsUndo("read_file")).toBe(false);
      expect(toolSupportsUndo("path_exists")).toBe(false);
    });

    it("returns false for unknown tools", () => {
      expect(toolSupportsUndo("nonexistent_tool")).toBe(false);
    });
  });

  describe("executeTool", () => {
    it("executes read_file via invoke", async () => {
      mockInvoke.mockResolvedValueOnce("file contents here");

      const result = await executeTool({
        id: "tc-1",
        name: "read_file",
        arguments: { path: "/tmp/test.txt" },
      });

      expect(result).toEqual({
        toolCallId: "tc-1",
        toolName: "read_file",
        status: "success",
        result: "file contents here",
      });
      expect(mockInvoke).toHaveBeenCalledWith("read_file", { path: "/tmp/test.txt" });
    });

    it("executes write_file via invoke", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const result = await executeTool({
        id: "tc-2",
        name: "write_file",
        arguments: { path: "/tmp/out.txt", content: "hello" },
      });

      expect(result).toEqual({
        toolCallId: "tc-2",
        toolName: "write_file",
        status: "success",
        result: "Successfully wrote to /tmp/out.txt",
      });
      expect(mockInvoke).toHaveBeenCalledWith("write_file", { path: "/tmp/out.txt", content: "hello" });
    });

    it("executes delete_path via invoke", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const result = await executeTool({
        id: "tc-3",
        name: "delete_path",
        arguments: { path: "/tmp/remove" },
      });

      expect(result.status).toBe("success");
      expect(result.result).toContain("Successfully deleted /tmp/remove");
    });

    it("executes create_directory via invoke", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const result = await executeTool({
        id: "tc-4",
        name: "create_directory",
        arguments: { path: "/tmp/newdir" },
      });

      expect(result.status).toBe("success");
      expect(result.result).toContain("Successfully created directory /tmp/newdir");
    });

    it("executes read_directory and formats result as JSON", async () => {
      const dirContents = [{ name: "file.txt", type: "file" }];
      mockInvoke.mockResolvedValueOnce(dirContents);

      const result = await executeTool({
        id: "tc-5",
        name: "read_directory",
        arguments: { path: "/tmp", max_depth: 2 },
      });

      expect(result.status).toBe("success");
      expect(result.result).toBe(JSON.stringify(dirContents, null, 2));
      expect(mockInvoke).toHaveBeenCalledWith("read_directory", { path: "/tmp", maxDepth: 2 });
    });

    it("executes path_exists and returns human-readable result when path exists", async () => {
      mockInvoke.mockResolvedValueOnce(true);

      const result = await executeTool({
        id: "tc-6",
        name: "path_exists",
        arguments: { path: "/tmp/exists" },
      });

      expect(result.status).toBe("success");
      expect(result.result).toBe("Path exists: /tmp/exists");
    });

    it("executes path_exists and returns human-readable result when path does not exist", async () => {
      mockInvoke.mockResolvedValueOnce(false);

      const result = await executeTool({
        id: "tc-7",
        name: "path_exists",
        arguments: { path: "/tmp/nope" },
      });

      expect(result.status).toBe("success");
      expect(result.result).toBe("Path does not exist: /tmp/nope");
    });

    it("executes list_files and joins array results with newlines", async () => {
      mockInvoke.mockResolvedValueOnce(["a.txt", "b.txt", "c.txt"]);

      const result = await executeTool({
        id: "tc-8",
        name: "list_files",
        arguments: { dir: "/tmp", extension: "txt" },
      });

      expect(result.status).toBe("success");
      expect(result.result).toBe("a.txt\nb.txt\nc.txt");
      expect(mockInvoke).toHaveBeenCalledWith("list_files", { dir: "/tmp", extension: "txt" });
    });

    it("executes list_files and handles non-array result", async () => {
      mockInvoke.mockResolvedValueOnce("single result");

      const result = await executeTool({
        id: "tc-8b",
        name: "list_files",
        arguments: { dir: "/tmp" },
      });

      expect(result.status).toBe("success");
      expect(result.result).toBe("single result");
    });

    it("executes rename_path via invoke", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const result = await executeTool({
        id: "tc-9",
        name: "rename_path",
        arguments: { old_path: "/tmp/a", new_path: "/tmp/b" },
      });

      expect(result.status).toBe("success");
      expect(result.result).toContain("Successfully renamed /tmp/a to /tmp/b");
      expect(mockInvoke).toHaveBeenCalledWith("rename_path", { oldPath: "/tmp/a", newPath: "/tmp/b" });
    });

    it("delegates web tools to executeWebTool", async () => {
      mockExecuteWebTool.mockResolvedValueOnce("web result");

      const result = await executeTool({
        id: "tc-10",
        name: "http_fetch",
        arguments: { url: "https://example.com" },
      });

      expect(result.status).toBe("success");
      expect(result.result).toBe("web result");
      expect(mockExecuteWebTool).toHaveBeenCalledWith("http_fetch", { url: "https://example.com" });
    });

    it("delegates web_search to executeWebTool", async () => {
      mockExecuteWebTool.mockResolvedValueOnce("search results");

      const result = await executeTool({
        id: "tc-11",
        name: "web_search",
        arguments: { query: "test" },
      });

      expect(result.status).toBe("success");
      expect(mockExecuteWebTool).toHaveBeenCalledWith("web_search", { query: "test" });
    });

    it("delegates scrape_webpage to executeWebTool", async () => {
      mockExecuteWebTool.mockResolvedValueOnce("scraped content");

      const result = await executeTool({
        id: "tc-12",
        name: "scrape_webpage",
        arguments: { url: "https://example.com" },
      });

      expect(result.status).toBe("success");
      expect(mockExecuteWebTool).toHaveBeenCalledWith("scrape_webpage", { url: "https://example.com" });
    });

    it("returns error for unknown tool", async () => {
      const result = await executeTool({
        id: "tc-err",
        name: "nonexistent_tool",
        arguments: {},
      });

      expect(result).toEqual({
        toolCallId: "tc-err",
        toolName: "nonexistent_tool",
        status: "error",
        error: "Unknown tool: nonexistent_tool",
      });
    });

    it("catches invoke errors and returns error result", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("Permission denied"));

      const result = await executeTool({
        id: "tc-fail",
        name: "read_file",
        arguments: { path: "/root/secret" },
      });

      expect(result).toEqual({
        toolCallId: "tc-fail",
        toolName: "read_file",
        status: "error",
        error: "Permission denied",
      });
    });

    it("catches non-Error thrown values and converts to string", async () => {
      mockInvoke.mockRejectedValueOnce("string error");

      const result = await executeTool({
        id: "tc-fail2",
        name: "read_file",
        arguments: { path: "/tmp/x" },
      });

      expect(result.status).toBe("error");
      expect(result.error).toBe("string error");
    });

    it("catches web tool errors", async () => {
      mockExecuteWebTool.mockRejectedValueOnce(new Error("Network error"));

      const result = await executeTool({
        id: "tc-webfail",
        name: "http_fetch",
        arguments: { url: "https://bad.example.com" },
      });

      expect(result.status).toBe("error");
      expect(result.error).toBe("Network error");
    });

    it("stringifies non-string invoke results", async () => {
      mockInvoke.mockResolvedValueOnce({ key: "value" });

      const result = await executeTool({
        id: "tc-obj",
        name: "read_file",
        arguments: { path: "/tmp/data.json" },
      });

      expect(result.status).toBe("success");
      expect(result.result).toBe('{"key":"value"}');
    });
  });
});
