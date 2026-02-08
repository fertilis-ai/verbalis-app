import { describe, it, expect, vi } from "vitest";
import { cn, truncateText, createSingleton } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("merges conflicting tailwind classes (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles undefined and null inputs", () => {
    expect(cn("a", undefined, null, "b")).toBe("a b");
  });

  it("handles empty arguments", () => {
    expect(cn()).toBe("");
  });

  it("handles arrays of classes", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });
});

describe("truncateText", () => {
  it("returns text unchanged when within maxLength", () => {
    expect(truncateText("hello", 10)).toBe("hello");
  });

  it("returns text unchanged when exactly at maxLength", () => {
    expect(truncateText("hello", 5)).toBe("hello");
  });

  it("truncates text exceeding maxLength", () => {
    const result = truncateText("hello world", 5);
    expect(result).toBe("hello\n... (truncated, 11 total chars)");
  });

  it("includes total character count in truncation message", () => {
    const longText = "a".repeat(1000);
    const result = truncateText(longText, 10);
    expect(result).toContain("1000 total chars");
    expect(result.startsWith("a".repeat(10))).toBe(true);
  });

  it("handles empty string", () => {
    expect(truncateText("", 5)).toBe("");
  });

  it("handles maxLength of 0", () => {
    const result = truncateText("hello", 0);
    expect(result).toBe("\n... (truncated, 5 total chars)");
  });
});

describe("createSingleton", () => {
  it("creates instance lazily on first get()", () => {
    const factory = vi.fn(() => ({ value: 42 }));
    const singleton = createSingleton(factory);

    expect(factory).not.toHaveBeenCalled();
    const instance = singleton.get();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(instance).toEqual({ value: 42 });
  });

  it("returns same instance on subsequent get() calls", () => {
    const factory = vi.fn(() => ({ value: 42 }));
    const singleton = createSingleton(factory);

    const first = singleton.get();
    const second = singleton.get();
    expect(first).toBe(second);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("reset() clears instance so next get() creates a new one", () => {
    const factory = vi.fn(() => ({ value: Math.random() }));
    const singleton = createSingleton(factory);

    const first = singleton.get();
    singleton.reset();
    const second = singleton.get();

    expect(first).not.toBe(second);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("reset() calls cleanup function when instance exists", () => {
    const cleanup = vi.fn();
    const singleton = createSingleton(() => ({ value: 1 }), cleanup);

    const instance = singleton.get();
    singleton.reset();

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith(instance);
  });

  it("reset() does not call cleanup when no instance exists", () => {
    const cleanup = vi.fn();
    const singleton = createSingleton(() => ({ value: 1 }), cleanup);

    singleton.reset();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("reset() without cleanup function does not throw", () => {
    const singleton = createSingleton(() => ({ value: 1 }));
    singleton.get();
    expect(() => singleton.reset()).not.toThrow();
  });
});
