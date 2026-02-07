#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

function resolvePiBin() {
  const require = createRequire(import.meta.url);
  const pkgJsonPath = require.resolve("@mariozechner/pi-coding-agent/package.json");
  const pkgDir = dirname(pkgJsonPath);
  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));

  if (!pkg.bin) {
    throw new Error("pi-coding-agent package.json has no bin field");
  }

  if (typeof pkg.bin === "string") {
    return resolve(pkgDir, pkg.bin);
  }

  const preferred = pkg.bin.pi ?? pkg.bin["pi-coding-agent"];
  if (preferred) {
    return resolve(pkgDir, preferred);
  }

  const first = Object.values(pkg.bin)[0];
  if (!first) {
    throw new Error("pi-coding-agent bin field is empty");
  }

  return resolve(pkgDir, first);
}

function main() {
  const args = process.argv.slice(2);
  const binPath = resolvePiBin();
  const isJs = binPath.endsWith(".js") || binPath.endsWith(".mjs") || binPath.endsWith(".cjs");
  const runner = process.env.PI_SIDECAR_RUNNER || process.execPath;
  const cmd = isJs ? [runner, binPath, ...args] : [binPath, ...args];

  const child = spawn(cmd[0], cmd.slice(1), {
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    process.exit(code ?? 1);
  });

  child.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}

main();
