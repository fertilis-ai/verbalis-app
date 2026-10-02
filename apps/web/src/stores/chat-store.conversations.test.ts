import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  makeConversation,
  makeFolderTreeNode,
  makeMessage,
  mockCreateChatFolder,
  mockDeleteChatByPath,
  mockIsTauri,
  mockLoadChatByPath,
  mockLoadChatTree,
  mockSaveChatToFolder,
  resetChatStore,
} from "@/test/chat-store-harness";
import { useChatStore } from "./chat-store";

// chat-store tests for conversation lifecycle, selection, ghost mode and
// rename. Mocks and fixtures are in test/chat-store-harness.ts.

describe("chat-store", () => {
  beforeEach(() => {
    resetChatStore();
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------
  describe("initial state", () => {
    it("starts with empty conversations", () => {
      const state = useChatStore.getState();
      expect(state.conversations).toEqual([]);
      expect(state.currentConversationId).toBeNull();
    });

    it("starts with no streaming", () => {
      expect(useChatStore.getState().isStreaming).toBe(false);
    });

    it("starts with ghost mode off", () => {
      const s = useChatStore.getState();
      expect(s.isGhostMode).toBe(false);
      expect(s.ghostConversation).toBeNull();
    });

    it("starts with empty context files", () => {
      expect(useChatStore.getState().contextFiles).toEqual([]);
    });

    it("starts with default model", () => {
      expect(useChatStore.getState().model).toBe("claude-sonnet-4-20250514");
    });

    it("starts with null agentId", () => {
      expect(useChatStore.getState().agentId).toBeNull();
    });

    it("starts with empty chatTree", () => {
      expect(useChatStore.getState().chatTree).toEqual([]);
    });

    it("starts with empty expandedFolders", () => {
      expect(useChatStore.getState().expandedFolders.size).toBe(0);
    });
  });


  // -----------------------------------------------------------------------
  // getCurrentConversation
  // -----------------------------------------------------------------------
  describe("getCurrentConversation", () => {
    it("returns null when no conversation is selected", () => {
      expect(useChatStore.getState().getCurrentConversation()).toBeNull();
    });

    it("returns the selected conversation", () => {
      const conv = makeConversation({ id: "c1" });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
      });
      expect(useChatStore.getState().getCurrentConversation()).toEqual(conv);
    });

    it("returns ghost conversation when in ghost mode", () => {
      const ghost = makeConversation({ id: "ghost-1", title: "Ghost" });
      useChatStore.setState({
        isGhostMode: true,
        ghostConversation: ghost,
        currentConversationId: "ghost-1",
      });
      expect(useChatStore.getState().getCurrentConversation()).toEqual(ghost);
    });

    it("returns regular conversation when ghost mode on but different id", () => {
      const conv = makeConversation({ id: "c1" });
      const ghost = makeConversation({ id: "ghost-1" });
      useChatStore.setState({
        isGhostMode: true,
        ghostConversation: ghost,
        currentConversationId: "c1",
        conversations: [conv],
      });
      expect(useChatStore.getState().getCurrentConversation()).toEqual(conv);
    });

    it("returns null when currentConversationId does not match any conversation", () => {
      useChatStore.setState({
        conversations: [makeConversation({ id: "c1" })],
        currentConversationId: "nonexistent",
      });
      expect(useChatStore.getState().getCurrentConversation()).toBeNull();
    });

    it("returns null when ghost mode is on but no ghost conversation exists and id is set", () => {
      useChatStore.setState({
        isGhostMode: true,
        ghostConversation: null,
        currentConversationId: "ghost-1",
        conversations: [],
      });
      expect(useChatStore.getState().getCurrentConversation()).toBeNull();
    });
  });


  // -----------------------------------------------------------------------
  // setModel / setAgentId
  // -----------------------------------------------------------------------
  describe("setModel / setAgentId", () => {
    it("updates the model", () => {
      useChatStore.getState().setModel("gpt-4o");
      expect(useChatStore.getState().model).toBe("gpt-4o");
    });

    it("updates the agentId", () => {
      useChatStore.getState().setAgentId("agent-1");
      expect(useChatStore.getState().agentId).toBe("agent-1");
    });

    it("sets agentId to null", () => {
      useChatStore.getState().setAgentId("agent-1");
      useChatStore.getState().setAgentId(null);
      expect(useChatStore.getState().agentId).toBeNull();
    });

    it("can set model multiple times", () => {
      useChatStore.getState().setModel("gpt-4o");
      useChatStore.getState().setModel("claude-opus-4-20250514");
      expect(useChatStore.getState().model).toBe("claude-opus-4-20250514");
    });
  });


  // -----------------------------------------------------------------------
  // createConversation
  // -----------------------------------------------------------------------
  describe("createConversation", () => {
    it("creates a new conversation and selects it", async () => {
      await useChatStore.getState().createConversation();
      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.currentConversationId).toBe(state.conversations[0]!.id);
    });

    it("sets default title 'New Chat'", async () => {
      await useChatStore.getState().createConversation();
      expect(useChatStore.getState().conversations[0]!.title).toBe("New Chat");
    });

    it("clears context files on creation", async () => {
      useChatStore.setState({
        contextFiles: [{ path: "/a.txt", name: "a.txt", content: "a" }],
      });
      await useChatStore.getState().createConversation();
      expect(useChatStore.getState().contextFiles).toEqual([]);
    });

    it("prepends the new conversation to the list (select=true)", async () => {
      const existing = makeConversation({ id: "existing" });
      useChatStore.setState({ conversations: [existing] });
      await useChatStore.getState().createConversation();
      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(2);
      expect(state.conversations[0]!.id).not.toBe("existing");
      expect(state.conversations[1]!.id).toBe("existing");
    });

    it("sets the path based on app data dir when no folder", async () => {
      await useChatStore.getState().createConversation();
      const conv = useChatStore.getState().conversations[0];
      expect(conv!.path).toContain("/mock-data/chats/");
      expect(conv!.path).toMatch(/\.json$/);
    });

    it("sets path within folder when folderId is provided and folder exists in tree", async () => {
      const folder = makeFolderTreeNode({
        id: "f1",
        path: "/mock-data/chats/my-folder",
      });
      useChatStore.setState({ chatTree: [folder] });
      await useChatStore.getState().createConversation("f1");
      const conv = useChatStore.getState().conversations[0];
      expect(conv!.path).toContain("/mock-data/chats/my-folder/");
    });

    it("falls back to default path when folderId not found in tree", async () => {
      useChatStore.setState({ chatTree: [] });
      await useChatStore.getState().createConversation("nonexistent-folder");
      const conv = useChatStore.getState().conversations[0];
      expect(conv!.path).toContain("/mock-data/chats/");
    });

    it("creates conversation with empty messages", async () => {
      await useChatStore.getState().createConversation();
      expect(useChatStore.getState().conversations[0]!.messages).toEqual([]);
    });

    it("sets createdAt and updatedAt", async () => {
      await useChatStore.getState().createConversation();
      const conv = useChatStore.getState().conversations[0];
      expect(conv!.createdAt).toBeInstanceOf(Date);
      expect(conv!.updatedAt).toBeInstanceOf(Date);
    });
  });


  // -----------------------------------------------------------------------
  // createConversationInBackground
  // -----------------------------------------------------------------------
  describe("createConversationInBackground", () => {
    it("creates a conversation without selecting it", async () => {
      useChatStore.setState({ currentConversationId: null });
      await useChatStore.getState().createConversationInBackground();
      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.currentConversationId).toBeNull();
    });

    it("appends to the end of the conversation list", async () => {
      const existing = makeConversation({ id: "existing" });
      useChatStore.setState({ conversations: [existing] });
      await useChatStore.getState().createConversationInBackground();
      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(2);
      expect(state.conversations[0]!.id).toBe("existing");
    });

    it("uses provided title", async () => {
      await useChatStore.getState().createConversationInBackground({ title: "Background Task" });
      expect(useChatStore.getState().conversations[0]!.title).toBe("Background Task");
    });

    it("defaults to 'New Chat' when no title given", async () => {
      await useChatStore.getState().createConversationInBackground();
      expect(useChatStore.getState().conversations[0]!.title).toBe("New Chat");
    });

    it("marks conversation as background", async () => {
      const conv = await useChatStore.getState().createConversationInBackground();
      expect(conv.background).toBe(true);
    });

    it("returns the created conversation object", async () => {
      const conv = await useChatStore.getState().createConversationInBackground({ title: "BG" });
      expect(conv).toBeDefined();
      expect(conv.title).toBe("BG");
      expect(conv.id).toBeDefined();
    });

    it("uses folderId when provided", async () => {
      const folder = makeFolderTreeNode({
        id: "f1",
        path: "/mock-data/chats/my-folder",
      });
      useChatStore.setState({ chatTree: [folder] });
      const conv = await useChatStore.getState().createConversationInBackground({ folderId: "f1" });
      expect(conv.path).toContain("/mock-data/chats/my-folder/");
    });

    it("does not change currentConversationId when one already exists", async () => {
      useChatStore.setState({ currentConversationId: "existing-id" });
      await useChatStore.getState().createConversationInBackground();
      expect(useChatStore.getState().currentConversationId).toBe("existing-id");
    });
  });


  // -----------------------------------------------------------------------
  // deleteConversation
  // -----------------------------------------------------------------------
  describe("deleteConversation", () => {
    it("removes the conversation from the list", async () => {
      const c1 = makeConversation({ id: "c1" });
      const c2 = makeConversation({ id: "c2" });
      useChatStore.setState({
        conversations: [c1, c2],
        currentConversationId: "c1",
      });

      await useChatStore.getState().deleteConversation("c1");
      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0]!.id).toBe("c2");
    });

    it("selects the next conversation when current is deleted", async () => {
      const c1 = makeConversation({ id: "c1" });
      const c2 = makeConversation({ id: "c2" });
      useChatStore.setState({
        conversations: [c1, c2],
        currentConversationId: "c1",
      });

      await useChatStore.getState().deleteConversation("c1");
      expect(useChatStore.getState().currentConversationId).toBe("c2");
    });

    it("sets currentConversationId to null when last is deleted", async () => {
      const c1 = makeConversation({ id: "c1" });
      useChatStore.setState({
        conversations: [c1],
        currentConversationId: "c1",
      });

      await useChatStore.getState().deleteConversation("c1");
      expect(useChatStore.getState().currentConversationId).toBeNull();
    });

    it("does not change selection when deleting a non-selected conversation", async () => {
      const c1 = makeConversation({ id: "c1" });
      const c2 = makeConversation({ id: "c2" });
      useChatStore.setState({
        conversations: [c1, c2],
        currentConversationId: "c1",
      });

      await useChatStore.getState().deleteConversation("c2");
      expect(useChatStore.getState().currentConversationId).toBe("c1");
    });

    it("does nothing when deleting a nonexistent conversation", async () => {
      const c1 = makeConversation({ id: "c1" });
      useChatStore.setState({
        conversations: [c1],
        currentConversationId: "c1",
      });

      await useChatStore.getState().deleteConversation("nonexistent");
      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.currentConversationId).toBe("c1");
    });

    it("calls deleteChatByPath and reloads when Tauri is available and conversation has path", async () => {
      mockIsTauri.mockReturnValue(true);
      const c1 = makeConversation({ id: "c1", path: "/mock-data/chats/c1.json" });
      useChatStore.setState({
        conversations: [c1],
        currentConversationId: "c1",
      });

      await useChatStore.getState().deleteConversation("c1");
      expect(mockDeleteChatByPath).toHaveBeenCalledWith("/mock-data/chats/c1.json");
      expect(mockLoadChatTree).toHaveBeenCalled();
    });

    it("does not call disk operations when isTauri returns false", async () => {
      mockIsTauri.mockReturnValue(false);
      const c1 = makeConversation({ id: "c1", path: "/mock-data/chats/c1.json" });
      useChatStore.setState({
        conversations: [c1],
        currentConversationId: "c1",
      });

      await useChatStore.getState().deleteConversation("c1");
      expect(mockDeleteChatByPath).not.toHaveBeenCalled();
    });
  });


  // -----------------------------------------------------------------------
  // selectConversation
  // -----------------------------------------------------------------------
  describe("selectConversation", () => {
    it("sets the currentConversationId", async () => {
      const c1 = makeConversation({ id: "c1" });
      useChatStore.setState({ conversations: [c1] });
      await useChatStore.getState().selectConversation("c1");
      expect(useChatStore.getState().currentConversationId).toBe("c1");
    });

    it("clears context files on selection", async () => {
      const c1 = makeConversation({ id: "c1" });
      useChatStore.setState({
        conversations: [c1],
        contextFiles: [{ path: "/a.txt", name: "a.txt", content: "a" }],
      });
      await useChatStore.getState().selectConversation("c1");
      expect(useChatStore.getState().contextFiles).toEqual([]);
    });

    it("selects ghost conversation when in ghost mode", async () => {
      const ghost = makeConversation({ id: "ghost-1" });
      useChatStore.setState({
        isGhostMode: true,
        ghostConversation: ghost,
      });
      await useChatStore.getState().selectConversation("ghost-1");
      expect(useChatStore.getState().currentConversationId).toBe("ghost-1");
    });

    it("does not load from disk if conversation already has messages", async () => {
      const c1 = makeConversation({
        id: "c1",
        path: "/mock-data/chats/c1.json",
        messages: [makeMessage()],
      });
      useChatStore.setState({ conversations: [c1] });
      await useChatStore.getState().selectConversation("c1");
      expect(mockLoadChatByPath).not.toHaveBeenCalled();
    });

    it("loads from disk if conversation has path and no messages", async () => {
      const c1 = makeConversation({
        id: "c1",
        path: "/mock-data/chats/c1.json",
        messages: [],
      });
      mockLoadChatByPath.mockResolvedValueOnce({
        id: "c1",
        title: "Loaded Title",
        model: "gpt-4o",
        agentId: null,
        messages: [
          {
            id: "m1",
            role: "user" as const,
            content: "Hello",
            createdAt: "2025-01-01T00:00:00.000Z",
          },
        ],
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-02T00:00:00.000Z",
      });
      useChatStore.setState({ conversations: [c1] });

      await useChatStore.getState().selectConversation("c1");

      expect(mockLoadChatByPath).toHaveBeenCalledWith("/mock-data/chats/c1.json");
      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.title).toBe("Loaded Title");
      expect(updated?.messages).toHaveLength(1);
      expect(updated?.messages[0]?.content).toBe("Hello");
    });

    it("marks pending/executing tool calls as error when loading from disk", async () => {
      const c1 = makeConversation({
        id: "c1",
        path: "/mock-data/chats/c1.json",
        messages: [],
      });
      mockLoadChatByPath.mockResolvedValueOnce({
        id: "c1",
        title: "With Tools",
        model: "gpt-4o",
        agentId: null,
        messages: [
          {
            id: "m1",
            role: "assistant" as const,
            content: "Using tool...",
            createdAt: "2025-01-01T00:00:00.000Z",
            toolCalls: [
              { id: "tc1", name: "read_file", arguments: {}, status: "pending", result: undefined, error: undefined },
              { id: "tc2", name: "write_file", arguments: {}, status: "executing", result: undefined, error: undefined },
              { id: "tc3", name: "done", arguments: {}, status: "success", result: "ok", error: undefined },
              { id: "tc4", name: "legacy_done", arguments: {}, status: "completed", result: "legacy ok", error: undefined },
              { id: "tc5", name: "legacy_fail", arguments: {}, status: "failed", result: undefined, error: "legacy err" },
              { id: "tc6", name: "awaiting", arguments: {}, status: "awaiting_approval", result: undefined, error: undefined },
            ],
          },
        ],
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-02T00:00:00.000Z",
      });
      useChatStore.setState({ conversations: [c1] });

      await useChatStore.getState().selectConversation("c1");

      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      const toolCalls = updated?.messages[0]?.toolCalls;
      expect(toolCalls).toHaveLength(6);
      expect(toolCalls![0]!.status).toBe("error");
      expect(toolCalls![0]!.error).toBe("Interrupted — app closed during execution");
      expect(toolCalls![1]!.status).toBe("error");
      expect(toolCalls![1]!.error).toBe("Interrupted — app closed during execution");
      expect(toolCalls![2]!.status).toBe("success");
      expect(toolCalls![3]!.status).toBe("success");
      expect(toolCalls![3]!.result).toBe("legacy ok");
      expect(toolCalls![4]!.status).toBe("error");
      expect(toolCalls![4]!.error).toBe("legacy err");
      expect(toolCalls![5]!.status).toBe("error");
      expect(toolCalls![5]!.error).toBe("Interrupted — app closed during execution");
    });

    it("does not call loadChatByPath if conversation has no path", async () => {
      const c1 = makeConversation({ id: "c1", path: undefined, messages: [] });
      useChatStore.setState({ conversations: [c1] });
      await useChatStore.getState().selectConversation("c1");
      expect(mockLoadChatByPath).not.toHaveBeenCalled();
    });

    it("does not crash when loadChatByPath returns null", async () => {
      const c1 = makeConversation({ id: "c1", path: "/mock-data/chats/c1.json", messages: [] });
      mockLoadChatByPath.mockResolvedValueOnce(null);
      useChatStore.setState({ conversations: [c1] });
      await useChatStore.getState().selectConversation("c1");
      // Conversation remains unchanged
      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.messages).toEqual([]);
    });
  });


  // -----------------------------------------------------------------------
  // Ghost mode
  // -----------------------------------------------------------------------
  describe("ghost mode", () => {
    it("starts a ghost session", () => {
      useChatStore.getState().startGhostSession();
      const state = useChatStore.getState();
      expect(state.isGhostMode).toBe(true);
      expect(state.ghostConversation).toBeNull();
      expect(state.currentConversationId).toBeNull();
    });

    it("exits a ghost session and restores first conversation", () => {
      const conv = makeConversation({ id: "c1" });
      useChatStore.setState({
        conversations: [conv],
        isGhostMode: true,
        ghostConversation: makeConversation({ id: "ghost" }),
        currentConversationId: "ghost",
      });

      useChatStore.getState().exitGhostSession();
      const state = useChatStore.getState();
      expect(state.isGhostMode).toBe(false);
      expect(state.ghostConversation).toBeNull();
      expect(state.currentConversationId).toBe("c1");
    });

    it("exits ghost session with null id when no conversations exist", () => {
      useChatStore.setState({
        conversations: [],
        isGhostMode: true,
        ghostConversation: makeConversation({ id: "ghost" }),
      });

      useChatStore.getState().exitGhostSession();
      expect(useChatStore.getState().currentConversationId).toBeNull();
    });

    it("starting ghost session preserves existing conversations", () => {
      const conv = makeConversation({ id: "c1" });
      useChatStore.setState({ conversations: [conv], currentConversationId: "c1" });
      useChatStore.getState().startGhostSession();
      expect(useChatStore.getState().conversations).toHaveLength(1);
    });

    it("exiting ghost session clears ghostConversation even when conversations exist", () => {
      const ghost = makeConversation({ id: "ghost" });
      const conv = makeConversation({ id: "c1" });
      useChatStore.setState({
        conversations: [conv],
        isGhostMode: true,
        ghostConversation: ghost,
        currentConversationId: "ghost",
      });
      useChatStore.getState().exitGhostSession();
      expect(useChatStore.getState().ghostConversation).toBeNull();
    });

    it("exiting returns to the conversation that was open before the ghost session", () => {
      useChatStore.setState({
        conversations: [makeConversation({ id: "c1" }), makeConversation({ id: "c2" })],
        currentConversationId: "c2",
      });
      useChatStore.getState().startGhostSession();
      useChatStore.getState().exitGhostSession();
      expect(useChatStore.getState().currentConversationId).toBe("c2");
    });

    it("exiting loads the messages of a chat not yet read from disk", async () => {
      useChatStore.setState({
        conversations: [makeConversation({ id: "c1", path: "/mock-data/chats/c1.json", messages: [] })],
        currentConversationId: "c1",
      });
      mockLoadChatByPath.mockResolvedValueOnce({
        id: "c1",
        title: "Loaded",
        model: "gpt-4o",
        agentId: null,
        messages: [{ id: "m1", role: "user" as const, content: "Hello", createdAt: "2025-01-01T00:00:00.000Z" }],
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-02T00:00:00.000Z",
      });

      useChatStore.getState().startGhostSession();
      useChatStore.getState().exitGhostSession();

      await vi.waitFor(() => {
        expect(useChatStore.getState().getCurrentConversation()?.messages).toHaveLength(1);
      });
      expect(mockLoadChatByPath).toHaveBeenCalledWith("/mock-data/chats/c1.json");
    });
  });


  // -----------------------------------------------------------------------
  // renameChat (in-memory part)
  // -----------------------------------------------------------------------
  describe("renameChat", () => {
    it("updates the conversation title in memory", async () => {
      const conv = makeConversation({ id: "c1", title: "Old Title" });
      useChatStore.setState({ conversations: [conv] });

      await useChatStore.getState().renameChat("c1", "New Title");
      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.title).toBe("New Title");
    });

    it("updates the updatedAt timestamp", async () => {
      const conv = makeConversation({ id: "c1", updatedAt: new Date("2020-01-01") });
      useChatStore.setState({ conversations: [conv] });

      await useChatStore.getState().renameChat("c1", "New Title");
      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(new Date("2020-01-01").getTime());
    });

    it("does not affect other conversations", async () => {
      const c1 = makeConversation({ id: "c1", title: "Chat 1" });
      const c2 = makeConversation({ id: "c2", title: "Chat 2" });
      useChatStore.setState({ conversations: [c1, c2] });

      await useChatStore.getState().renameChat("c1", "Renamed");
      expect(useChatStore.getState().conversations.find((c) => c.id === "c2")?.title).toBe("Chat 2");
    });

    it("saves to disk when Tauri is available and conversation has path", async () => {
      mockIsTauri.mockReturnValue(true);
      const conv = makeConversation({ id: "c1", title: "Old", path: "/mock-data/chats/c1.json" });
      useChatStore.setState({ conversations: [conv] });

      await useChatStore.getState().renameChat("c1", "New Title");
      expect(mockSaveChatToFolder).toHaveBeenCalled();
      expect(mockLoadChatTree).toHaveBeenCalled();
    });

    it("does not save to disk when isTauri is false", async () => {
      mockIsTauri.mockReturnValue(false);
      const conv = makeConversation({ id: "c1", title: "Old" });
      useChatStore.setState({ conversations: [conv] });

      await useChatStore.getState().renameChat("c1", "New Title");
      expect(mockSaveChatToFolder).not.toHaveBeenCalled();
    });
  });


  // -----------------------------------------------------------------------
  // Multiple conversations isolation
  // -----------------------------------------------------------------------
  describe("conversation isolation", () => {
    it("creating multiple conversations preserves all of them", async () => {
      await useChatStore.getState().createConversation();
      await useChatStore.getState().createConversation();
      await useChatStore.getState().createConversation();
      expect(useChatStore.getState().conversations).toHaveLength(3);
    });

    it("each conversation has a unique id", async () => {
      await useChatStore.getState().createConversation();
      await useChatStore.getState().createConversation();
      const ids = useChatStore.getState().conversations.map((c) => c.id);
      expect(new Set(ids).size).toBe(2);
    });

    it("deleting one conversation does not affect others", async () => {
      const c1 = makeConversation({ id: "c1", messages: [makeMessage({ content: "msg1" })] });
      const c2 = makeConversation({ id: "c2", messages: [makeMessage({ content: "msg2" })] });
      const c3 = makeConversation({ id: "c3", messages: [makeMessage({ content: "msg3" })] });
      useChatStore.setState({ conversations: [c1, c2, c3], currentConversationId: "c2" });

      await useChatStore.getState().deleteConversation("c2");

      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(2);
      expect(state.conversations[0]!.messages[0]!.content).toBe("msg1");
      expect(state.conversations[1]!.messages[0]!.content).toBe("msg3");
    });
  });


  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe("edge cases", () => {
    it("can handle conversations with many messages", () => {
      const messages = Array.from({ length: 100 }, (_, i) =>
        makeMessage({ id: `msg-${i}`, content: `Message ${i}` }),
      );
      const conv = makeConversation({ id: "c1", messages });
      useChatStore.setState({ conversations: [conv], currentConversationId: "c1" });

      const current = useChatStore.getState().getCurrentConversation();
      expect(current?.messages).toHaveLength(100);
    });

    it("handles empty title in rename", async () => {
      const conv = makeConversation({ id: "c1", title: "Old Title" });
      useChatStore.setState({ conversations: [conv] });
      await useChatStore.getState().renameChat("c1", "");
      expect(useChatStore.getState().conversations[0]!.title).toBe("");
    });

    it("handles special characters in folder names", async () => {
      await useChatStore.getState().createFolder("Folder & <Special> \"Chars\"");
      expect(mockCreateChatFolder).toHaveBeenCalledWith("Folder & <Special> \"Chars\"", undefined);
    });

    it("handles rapid state mutations", () => {
      useChatStore.getState().setModel("a");
      useChatStore.getState().setModel("b");
      useChatStore.getState().setModel("c");
      expect(useChatStore.getState().model).toBe("c");
    });

    it("handles concurrent folder toggles", () => {
      useChatStore.getState().toggleFolderExpansion("f1");
      useChatStore.getState().toggleFolderExpansion("f2");
      useChatStore.getState().toggleFolderExpansion("f3");
      useChatStore.getState().toggleFolderExpansion("f1"); // untoggle f1
      const expanded = useChatStore.getState().expandedFolders;
      expect(expanded.has("f1")).toBe(false);
      expect(expanded.has("f2")).toBe(true);
      expect(expanded.has("f3")).toBe(true);
    });
  });
});
