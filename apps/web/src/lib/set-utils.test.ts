import { describe, it, expect } from "vitest";
import { toggleInSet } from "./set-utils";

describe("toggleInSet", () => {
  it("adds a value that is not present", () => {
    const result = toggleInSet(new Set(["a"]), "b");
    expect(result).toEqual(new Set(["a", "b"]));
  });

  it("removes a value that is present", () => {
    const result = toggleInSet(new Set(["a", "b"]), "b");
    expect(result).toEqual(new Set(["a"]));
  });

  it("does not mutate the original set", () => {
    const original = new Set(["a"]);
    const result = toggleInSet(original, "b");
    expect(original).toEqual(new Set(["a"]));
    expect(result).not.toBe(original);
  });

  it("works on an empty set", () => {
    expect(toggleInSet(new Set<string>(), "a")).toEqual(new Set(["a"]));
  });

  it("supports non-string values", () => {
    expect(toggleInSet(new Set([1, 2]), 2)).toEqual(new Set([1]));
  });
});
