import { spawnSync } from "child_process";
import { writeFileSync } from "fs";
import path from "path";

const webDir = path.resolve(import.meta.dir, "../apps/web");
const logPath = path.join(webDir, "test-durations.log");

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

console.log("Running tests with 2000ms timeout...\n");

const result = spawnSync(
  "bunx",
  ["vitest", "run", "-c", "vitest.quick.config.ts"],
  {
    cwd: webDir,
    stdio: ["inherit", "pipe", "pipe"],
    timeout: 600_000,
  },
);

const stdout = stripAnsi(result.stdout?.toString() ?? "");
const stderr = stripAnsi(result.stderr?.toString() ?? "");

// Print vitest stdout so the user sees test output
process.stdout.write(result.stdout ?? "");

// Parse verbose output lines like: ✓ file > suite > test 123ms
// or: × file > suite > test 456ms
const testLine = /^\s*([✓×✗⊘])\s+(.+?)\s+(\d+)\s*ms\s*$/;

const tests: { name: string; duration: number; passed: boolean }[] = [];

for (const line of (stdout + "\n" + stderr).split("\n")) {
  const match = line.match(testLine);
  if (match) {
    tests.push({
      name: match[2].trim(),
      duration: parseInt(match[3], 10),
      passed: match[1] === "✓",
    });
  }
}

// Sort by duration descending
tests.sort((a, b) => b.duration - a.duration);

const passed = tests.filter((t) => t.passed).length;
const failed = tests.length - passed;
const totalMs = tests.reduce((sum, t) => sum + t.duration, 0);

// Print summary
console.log("\n========================================");
console.log("       Test Duration Summary");
console.log("========================================\n");

for (const t of tests) {
  const icon = t.passed ? "PASS" : "FAIL";
  const slow = t.duration > 1000 ? " SLOW" : "";
  console.log(
    `  ${icon} ${String(t.duration).padStart(6)}ms${slow}  ${t.name}`,
  );
}

console.log(
  `\n  Total: ${tests.length} tests | ${passed} passed | ${failed} failed | ${totalMs}ms`,
);

// Write log file
const logLines = [
  `Test Duration Log - ${new Date().toISOString()}`,
  `Timeout: 2000ms`,
  `Total: ${tests.length} tests | ${passed} passed | ${failed} failed | ${totalMs}ms`,
  "",
  "Duration  Status  Test",
  "-".repeat(80),
  ...tests.map(
    (t) =>
      `${String(t.duration).padStart(6)}ms  ${(t.passed ? "passed" : "failed").padEnd(6)}  ${t.name}`,
  ),
];

writeFileSync(logPath, logLines.join("\n") + "\n");
console.log(`\n  Log written to apps/web/test-durations.log`);

process.exit(result.status ?? 1);
