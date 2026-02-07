import { invoke, isTauri } from "@tauri-apps/api/core";

export async function runPiSidecar(args: string[]): Promise<string> {
  if (!isTauri()) {
    throw new Error("Pi sidecar is only available in the desktop app.");
  }

  return invoke<string>("run_pi_sidecar", { args });
}
