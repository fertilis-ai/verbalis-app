import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the module
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

vi.mock("@/lib/storage", () => ({
  isTauri: vi.fn(() => false),
}));

import {
  WEB_TOOL_DEFINITIONS,
  executeWebTool,
  executeHttpFetch,
  executeWebSearch,
  executeScrapeWebpage,
  type HttpResponse,
  type SearchResult,
} from "./web-tools";
import { isTauri } from "@/lib/storage";
import { invoke } from "@tauri-apps/api/core";

const mockIsTauri = vi.mocked(isTauri);
const mockInvoke = vi.mocked(invoke);

// ============================================================================
// We need to access private helpers for thorough testing.
// We'll test them through the public functions that use them.
// ============================================================================

describe("WEB_TOOL_DEFINITIONS", () => {
  it("defines http_fetch tool", () => {
    const def = WEB_TOOL_DEFINITIONS.http_fetch;
    expect(def.name).toBe("http_fetch");
    expect(def.category).toBe("web");
    expect(def.riskLevel).toBe("medium");
    expect(def.requiresNetwork).toBe(true);
    expect(def.supportsUndo).toBe(false);
  });

  it("defines web_search tool", () => {
    const def = WEB_TOOL_DEFINITIONS.web_search;
    expect(def.name).toBe("web_search");
    expect(def.category).toBe("web");
    expect(def.riskLevel).toBe("low");
    expect(def.requiresNetwork).toBe(true);
    expect(def.supportsUndo).toBe(false);
  });

  it("defines scrape_webpage tool", () => {
    const def = WEB_TOOL_DEFINITIONS.scrape_webpage;
    expect(def.name).toBe("scrape_webpage");
    expect(def.category).toBe("web");
    expect(def.riskLevel).toBe("low");
    expect(def.requiresNetwork).toBe(true);
    expect(def.supportsUndo).toBe(false);
  });

  it("all definitions have required fields", () => {
    for (const def of Object.values(WEB_TOOL_DEFINITIONS)) {
      expect(def).toHaveProperty("name");
      expect(def).toHaveProperty("description");
      expect(def).toHaveProperty("category");
      expect(def).toHaveProperty("riskLevel");
      expect(def).toHaveProperty("parameters");
      expect(def).toHaveProperty("requiresNetwork");
      expect(def).toHaveProperty("supportsUndo");
    }
  });
});

// ============================================================================
// executeHttpFetch
// ============================================================================

describe("executeHttpFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauri.mockReturnValue(false);
  });

  it("uses browser fetch when not in Tauri", async () => {
    const mockResponse = new Response("response body", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await executeHttpFetch({ url: "https://example.com" });

    expect(global.fetch).toHaveBeenCalledWith("https://example.com", {
      method: "GET",
      headers: undefined,
      body: undefined,
      signal: expect.any(AbortSignal),
    });
    expect(result).toContain("Status: 200");
    expect(result).toContain("Body:");
    expect(result).toContain("response body");
  });

  it("uses Tauri invoke when in Tauri", async () => {
    mockIsTauri.mockReturnValue(true);

    const mockHttpResponse: HttpResponse = {
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"data": "test"}',
      duration_ms: 150,
    };
    mockInvoke.mockResolvedValue(mockHttpResponse);

    const result = await executeHttpFetch({
      url: "https://api.example.com/data",
      method: "GET",
    });

    expect(mockInvoke).toHaveBeenCalledWith("http_request", {
      url: "https://api.example.com/data",
      method: "GET",
      headers: null,
      body: null,
      timeoutMs: null,
    });
    expect(result).toContain("Status: 200");
    expect(result).toContain("Duration: 150ms");
    expect(result).toContain('{"data": "test"}');
  });

  it("passes headers and body for POST requests", async () => {
    mockIsTauri.mockReturnValue(true);

    mockInvoke.mockResolvedValue({
      status: 201,
      headers: {},
      body: "created",
      duration_ms: 100,
    });

    await executeHttpFetch({
      url: "https://api.example.com/items",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"name": "test"}',
      timeout_ms: 5000,
    });

    expect(mockInvoke).toHaveBeenCalledWith("http_request", {
      url: "https://api.example.com/items",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"name": "test"}',
      timeoutMs: 5000,
    });
  });

  it("formats response with headers", async () => {
    mockIsTauri.mockReturnValue(true);

    mockInvoke.mockResolvedValue({
      status: 200,
      headers: {
        "content-type": "text/html",
        "x-custom": "value",
      },
      body: "<html>test</html>",
      duration_ms: 50,
    });

    const result = await executeHttpFetch({ url: "https://example.com" });

    expect(result).toContain("Headers:");
    expect(result).toContain("content-type: text/html");
    expect(result).toContain("x-custom: value");
  });

  it("propagates fetch errors in browser mode", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    await expect(
      executeHttpFetch({ url: "https://example.com" })
    ).rejects.toThrow("Network error");
  });
});

// ============================================================================
// executeWebSearch
// ============================================================================

describe("executeWebSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauri.mockReturnValue(false);
  });

  it("throws in browser mode (CORS limitation)", async () => {
    await expect(
      executeWebSearch({ query: "test query" })
    ).rejects.toThrow("Web search is only available in the desktop app");
  });

  it("calls Tauri invoke with search URL in Tauri mode", async () => {
    mockIsTauri.mockReturnValue(true);

    mockInvoke.mockResolvedValue({
      status: 200,
      headers: {},
      body: '<a class="result__a" href="https://example.com">Example</a><a class="result__snippet">A snippet</a>',
      duration_ms: 500,
    });

    const result = await executeWebSearch({ query: "test query" });

    expect(mockInvoke).toHaveBeenCalledWith("http_request", {
      url: expect.stringContaining("duckduckgo.com"),
      method: "GET",
      headers: expect.objectContaining({ "User-Agent": expect.any(String) }),
      body: null,
      timeoutMs: 10000,
    });
    expect(result).toContain("Search results for");
  });

  it("returns no results message when parsing yields nothing", async () => {
    mockIsTauri.mockReturnValue(true);

    mockInvoke.mockResolvedValue({
      status: 200,
      headers: {},
      body: "<html><body>No matching results</body></html>",
      duration_ms: 300,
    });

    const result = await executeWebSearch({ query: "obscure query" });
    expect(result).toContain('No results found for "obscure query"');
  });

  it("encodes query parameters in URL", async () => {
    mockIsTauri.mockReturnValue(true);

    mockInvoke.mockResolvedValue({
      status: 200,
      headers: {},
      body: "",
      duration_ms: 100,
    });

    await executeWebSearch({ query: "hello world & special=chars" });

    expect(mockInvoke).toHaveBeenCalledWith(
      "http_request",
      expect.objectContaining({
        url: expect.stringContaining("hello%20world%20%26%20special%3Dchars"),
      })
    );
  });
});

// ============================================================================
// executeScrapeWebpage
// ============================================================================

describe("executeScrapeWebpage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauri.mockReturnValue(false);
  });

  it("throws in browser mode", async () => {
    await expect(
      executeScrapeWebpage({ url: "https://example.com" })
    ).rejects.toThrow("Web scraping is only available in the desktop app");
  });

  it("scrapes webpage content in Tauri mode", async () => {
    mockIsTauri.mockReturnValue(true);

    mockInvoke.mockResolvedValue({
      status: 200,
      headers: {},
      body: '<html><head><title>Test Page</title></head><body><p>Hello world</p></body></html>',
      duration_ms: 200,
    });

    const result = await executeScrapeWebpage({ url: "https://example.com" });

    expect(result).toContain("URL: https://example.com");
    expect(result).toContain("Title: Test Page");
    expect(result).toContain("Content:");
    expect(result).toContain("Hello world");
  });

  it("extracts links from scraped page", async () => {
    mockIsTauri.mockReturnValue(true);

    mockInvoke.mockResolvedValue({
      status: 200,
      headers: {},
      body: '<html><head><title>Links</title></head><body><a href="https://link1.com">Link 1</a><a href="https://link2.com">Link 2</a></body></html>',
      duration_ms: 100,
    });

    const result = await executeScrapeWebpage({ url: "https://example.com" });
    expect(result).toContain("Links (2):");
    expect(result).toContain("https://link1.com");
    expect(result).toContain("https://link2.com");
  });

  it("strips script and style tags from content", async () => {
    mockIsTauri.mockReturnValue(true);

    mockInvoke.mockResolvedValue({
      status: 200,
      headers: {},
      body: '<html><head><title>Test</title><style>body{color:red}</style></head><body><script>alert("hi")</script><p>Visible</p></body></html>',
      duration_ms: 100,
    });

    const result = await executeScrapeWebpage({ url: "https://example.com" });
    expect(result).toContain("Visible");
    expect(result).not.toContain("alert");
    expect(result).not.toContain("color:red");
  });

  it("handles pages without a title", async () => {
    mockIsTauri.mockReturnValue(true);

    mockInvoke.mockResolvedValue({
      status: 200,
      headers: {},
      body: "<html><body>No title here</body></html>",
      duration_ms: 100,
    });

    const result = await executeScrapeWebpage({ url: "https://example.com" });
    expect(result).toContain("Title: Untitled");
  });

  it("decodes HTML entities in content", async () => {
    mockIsTauri.mockReturnValue(true);

    mockInvoke.mockResolvedValue({
      status: 200,
      headers: {},
      body: "<html><head><title>Test &amp; Page</title></head><body>&lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot;</body></html>",
      duration_ms: 100,
    });

    const result = await executeScrapeWebpage({ url: "https://example.com" });
    expect(result).toContain("Test & Page");
    expect(result).toContain('<b>bold</b> & "quoted"');
  });

  it("passes custom timeout", async () => {
    mockIsTauri.mockReturnValue(true);

    mockInvoke.mockResolvedValue({
      status: 200,
      headers: {},
      body: "<html><body>ok</body></html>",
      duration_ms: 50,
    });

    await executeScrapeWebpage({
      url: "https://example.com",
      timeout_ms: 30000,
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      "http_request",
      expect.objectContaining({ timeoutMs: 30000 })
    );
  });
});

// ============================================================================
// executeWebTool router
// ============================================================================

describe("executeWebTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauri.mockReturnValue(true);
  });

  it("routes http_fetch correctly", async () => {
    mockInvoke.mockResolvedValue({
      status: 200,
      headers: {},
      body: "ok",
      duration_ms: 10,
    });

    const result = await executeWebTool("http_fetch", {
      url: "https://example.com",
    });
    expect(result).toContain("Status: 200");
  });

  it("routes web_search correctly", async () => {
    mockInvoke.mockResolvedValue({
      status: 200,
      headers: {},
      body: "",
      duration_ms: 100,
    });

    const result = await executeWebTool("web_search", {
      query: "test",
    });
    expect(result).toContain("No results found");
  });

  it("routes scrape_webpage correctly", async () => {
    mockInvoke.mockResolvedValue({
      status: 200,
      headers: {},
      body: "<html><head><title>Page</title></head><body>content</body></html>",
      duration_ms: 50,
    });

    const result = await executeWebTool("scrape_webpage", {
      url: "https://example.com",
    });
    expect(result).toContain("Title: Page");
  });

  it("throws for unknown tool names", async () => {
    await expect(
      executeWebTool("unknown_tool", {})
    ).rejects.toThrow("Unknown web tool: unknown_tool");
  });
});
