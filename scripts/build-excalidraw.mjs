// Builds the vendored Excalidraw fork: yarn install -> esbuild bundle -> type
// declarations -> fork-edit verification. This is the one place that
// incantation should live — before this script existed, three places each
// carried their own copy (this package.json's own `build:excalidraw`, which
// had drifted to calling a yarn script that does not exist; a CI workflow's
// bespoke steps; and a project memory file documenting the manual workaround).
// See `.claude/memory/excalidraw-upgrade.md` for the history.
//
// flow builds locally, with no CI. That is why stage 4 lives here: it is the
// only automated guard that a submodule rebase did not silently drop a fork
// edit, and it runs at the one moment that can happen.
//
// Usage: npm run build:excalidraw
//
// Requires Node 20–22 to install/build the submodule (upstream's engine cap
// rejects newer Node; `.nvmrc` pins 22). This script does not switch Node
// versions for you — use nvm (`nvm use`) first if your shell defaults newer.
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
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

// ── 4. Fork-edit survival ───────────────────────────────────────────────────
// flow's customizations live as commits on the `flow-next` submodule branch, so
// a rebase onto upstream can silently drop one. Left undetected that surfaces
// much later as a baffling typecheck or e2e failure, far from its cause.
//
// Asserting on the BUILT declarations rather than on the source is the point:
// it proves the edit survived all the way through the bundle, which is the
// thing flow actually consumes. This runs at vendor-build time — the exact
// moment a rebase could have dropped an edit — which is earlier and more
// reliable than the CI job that used to own this check (and which only ever
// covered the first of these two).
//
// Add a line here whenever a fork edit becomes load-bearing.
const FORK_EDITS = [
  {
    symbol: "commitDeferredChanges",
    file: "dist/types/excalidraw/components/App.d.ts",
    why: "one-undo-entry batching for drag gestures (see deferred-commit.ts)",
  },
  {
    symbol: "activeEyeDropperAtom",
    file: "dist/types/excalidraw/index.d.ts",
    why: "lets flow's pickers open the vendor eyedropper (see src/lib/eyedropper.ts)",
  },
  {
    symbol: "pastePosition",
    file: "dist/types/excalidraw/types.d.ts",
    why: "paste-position preference read by the clipboard paste path (see src/lib/paste-position.ts)",
  },
  {
    symbol: "getLineHeight",
    file: "dist/types/excalidraw/index.d.ts",
    why: "per-font default line height, so the Text panel can tell a user-chosen line height from the font's own (see src/lib/line-height.ts)",
  },
];

const missing = FORK_EDITS.filter(({ symbol, file }) => {
  const path = join(pkg, file);
  return !existsSync(path) || !readFileSync(path, "utf8").includes(symbol);
});

if (missing.length > 0) {
  die(
    `fork edit(s) missing from the built declarations — a submodule rebase ` +
      `probably dropped them:\n` +
      missing.map((m) => `  - ${m.symbol} (${m.why})\n      expected in ${m.file}`).join("\n"),
  );
}

// ── 5. Deletion-shaped fork-edit survival ───────────────────────────────────
// Stage 4 can only express *additive* fork edits: it asserts a symbol is
// PRESENT in the built output. The `feat/cmd-modifier-semantics` work is the
// opposite shape — it DELETES upstream expressions. This stage can only key on
// the grid-snap bypass idiom, so it covers that subset: 24 sites across 3
// files (`App.tsx`, `linearElementEditor.ts`, `actionFinalize.tsx`) — 21
// already removed as deletions (16 + 5, across the first two files only)
// plus the 3 deliberately left and allowlisted below. The branch's other 2
// deletions (App.tsx's deep-select shift gate and snapping.ts's object-snap
// toggle) don't share this idiom and have no automated guard here. The
// branch total across all 3 deletion kinds is 23 removed sites in 3 files
// (App.tsx, linearElementEditor.ts, snapping.ts) — see
// `.claude/memory/tool-override.md`, "Cmd/Ctrl means one thing". A replay
// that silently restores one of the grid bypasses produces no missing
// symbol, no merge conflict, and no test failure behind all but one site, so
// stage 4 is structurally blind to it.
//
// This check therefore runs against the fork SOURCE, not the built artifact: a
// deletion has no footprint in `dist/` to assert on. It looks for the removed
// idiom — `event[KEYS.CTRL_OR_CMD]` feeding `getEffectiveGridSize()` or a
// `snapToGrid` argument — within a window around each `CTRL_OR_CMD` hit: 3
// lines forward, enough to span the multi-line ternaries upstream formats
// these as, and 6 lines back, enough to reach a `snapToGrid` mention sitting
// in a preceding `flow:` comment rather than on the same or a following line
// (the `LinearElementEditor.addMidpoint` boolean-argument site is call-shaped
// this way — the idiom word is above the argument, not beside or below it).
// Comment lines are skipped as scan *targets* (a `flow:` marker documenting a
// deletion doesn't itself trip the check by being the CTRL_OR_CMD line), but
// they still count as context when they fall inside another hit's window.
//
// A small number of sites were DELIBERATELY left: they are reachable only while
// a multi-point element is being drawn, and `canEngage`
// (src/ui/toolbar/tool-override.ts) refuses to engage the override when
// `multiElement` is set, so the modifier is never held through them. They are
// allowlisted per file with an exact expected count, so removing one is fine
// but adding one anywhere fails the build.
const GRID_BYPASS_IDIOM = /getEffectiveGridSize|snapToGrid/;
const GRID_BYPASS_ALLOWED = new Map([
  [
    "packages/element/src/linearElementEditor.ts",
    {
      count: 2,
      why: "handlePointerMoveInEditMode — mid-draw only; canEngage bails on multiElement",
    },
  ],
  [
    "packages/excalidraw/actions/actionFinalize.tsx",
    {
      count: 1,
      why: "actionFinalize — finishing an in-progress multi-point draw; same reachability",
    },
  ],
]);

const collectGridBypasses = (dir, found = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") {
        continue;
      }
      collectGridBypasses(path, found);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) {
      continue;
    }
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
        return; // a `flow:` comment describing the deletion, not the idiom
      }
      if (!line.includes("CTRL_OR_CMD")) {
        return;
      }
      const window = lines.slice(Math.max(0, i - 6), i + 3).join("\n");
      if (GRID_BYPASS_IDIOM.test(window)) {
        found.push({ file: relative(vendor, path), line: i + 1, text: trimmed });
      }
    });
  }
  return found;
};

const bypasses = collectGridBypasses(join(vendor, "packages"));
const byFile = new Map();
for (const hit of bypasses) {
  byFile.set(hit.file, [...(byFile.get(hit.file) ?? []), hit]);
}

const unexpected = [...byFile].flatMap(([file, hits]) => {
  const allowed = GRID_BYPASS_ALLOWED.get(file)?.count ?? 0;
  return hits.length > allowed ? [{ file, allowed, hits }] : [];
});

if (unexpected.length > 0) {
  die(
    `cmd/ctrl grid-snap bypass reappeared in the fork source — an upstream ` +
      `replay probably restored a deletion this fork made on purpose ` +
      `(see .claude/memory/tool-override.md, "Cmd/Ctrl means one thing"):\n` +
      unexpected
        .map(
          ({ file, allowed, hits }) =>
            `  - ${file}: ${hits.length} site(s), ${allowed} allowed\n` +
            hits.map((h) => `      ${h.file}:${h.line}  ${h.text}`).join("\n"),
        )
        .join("\n") +
      `\n\n  Drop the \`event[KEYS.CTRL_OR_CMD]\` term (keep any elbow-arrow ` +
      `exemption) and re-add a \`flow:\` comment at each site.`,
  );
}

// ── 6. Arrow-binding inversion survival ─────────────────────────────────────
// The same deletion shape as stage 5, for the fifth collision in that family:
// upstream inverted `isBindingEnabled` away from `bindingPreference` while
// cmd/ctrl was held. flow deleted both sites (`handleKeyDown` and
// `handleLinearElementOnPointerDown` in `App.tsx`). A replay that restores
// either one produces no missing symbol and no merge conflict.
//
// `packages/excalidraw/tests/arrowBinding.test.tsx` also covers this, so why
// duplicate it here: the vendor test suite is not part of flow's build or CI
// (flow runs its own unit + e2e suites against `dist/`), so a restored
// inversion would only surface if somebody ran the fork's own tests by hand.
// This check runs on every build.
//
// The idiom is narrow on purpose — an assignment of `isBindingEnabled` whose
// value is derived by *negating* `bindingPreference`. The legitimate
// preference-following writes (`=== "enabled"`, four of them) are the opposite
// comparison and do not match.
const BINDING_INVERSION_IDIOM =
  /isBindingEnabled:\s*[\s\S]{0,80}?bindingPreference\s*!==\s*"enabled"/;

const bindingSource = join(vendor, "packages/excalidraw/components/App.tsx");
const bindingText = readFileSync(bindingSource, "utf8");
const bindingLines = bindingText.split("\n");
const inversions = bindingLines.flatMap((line, i) => {
  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
    return []; // a `flow:` comment describing the deletion, not the idiom
  }
  if (!line.includes("isBindingEnabled")) {
    return [];
  }
  const window = bindingLines.slice(i, i + 4).join("\n");
  return BINDING_INVERSION_IDIOM.test(window)
    ? [{ line: i + 1, text: trimmed }]
    : [];
});

if (inversions.length > 0) {
  die(
    `cmd/ctrl arrow-binding inversion reappeared in the fork source — an ` +
      `upstream replay probably restored a deletion this fork made on purpose ` +
      `(see .claude/memory/tool-override.md, "The fifth collision: arrow ` +
      `binding"):\n` +
      inversions
        .map((h) => `      packages/excalidraw/components/App.tsx:${h.line}  ${h.text}`)
        .join("\n") +
      `\n\n  Delete the inversion and let the binding preference stand alone ` +
      `(flow's \`bindingMode\` lock plus upstream's \`bindingPreference\`), ` +
      `then re-add a \`flow:\` comment at the site.`,
  );
}

// ── 7. Binding-lock selector survival ───────────────────────────────────────
// flow's persistent arrow-binding lock lives in `appState.bindingMode` and is
// honoured by ONE place: the `isBindingEnabled` selector in
// `packages/element/src/binding.ts`. Any code that reads the raw
// `state.isBindingEnabled` field instead silently bypasses the lock — which is
// exactly the defect this stage exists to prevent recurring. Upstream added
// several such reads during the 382-commit upgrade and flow's lock was
// partially ineffective as a result (binding highlight, elbow routing and
// outline snapping, shape recognition).
//
// This cannot be expressed as a test in flow's suites: the reads live in vendor
// modules that flow's unit tests do not import and whose effects are canvas
// rendering. It is a structural invariant, so it is checked structurally.
//
// The allowlist below is the complete set of legitimate raw reads. Everything
// else must go through the selector.
// Only appState-shaped reads count. `options?.isBindingEnabled` and friends are
// options-bag plumbing carrying an ALREADY-RESOLVED boolean down the call
// chain — the resolution happened at the appState read, which is what this
// stage governs. Matching those too would flag ~7 legitimate sites in
// `elbowArrow.ts` / `linearElementEditor.ts` and force a meaningless allowlist.
const RAW_BINDING_READ =
  /\b(?:appState|app\.state|this\.state|state)\.isBindingEnabled\b/;
const RAW_BINDING_ALLOWED = new Map([
  [
    "packages/element/src/binding.ts",
    { count: 1, why: "the selector itself — this is the one place that may read the raw field" },
  ],
  [
    "packages/excalidraw/components/App.tsx",
    {
      count: 3,
      why: "preference-restore comparisons (keyup / pointerdown / pointerup); writes, not binding decisions",
    },
  ],
  [
    "packages/excalidraw/components/canvases/InteractiveCanvas.tsx",
    { count: 1, why: "prop mapping — passes the field through alongside bindingMode" },
  ],
]);

const collectRawBindingReads = (dir, found = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") {
        continue;
      }
      if (entry.name === "tests" || entry.name === "__tests__") {
        continue; // vendor tests legitimately assert on the raw field
      }
      collectRawBindingReads(path, found);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) {
      continue;
    }
    readFileSync(path, "utf8")
      .split("\n")
      .forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
          return; // a `flow:` comment naming the field, not a read
        }
        if (RAW_BINDING_READ.test(line)) {
          found.push({ file: relative(vendor, path), line: i + 1, text: trimmed });
        }
      });
  }
  return found;
};

const rawReads = collectRawBindingReads(join(vendor, "packages"));
const rawByFile = new Map();
for (const hit of rawReads) {
  rawByFile.set(hit.file, [...(rawByFile.get(hit.file) ?? []), hit]);
}

const unexpectedRaw = [...rawByFile].flatMap(([file, hits]) => {
  const allowed = RAW_BINDING_ALLOWED.get(file)?.count ?? 0;
  return hits.length > allowed ? [{ file, allowed, hits }] : [];
});

if (unexpectedRaw.length > 0) {
  die(
    `raw \`.isBindingEnabled\` read(s) outside the selector — these bypass ` +
      `flow's persistent \`bindingMode\` arrow-binding lock ` +
      `(see .claude/memory/tool-override.md, "flow's lock is bypassed"):\n` +
      unexpectedRaw
        .map(
          ({ file, allowed, hits }) =>
            `  - ${file}: ${hits.length} read(s), ${allowed} allowed\n` +
            hits.map((h) => `      ${h.file}:${h.line}  ${h.text}`).join("\n"),
        )
        .join("\n") +
      `\n\n  Call \`isBindingEnabled(appState)\` from ` +
      `\`@excalidraw/element\` instead of reading the field, and make sure the ` +
      `appState reaching it actually carries \`bindingMode\` — the selector's ` +
      `\`bindingMode?\` is optional, so a narrowed state type compiles fine and ` +
      `then silently falls through to the raw flag.`,
  );
}

// ── 8. Rotation-cursor seam survival ────────────────────────────────────────
// The rotation transform handle's cursor is a one-line fork edit in
// `resizeTest.ts`: it returns a CSS custom property instead of the literal
// "grab", so flow's own circular-arrow cursor (src/index.css) can take over.
// Stage 4 can't see it — a string inside a function body never reaches the
// built .d.ts — and the failure is silent: the cursor quietly reverts to a
// grabber hand with nothing else broken. So it gets its own source check.
const ROTATE_CURSOR_VAR = "--flow-rotate-cursor";
const rotateCursorSource = join(vendor, "packages/element/src/resizeTest.ts");
const rotateCursorCss = join(root, "src/index.css");

const rotateCursorMissing = [rotateCursorSource, rotateCursorCss].filter(
  (path) => !existsSync(path) || !readFileSync(path, "utf8").includes(ROTATE_CURSOR_VAR),
);

if (rotateCursorMissing.length > 0) {
  die(
    `the rotation-handle cursor seam is broken — \`${ROTATE_CURSOR_VAR}\` is ` +
      `missing from:\n` +
      rotateCursorMissing.map((p) => `  - ${p.replace(`${root}/`, "")}`).join("\n") +
      `\n\n  Both halves are needed: resizeTest.ts must return ` +
      `\`var(${ROTATE_CURSOR_VAR}, grab)\` for the "rotation" handle, and ` +
      `flow's stylesheet must define that variable. Losing either one silently ` +
      `restores the vendor grabber hand.`,
  );
}

// ── 9. Rotation-handle corner placement survival ────────────────────────────
// flow moved the rotation handle from above the top edge to diagonally outside
// the NE corner so the quick-arrow affordances can own the edge midpoints. A
// rebase that drops the edit is silent at build time and only shows up as
// quick arrows overlapping the rotation handle, so assert the source directly.
const CORNER_GAP_SYMBOL = "ROTATION_HANDLE_CORNER_GAP";
const transformHandlesSource = join(
  vendor,
  "packages/element/src/transformHandles.ts",
);

if (
  !existsSync(transformHandlesSource) ||
  !readFileSync(transformHandlesSource, "utf8").includes(CORNER_GAP_SYMBOL)
) {
  die(
    `the rotation-handle corner placement is missing — \`${CORNER_GAP_SYMBOL}\` ` +
      `is not in packages/element/src/transformHandles.ts. A rebase probably ` +
      `restored the vendor top-center placement, which puts the rotation ` +
      `handle underneath flow's top quick arrow.`,
  );
}

console.log(
  `[build:excalidraw] done — ${FORK_EDITS.length} fork edits verified in the ` +
    `built declarations, and no cmd/ctrl grid-snap bypass in the fork source ` +
    `(${bypasses.length} allowlisted mid-draw site(s) skipped), and no ` +
    `cmd/ctrl arrow-binding inversion, and no raw isBindingEnabled read ` +
    `outside the selector (${rawReads.length} allowlisted), and the ` +
    `rotation-cursor seam intact, and the rotation handle is on the corner.`,
);
