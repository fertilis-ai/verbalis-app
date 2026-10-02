import { describe, it, expect, beforeEach } from "vitest";
import {
  loopBus,
  makeConversation,
  makeMessage,
  mockConfirmTool,
  mockRejectTool,
  resetChatStore,
} from "@/test/chat-store-harness";
import { useChatStore } from "./chat-store";

// chat-store tests for tool-call execution: the loop bus, stop, confirm and
// reject. Mocks and fixtures are in test/chat-store-harness.ts.

describe("chat-store", () => {
  beforeEach(() => {
    resetChatStore();
  });

  // -----------------------------------------------------------------------
  // Loop bus (the single path from the agentic loop to conversation state)
  // -----------------------------------------------------------------------
  describe("loop bus", () => {
    const publish = (event: unknown) => loopBus.callback?.(event);

    it("merges tool state into the matching tool call, keeping omitted fields", () => {
      const msg = makeMessage({
        id: "m1",
        role: "assistant",
        toolCalls: [
          { id: "tc1", name: "read_file", arguments: { path: "a" }, status: "pending", riskLevel: "low" },
        ],
      });
      useChatStore.setState({ conversations: [makeConversation({ id: "c1", messages: [msg] })] });

      publish({
        type: "tool_state",
        conversationId: "c1",
        toolCall: { id: "tc1", name: "read_file", arguments: { path: "a" }, status: "success", result: "ok" },
      });

      const tc = useChatStore.getState().conversations[0]!.messages[0]!.toolCalls![0];
      expect(tc).toMatchObject({ status: "success", result: "ok", riskLevel: "low" });
    });

    it("appends an unseen tool call to the last assistant message", () => {
      const msg = makeMessage({ id: "m1", role: "assistant", toolCalls: [] });
      useChatStore.setState({ conversations: [makeConversation({ id: "c1", messages: [msg] })] });

      publish({
        type: "tool_state",
        conversationId: "c1",
        toolCall: { id: "tc9", name: "write_file", arguments: {}, status: "pending_confirmation" },
      });

      const calls = useChatStore.getState().conversations[0]!.messages[0]!.toolCalls!;
      expect(calls.map((tc) => tc.id)).toEqual(["tc9"]);
    });

    it("updates the ghost conversation when it is the target", () => {
      const msg = makeMessage({
        id: "m1",
        role: "assistant",
        toolCalls: [{ id: "tc1", name: "t", arguments: {}, status: "executing" }],
      });
      useChatStore.setState({
        isGhostMode: true,
        ghostConversation: makeConversation({ id: "ghost-1", messages: [msg] }),
      });

      publish({
        type: "tool_state",
        conversationId: "ghost-1",
        toolCall: { id: "tc1", name: "t", arguments: {}, status: "error", error: "boom" },
      });

      expect(useChatStore.getState().ghostConversation!.messages[0]!.toolCalls![0]).toMatchObject({
        status: "error",
        error: "boom",
      });
    });

    it("marks in-flight tool calls stopped on loop_ended", () => {
      const msg = makeMessage({
        id: "m1",
        role: "assistant",
        toolCalls: [{ id: "tc1", name: "t", arguments: {}, status: "executing" }],
      });
      useChatStore.setState({ conversations: [makeConversation({ id: "c1", messages: [msg] })] });

      publish({ type: "loop_ended", conversationId: "c1" });

      expect(useChatStore.getState().conversations[0]!.messages[0]!.toolCalls![0]!.status).toBe("stopped");
    });
  });


  // -----------------------------------------------------------------------
  // markToolCallsStopped
  // -----------------------------------------------------------------------
  describe("markToolCallsStopped", () => {
    it("marks pending tool calls as stopped", () => {
      const msg = makeMessage({
        id: "m1",
        role: "assistant",
        toolCalls: [
          { id: "tc1", name: "tool1", arguments: {}, status: "pending" },
          { id: "tc2", name: "tool2", arguments: {}, status: "executing" },
          { id: "tc3", name: "tool3", arguments: {}, status: "success" },
        ],
      });
      const conv = makeConversation({ id: "c1", messages: [msg] });
      useChatStore.setState({ conversations: [conv] });

      useChatStore.getState().markToolCallsStopped("c1");

      const updated = useChatStore.getState().conversations[0]!.messages[0];
      expect(updated!.toolCalls![0]!.status).toBe("stopped");
      expect(updated!.toolCalls![1]!.status).toBe("stopped");
      expect(updated!.toolCalls![2]!.status).toBe("success"); // unchanged
    });

    it("does not modify conversations without the matching id", () => {
      const msg = makeMessage({
        id: "m1",
        role: "assistant",
        toolCalls: [{ id: "tc1", name: "tool1", arguments: {}, status: "pending" }],
      });
      const conv = makeConversation({ id: "c1", messages: [msg] });
      useChatStore.setState({ conversations: [conv] });

      useChatStore.getState().markToolCallsStopped("c-other");

      const unchanged = useChatStore.getState().conversations[0]!.messages[0];
      expect(unchanged!.toolCalls![0]!.status).toBe("pending");
    });

    it("marks ghost conversation tool calls as stopped", () => {
      const msg = makeMessage({
        id: "m1",
        role: "assistant",
        toolCalls: [{ id: "tc1", name: "tool1", arguments: {}, status: "executing" }],
      });
      const ghost = makeConversation({ id: "ghost-1", messages: [msg] });
      useChatStore.setState({
        isGhostMode: true,
        ghostConversation: ghost,
      });

      useChatStore.getState().markToolCallsStopped("ghost-1");

      const updated = useChatStore.getState().ghostConversation!.messages[0];
      expect(updated!.toolCalls![0]!.status).toBe("stopped");
    });

    it("does not change messages without tool calls", () => {
      const msg = makeMessage({ id: "m1", role: "assistant", content: "Hello" });
      const conv = makeConversation({ id: "c1", messages: [msg] });
      useChatStore.setState({ conversations: [conv] });

      useChatStore.getState().markToolCallsStopped("c1");

      const unchanged = useChatStore.getState().conversations[0]!.messages[0];
      expect(unchanged!.toolCalls).toBeUndefined();
      expect(unchanged!.content).toBe("Hello");
    });

    it("marks pending_confirmation tool calls as stopped", () => {
      const msg = makeMessage({
        id: "m1",
        role: "assistant",
        toolCalls: [
          { id: "tc1", name: "tool1", arguments: {}, status: "pending_confirmation" },
        ],
      });
      const conv = makeConversation({ id: "c1", messages: [msg] });
      useChatStore.setState({ conversations: [conv] });

      useChatStore.getState().markToolCallsStopped("c1");

      const updated = useChatStore.getState().conversations[0]!.messages[0];
      expect(updated!.toolCalls![0]!.status).toBe("stopped");
    });

    it("handles multiple messages in conversation", () => {
      const msg1 = makeMessage({
        id: "m1",
        role: "assistant",
        toolCalls: [{ id: "tc1", name: "tool1", arguments: {}, status: "pending" }],
      });
      const msg2 = makeMessage({
        id: "m2",
        role: "assistant",
        toolCalls: [{ id: "tc2", name: "tool2", arguments: {}, status: "executing" }],
      });
      const conv = makeConversation({ id: "c1", messages: [msg1, msg2] });
      useChatStore.setState({ conversations: [conv] });

      useChatStore.getState().markToolCallsStopped("c1");

      const updated = useChatStore.getState().conversations[0];
      expect(updated!.messages[0]!.toolCalls![0]!.status).toBe("stopped");
      expect(updated!.messages[1]!.toolCalls![0]!.status).toBe("stopped");
    });

    it("does not modify ghost conversation when id doesn't match", () => {
      const msg = makeMessage({
        id: "m1",
        role: "assistant",
        toolCalls: [{ id: "tc1", name: "tool1", arguments: {}, status: "pending" }],
      });
      const ghost = makeConversation({ id: "ghost-1", messages: [msg] });
      useChatStore.setState({
        isGhostMode: true,
        ghostConversation: ghost,
      });

      useChatStore.getState().markToolCallsStopped("different-id");

      const unchanged = useChatStore.getState().ghostConversation!.messages[0];
      expect(unchanged!.toolCalls![0]!.status).toBe("pending");
    });
  });


  // -----------------------------------------------------------------------
  // confirmToolExecution
  // -----------------------------------------------------------------------
  describe("confirmToolExecution", () => {
    it("delegates to agentic loop store confirmTool", async () => {
      useChatStore.setState({ currentConversationId: "c1" });
      await useChatStore.getState().confirmToolExecution("tc-1");
      expect(mockConfirmTool).toHaveBeenCalledWith("c1", "tc-1");
    });

    it("does nothing when no conversation is selected", async () => {
      useChatStore.setState({ currentConversationId: null });
      await useChatStore.getState().confirmToolExecution("tc-1");
      expect(mockConfirmTool).not.toHaveBeenCalled();
    });
  });


  // -----------------------------------------------------------------------
  // rejectToolExecution
  // -----------------------------------------------------------------------
  describe("rejectToolExecution", () => {
    it("delegates to agentic loop store rejectTool", () => {
      useChatStore.setState({ currentConversationId: "c1" });
      useChatStore.getState().rejectToolExecution("tc-1");
      expect(mockRejectTool).toHaveBeenCalledWith("c1", "tc-1", "Rejected by user");
    });

    it("marks the rejected tool call as cancelled in conversation state", () => {
      const conv = makeConversation({
        id: "c1",
        messages: [
          makeMessage({
            id: "m1",
            role: "assistant",
            toolCalls: [
              { id: "tc-1", name: "write_file", arguments: {}, status: "pending_confirmation" },
            ],
          }),
        ],
      });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
      });

      useChatStore.getState().rejectToolExecution("tc-1");

      const updated = useChatStore.getState().conversations[0]!.messages[0]!.toolCalls?.[0];
      expect(updated?.status).toBe("cancelled");
      expect(updated?.error).toBe("Rejected by user");
    });

    it("does nothing when no conversation is selected", () => {
      useChatStore.setState({ currentConversationId: null });
      useChatStore.getState().rejectToolExecution("tc-1");
      expect(mockRejectTool).not.toHaveBeenCalled();
    });
  });
});
