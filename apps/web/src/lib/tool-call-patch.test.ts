import { describe, it, expect } from "vitest";
import type { ToolCallState } from "@/lib/tools";
import type { Conversation, Message } from "@/stores/chat-store";
import {
  isToolCallInFlight,
  mergeToolCalls,
  rejectToolCall,
  restoreToolCall,
  stopInFlightToolCalls,
  upsertToolCall,
} from "./tool-call-patch";

const tc = (id: string, status: ToolCallState["status"], extra: Partial<ToolCallState> = {}): ToolCallState => ({
  id,
  name: "read_file",
  arguments: {},
  status,
  ...extra,
});

const msg = (role: Message["role"], toolCalls?: ToolCallState[]): Message => ({
  id: `m-${Math.random()}`,
  role,
  content: "",
  createdAt: new Date(0),
  ...(toolCalls ? { toolCalls } : {}),
});

const conv = (messages: Message[]): Conversation => ({
  id: "c1",
  title: "t",
  messages,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

describe("isToolCallInFlight", () => {
  it("is true only for pending, pending_confirmation and executing", () => {
    expect(isToolCallInFlight("pending")).toBe(true);
    expect(isToolCallInFlight("pending_confirmation")).toBe(true);
    expect(isToolCallInFlight("executing")).toBe(true);
    expect(isToolCallInFlight("success")).toBe(false);
    expect(isToolCallInFlight("error")).toBe(false);
    expect(isToolCallInFlight("stopped")).toBe(false);
    expect(isToolCallInFlight("cancelled")).toBe(false);
  });
});

describe("mergeToolCalls", () => {
  it("appends only calls with new ids, keeping existing entries", () => {
    const existing = [tc("a", "success", { result: "old" })];
    const merged = mergeToolCalls(existing, [tc("a", "pending"), tc("b", "pending")]);
    expect(merged.map((t) => [t.id, t.status])).toEqual([
      ["a", "success"],
      ["b", "pending"],
    ]);
  });
});

describe("upsertToolCall", () => {
  it("merges into the existing call: present fields win, omitted fields are kept", () => {
    const c = conv([msg("assistant", [tc("a", "executing", { result: "partial" })])]);
    const next = upsertToolCall(c, { id: "a", name: "read_file", arguments: {}, status: "completed" as never });
    const updated = next.messages[0]!.toolCalls?.[0];
    expect(updated?.status).toBe("success");
    expect(updated?.result).toBe("partial");
  });

  it("appends an unknown call to the last assistant message", () => {
    const c = conv([msg("assistant", [tc("a", "success")]), msg("assistant")]);
    const next = upsertToolCall(c, tc("b", "pending"));
    expect(next.messages[0]!.toolCalls?.map((t) => t.id)).toEqual(["a"]);
    expect(next.messages[1]!.toolCalls?.map((t) => t.id)).toEqual(["b"]);
  });

  it("drops an unknown call when the last message is from the user", () => {
    const c = conv([msg("user")]);
    expect(upsertToolCall(c, tc("b", "pending")).messages[0]!.toolCalls).toBeUndefined();
  });
});

describe("stopInFlightToolCalls", () => {
  it("stops in-flight calls and leaves finished ones alone", () => {
    const c = conv([
      msg("assistant", [tc("a", "success")]),
      msg("assistant", [tc("b", "executing"), tc("c", "pending_confirmation")]),
    ]);
    const next = stopInFlightToolCalls(c);
    expect(next.messages[0]).toBe(c.messages[0]);
    expect(next.messages[1]!.toolCalls?.map((t) => t.status)).toEqual(["stopped", "stopped"]);
    expect(next.updatedAt).not.toBe(c.updatedAt);
  });

  it("returns the same conversation when nothing is in flight", () => {
    const c = conv([msg("assistant", [tc("a", "success")]), msg("user")]);
    expect(stopInFlightToolCalls(c)).toBe(c);
  });
});

describe("rejectToolCall", () => {
  it("cancels the matching call with the reason and a completion time", () => {
    const c = conv([msg("assistant", [tc("a", "pending_confirmation"), tc("b", "pending_confirmation")])]);
    const next = rejectToolCall(c, "a", "Rejected by user");
    const [a, b] = next.messages[0]!.toolCalls ?? [];
    expect(a!.status).toBe("cancelled");
    expect(a!.error).toBe("Rejected by user");
    expect(a!.completedAt).toBeInstanceOf(Date);
    expect(b!.status).toBe("pending_confirmation");
  });

  it("keeps an existing completion time", () => {
    const done = new Date(5);
    const c = conv([msg("assistant", [tc("a", "pending", { completedAt: done })])]);
    expect(rejectToolCall(c, "a", "x").messages[0]!.toolCalls?.[0]?.completedAt).toBe(done);
  });

  it("returns the same conversation when the id is unknown", () => {
    const c = conv([msg("assistant", [tc("a", "pending")])]);
    expect(rejectToolCall(c, "zzz", "x")).toBe(c);
  });
});

describe("restoreToolCall", () => {
  it("turns a call that was in flight into an interrupted error", () => {
    expect(restoreToolCall({ id: "a", status: "executing" })).toEqual({
      id: "a",
      status: "error",
      error: "Interrupted — app closed during execution",
    });
  });

  it("keeps an existing error message on an interrupted call", () => {
    expect(restoreToolCall({ status: "pending", error: "boom" }).error).toBe("boom");
  });

  it("normalizes legacy statuses of finished calls", () => {
    expect(restoreToolCall({ status: "completed", error: undefined })).toEqual({ status: "success", error: undefined });
    expect(restoreToolCall({ status: "failed", error: "x" })).toEqual({ status: "error", error: "x" });
  });
});
