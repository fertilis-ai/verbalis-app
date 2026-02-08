import { describe, it, expect, beforeEach, vi } from "vitest";

const mockInvoke = vi.fn();
const mockIsTauri = vi.fn(() => false);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@/lib/storage", () => ({
  isTauri: () => mockIsTauri(),
}));

import { useDebugStore } from "./debug-store";

describe("debug-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauri.mockReturnValue(false);
    mockInvoke.mockResolvedValue(undefined);
    useDebugStore.setState({
      logFiles: [],
      selectedFile: null,
      fileContent: "",
      isLoading: false,
    });
  });

  describe("initial state", () => {
    it("has empty log files", () => {
      expect(useDebugStore.getState().logFiles).toEqual([]);
    });

    it("has no selected file", () => {
      expect(useDebugStore.getState().selectedFile).toBeNull();
    });

    it("has empty file content", () => {
      expect(useDebugStore.getState().fileContent).toBe("");
    });

    it("is not loading", () => {
      expect(useDebugStore.getState().isLoading).toBe(false);
    });
  });

  describe("loadLogFiles", () => {
    it("does nothing when not in Tauri", async () => {
      await useDebugStore.getState().loadLogFiles();
      expect(mockInvoke).not.toHaveBeenCalled();
      expect(useDebugStore.getState().logFiles).toEqual([]);
    });

    it("loads log files in Tauri", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue(["agent.txt", "error.txt"]);
      await useDebugStore.getState().loadLogFiles();
      expect(mockInvoke).toHaveBeenCalledWith("list_log_files");
      expect(useDebugStore.getState().logFiles).toEqual(["agent.txt", "error.txt"]);
    });

    it("handles errors gracefully", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockRejectedValue(new Error("fs error"));
      await useDebugStore.getState().loadLogFiles();
      expect(useDebugStore.getState().logFiles).toEqual([]);
    });
  });

  describe("selectFile", () => {
    it("does nothing when not in Tauri", async () => {
      await useDebugStore.getState().selectFile("agent.txt");
      expect(mockInvoke).not.toHaveBeenCalled();
      expect(useDebugStore.getState().selectedFile).toBeNull();
    });

    it("selects a file and loads its content", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue("log line 1\nlog line 2");
      await useDebugStore.getState().selectFile("agent.txt");
      expect(useDebugStore.getState().selectedFile).toBe("agent.txt");
      expect(useDebugStore.getState().fileContent).toBe("log line 1\nlog line 2");
      expect(useDebugStore.getState().isLoading).toBe(false);
      expect(mockInvoke).toHaveBeenCalledWith("read_log_file", { filename: "agent.txt" });
    });

    it("sets isLoading during load", async () => {
      mockIsTauri.mockReturnValue(true);
      let resolveInvoke: (v: string) => void;
      mockInvoke.mockImplementation(
        () => new Promise<string>((resolve) => { resolveInvoke = resolve; })
      );
      const promise = useDebugStore.getState().selectFile("agent.txt");
      // isLoading should be true while waiting
      expect(useDebugStore.getState().isLoading).toBe(true);
      expect(useDebugStore.getState().selectedFile).toBe("agent.txt");
      resolveInvoke!("content");
      await promise;
      expect(useDebugStore.getState().isLoading).toBe(false);
    });

    it("clears content on error", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockRejectedValue(new Error("read error"));
      await useDebugStore.getState().selectFile("broken.txt");
      expect(useDebugStore.getState().selectedFile).toBe("broken.txt");
      expect(useDebugStore.getState().fileContent).toBe("");
      expect(useDebugStore.getState().isLoading).toBe(false);
    });
  });

  describe("refreshContent", () => {
    it("does nothing when no file selected", async () => {
      mockIsTauri.mockReturnValue(true);
      await useDebugStore.getState().refreshContent();
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("does nothing when not in Tauri", async () => {
      useDebugStore.setState({ selectedFile: "agent.txt" });
      await useDebugStore.getState().refreshContent();
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("refreshes content of selected file", async () => {
      mockIsTauri.mockReturnValue(true);
      useDebugStore.setState({ selectedFile: "agent.txt", fileContent: "old" });
      mockInvoke.mockResolvedValue("new content");
      await useDebugStore.getState().refreshContent();
      expect(useDebugStore.getState().fileContent).toBe("new content");
      expect(mockInvoke).toHaveBeenCalledWith("read_log_file", { filename: "agent.txt" });
    });

    it("keeps old content on error", async () => {
      mockIsTauri.mockReturnValue(true);
      useDebugStore.setState({ selectedFile: "agent.txt", fileContent: "old content" });
      mockInvoke.mockRejectedValue(new Error("refresh error"));
      await useDebugStore.getState().refreshContent();
      expect(useDebugStore.getState().fileContent).toBe("old content");
    });
  });

  describe("clearSelectedFile", () => {
    it("does nothing when no file selected", async () => {
      mockIsTauri.mockReturnValue(true);
      await useDebugStore.getState().clearSelectedFile();
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("does nothing when not in Tauri", async () => {
      useDebugStore.setState({ selectedFile: "agent.txt" });
      await useDebugStore.getState().clearSelectedFile();
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("clears the file content via Tauri invoke", async () => {
      mockIsTauri.mockReturnValue(true);
      useDebugStore.setState({ selectedFile: "agent.txt", fileContent: "some logs" });
      await useDebugStore.getState().clearSelectedFile();
      expect(mockInvoke).toHaveBeenCalledWith("clear_log_file", { filename: "agent.txt" });
      expect(useDebugStore.getState().fileContent).toBe("");
    });

    it("handles error gracefully", async () => {
      mockIsTauri.mockReturnValue(true);
      useDebugStore.setState({ selectedFile: "agent.txt", fileContent: "logs" });
      mockInvoke.mockRejectedValue(new Error("clear error"));
      await useDebugStore.getState().clearSelectedFile();
      // Content should remain unchanged on error
      expect(useDebugStore.getState().fileContent).toBe("logs");
    });
  });
});
