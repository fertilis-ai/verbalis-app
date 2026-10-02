import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import YAML from "yaml";

/**
 * The packaged Tauri app runs under `script-src 'self'` with no
 * 'unsafe-eval', so `new Function(...)` throws. Load-time validation must not
 * depend on TypeBox's schema compiler, or every chat, schedule and task file
 * would be rejected in the packaged app.
 *
 * `Function` is blocked before `./validate` (and TypeBox) is imported.
 */

const original = globalThis.Function;

beforeAll(() => {
  const blocked = () => {
    throw new EvalError("Function constructor blocked by Content Security Policy");
  };
  globalThis.Function = new Proxy(original, {
    apply: blocked,
    construct: blocked,
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterAll(() => {
  globalThis.Function = original;
  vi.restoreAllMocks();
});

describe("load validation under an eval-blocking CSP", () => {
  it("accepts a valid file", async () => {
    const { ScheduleFileSchema, parseLoaded } = await import("./validate");
    const schedule = parseLoaded(ScheduleFileSchema, "id: s1\nenabled: true\nlastRun: null\n", "/s1.yaml", YAML.parse);
    expect(schedule).toEqual({ id: "s1", enabled: true, lastRun: null });
  });

  it("rejects an invalid file and reports the first error", async () => {
    const { ChatFileSchema, parseLoaded } = await import("./validate");
    const chat = parseLoaded(ChatFileSchema, '{"id":"c1","messages":[{"role":"user"}]}', "/c1.json", JSON.parse);
    expect(chat).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("/messages/0"));
  });
});
