/** Strip trailing slashes from a URL string. */
export function normalizeBaseUrl(input: string): string {
  return input.trim().replace(/\/+$/, "");
}

/** Ensure a base URL ends with `/v1`. */
export function buildOpenAiBaseUrl(baseUrl: string): string {
  const trimmed = normalizeBaseUrl(baseUrl);
  if (trimmed.endsWith("/v1")) {
    return trimmed;
  }
  if (trimmed.includes("/v1/")) {
    const idx = trimmed.indexOf("/v1/");
    return trimmed.slice(0, idx + 3);
  }
  return `${trimmed}/v1`;
}

/** Build a full OpenAI-compatible URL from a base URL and path. */
export function buildOpenAiUrl(baseUrl: string, path: string): string {
  return `${buildOpenAiBaseUrl(baseUrl)}${path}`;
}
