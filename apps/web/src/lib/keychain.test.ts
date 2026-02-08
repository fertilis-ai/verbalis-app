import { describe, it, expect, vi, beforeEach } from "vitest";
import { storeApiKey, getApiKey, deleteApiKey, loadAllApiKeys } from "./keychain";

const mockInvoke = vi.fn();
const mockIsTauri = vi.fn(() => false);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  isTauri: () => mockIsTauri(),
}));

describe("keychain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauri.mockReturnValue(false);
    mockInvoke.mockResolvedValue(undefined);
  });

  describe("storeApiKey", () => {
    it("does nothing when not in Tauri", async () => {
      await storeApiKey("anthropic", "sk-test");
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("invokes store_api_key in Tauri", async () => {
      mockIsTauri.mockReturnValue(true);
      await storeApiKey("anthropic", "sk-test");
      expect(mockInvoke).toHaveBeenCalledWith("store_api_key", {
        provider: "anthropic",
        key: "sk-test",
      });
    });

    it("passes correct provider and key", async () => {
      mockIsTauri.mockReturnValue(true);
      await storeApiKey("openai", "sk-openai-123");
      expect(mockInvoke).toHaveBeenCalledWith("store_api_key", {
        provider: "openai",
        key: "sk-openai-123",
      });
    });
  });

  describe("getApiKey", () => {
    it("returns empty string when not in Tauri", async () => {
      const result = await getApiKey("anthropic");
      expect(result).toBe("");
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("returns key from Tauri invoke", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue("sk-stored-key");
      const result = await getApiKey("anthropic");
      expect(result).toBe("sk-stored-key");
      expect(mockInvoke).toHaveBeenCalledWith("get_api_key", {
        provider: "anthropic",
      });
    });

    it("returns empty string when invoke returns null", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue(null);
      const result = await getApiKey("anthropic");
      expect(result).toBe("");
    });
  });

  describe("deleteApiKey", () => {
    it("does nothing when not in Tauri", async () => {
      await deleteApiKey("anthropic");
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("invokes delete_api_key in Tauri", async () => {
      mockIsTauri.mockReturnValue(true);
      await deleteApiKey("openai");
      expect(mockInvoke).toHaveBeenCalledWith("delete_api_key", {
        provider: "openai",
      });
    });
  });

  describe("loadAllApiKeys", () => {
    it("returns empty object when not in Tauri", async () => {
      const result = await loadAllApiKeys();
      expect(result).toEqual({});
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("returns keys from Tauri invoke", async () => {
      mockIsTauri.mockReturnValue(true);
      const keys = { anthropic: "sk-1", openai: "sk-2" };
      mockInvoke.mockResolvedValue(keys);
      const result = await loadAllApiKeys();
      expect(result).toEqual(keys);
      expect(mockInvoke).toHaveBeenCalledWith("get_all_api_keys");
    });

    it("returns empty object when Tauri returns empty", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue({});
      const result = await loadAllApiKeys();
      expect(result).toEqual({});
    });
  });
});
