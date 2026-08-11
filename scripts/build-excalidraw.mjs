// Builds the vendored Excalidraw fork: yarn install -> esbuild bundle -> type
// declarations. This is the one place that incantation should live — before
// this script existed, three places each carried their own copy (this
// package.json's own `build:excalidraw`, which had drifted to calling a yarn
// script that does not exist; `.github/workflows/ci.yml`'s bespoke steps; and
// a project memory file documenting the manual workaround). See
// `.claude/memory/excalidraw-upgrade.md` for the history.
//
// Usage: npm run build:excalidraw
//
// Requires Node 20–22 to install/build the submodule (upstream's engine cap
// rejects newer Node; `.nvmrc` pins 22). This script does not switch Node
// versions for you — use nvm (`nvm use`) first if your shell defaults newer.
import { existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendor = join(root, "vendor/excalidraw");
const pkg = join(vendor, "packages/excalidraw");

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "inherit" });

const die = (msg) => {
  console.error(`\n[build:excalidraw] ${msg}`);
  process.exit(1);
};

if (!existsSync(join(vendor, "package.json"))) {
  die(
    `vendor/excalidraw is empty — run 'git submodule update --init' first.`,
  );
}

// ── 1. Install the submodule's own dependencies ─────────────────────────────
console.log("[build:excalidraw] yarn install (vendor/excalidraw)...");
try {
  run("yarn", ["install", "--frozen-lockfile"], vendor);
} catch {
  die(
    "yarn install failed in vendor/excalidraw. The fork's engines field caps " +
      "Node at 20–22 (see .nvmrc) — newer Node (e.g. 25) is a common cause. Run " +
      "'nvm use' first.",
  );
}

// ── 2. esbuild bundle (dist/dev + dist/prod) ────────────────────────────────
// buildPackage.js uses paths relative to packages/excalidraw, so it must run
// from there, not the submodule root (it fails with "entry point index.tsx
// cannot be marked as external" otherwise).
console.log("[build:excalidraw] bundling (esbuild)...");
rmSync(join(pkg, "dist"), { recursive: true, force: true });
run("node", ["../../scripts/buildPackage.js"], pkg);

if (!existsSync(join(pkg, "dist/dev")) || !existsSync(join(pkg, "dist/prod"))) {
  die("dist/dev or dist/prod missing after buildPackage.js — the bundle step failed.");
}

// ── 3. Type declarations ────────────────────────────────────────────────────
// tsc (emitDeclarationOnly, no noEmitOnError) can print pre-existing upstream
// type errors unrelated to any flow/fork edit and exit non-zero while still
// writing every declaration file to dist/types. Tolerate the exit code here —
// same as CI — and verify the actual artifact below instead of trusting tsc's
// exit status. (As of the 2026-08 upstream-master upgrade this exits 0 clean;
// tolerating it costs nothing and guards against the historical failure mode
// reappearing on a future upstream sync.)
console.log("[build:excalidraw] generating type declarations (tsc)...");
try {
  run("node_modules/.bin/tsc", ["-p", "tsconfig.json"], pkg);
} catch {
  console.warn(
    "[build:excalidraw] tsc exited non-zero — checking whether declarations were still written...",
  );
}

const typesEntry = join(pkg, "dist/types/excalidraw/index.d.ts");
if (!existsSync(typesEntry)) {
  die(`${typesEntry} missing — tsc did not emit declarations.`);
}

console.log("[build:excalidraw] done.");
