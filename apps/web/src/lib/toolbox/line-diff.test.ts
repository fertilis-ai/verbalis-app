import { describe, it, expect } from "vitest";
import { computeLineDiff } from "./line-diff";

function render(lines: ReturnType<typeof computeLineDiff>): string {
  const prefix = { context: " ", removed: "-", added: "+" } as const;
  return lines.map((l) => `${prefix[l.type]}${l.text}`).join("\n");
}

describe("computeLineDiff", () => {
  it("returns [] for identical texts", () => {
    expect(computeLineDiff("a\nb", "a\nb")).toEqual([]);
  });

  it("shows a one-line change with surrounding context", () => {
    const oldText = "a\nb\nc\nd\ne";
    const newText = "a\nb\nC\nd\ne";
    expect(render(computeLineDiff(oldText, newText))).toBe(" a\n b\n-c\n+C\n d\n e");
  });

  it("elides distant context", () => {
    const oldLines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const newLines = [...oldLines];
    newLines[10] = "CHANGED";
    const diff = computeLineDiff(oldLines.join("\n"), newLines.join("\n"));
    const text = render(diff);
    expect(text).toContain("⋯");
    expect(text).toContain("-line 10");
    expect(text).toContain("+CHANGED");
    expect(text).not.toContain("line 0");
    expect(text).not.toContain("line 19");
  });

  it("handles pure insertion and pure deletion", () => {
    expect(render(computeLineDiff("a\nc", "a\nb\nc"))).toBe(" a\n+b\n c");
    expect(render(computeLineDiff("a\nb\nc", "a\nc"))).toBe(" a\n-b\n c");
  });

  it("handles replacement at the start and end", () => {
    expect(render(computeLineDiff("x\nb", "y\nb"))).toBe("-x\n+y\n b");
    expect(render(computeLineDiff("a\nx", "a\ny"))).toBe(" a\n-x\n+y");
  });

  it("handles completely different texts", () => {
    expect(render(computeLineDiff("old", "new"))).toBe("-old\n+new");
  });

  it("handles empty old text (new item body)", () => {
    expect(render(computeLineDiff("", "a\nb"))).toBe("-\n+a\n+b");
  });
});
