import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appFetch, initFetchPolyfill } from "./http";

const mockIsTauri = vi.fn(() => false);
const mockTauriFetch = vi.fn();
const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  isTauri: () => mockIsTauri(),
}));

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => mockTauriFetch(...args),
}));

describe("appFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauri.mockReturnValue(false);
    globalThis.fetch = vi.fn();
  });

  it("uses globalThis.fetch when not in Tauri", async () => {
    const mockResponse = new Response("ok");
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    const result = await appFetch("https://example.com/api");
    expect(globalThis.fetch).toHaveBeenCalledWith("https://example.com/api", undefined);
    expect(result).toBe(mockResponse);
    expect(mockTauriFetch).not.toHaveBeenCalled();
  });

  it("uses Tauri fetch when in Tauri", async () => {
    mockIsTauri.mockReturnValue(true);
    const mockResponse = new Response("tauri ok");
    mockTauriFetch.mockResolvedValue(mockResponse);

    const result = await appFetch("https://api.example.com/data");
    expect(mockTauriFetch).toHaveBeenCalledWith("https://api.example.com/data", undefined);
    expect(result).toBe(mockResponse);
  });

  it("passes init options to Tauri fetch", async () => {
    mockIsTauri.mockReturnValue(true);
    mockTauriFetch.mockResolvedValue(new Response("ok"));

    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "test" }),
    };

    await appFetch("https://api.example.com/data", init);
    expect(mockTauriFetch).toHaveBeenCalledWith("https://api.example.com/data", init);
  });

  it("passes init options to globalThis.fetch", async () => {
    mockIsTauri.mockReturnValue(false);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("ok"));

    const init = { headers: { Authorization: "Bearer token" } };
    await appFetch("https://example.com", init);
    expect(globalThis.fetch).toHaveBeenCalledWith("https://example.com", init);
  });

  it("supports URL object input in non-Tauri", async () => {
    mockIsTauri.mockReturnValue(false);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("ok"));

    const url = new URL("https://example.com/path");
    await appFetch(url);
    expect(globalThis.fetch).toHaveBeenCalledWith(url, undefined);
  });

  it("supports URL object input in Tauri", async () => {
    mockIsTauri.mockReturnValue(true);
    mockTauriFetch.mockResolvedValue(new Response("ok"));

    const url = new URL("https://example.com/path");
    await appFetch(url);
    expect(mockTauriFetch).toHaveBeenCalledWith(url, undefined);
  });
});

describe("initFetchPolyfill", () => {
  let savedFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    savedFetch = vi.fn().mockResolvedValue(new Response("original"));
    globalThis.fetch = savedFetch;
  });

  afterEach(() => {
    // Restore fetch to avoid leaking between tests
    globalThis.fetch = savedFetch;
  });

  it("does nothing when not in Tauri", async () => {
    mockIsTauri.mockReturnValue(false);
    const before = globalThis.fetch;

    await initFetchPolyfill();

    expect(globalThis.fetch).toBe(before);
  });

  it("replaces globalThis.fetch when in Tauri", async () => {
    mockIsTauri.mockReturnValue(true);
    const before = globalThis.fetch;

    await initFetchPolyfill();

    expect(globalThis.fetch).not.toBe(before);
  });

  describe("polyfilled fetch routing", () => {
    beforeEach(async () => {
      mockIsTauri.mockReturnValue(true);
      mockTauriFetch.mockResolvedValue(new Response("tauri response"));
      (savedFetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("original response"));
      await initFetchPolyfill();
    });

    it("routes remote HTTPS requests through Tauri fetch", async () => {
      await globalThis.fetch("https://api.openai.com/v1/chat");

      expect(mockTauriFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/chat",
        undefined
      );
      expect(savedFetch).not.toHaveBeenCalled();
    });

    it("keeps localhost requests on original fetch", async () => {
      await globalThis.fetch("https://localhost:3001/api");

      expect(savedFetch).toHaveBeenCalled();
      expect(mockTauriFetch).not.toHaveBeenCalled();
    });

    it("keeps *.localhost requests on original fetch", async () => {
      await globalThis.fetch("https://tauri.localhost/api");

      expect(savedFetch).toHaveBeenCalled();
      expect(mockTauriFetch).not.toHaveBeenCalled();
    });

    it("keeps 127.* requests on original fetch", async () => {
      await globalThis.fetch("https://127.0.0.1:8080/data");

      expect(savedFetch).toHaveBeenCalled();
      expect(mockTauriFetch).not.toHaveBeenCalled();
    });

    it("keeps relative URLs on original fetch", async () => {
      await globalThis.fetch("/api/data");

      expect(savedFetch).toHaveBeenCalled();
      expect(mockTauriFetch).not.toHaveBeenCalled();
    });

    it("routes URL object through Tauri fetch for remote HTTPS", async () => {
      const url = new URL("https://api.example.com/data");
      await globalThis.fetch(url);

      expect(mockTauriFetch).toHaveBeenCalled();
    });

    it("routes Request object through Tauri fetch for remote HTTPS", async () => {
      const request = new Request("https://api.example.com/data");
      await globalThis.fetch(request);

      expect(mockTauriFetch).toHaveBeenCalled();
    });

    it("logs POST request bodies via invoke", async () => {
      mockInvoke.mockResolvedValue(undefined);

      await globalThis.fetch("https://api.openai.com/v1/chat", {
        method: "POST",
        body: JSON.stringify({ model: "gpt-4" }),
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        "write_log_file",
        expect.objectContaining({ filename: "api_request.txt" })
      );
    });

    it("logs POST body when method is not specified (defaults to POST for body)", async () => {
      mockInvoke.mockResolvedValue(undefined);

      await globalThis.fetch("https://api.openai.com/v1/chat", {
        body: JSON.stringify({ data: "test" }),
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        "write_log_file",
        expect.objectContaining({ filename: "api_request.txt" })
      );
    });

    it("does not log GET requests without body", async () => {
      await globalThis.fetch("https://api.example.com/data");

      expect(mockInvoke).not.toHaveBeenCalledWith(
        "write_log_file",
        expect.anything()
      );
    });

    it("handles non-JSON body for logging gracefully", async () => {
      mockInvoke.mockResolvedValue(undefined);

      await globalThis.fetch("https://api.openai.com/v1/chat", {
        method: "POST",
        body: "not-json-body",
      });

      // Should still call invoke (falls back to raw string)
      expect(mockInvoke).toHaveBeenCalledWith(
        "write_log_file",
        expect.objectContaining({
          filename: "api_request.txt",
          content: "not-json-body",
        })
      );
    });

    it("does not throw when invoke for logging fails", async () => {
      mockInvoke.mockRejectedValue(new Error("log failed"));

      // Should not throw despite log failure
      await expect(
        globalThis.fetch("https://api.openai.com/v1/chat", {
          method: "POST",
          body: JSON.stringify({ data: "test" }),
        })
      ).resolves.toBeDefined();
    });

    it("keeps http:// URLs on original fetch", async () => {
      await globalThis.fetch("http://example.com/api");

      expect(savedFetch).toHaveBeenCalled();
      expect(mockTauriFetch).not.toHaveBeenCalled();
    });
  });
});
