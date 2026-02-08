import { invoke, isTauri } from "@tauri-apps/api/core";

export async function storeApiKey(provider: string, key: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("store_api_key", { provider, key });
}

export async function getApiKey(provider: string): Promise<string> {
  if (!isTauri()) return "";
  const result = await invoke<string | null>("get_api_key", { provider });
  return result ?? "";
}

export async function deleteApiKey(provider: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("delete_api_key", { provider });
}

export async function loadAllApiKeys(): Promise<Record<string, string>> {
  if (!isTauri()) return {};
  return invoke<Record<string, string>>("get_all_api_keys");
}
