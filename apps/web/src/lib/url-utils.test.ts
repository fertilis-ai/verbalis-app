import { describe, it, expect } from "vitest";
import { normalizeBaseUrl, buildOpenAiBaseUrl, buildOpenAiUrl } from "./url-utils";

describe("normalizeBaseUrl", () => {
  it("strips trailing slashes", () => {
    expect(normalizeBaseUrl("http://localhost:1234/")).toBe("http://localhost:1234");
  });

  it("strips multiple trailing slashes", () => {
    expect(normalizeBaseUrl("http://localhost:1234///")).toBe("http://localhost:1234");
  });

  it("trims whitespace", () => {
    expect(normalizeBaseUrl("  http://localhost:1234  ")).toBe("http://localhost:1234");
  });

  it("returns clean URL unchanged", () => {
    expect(normalizeBaseUrl("http://localhost:1234")).toBe("http://localhost:1234");
  });
});

describe("buildOpenAiBaseUrl", () => {
  it("appends /v1 when missing", () => {
    expect(buildOpenAiBaseUrl("http://localhost:1234")).toBe("http://localhost:1234/v1");
  });

  it("keeps existing /v1 suffix", () => {
    expect(buildOpenAiBaseUrl("http://localhost:1234/v1")).toBe("http://localhost:1234/v1");
  });

  it("truncates path after /v1/", () => {
    expect(buildOpenAiBaseUrl("http://localhost:1234/v1/chat/completions")).toBe("http://localhost:1234/v1");
  });

  it("strips trailing slashes before appending /v1", () => {
    expect(buildOpenAiBaseUrl("http://localhost:1234/")).toBe("http://localhost:1234/v1");
  });
});

describe("buildOpenAiUrl", () => {
  it("combines base URL and path", () => {
    expect(buildOpenAiUrl("http://localhost:1234", "/models")).toBe("http://localhost:1234/v1/models");
  });

  it("handles base URL that already has /v1", () => {
    expect(buildOpenAiUrl("http://localhost:1234/v1", "/models")).toBe("http://localhost:1234/v1/models");
  });
});
