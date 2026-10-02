import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Conversation } from "@/stores/chat-store";

const { mockSaveChatToFolder } = vi.hoisted(() => ({
  mockSaveChatToFolder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/storage", async () => ({
  ...(await import("@/test/mocks/storage")),
  getAppDataDir: vi.fn().mockResolvedValue("/data"),
  saveChatToFolder: mockSaveChatToFolder,
}));

import {
  chatFolderArg,
  conversationToChatData,
  deserializeMessages,
  saveConversation,
  serializeMessages,
} from "./chat-persistence";

const conversation = (path?: string): Conversation => ({
  id: "c1",
  title: "Title",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  path,
  messages: [
    { id: "u", role: "user", content: "hi", createdAt: new Date("2026-01-01T00:00:01.000Z") },
    {
      id: "a",
      role: "assistant",
      content: "ok",
      createdAt: new Date("2026-01-01T00:00:02.000Z"),
      toolCalls: [
        {
          id: "t",
          name: "read_file",
          arguments: { path: "x" },
          status: "success",
          result: "r",
          durationMs: 3,
          startedAt: new Date(0),
        },
      ],
    },
  ],
});

beforeEach(() => mockSaveChatToFolder.mockClear());

describe("serializeMessages", () => {
  it("writes ISO dates and only the persisted tool-call fields", () => {
    const [user, assistant] = serializeMessages(conversation().messages);
    expect(user).toEqual({ id: "u", role: "user", content: "hi", createdAt: "2026-01-01T00:00:01.000Z" });
    expect(assistant!.toolCalls).toEqual([
      { id: "t", name: "read_file", arguments: { path: "x" }, status: "success", result: "r", error: undefined, durationMs: 3 },
    ]);
  });
});

describe("deserializeMessages", () => {
  it("round-trips serialized messages", () => {
    const original = conversation().messages;
    const restored = deserializeMessages(serializeMessages(original));
    expect(restored[0]).toEqual(original[0]);
    expect(restored[1]!.createdAt).toEqual(original[1]!.createdAt);
    expect(restored[1]!.toolCalls?.[0]?.status).toBe("success");
  });

  it("strips protocol markers and marks interrupted tool calls as errors", () => {
    const [m] = deserializeMessages([
      {
        id: "a",
        role: "assistant",
        content: `Done <|channel|>commentary to=tool code<|message|>{"a":1}`,
        createdAt: "2026-01-01T00:00:00.000Z",
        toolCalls: [{ id: "t", name: "read_file", arguments: {}, status: "executing" }],
      },
    ]);
    expect(m!.content).toContain("Done");
    expect(m!.content).not.toContain("<|channel|>");
    expect(m!.toolCalls?.[0]).toMatchObject({ status: "error", error: "Interrupted — app closed during execution" });
  });

  it("omits toolCalls when the stored list is empty", () => {
    const [m] = deserializeMessages([{ id: "a", role: "assistant", content: "", createdAt: "2026-01-01T00:00:00.000Z", toolCalls: [] }]);
    expect("toolCalls" in m!).toBe(false);
  });
});

describe("conversationToChatData", () => {
  it("records the given model and agent", () => {
    const data = conversationToChatData(conversation(), "m", "writer");
    expect(data).toMatchObject({
      id: "c1",
      title: "Title",
      model: "m",
      agentId: "writer",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(data.messages).toHaveLength(2);
  });
});

describe("chatFolderArg", () => {
  it("is undefined for the root chats directory and the directory otherwise", async () => {
    expect(await chatFolderArg("/data/chats")).toBeUndefined();
    expect(await chatFolderArg("/data/chats/work")).toBe("/data/chats/work");
  });
});

describe("saveConversation", () => {
  it("saves into the folder the path points into", async () => {
    await saveConversation(conversation("/data/chats/work/c1.json"), "m", null);
    expect(mockSaveChatToFolder).toHaveBeenCalledWith(expect.objectContaining({ id: "c1", model: "m" }), "/data/chats/work");
  });

  it("saves a root chat without a folder", async () => {
    await saveConversation(conversation("/data/chats/c1.json"), "m", null);
    expect(mockSaveChatToFolder).toHaveBeenCalledWith(expect.anything(), undefined);
  });

  it("does nothing without a path", async () => {
    await saveConversation(conversation(), "m", null);
    expect(mockSaveChatToFolder).not.toHaveBeenCalled();
  });
});
