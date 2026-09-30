import { isTauri } from "@tauri-apps/api/core";
import * as commands from "@/lib/tauri/commands";

export async function storeApiKey(provider: string, key: string): Promise<void> {
  if (!isTauri()) return;
  await commands.storeApiKey(provider, key);
}

export async function getApiKey(provider: string): Promise<string> {
  if (!isTauri()) return "";
  const result = await commands.getApiKey(provider);
  return result ?? "";
}

export async function deleteApiKey(provider: string): Promise<void> {
  if (!isTauri()) return;
  await commands.deleteApiKey(provider);
}

export async function loadAllApiKeys(): Promise<Record<string, string>> {
  if (!isTauri()) return {};
  return commands.getAllApiKeys();
}
