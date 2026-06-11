import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = resolve(root, "packages/pi-sidecar/src/index.mjs");

// Get the target triple for Tauri sidecar naming convention
const rustcOutput = execSync("rustc -vV").toString();
const tripleMatch = rustcOutput.match(/host: (.+)/);
if (!tripleMatch) {
  throw new Error(
    `Failed to detect target triple from \`rustc -vV\` output:\n${rustcOutput}`
  );
}
const targetTriple = tripleMatch[1].trim();

const target = resolve(
  root,
  `apps/web/src-tauri/bin/pi-sidecar-${targetTriple}`
);

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
chmodSync(target, 0o755);
