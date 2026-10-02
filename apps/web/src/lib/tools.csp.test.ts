import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

/**
 * The packaged Tauri app runs under `script-src 'self'` with no
 * 'unsafe-eval', so `new Function(...)` throws. Tool arguments are validated
 * with TypeBox (via pi-ai's validateToolArguments), whose schema compiler
 * generates code with `new Function` when it can — and must fall back to an
 * interpreter when it can't, or every tool call would fail in the packaged app.
 *
 * TypeBox probes for eval support once per module instance, so `Function` is
 * blocked before `./tools` is imported.
 */

vi.mock("@tauri-apps/api/core", () => import("@/test/mocks/tauri"));

const original = globalThis.Function;
let evalAttempts = 0;

beforeAll(() => {
  const blocked = () => {
    evalAttempts++;
    throw new EvalError("Function constructor blocked by Content Security Policy");
  };
  globalThis.Function = new Proxy(original, {
    apply: blocked,
    construct: blocked,
  });
});

afterAll(() => {
  globalThis.Function = original;
});

describe("executeTool under an eval-blocking CSP", () => {
  it("still validates, coerces and runs the tool", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockResolvedValueOnce([]);
    const { executeTool } = await import("./tools");

    const result = await executeTool({
      type: "toolCall",
      id: "tc-csp",
      name: "read_directory",
      arguments: { path: "/tmp", max_depth: "2" },
    });

    expect(result.status).toBe("success");
    expect(invoke).toHaveBeenCalledWith("read_directory", { path: "/tmp", maxDepth: 2 });
    // Proves the eval path was attempted and refused, not skipped.
    expect(evalAttempts).toBeGreaterThan(0);
  });

  it("still rejects invalid arguments", async () => {
    const { executeTool } = await import("./tools");

    const result = await executeTool({
      type: "toolCall",
      id: "tc-csp-invalid",
      name: "write_file",
      arguments: { path: "/tmp/out.txt" },
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain('Validation failed for tool "write_file"');
  });
});
