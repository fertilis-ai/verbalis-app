import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ToolCallState } from "@/lib/types/chat";

const { loadToolboxItem } = vi.hoisted(() => ({ loadToolboxItem: vi.fn() }));

vi.mock("@/lib/storage", async () => ({
  ...(await import("@/test/mocks/storage")),
  loadToolboxItem,
}));

import { useToolboxDiff } from "./use-toolbox-diff";

function call(name: string, args: Record<string, unknown>): ToolCallState {
  return { id: "t1", name, arguments: args, status: "pending_confirmation" };
}

describe("useToolboxDiff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("diffs old_string against new_string for an edit, with unique keys", () => {
    const toolCall = call("edit_toolbox_item", { old_string: "a\nb\nb", new_string: "a\nc\nb" });
    const { result } = renderHook(() => useToolboxDiff(toolCall, true));

    const lines = result.current ?? [];
    expect(lines.map((l) => [l.type, l.text])).toContainEqual(["added", "c"]);
    expect(new Set(lines.map((l) => l.key)).size).toBe(lines.length);
    expect(loadToolboxItem).not.toHaveBeenCalled();
  });

  it("diffs a write against the existing item", async () => {
    loadToolboxItem.mockResolvedValue({ content: "old" });
    const toolCall = call("write_toolbox_item", { category: "prompts", name: "p", content: "new" });

    const { result } = renderHook(() => useToolboxDiff(toolCall, true));

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(loadToolboxItem).toHaveBeenCalledWith("prompts", "p");
    expect(result.current?.map((l) => [l.type, l.text])).toEqual([
      ["removed", "old"],
      ["added", "new"],
    ]);
  });

  it("returns null for a new item and when inactive", async () => {
    loadToolboxItem.mockResolvedValue(null);
    const toolCall = call("write_toolbox_item", { category: "prompts", name: "p", content: "new" });

    const { result } = renderHook(() => useToolboxDiff(toolCall, true));
    await waitFor(() => expect(loadToolboxItem).toHaveBeenCalled());
    expect(result.current).toBeNull();

    const inactive = renderHook(() =>
      useToolboxDiff(call("edit_toolbox_item", { old_string: "a", new_string: "b" }), false),
    );
    expect(inactive.result.current).toBeNull();
  });
});
