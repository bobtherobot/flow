# Laser Pointer in the Tool Rail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a laser-pointer button to flow's vertical tool rail so the tool is selectable by click, not only via its `K` keyboard shortcut.

**Architecture:** The rail (`src/ui/toolbar/`) renders a generic list. `tools.ts` declares the `ToolId` union and the `TOOLS` array; `icons.tsx` maps each id to an SVG; `ToolBar.tsx` iterates `TOOLS`; `useActiveTool.setTool(id)` dispatches Excalidraw's public `setActiveTool({ type: id })`. Adding one `TOOLS` entry plus one `TOOL_ICONS` entry surfaces the tool everywhere (button, tooltip, active highlight, config-menu show/hide, `hiddenTools` persistence) with no other code changes and no fork edits.

**Tech Stack:** TypeScript, React, Vitest (`npm test` → `vitest`), Excalidraw (submodule fork, public API only).

## Global Constraints

- ZERO fork edits. Only files under `src/ui/toolbar/` change.
- Tool type string must be exactly `"laser"` and the shortcut label exactly `"K"` (Excalidraw's identifiers — verified in the spec).
- Laser is the **last** entry in `TOOLS` (order: …`eraser`, `frame`, `laser`).
- Icons are hand-rolled 20×20 SVGs using the shared `Svg` wrapper (stroked `currentColor`), consistent with existing icons.
- Vitest runs in watch mode by default; use `npm test -- --run <path>` for a single non-watch pass.

Spec: `docs/superpowers/specs/2026-07-08-laser-tool-rail-design.md`

---

### Task 1: Add the laser tool to `TOOLS` and `ToolId`

**Files:**
- Modify: `src/ui/toolbar/tools.ts` (union at lines 3-15; `TOOLS` array at lines 27-40)
- Test: `src/ui/toolbar/tools.test.ts` (existing, lines 4-22)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ToolId` now includes `"laser"`; `TOOLS` ends with `{ id: "laser", label: "Laser pointer", shortcut: "K" }`. Task 2 relies on `"laser"` being a valid `ToolId` key.

- [ ] **Step 1: Update the failing test**

In `src/ui/toolbar/tools.test.ts`, replace the first test (the `toEqual` list) so laser is expected last, and update the description:

```ts
  it("lists the 12 native tools plus laser, in order", () => {
    expect(TOOLS.map((t) => t.id)).toEqual([
      "selection", "hand", "rectangle", "diamond", "ellipse",
      "arrow", "line", "freedraw", "text", "image", "eraser", "frame",
      "laser",
    ]);
  });
```

Leave the other two tests (`gives every tool a non-empty label and shortcut`, `exposes the lock id constant`) unchanged — they already cover the new entry generically.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/ui/toolbar/tools.test.ts`
Expected: FAIL — received array ends with `"frame"`, missing `"laser"`.

- [ ] **Step 3: Add `"laser"` to the `ToolId` union**

In `src/ui/toolbar/tools.ts`, add `"laser"` as the final member of the union (after `"frame"`):

```ts
export type ToolId =
  | "selection"
  | "hand"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "image"
  | "eraser"
  | "frame"
  | "laser";
```

- [ ] **Step 4: Append the laser entry to `TOOLS`**

In `src/ui/toolbar/tools.ts`, add the laser entry as the last element of the `TOOLS` array, after the `frame` entry:

```ts
  { id: "frame", label: "Frame", shortcut: "F" },
  { id: "laser", label: "Laser pointer", shortcut: "K" },
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --run src/ui/toolbar/tools.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/ui/toolbar/tools.ts src/ui/toolbar/tools.test.ts
git commit -m "feat: add laser to the tool rail's tool list"
```

---

### Task 2: Add the laser icon

**Files:**
- Modify: `src/ui/toolbar/icons.tsx` (`TOOL_ICONS` record, lines 26-97)
- Test: `src/ui/toolbar/icons.test.tsx` (existing, lines 6-13)

**Interfaces:**
- Consumes: `ToolId` now includes `"laser"` (Task 1). Because `TOOL_ICONS` is typed `Record<ToolId | typeof LOCK_ID, ReactNode>`, TypeScript requires a `laser` entry — omitting it is a compile error.
- Produces: `TOOL_ICONS.laser` is a valid React element. `ToolButton`/`ToolBar` consume it unchanged.

- [ ] **Step 1: Confirm the failing test**

`src/ui/toolbar/icons.test.tsx` already loops over every tool in `TOOLS` and asserts `isValidElement(TOOL_ICONS[t.id])`. Since Task 1 added `"laser"` to `TOOLS`, this test now implicitly covers the laser icon — no test edit needed. (Add nothing; the coverage is generic.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/ui/toolbar/icons.test.tsx`
Expected: FAIL — TypeScript/type error: property `laser` is missing in `TOOL_ICONS` (the `Record<ToolId | ...>` type is not satisfied). If the runner reports a type error rather than an assertion failure, that is the expected red state.

- [ ] **Step 3: Add the `laser` icon to `TOOL_ICONS`**

In `src/ui/toolbar/icons.tsx`, add a `laser` entry to the `TOOL_ICONS` record, placed after `frame` and before the `[LOCK_ID]` entry. A pen/pointer emitting a beam, in the shared stroked style:

```tsx
  laser: (
    <Svg>
      <path d="M13 4l3 3-7 7-3 1 1-3z" />
      <path d="M4 4l2.5 2.5M4 9h2.5M9 4v2.5" />
    </Svg>
  ),
```

(The first path is the angled pointer/pen; the second draws three short "emission" strokes at the tip corner, distinguishing it from `freedraw` and `eraser`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/ui/toolbar/icons.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/toolbar/icons.tsx
git commit -m "feat: add laser pointer icon to the tool rail"
```

---

### Task 3: Verify end-to-end wiring and full suite

**Files:**
- Test: `src/ui/toolbar/ToolBar.test.tsx` (existing — inspect only; add a case only if laser selection is not already covered generically)

**Interfaces:**
- Consumes: `TOOLS` (Task 1), `TOOL_ICONS` (Task 2), and existing `useActiveTool`/`ToolButton`/`ToolBar`.
- Produces: confidence that clicking the laser button calls `setTool("laser")` and that the rail highlights it when active.

- [ ] **Step 1: Read `ToolBar.test.tsx` to see how tool clicks are asserted**

Run: `sed -n '1,80p' src/ui/toolbar/ToolBar.test.tsx` (read tool only if a dedicated `sed` is unavailable; otherwise open the file).
Determine whether existing tests iterate `TOOLS` (generic — laser already covered) or assert specific tools by name.

- [ ] **Step 2: Add a laser-specific test only if not already covered**

If, and only if, the existing tests assert specific tools individually (not a `TOOLS.map` loop), add this test near the other click assertions, matching the file's existing render/mocking setup (reuse its existing `render` helper and `setTool` spy — do not introduce a new mocking style):

```tsx
  it("selects the laser tool when its button is clicked", async () => {
    // Mirror the render + setTool-spy setup already used by the sibling
    // click tests in this file.
    const user = userEvent.setup();
    // render(...) as the existing tests do
    await user.click(screen.getByRole("button", { name: /laser pointer/i }));
    expect(setToolSpy).toHaveBeenCalledWith("laser");
  });
```

If the existing tests already loop over `TOOLS`, skip this step — laser is covered. Note in the commit which case applied.

- [ ] **Step 3: Run the full toolbar suite**

Run: `npm test -- --run src/ui/toolbar/`
Expected: PASS — all toolbar specs green, including `tools`, `icons`, `ToolBar`, `ToolButton`, `ToolbarConfigMenu`, `toolbar-state`, `useActiveTool`.

- [ ] **Step 4: Typecheck / build the app bundle**

Run: `npm run build`
Expected: succeeds with no TypeScript errors (confirms the `Record<ToolId | ...>` exhaustiveness and the new union member compile cleanly across the rail).

- [ ] **Step 5: Commit (only if Step 2 added a test)**

```bash
git add src/ui/toolbar/ToolBar.test.tsx
git commit -m "test: cover laser tool selection in the tool rail"
```

If Step 2 was skipped, there is nothing to commit for this task.

---

## Manual verification (after all tasks)

1. Run the app (`npm run dev`).
2. Confirm a laser button appears at the bottom of the left tool rail, below Frame.
3. Hover it: tooltip reads "Laser pointer" with the `K` shortcut.
4. Click it: the button highlights as active and the cursor enters laser mode.
5. Press `K`: the same button highlights (rail stays in sync with the shortcut).
6. Open the rail's config menu: a laser show/hide toggle is present; hiding it removes the button and the choice persists across reload.

## Post-implementation

Update `.claude/memory/vertical-toolbar.md` to note laser is now a rail tool (append to the "Shipped" / "Key facts" section), per the project's repo-local memory convention.
