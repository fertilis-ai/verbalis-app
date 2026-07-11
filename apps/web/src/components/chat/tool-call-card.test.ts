import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}));

import { extractImagePaths } from "./tool-call-card";

describe("extractImagePaths", () => {
  it("extracts the path from a generate_image result", () => {
    const result = [
      "Image generated successfully.",
      "Model: openai/gpt-image-1",
      "Saved to: /Users/test/.verbalis/images/20260701-120000-a-cat.png",
      "Cost: $0.0400",
    ].join("\n");
    expect(extractImagePaths(result)).toEqual([
      "/Users/test/.verbalis/images/20260701-120000-a-cat.png",
    ]);
  });

  it("extracts multiple paths", () => {
    const result = "Saved to: /a/one.png\nSaved to: /b/two.png";
    expect(extractImagePaths(result)).toEqual(["/a/one.png", "/b/two.png"]);
  });

  it("handles Windows-style paths", () => {
    const result = "Saved to: C:\\Users\\test\\.verbalis\\images\\img.png";
    expect(extractImagePaths(result)).toEqual(["C:\\Users\\test\\.verbalis\\images\\img.png"]);
  });

  it("returns empty array for no matches or missing result", () => {
    expect(extractImagePaths("Something else entirely")).toEqual([]);
    expect(extractImagePaths(undefined)).toEqual([]);
    expect(extractImagePaths("")).toEqual([]);
  });

  it("ignores mid-line mentions of Saved to:", () => {
    expect(extractImagePaths("The file was Saved to: /x.png earlier")).toEqual([]);
  });
});
