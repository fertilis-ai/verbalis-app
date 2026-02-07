import { Type, type Static } from "@sinclair/typebox";
import { invoke } from "@tauri-apps/api/core";
import type { ToolDefinitionV2 } from "./categories";
import { isTauri } from "@/lib/storage";
import { truncateText } from "@/lib/utils";

// ============================================================================
// Parameter Schemas
// ============================================================================

export const HttpFetchParams = Type.Object({
  url: Type.String({ description: "URL to fetch" }),
  method: Type.Optional(
    Type.Union([
      Type.Literal("GET"),
      Type.Literal("POST"),
      Type.Literal("PUT"),
      Type.Literal("DELETE"),
      Type.Literal("PATCH"),
    ], { description: "HTTP method (default: GET)" })
  ),
  headers: Type.Optional(
    Type.Record(Type.String(), Type.String(), { description: "Request headers" })
  ),
  body: Type.Optional(Type.String({ description: "Request body (for POST/PUT/PATCH)" })),
  timeout_ms: Type.Optional(Type.Number({ description: "Request timeout in milliseconds" })),
});

export const WebSearchParams = Type.Object({
  query: Type.String({ description: "Search query" }),
  provider: Type.Optional(
    Type.Union([
      Type.Literal("duckduckgo"),
      Type.Literal("google"),
    ], { description: "Search provider (default: duckduckgo)" })
  ),
  max_results: Type.Optional(Type.Number({ description: "Maximum number of results (default: 5)" })),
});

export const ScrapeWebpageParams = Type.Object({
  url: Type.String({ description: "URL to scrape" }),
  selector: Type.Optional(Type.String({ description: "CSS selector to extract specific content" })),
  timeout_ms: Type.Optional(Type.Number({ description: "Request timeout in milliseconds" })),
});

// ============================================================================
// Response Types
// ============================================================================

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  duration_ms: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface ScrapeResult {
  title: string;
  text: string;
  links: string[];
}

// ============================================================================
// Tool Implementations
// ============================================================================

export async function executeHttpFetch(
  args: Static<typeof HttpFetchParams>
): Promise<string> {
  const { url, method = "GET", headers, body, timeout_ms } = args;

  if (isTauri()) {
    const response = await invoke<HttpResponse>("http_request", {
      url,
      method,
      headers: headers || null,
      body: body || null,
      timeoutMs: timeout_ms || null,
    });

    return formatHttpResponse(response);
  } else {
    // Browser fallback (limited by CORS)
    const controller = new AbortController();
    const timeoutId = timeout_ms
      ? setTimeout(() => controller.abort(), timeout_ms)
      : null;

    try {
      const response = await fetch(url, {
        method,
        headers: headers || undefined,
        body: body || undefined,
        signal: controller.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      const responseBody = await response.text();
      return formatHttpResponse({
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseBody,
        duration_ms: 0,
      });
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      throw error;
    }
  }
}

export async function executeWebSearch(
  args: Static<typeof WebSearchParams>
): Promise<string> {
  const { query, max_results = 5 } = args;

  // Use DuckDuckGo HTML API (doesn't require API key)
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  if (isTauri()) {
    const response = await invoke<HttpResponse>("http_request", {
      url: searchUrl,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Sapio/1.0)",
      },
      body: null,
      timeoutMs: 10000,
    });

    // Parse HTML response to extract results
    const results = parseSearchResults(response.body, max_results);
    return formatSearchResults(query, results);
  } else {
    // Browser fallback - return error since DuckDuckGo blocks CORS
    throw new Error("Web search is only available in the desktop app");
  }
}

export async function executeScrapeWebpage(
  args: Static<typeof ScrapeWebpageParams>
): Promise<string> {
  const { url, selector, timeout_ms = 10000 } = args;

  if (isTauri()) {
    const response = await invoke<HttpResponse>("http_request", {
      url,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Sapio/1.0)",
      },
      body: null,
      timeoutMs: timeout_ms,
    });

    // Parse HTML and extract text
    const result = parseWebpage(response.body, selector);
    return formatScrapeResult(url, result);
  } else {
    throw new Error("Web scraping is only available in the desktop app");
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatHttpResponse(response: HttpResponse): string {
  const lines: string[] = [];
  lines.push(`Status: ${response.status}`);
  lines.push(`Duration: ${response.duration_ms}ms`);
  lines.push("");
  lines.push("Headers:");
  for (const [key, value] of Object.entries(response.headers)) {
    lines.push(`  ${key}: ${value}`);
  }
  lines.push("");
  lines.push("Body:");
  lines.push(truncateText(response.body, 10000));
  return lines.join("\n");
}

function parseSearchResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // Simple regex-based parsing for DuckDuckGo HTML results
  const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>.*?<a[^>]+class="result__snippet"[^>]*>([^<]+)<\/a>/gs;

  let match;
  while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
    results.push({
      url: match[1],
      title: decodeHtmlEntities(match[2]),
      snippet: decodeHtmlEntities(match[3]),
    });
  }

  return results;
}

function formatSearchResults(query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `No results found for "${query}"`;
  }

  const lines: string[] = [];
  lines.push(`Search results for "${query}":`);
  lines.push("");

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    lines.push(`${i + 1}. ${result.title}`);
    lines.push(`   URL: ${result.url}`);
    lines.push(`   ${result.snippet}`);
    lines.push("");
  }

  return lines.join("\n");
}

function parseWebpage(html: string, selector?: string): ScrapeResult {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : "Untitled";

  // Remove script and style tags
  let cleanHtml = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");

  // If selector provided, try to find matching content
  if (selector) {
    // Simple selector support (just for id and class)
    if (selector.startsWith("#")) {
      const id = selector.slice(1);
      const match = cleanHtml.match(new RegExp(`<[^>]+id="${id}"[^>]*>([\\s\\S]*?)<\\/`, "i"));
      if (match) {
        cleanHtml = match[1];
      }
    } else if (selector.startsWith(".")) {
      const className = selector.slice(1);
      const match = cleanHtml.match(new RegExp(`<[^>]+class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/`, "i"));
      if (match) {
        cleanHtml = match[1];
      }
    }
  }

  // Extract links
  const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>/g;
  const links: string[] = [];
  let linkMatch;
  while ((linkMatch = linkRegex.exec(cleanHtml)) !== null && links.length < 50) {
    if (linkMatch[1].startsWith("http")) {
      links.push(linkMatch[1]);
    }
  }

  // Strip all HTML tags and decode entities
  const text = cleanHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { title, text: decodeHtmlEntities(text), links };
}

function formatScrapeResult(url: string, result: ScrapeResult): string {
  const lines: string[] = [];
  lines.push(`URL: ${url}`);
  lines.push(`Title: ${result.title}`);
  lines.push("");
  lines.push("Content:");
  lines.push(truncateText(result.text, 5000));

  if (result.links.length > 0) {
    lines.push("");
    lines.push(`Links (${result.links.length}):`);
    for (const link of result.links.slice(0, 10)) {
      lines.push(`  - ${link}`);
    }
    if (result.links.length > 10) {
      lines.push(`  ... and ${result.links.length - 10} more`);
    }
  }

  return lines.join("\n");
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const WEB_TOOL_DEFINITIONS: Record<string, ToolDefinitionV2> = {
  http_fetch: {
    name: "http_fetch",
    description: "Make an HTTP request to a URL and return the response",
    category: "web",
    riskLevel: "medium", // Will be elevated for non-GET methods
    parameters: HttpFetchParams,
    requiresNetwork: true,
    supportsUndo: false,
    estimatedDurationMs: 2000,
  },
  web_search: {
    name: "web_search",
    description: "Search the web using a search engine and return results",
    category: "web",
    riskLevel: "low",
    parameters: WebSearchParams,
    requiresNetwork: true,
    supportsUndo: false,
    estimatedDurationMs: 3000,
  },
  scrape_webpage: {
    name: "scrape_webpage",
    description: "Fetch and extract text content from a webpage",
    category: "web",
    riskLevel: "low",
    parameters: ScrapeWebpageParams,
    requiresNetwork: true,
    supportsUndo: false,
    estimatedDurationMs: 3000,
  },
};

// ============================================================================
// Execution Router
// ============================================================================

export async function executeWebTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (toolName) {
    case "http_fetch":
      return executeHttpFetch(args as Static<typeof HttpFetchParams>);
    case "web_search":
      return executeWebSearch(args as Static<typeof WebSearchParams>);
    case "scrape_webpage":
      return executeScrapeWebpage(args as Static<typeof ScrapeWebpageParams>);
    default:
      throw new Error(`Unknown web tool: ${toolName}`);
  }
}
