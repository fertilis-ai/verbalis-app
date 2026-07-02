import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAppFetch = vi.fn();

// Passthrough persist (avoids localStorage issues in tests)
vi.mock("zustand/middleware", () => ({
  persist: (fn: unknown) => fn,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

vi.mock("@/lib/storage", () => ({
  isTauri: vi.fn(() => false),
  getAppDataDir: vi.fn(async () => "/Users/test/.sapio"),
}));

vi.mock("@/lib/http", () => ({
  appFetch: (...args: unknown[]) => mockAppFetch(...args),
}));

import { IMAGE_TOOL_DEFINITIONS, executeGenerateImage } from "./image-tools";
import { isTauri } from "@/lib/storage";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "@/stores/settings-store";

const mockIsTauri = vi.mocked(isTauri);
const mockInvoke = vi.mocked(invoke);

function jsonResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

function configureSettings(overrides: Record<string, unknown> = {}) {
  useSettingsStore.setState({
    apiKeys: { anthropic: "", openai: "", google: "", openrouter: "sk-or-key" },
    imageModel: "openai/gpt-image-1",
    availableImageModels: [
      { id: "openai/gpt-image-1", name: "GPT Image 1", supportsImageInput: true },
      { id: "text-only/model", name: "Text Only", supportsImageInput: false },
    ],
    ...overrides,
  });
}

describe("IMAGE_TOOL_DEFINITIONS", () => {
  it("defines generate_image with expected metadata", () => {
    const def = IMAGE_TOOL_DEFINITIONS.generate_image;
    expect(def.name).toBe("generate_image");
    expect(def.category).toBe("web");
    expect(def.riskLevel).toBe("low");
    expect(def.requiresNetwork).toBe(true);
    expect(def.supportsUndo).toBe(false);
  });
});

describe("executeGenerateImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauri.mockReturnValue(true);
    configureSettings();
  });

  it("throws in browser mode", async () => {
    mockIsTauri.mockReturnValue(false);
    await expect(executeGenerateImage({ prompt: "a cat" })).rejects.toThrow(
      "only available in the desktop app"
    );
  });

  it("throws when no OpenRouter API key is configured", async () => {
    configureSettings({ apiKeys: { anthropic: "", openai: "", google: "", openrouter: "  " } });
    await expect(executeGenerateImage({ prompt: "a cat" })).rejects.toThrow(
      "No OpenRouter API key"
    );
  });

  it("throws when no image model is selected", async () => {
    configureSettings({ imageModel: "" });
    await expect(executeGenerateImage({ prompt: "a cat" })).rejects.toThrow(
      "No image model selected"
    );
  });

  it("generates an image and saves it to the images folder", async () => {
    mockAppFetch.mockResolvedValue(
      jsonResponse({ data: [{ b64_json: "aW1hZ2U=" }], usage: { cost: 0.04 } })
    );
    mockInvoke.mockResolvedValue(undefined);

    const result = await executeGenerateImage({ prompt: "A red panda! In space." });

    expect(mockAppFetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/images",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-or-key" }),
      })
    );
    const body = JSON.parse(mockAppFetch.mock.calls[0][1].body as string);
    expect(body).toEqual({
      model: "openai/gpt-image-1",
      prompt: "A red panda! In space.",
      output_format: "png",
    });

    expect(mockInvoke).toHaveBeenCalledWith("write_file_base64", {
      path: expect.stringMatching(/^\/Users\/test\/\.sapio\/images\/.+-a-red-panda-in-space\.png$/),
      dataBase64: "aW1hZ2U=",
    });

    expect(result).toContain("Image generated successfully.");
    expect(result).toContain("Model: openai/gpt-image-1");
    expect(result).toMatch(/^Saved to: \/Users\/test\/\.sapio\/images\/.+\.png$/m);
    expect(result).toContain("Cost: $0.0400");
  });

  it("omits the cost line when usage is absent", async () => {
    mockAppFetch.mockResolvedValue(jsonResponse({ data: [{ b64_json: "aW1hZ2U=" }] }));
    mockInvoke.mockResolvedValue(undefined);

    const result = await executeGenerateImage({ prompt: "a cat" });
    expect(result).not.toContain("Cost:");
  });

  it("passes aspect_ratio when provided", async () => {
    mockAppFetch.mockResolvedValue(jsonResponse({ data: [{ b64_json: "aW1hZ2U=" }] }));
    mockInvoke.mockResolvedValue(undefined);

    await executeGenerateImage({ prompt: "a cat", aspect_ratio: "16:9" });
    const body = JSON.parse(mockAppFetch.mock.calls[0][1].body as string);
    expect(body.aspect_ratio).toBe("16:9");
  });

  it("uses the media_type for the file extension", async () => {
    mockAppFetch.mockResolvedValue(
      jsonResponse({ data: [{ b64_json: "c3Zn", media_type: "image/svg+xml" }] })
    );
    mockInvoke.mockResolvedValue(undefined);

    const result = await executeGenerateImage({ prompt: "a logo" });
    expect(result).toMatch(/^Saved to: .+\.svg$/m);
  });

  it("sends source_image as a base64 data URL reference for editing", async () => {
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "read_file_base64" ? "c291cmNl" : undefined
    );
    mockAppFetch.mockResolvedValue(jsonResponse({ data: [{ b64_json: "ZWRpdGVk" }] }));

    const result = await executeGenerateImage({
      prompt: "make it watercolor",
      source_image: "/Users/test/.sapio/images/old.png",
    });

    expect(mockInvoke).toHaveBeenCalledWith("read_file_base64", {
      path: "/Users/test/.sapio/images/old.png",
    });
    const body = JSON.parse(mockAppFetch.mock.calls[0][1].body as string);
    expect(body.input_references).toEqual([
      { type: "image_url", image_url: { url: "data:image/png;base64,c291cmNl" } },
    ]);
    expect(result).toContain("Image edited successfully.");
  });

  it("infers the source image MIME type from its extension", async () => {
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "read_file_base64" ? "anBn" : undefined
    );
    mockAppFetch.mockResolvedValue(jsonResponse({ data: [{ b64_json: "eA==" }] }));

    await executeGenerateImage({ prompt: "edit", source_image: "/tmp/photo.JPG" });
    const body = JSON.parse(mockAppFetch.mock.calls[0][1].body as string);
    expect(body.input_references[0].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("rejects editing when the selected model does not support image input", async () => {
    configureSettings({ imageModel: "text-only/model" });
    await expect(
      executeGenerateImage({ prompt: "edit this", source_image: "/tmp/a.png" })
    ).rejects.toThrow("does not support image editing");
    expect(mockAppFetch).not.toHaveBeenCalled();
  });

  it("attempts editing when the model is not in the known list", async () => {
    configureSettings({ imageModel: "unknown/model", availableImageModels: [] });
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "read_file_base64" ? "eA==" : undefined
    );
    mockAppFetch.mockResolvedValue(jsonResponse({ data: [{ b64_json: "eQ==" }] }));

    const result = await executeGenerateImage({ prompt: "edit", source_image: "/tmp/a.png" });
    expect(result).toContain("Saved to:");
  });

  it("surfaces API error messages", async () => {
    mockAppFetch.mockResolvedValue(
      jsonResponse({ error: { message: "Insufficient credits" } }, false, 402)
    );
    await expect(executeGenerateImage({ prompt: "a cat" })).rejects.toThrow(
      "Image generation failed (HTTP 402: Insufficient credits)"
    );
  });

  it("throws when the API returns no image data", async () => {
    mockAppFetch.mockResolvedValue(jsonResponse({ data: [] }));
    await expect(executeGenerateImage({ prompt: "a cat" })).rejects.toThrow(
      "returned no image data"
    );
  });
});
