#!/usr/bin/env node
/**
 * Pre-commit verification for Claude Code.
 *
 * Runs the same gates Vercel applies at deploy time, so a commit Claude makes
 * only lands if the build would also succeed remotely:
 *   1. pnpm typecheck   — TS errors (~5 s)
 *   2. pnpm build       — static-page collection + route validation (~30 s)
 *
 * Triggered as a PreToolUse hook on Bash(git commit*). On failure the hook
 * emits a permission-deny JSON document so Claude knows the commit is blocked
 * and surfaces the reason in the UI.
 *
 * stdin is the Claude Code hook payload JSON. We don't strictly need to parse
 * it because the `if` field in settings.json already filters non-commit bash
 * invocations, but we do parse defensively in case the matcher is bypassed.
 */

const { spawnSync, execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function emitDeny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          reason + " — run the failing command locally, fix, and try the commit again.",
      },
    }),
  );
}

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function readEnvLocal(rootDir) {
  const envPath = path.join(rootDir, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function run(cmd, args, opts) {
  // pnpm.CMD on Windows when run from MINGW/Git-Bash needs shell: true to resolve.
  // shell:true also lets us pass through PATH for pnpm shim resolution.
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: true,
    ...opts,
  });
  return result.status === 0;
}

function main() {
  // Defensive check: confirm this is actually a git-commit invocation.
  // The `if` matcher should have filtered already, but a stale settings.json
  // could let other bash commands through.
  const payload = readStdin();
  try {
    const json = JSON.parse(payload || "{}");
    const cmd = json?.tool_input?.command || "";
    if (cmd && !/\bgit\s+commit\b/.test(cmd)) {
      // Not a git commit — silently allow.
      return;
    }
  } catch {
    // Unreadable payload — proceed; worst case we run typecheck+build redundantly.
  }

  // Resolve repo root so pnpm finds package.json.
  let root;
  try {
    root = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  } catch {
    // Not in a git repo — nothing to verify.
    return;
  }
  process.chdir(root);

  readEnvLocal(root);

  // Build needs these at module-load time (auth + db modules throw if missing).
  // Provide placeholders only if the real values aren't in .env.local.
  if (!process.env.BETTER_AUTH_SECRET) {
    process.env.BETTER_AUTH_SECRET = "local-build-only-secret-at-least-32-chars";
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      "postgres://placeholder:placeholder@placeholder/placeholder?sslmode=require";
  }

  process.stderr.write(">>> [claude pre-commit] pnpm typecheck\n");
  if (!run("pnpm", ["typecheck"])) {
    emitDeny("pnpm typecheck failed");
    return;
  }

  process.stderr.write(">>> [claude pre-commit] pnpm build\n");
  if (!run("pnpm", ["build"])) {
    emitDeny("pnpm build failed");
    return;
  }

  // Both checks passed — exit 0 with no output means allow.
}

main();
