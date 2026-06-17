#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function resolvePiBin() {
  // pi-coding-agent restricts its "exports" map and no longer exposes
  // "./package.json" (nor a CJS-resolvable "." entry), so require.resolve()
  // fails. Resolve the ESM entry instead and walk up to the package root to
  // read its bin field — filesystem reads are not subject to "exports".
  const entryPath = fileURLToPath(
    import.meta.resolve("@earendil-works/pi-coding-agent")
  );
  let dir = dirname(entryPath);
  let pkgJsonPath;
  let pkg;
  for (;;) {
    const candidate = resolve(dir, "package.json");
    if (existsSync(candidate)) {
      const parsed = JSON.parse(readFileSync(candidate, "utf8"));
      if (parsed.name === "@earendil-works/pi-coding-agent") {
        pkgJsonPath = candidate;
        pkg = parsed;
        break;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("Could not locate @earendil-works/pi-coding-agent package root");
    }
    dir = parent;
  }
  const pkgDir = dirname(pkgJsonPath);

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
