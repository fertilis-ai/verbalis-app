import { describe, it, expect, beforeEach } from "vitest";
import {
  makeConversation,
  mockGetActiveModels,
  mockGetModel,
  mockReadFile,
  mockSettingsGetState,
  mockStreamSimple,
  resetChatStore,
} from "@/test/chat-store-harness";
import { useChatStore } from "./chat-store";

// chat-store tests for context files and their injection into prompts. Mocks
// and fixtures are in test/chat-store-harness.ts.

describe("chat-store", () => {
  beforeEach(() => {
    resetChatStore();
  });

  // -----------------------------------------------------------------------
  // Context files
  // -----------------------------------------------------------------------
  describe("context files", () => {
    it("removeContextFile removes by path", () => {
      useChatStore.setState({
        contextFiles: [
          { path: "/a.txt", name: "a.txt", content: "a" },
          { path: "/b.txt", name: "b.txt", content: "b" },
        ],
      });
      useChatStore.getState().removeContextFile("/a.txt");
      const files = useChatStore.getState().contextFiles;
      expect(files).toHaveLength(1);
      expect(files[0]!.path).toBe("/b.txt");
    });

    it("clearContextFiles empties the list", () => {
      useChatStore.setState({
        contextFiles: [{ path: "/a.txt", name: "a.txt", content: "a" }],
      });
      useChatStore.getState().clearContextFiles();
      expect(useChatStore.getState().contextFiles).toEqual([]);
    });

    it("removeContextFile does nothing if path not found", () => {
      useChatStore.setState({
        contextFiles: [{ path: "/a.txt", name: "a.txt", content: "a" }],
      });
      useChatStore.getState().removeContextFile("/nonexistent.txt");
      expect(useChatStore.getState().contextFiles).toHaveLength(1);
    });

    it("clearContextFiles on already empty list is a no-op", () => {
      useChatStore.setState({ contextFiles: [] });
      useChatStore.getState().clearContextFiles();
      expect(useChatStore.getState().contextFiles).toEqual([]);
    });
  });


  // -----------------------------------------------------------------------
  // addContextFiles
  // -----------------------------------------------------------------------
  describe("addContextFiles", () => {
    it("adds files by reading their contents", async () => {
      mockReadFile.mockResolvedValue("file content here");
      await useChatStore.getState().addContextFiles(["/test/file.txt"]);
      const files = useChatStore.getState().contextFiles;
      expect(files).toHaveLength(1);
      expect(files[0]!.path).toBe("/test/file.txt");
      expect(files[0]!.name).toBe("file.txt");
      expect(files[0]!.content).toBe("file content here");
    });

    it("extracts filename from path", async () => {
      mockReadFile.mockResolvedValue("data");
      await useChatStore.getState().addContextFiles(["/some/deep/path/myfile.ts"]);
      expect(useChatStore.getState().contextFiles[0]!.name).toBe("myfile.ts");
    });

    it("skips duplicate paths", async () => {
      useChatStore.setState({
        contextFiles: [{ path: "/a.txt", name: "a.txt", content: "a" }],
      });
      mockReadFile.mockResolvedValue("new content");
      await useChatStore.getState().addContextFiles(["/a.txt"]);
      expect(useChatStore.getState().contextFiles).toHaveLength(1);
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it("adds multiple files at once", async () => {
      mockReadFile.mockResolvedValue("content");
      await useChatStore.getState().addContextFiles(["/a.txt", "/b.txt", "/c.txt"]);
      expect(useChatStore.getState().contextFiles).toHaveLength(3);
    });

    it("truncates files over 50,000 characters", async () => {
      const longContent = "x".repeat(60_000);
      mockReadFile.mockResolvedValue(longContent);
      await useChatStore.getState().addContextFiles(["/big.txt"]);
      const file = useChatStore.getState().contextFiles[0];
      expect(file!.content.length).toBeLessThan(60_000);
      expect(file!.content).toContain("... (truncated)");
    });

    it("handles file read errors gracefully", async () => {
      mockReadFile.mockRejectedValueOnce(new Error("Permission denied"));
      await useChatStore.getState().addContextFiles(["/forbidden.txt"]);
      expect(useChatStore.getState().contextFiles).toHaveLength(0);
    });

    it("reads some files even when others fail", async () => {
      mockReadFile
        .mockResolvedValueOnce("good content")
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce("also good");
      await useChatStore.getState().addContextFiles(["/a.txt", "/b.txt", "/c.txt"]);
      expect(useChatStore.getState().contextFiles).toHaveLength(2);
    });

    it("does nothing when given empty array", async () => {
      await useChatStore.getState().addContextFiles([]);
      expect(useChatStore.getState().contextFiles).toEqual([]);
      expect(mockReadFile).not.toHaveBeenCalled();
    });
  });


  // -----------------------------------------------------------------------
  // Context files injected into system prompt (via sendMessage)
  // -----------------------------------------------------------------------
  describe("context file injection", () => {
    beforeEach(() => {
      mockGetActiveModels.mockReturnValue([
        { id: "claude-sonnet-4-20250514", name: "Sonnet", provider: "anthropic" },
      ]);
      mockGetModel.mockReturnValue({
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet",
        api: "anthropic",
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      });
      mockSettingsGetState.mockReturnValue({
        apiKeys: { anthropic: "sk-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [],
        defaultModel: "claude-sonnet-4-20250514",
      });
      mockStreamSimple.mockReturnValue(
        (async function* () {
          yield { type: "text_delta", delta: "Response" };
        })(),
      );
    });

    it("sends message successfully when context files are attached", async () => {
      const conv = makeConversation({ id: "c1" });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
        contextFiles: [{ path: "/test.ts", name: "test.ts", content: "const x = 1;" }],
      });

      await useChatStore.getState().sendMessage("Explain this");
      // Should complete without errors
      expect(useChatStore.getState().isStreaming).toBe(false);
    });
  });
});
