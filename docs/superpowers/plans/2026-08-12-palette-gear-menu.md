# Palette gear menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Color panel's palette `+` and `🗑` footer buttons with a gear dropdown carrying five palette actions, four of them dialog-driven, including a new copy-swatches-between-palettes capability.

**Architecture:** One new store mutation (`copySwatchesTo`), two new presentational components (`PaletteDialog`, a shared modal shell; `PaletteMenu`, the dropdown), and a rewrite of `PaletteSection`'s footer row. The menu follows `PanelConfigMenu`'s anchored-popup pattern; the dialogs reuse the existing `src/ui/dialogs.css` modal system and portal to `document.body`.

**Tech Stack:** TypeScript, React 19, `useSyncExternalStore` module-singleton stores, Vitest + React Testing Library, Playwright.

Spec: [`docs/superpowers/specs/2026-08-12-palette-gear-menu-design.md`](../specs/2026-08-12-palette-gear-menu-design.md)

## Global Constraints

- **Zero fork edits.** Nothing in `vendor/excalidraw`. No `npm run build:excalidraw`.
- **No new runtime dependency.** In particular **do not add `@radix-ui/react-dropdown-menu`** — the menu follows `PanelConfigMenu`'s hand-rolled pattern.
- **Two different disabled rules, deliberately. Do not unify them:**
  - **Menu items** use `aria-disabled` + a guarded `onClick`. A native `disabled` button is unfocusable, so a keyboard user cannot land on the item to learn why it is unavailable.
  - **Dialog buttons** use the native `disabled` attribute. `.flow-btn:disabled` already exists in `dialogs.css` and `LayoutManagerDialog` relies on it.
  - **The grid's trash tile keeps `aria-disabled` for its own third reason** — Chrome delivers no mouse events to a disabled control, and that tile is an HTML5 drop target. Do not touch it.
- Dialogs **portal to `document.body`**. `PaletteSection` is inside a scrollable, draggable dock panel, and a `position: fixed` backdrop resolves against the nearest transformed ancestor rather than the viewport.
- Reuse `src/ui/dialogs.css`: `.flow-dialog-backdrop`, `.flow-dialog`, `.flow-dialog__header`, `__title`, `__body`, `__footer`, `.flow-btn`, `.flow-btn--ghost`, `.flow-btn--primary`. Do not write a parallel modal system.
- The Recent palette (`RECENT_PALETTE_ID`) must stay undeletable, and `removePalette`'s store guard stays as the backstop.
- Every task ends green on `npx vitest run` and `npm run typecheck`.

## Baseline

```bash
npx vitest run 2>&1 | tail -5
npm run typecheck
```

Expect **886 passing / 83 files**, typecheck exit 0. E2E healthy state is **135 passed / 2 failed** — the two failures are `e2e/text-panel.spec.ts:201` and `:225` (container padding), deterministic, pre-existing, reproduce on `main`, out of scope. Three specs (`new-document.spec.ts:60`, `style-memory.spec.ts`, `selection-mode.spec.ts:57`) flake only under parallel load and pass alone; re-run alone before concluding anything. `pkill -f vite` before any e2e run.

## File Structure

**Created:**
- `src/ui/color/PaletteDialog.tsx` — the shared modal shell (portal, backdrop, Escape, focus return, footer buttons). One responsibility: dialog chrome. Knows nothing about palettes.
- `src/ui/color/PaletteMenu.tsx` — the gear dropdown. Presentational: takes flags and callbacks, renders five items, owns no palette state.
- Test files mirroring both.

**Modified:**
- `src/lib/palette-store.ts` — `copySwatchesTo` mutation.
- `src/ui/color/PaletteSection.tsx` — footer row rewritten; dialog state; retires `abandonRename`, the inline confirm, and the `+`/`🗑` buttons.
- `src/ui/color/color.css` — gear button styling; retire `.flow-clr-palette__confirm` rules.
- `src/ui/color/PaletteSection.test.tsx`, `src/lib/palette-store.test.ts`, `e2e/color-panel.spec.ts`.

---

### Task 1: `copySwatchesTo`

**Files:**
- Modify: `src/lib/palette-store.ts`
- Test: `src/lib/palette-store.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `copySwatchesTo(targetId: string, colors: string[]): void`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/palette-store.test.ts`:

```ts
describe("copySwatchesTo", () => {
  const colorsOf = (id: string) =>
    store.getSnapshot().palettes.find((p) => p.id === id)!.colors;

  it("appends colors the target does not have", () => {
    const target = store.addPalette("Target");
    store.copySwatchesTo(target.id, ["#111111", "#222222"]);
    expect(colorsOf(target.id)).toEqual(["#111111", "#222222"]);
  });

  it("skips colors the target already has", () => {
    const target = store.addPalette("Target");
    store.copySwatchesTo(target.id, ["#111111"]);
    store.copySwatchesTo(target.id, ["#111111", "#222222"]);
    expect(colorsOf(target.id)).toEqual(["#111111", "#222222"]);
  });

  it("drops duplicates within a single copy", () => {
    const target = store.addPalette("Target");
    store.copySwatchesTo(target.id, ["#111111", "#111111"]);
    expect(colorsOf(target.id)).toEqual(["#111111"]);
  });

  it("commits ONCE for a multi-swatch copy", () => {
    // The regression this guards: implementing copy as a loop over addSwatch.
    // That fires one notify and one localStorage write per swatch for a single
    // user action, and is invisible in every other assertion here.
    const target = store.addPalette("Target");
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    store.copySwatchesTo(target.id, ["#111111", "#222222", "#333333"]);
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("does not notify when every color is already present", () => {
    const target = store.addPalette("Target");
    store.copySwatchesTo(target.id, ["#111111"]);
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    store.copySwatchesTo(target.id, ["#111111"]);
    expect(listener).not.toHaveBeenCalled();
    unsub();
  });

  it("scrubs forgiving input the way swatches do", () => {
    const target = store.addPalette("Target");
    store.copySwatchesTo(target.id, ["ABC", "transparent", "#DDEEFF"]);
    expect(colorsOf(target.id)).toEqual(["#aabbcc", "#ddeeff"]);
  });

  it("no-ops on an unknown target id", () => {
    const before = store.getSnapshot();
    store.copySwatchesTo("nope", ["#111111"]);
    expect(store.getSnapshot()).toBe(before);
  });

  it("leaves the source palette untouched", () => {
    // Copy, not move. Uses Recent as the source since that is the intended use.
    store.recordUsedColor("#abcdef");
    const target = store.addPalette("Target");
    store.copySwatchesTo(target.id, ["#abcdef"]);
    expect(colorsOf(RECENT_PALETTE_ID)).toEqual(["#abcdef"]);
    expect(colorsOf(target.id)).toEqual(["#abcdef"]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/palette-store.test.ts`
Expected: FAIL — `store.copySwatchesTo is not a function`.

- [ ] **Step 3: Implement**

Add to the mutations section of `src/lib/palette-store.ts`:

```ts
/**
 * Copy colors into `targetId`, skipping any the target already has.
 *
 * A single `commit()` for the whole batch, deliberately: looping `addSwatch`
 * would fire one subscriber notification and one localStorage write per
 * swatch for what the user experiences as one action.
 *
 * Duplicates are dropped rather than appended so a target can never end up
 * with two identical tiles — the same rule `recordUsedColor` applies, for the
 * same reason (these grids are looked at, and two identical swatches are
 * indistinguishable).
 */
export function copySwatchesTo(targetId: string, colors: string[]): void {
  const target = state.palettes.find((p) => p.id === targetId);
  if (!target) return;

  const seen = new Set(target.colors);
  const additions: string[] = [];
  for (const color of colors) {
    const hex = scrubHex(color);
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    additions.push(hex);
  }
  if (additions.length === 0) return;

  commit({
    ...state,
    palettes: mapPalette(targetId, (p) => ({ ...p, colors: [...p.colors, ...additions] })),
  });
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/palette-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite and typecheck**

Run: `npx vitest run && npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add src/lib/palette-store.ts src/lib/palette-store.test.ts
git commit -m "feat(color): copySwatchesTo for moving colors between palettes"
```

---

### Task 2: `PaletteDialog` — the shared modal shell

**Files:**
- Create: `src/ui/color/PaletteDialog.tsx`, `src/ui/color/PaletteDialog.test.tsx`

**Interfaces:**
- Consumes: `src/ui/dialogs.css` classes.
- Produces:

```ts
interface PaletteDialogProps {
  title: string;
  /** Label for the confirming button. */
  confirmLabel: string;
  /** Disables the confirm button (native `disabled` — see below). */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}
export function PaletteDialog(props: PaletteDialogProps): React.ReactPortal;
```

- [ ] **Step 1: Write the failing tests**

Create `src/ui/color/PaletteDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaletteDialog } from "./PaletteDialog";

const setup = (over: Partial<React.ComponentProps<typeof PaletteDialog>> = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <PaletteDialog
      title="Rename palette"
      confirmLabel="OK"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...over}
    >
      <input aria-label="Palette name" defaultValue="Pastel" />
    </PaletteDialog>,
  );
  return { onConfirm, onCancel };
};

describe("PaletteDialog", () => {
  it("renders as a labelled dialog with its children", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Rename palette" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText("Palette name")).toBeInTheDocument();
  });

  it("portals out of its parent so a transformed ancestor cannot trap it", () => {
    // PaletteSection sits inside a draggable dock panel; a position:fixed
    // backdrop resolves against the nearest transformed ancestor, not the
    // viewport. jsdom does no layout, so this asserts the portal itself —
    // the only part of that guarantee a unit test can see.
    const { container } = render(
      <PaletteDialog title="T" confirmLabel="OK" onConfirm={vi.fn()} onCancel={vi.fn()}>
        <span>body</span>
      </PaletteDialog>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.getByRole("dialog", { name: "T" })).toBeInTheDocument();
  });

  it("confirms from the confirm button", () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels from the Cancel button", () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels on Escape", () => {
    const { onCancel } = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels on a backdrop click", () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByTestId("palette-dialog-backdrop"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does NOT cancel when the click started inside the dialog", () => {
    // A click that begins on the dialog body and ends on the backdrop (a
    // drag-select in the name field that overshoots) must not be read as a
    // backdrop dismissal — that would discard the user's typing.
    const { onCancel } = setup();
    fireEvent.click(screen.getByRole("dialog", { name: "Rename palette" }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("submits on Enter inside the body", () => {
    const { onConfirm } = setup();
    fireEvent.submit(screen.getByTestId("palette-dialog-form"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("uses the NATIVE disabled attribute on the confirm button", () => {
    // Not aria-disabled: .flow-btn:disabled already exists in dialogs.css and
    // this is neither a menu item nor a drop target. The two aria-disabled
    // rules elsewhere in this feature exist for reasons that do not apply here.
    setup({ confirmDisabled: true });
    expect(screen.getByRole("button", { name: "OK" })).toBeDisabled();
  });

  it("does not confirm on Enter while the confirm button is disabled", () => {
    const { onConfirm } = setup({ confirmDisabled: true });
    fireEvent.submit(screen.getByTestId("palette-dialog-form"));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/ui/color/PaletteDialog.test.tsx`
Expected: FAIL — cannot resolve `./PaletteDialog`.

- [ ] **Step 3: Implement**

Create `src/ui/color/PaletteDialog.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "../dialogs.css";

interface PaletteDialogProps {
  title: string;
  /** Label for the confirming button ("OK", "Delete", "Copy"). */
  confirmLabel: string;
  /** Native `disabled` on the confirm button, and blocks Enter-to-submit. */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}

/**
 * The modal shell every palette dialog shares. Chrome only — it knows nothing
 * about palettes, which is what lets rename, add, delete and copy-to differ
 * by their body content alone.
 *
 * Portals to `document.body`, unlike `LayoutManagerDialog` which renders in
 * place: `PaletteSection` lives inside a scrollable, draggable dock panel, and
 * a `position: fixed` backdrop is positioned against the nearest ancestor with
 * a transform rather than against the viewport. The dock applies transforms
 * while dragging. `ColorPopup` portals for the same reason.
 */
export function PaletteDialog({
  title,
  confirmLabel,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}: PaletteDialogProps) {
  // Where focus came from, so dismissal hands it back the way a native dialog
  // does rather than dumping the user at the top of the document.
  const opener = useRef<HTMLElement | null>(
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null),
  );
  useEffect(() => {
    const returnTo = opener.current;
    return () => returnTo?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return createPortal(
    <div
      className="flow-dialog-backdrop"
      data-testid="palette-dialog-backdrop"
      onClick={onCancel}
    >
      {/* Stops a click inside the dialog from reaching the backdrop's
          dismiss handler — including a drag-select in the name field that
          releases outside, which would otherwise discard the user's typing. */}
      <form
        className="flow-dialog"
        data-testid="palette-dialog-form"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!confirmDisabled) onConfirm();
        }}
      >
        <div className="flow-dialog__header">
          <h2 className="flow-dialog__title">{title}</h2>
        </div>
        <div className="flow-dialog__body">{children}</div>
        <div className="flow-dialog__footer">
          <button type="button" className="flow-btn flow-btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="flow-btn flow-btn--primary" disabled={confirmDisabled}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
```

> **Why a `<form>` rather than a `<div>` plus a keydown handler:** Enter-to-submit then comes from the platform, including from a `<select>` and from any future field, instead of from a hand-rolled key listener that has to be repeated per body. `type="submit"` on the confirm button also makes the disabled state block Enter for free.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/ui/color/PaletteDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full suite and typecheck, then commit**

```bash
npx vitest run && npm run typecheck
git add src/ui/color/PaletteDialog.tsx src/ui/color/PaletteDialog.test.tsx
git commit -m "feat(color): PaletteDialog, the shared palette modal shell"
```

---

### Task 3: `PaletteMenu` — the gear dropdown

**Files:**
- Create: `src/ui/color/PaletteMenu.tsx`, `src/ui/color/PaletteMenu.test.tsx`
- Modify: `src/ui/color/color.css` (menu styling)

**Interfaces:**
- Consumes: `clampMenuPosition`, `MenuPoint` from `../panels/dock/menu-position`.
- Produces:

```ts
interface PaletteMenuProps {
  anchor: MenuPoint;
  /** Nothing selected → the two swatch items are inert. */
  hasSelection: boolean;
  /** Current palette is Recent → Delete palette is inert. */
  canDeletePalette: boolean;
  /** No other palette to copy into → Copy is inert. */
  canCopy: boolean;
  onRename: () => void;
  onAdd: () => void;
  onDeletePalette: () => void;
  onDeleteSwatches: () => void;
  onCopy: () => void;
  onClose: () => void;
}
export function PaletteMenu(props: PaletteMenuProps): React.ReactPortal;
```

- [ ] **Step 1: Write the failing tests**

Create `src/ui/color/PaletteMenu.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaletteMenu } from "./PaletteMenu";

const ITEMS = [
  "Rename palette…",
  "Add palette…",
  "Delete palette…",
  "Delete selected swatches",
  "Copy selected swatches to…",
];

const handlers = () => ({
  onRename: vi.fn(),
  onAdd: vi.fn(),
  onDeletePalette: vi.fn(),
  onDeleteSwatches: vi.fn(),
  onCopy: vi.fn(),
  onClose: vi.fn(),
});

const setup = (over: Partial<React.ComponentProps<typeof PaletteMenu>> = {}) => {
  const h = handlers();
  render(
    <PaletteMenu
      anchor={{ top: 0, left: 0 }}
      hasSelection
      canDeletePalette
      canCopy
      {...h}
      {...over}
    />,
  );
  return h;
};

describe("PaletteMenu", () => {
  it("renders all five items in order", () => {
    setup();
    const items = screen.getAllByRole("menuitem").map((el) => el.textContent);
    expect(items).toEqual(ITEMS);
  });

  it.each([
    ["Rename palette…", "onRename"],
    ["Add palette…", "onAdd"],
    ["Delete palette…", "onDeletePalette"],
    ["Delete selected swatches", "onDeleteSwatches"],
    ["Copy selected swatches to…", "onCopy"],
  ] as const)("invokes %s", (label, key) => {
    const h = setup();
    fireEvent.click(screen.getByRole("menuitem", { name: label }));
    expect(h[key]).toHaveBeenCalledTimes(1);
  });

  it("marks the swatch items inert with nothing selected", () => {
    setup({ hasSelection: false });
    for (const label of ["Delete selected swatches", "Copy selected swatches to…"]) {
      expect(screen.getByRole("menuitem", { name: label })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
  });

  it("does NOT invoke an inert item that is clicked anyway", () => {
    // aria-disabled is advisory — the element stays clickable, so the guard
    // has to be in the handler. Without it the menu would act on a swatch
    // selection that does not exist.
    const h = setup({ hasSelection: false });
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete selected swatches" }));
    expect(h.onDeleteSwatches).not.toHaveBeenCalled();
  });

  it("uses aria-disabled, never the native attribute", () => {
    // Native `disabled` is unfocusable, so a keyboard user could not land on
    // the item to discover why it is unavailable.
    setup({ hasSelection: false });
    expect(screen.getByRole("menuitem", { name: "Delete selected swatches" })).not.toBeDisabled();
  });

  it("marks Delete palette inert when the palette cannot be deleted", () => {
    const h = setup({ canDeletePalette: false });
    const item = screen.getByRole("menuitem", { name: "Delete palette…" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(item);
    expect(h.onDeletePalette).not.toHaveBeenCalled();
  });

  it("marks Copy inert when there is nowhere to copy to", () => {
    const h = setup({ canCopy: false });
    const item = screen.getByRole("menuitem", { name: "Copy selected swatches to…" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(item);
    expect(h.onCopy).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const h = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on an outside pointer press", () => {
    const h = setup();
    fireEvent.pointerDown(document.body);
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on a press inside itself", () => {
    const h = setup();
    fireEvent.pointerDown(screen.getByRole("menu"));
    expect(h.onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/ui/color/PaletteMenu.test.tsx`
Expected: FAIL — cannot resolve `./PaletteMenu`.

- [ ] **Step 3: Implement**

Create `src/ui/color/PaletteMenu.tsx`. Model the anchoring on `PanelConfigMenu` (measure in `useLayoutEffect`, then `clampMenuPosition` before paint) and the dismissal on `ColorPopup`:

```tsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./color.css";
import { clampMenuPosition, type MenuPoint } from "../panels/dock/menu-position";

interface PaletteMenuProps {
  anchor: MenuPoint;
  hasSelection: boolean;
  canDeletePalette: boolean;
  canCopy: boolean;
  onRename: () => void;
  onAdd: () => void;
  onDeletePalette: () => void;
  onDeleteSwatches: () => void;
  onCopy: () => void;
  onClose: () => void;
}

/**
 * The palette gear's dropdown. Replaces a `+` and a `🗑` whose meaning changed
 * underneath the user depending on whether swatches were selected.
 *
 * Inert items carry `aria-disabled` rather than the native attribute: a
 * disabled button cannot take focus, so a keyboard user could never land on
 * the item to find out why it is unavailable. That makes the attribute
 * advisory, so every handler guards its own condition — `aria-disabled` alone
 * would let a click straight through.
 */
export function PaletteMenu({
  anchor, hasSelection, canDeletePalette, canCopy,
  onRename, onAdd, onDeletePalette, onDeleteSwatches, onCopy, onClose,
}: PaletteMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPoint>(anchor);

  // Measure, then pull fully on-screen before the browser paints — the panel
  // can be docked against any edge, so the naive anchor overflows routinely.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos(
      clampMenuPosition(anchor, { width, height }, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- anchor is a fresh
    // object every render; only its coordinates should re-trigger the clamp.
  }, [anchor.top, anchor.left]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      // The gear itself lives outside this portal. Without this guard a press
      // on it would close here on pointerdown and the click that follows would
      // reopen — making the toggle's close branch unreachable. Same guard
      // ColorPopup uses for its trigger.
      if ((e.target as HTMLElement).closest(".flow-clr-palette__gear")) return;
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const item = (label: string, enabled: boolean, run: () => void) => (
    <button
      type="button"
      role="menuitem"
      className="flow-clr-palette__menuitem"
      aria-disabled={!enabled}
      onClick={() => {
        if (!enabled) return;
        run();
      }}
    >
      {label}
    </button>
  );

  return createPortal(
    <div
      ref={ref}
      className="flow-clr-palette__menu"
      role="menu"
      aria-label="Palette actions"
      style={{ top: pos.top, left: pos.left }}
    >
      {item("Rename palette…", true, onRename)}
      {item("Add palette…", true, onAdd)}
      {item("Delete palette…", canDeletePalette, onDeletePalette)}
      {item("Delete selected swatches", hasSelection, onDeleteSwatches)}
      {item("Copy selected swatches to…", hasSelection && canCopy, onCopy)}
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Style it**

Add to `src/ui/color/color.css`, using the theme tokens the file already uses (`--flow-panel-bg`, `--flow-panel-ink`, `--flow-panel-border`, `--flow-panel-hover`, `--flow-radius-*`, `--flow-ink-disabled`) — **no hardcoded hex**, or dark mode breaks:

```css
.flow-clr-palette__menu { position: fixed; z-index: 60; display: flex; flex-direction: column;
  min-width: 200px; padding: 4px; background: var(--flow-panel-bg);
  border: 1px solid var(--flow-panel-border); border-radius: var(--flow-radius-md); }
.flow-clr-palette__menuitem { padding: 6px 10px; border: 0; background: none; text-align: left;
  color: var(--flow-panel-ink); cursor: pointer; border-radius: var(--flow-radius-sm); }
.flow-clr-palette__menuitem:hover { background: var(--flow-panel-hover); }
.flow-clr-palette__menuitem[aria-disabled="true"] { color: var(--flow-ink-disabled); cursor: default; }
.flow-clr-palette__menuitem[aria-disabled="true"]:hover { background: none; }
```

Confirm each token exists before using it (`grep -rn "--flow-panel-hover" src/`); substitute the file's real equivalents if a name differs. Place the `[aria-disabled]` rules **after** `:hover` — equal specificity, source order decides.

- [ ] **Step 5: Run tests, full suite, typecheck, commit**

```bash
npx vitest run src/ui/color/PaletteMenu.test.tsx
npx vitest run && npm run typecheck
git add src/ui/color/PaletteMenu.tsx src/ui/color/PaletteMenu.test.tsx src/ui/color/color.css
git commit -m "feat(color): PaletteMenu, the palette gear dropdown"
```

---

### Task 4: The switchover — gear replaces the footer buttons

The behavioral change. After this task the feature works except copy-to.

**Files:**
- Modify: `src/ui/color/PaletteSection.tsx`, `src/ui/color/color.css`
- Test: `src/ui/color/PaletteSection.test.tsx`

**Interfaces:**
- Consumes: `PaletteDialog` (Task 2), `PaletteMenu` (Task 3).
- Produces: nothing new externally.

**Why one task:** the `+` and `🗑` cannot be removed before their replacements work, and `abandonRename` cannot be deleted before the rename dialog exists. Splitting leaves a commit where a palette cannot be created or renamed.

- [ ] **Step 1: Write the failing tests**

In `src/ui/color/PaletteSection.test.tsx`, **rewrite** the tests pinned to retired gestures rather than deleting them: `renames in place on double-click`, `abandons a rename on Escape`, `leaves rename mode when a palette is switched via Add palette mid-rename`, `still commits a rename after an earlier Escape`, and any asserting the footer trash's dual role.

Add a helper matching the file's existing render style, then:

```tsx
const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Palette actions" }));

describe("the palette gear menu", () => {
  it("replaces the add and delete buttons", () => {
    renderSection();
    expect(screen.queryByRole("button", { name: "Add palette" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete palette" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Palette actions" })).toBeInTheDocument();
  });

  it("renames through the dialog", () => {
    renderSection();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename palette…" }));
    fireEvent.change(screen.getByLabelText("Palette name"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.getByRole("option", { name: "Renamed" })).toBeInTheDocument();
  });

  it("discards a rename on Cancel", () => {
    renderSection();
    const before = currentPaletteName();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename palette…" }));
    fireEvent.change(screen.getByLabelText("Palette name"), { target: { value: "Nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(currentPaletteName()).toBe(before);
    expect(screen.queryByRole("option", { name: "Nope" })).not.toBeInTheDocument();
  });

  it("blocks OK on an all-whitespace name", () => {
    renderSection();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename palette…" }));
    fireEvent.change(screen.getByLabelText("Palette name"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "OK" })).toBeDisabled();
  });

  it("adds a palette AND switches to it", () => {
    // The `+` it replaces did both; adding without switching would be a
    // silent regression, since the new palette is empty and invisible.
    renderSection();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Add palette…" }));
    fireEvent.change(screen.getByLabelText("Palette name"), { target: { value: "Fresh" } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(currentPaletteName()).toBe("Fresh");
  });

  it("prefills Add with the next auto-name", () => {
    renderSection();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Add palette…" }));
    expect(screen.getByLabelText("Palette name")).toHaveValue("color set 1");
  });

  it("deletes the palette only after confirming", () => {
    renderSection();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Add palette…" }));
    fireEvent.change(screen.getByLabelText("Palette name"), { target: { value: "Doomed" } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete palette…" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("option", { name: "Doomed" })).toBeInTheDocument();

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete palette…" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByRole("option", { name: "Doomed" })).not.toBeInTheDocument();
  });

  it("deletes the selected swatches from the menu", () => {
    renderSection();
    selectFirstSwatch();
    const hex = firstSwatchHex();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete selected swatches" }));
    expect(screen.queryByRole("button", { name: `Swatch ${hex}` })).not.toBeInTheDocument();
  });

  it("closes the menu after an action", () => {
    renderSection();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename palette…" }));
    expect(screen.queryByRole("menu", { name: "Palette actions" })).not.toBeInTheDocument();
  });

  it("marks Delete palette inert for the Recent palette", () => {
    renderSection();
    selectPalette(RECENT_PALETTE_NAME);
    openMenu();
    expect(screen.getByRole("menuitem", { name: "Delete palette…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("still lets the Recent palette be renamed", () => {
    // Only deletion is special. Rename must keep working — RECENT_PALETTE_ID
    // is fixed and migrateBuiltins exempts it, so a rename is safe.
    renderSection();
    selectPalette(RECENT_PALETTE_NAME);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename palette…" }));
    fireEvent.change(screen.getByLabelText("Palette name"), { target: { value: "My colors" } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.getByRole("option", { name: "My colors" })).toBeInTheDocument();
  });

  it("no longer renames on double-click", () => {
    renderSection();
    fireEvent.doubleClick(screen.getByLabelText("Palette"));
    expect(screen.queryByLabelText("Palette name")).not.toBeInTheDocument();
  });
});
```

Adapt `renderSection`, `currentPaletteName`, `selectPalette`, `selectFirstSwatch`, and `firstSwatchHex` to the file's existing conventions — do not introduce a second render helper. `"color set 1"` comes from `nextSetName`; read it from the helper rather than hardcoding if the file already does so elsewhere.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/ui/color/PaletteSection.test.tsx`
Expected: FAIL — no "Palette actions" button.

- [ ] **Step 3: Rewrite the footer row**

In `PaletteSection.tsx`:

1. Delete the `renaming` state, the `abandonRename` ref, and the entire `renaming ? <input …> : <select …>` conditional — the `<select>` renders unconditionally now, with no `onDoubleClick` and no `title="Double-click to rename"`.
2. Delete the `confirming` state and the inline `role="alertdialog"` block at the bottom of the component.
3. Delete the footer `+` and `🗑` buttons and the `onTrash` handler.
4. Extend the imports: `nextSetName` from `../../lib/color-palettes` (the `+` button never needed it — `addPalette` computed the name internally — but the Add dialog has to *show* it before creating), `MenuPoint` from `../panels/dock/menu-position`, plus `PaletteMenu` and `PaletteDialog`. `RECENT_PALETTE_ID` is already imported.

5. Add one piece of dialog state:

```tsx
/** Which dialog is open. One field, not four booleans — they are mutually
 *  exclusive by construction, and four flags admit states like "renaming and
 *  deleting at once" that have no meaning. */
type Dialog = null | { kind: "rename" | "add" | "delete" | "copy" };
const [dialog, setDialog] = useState<Dialog>(null);
const [menuOpen, setMenuOpen] = useState(false);
const [draftName, setDraftName] = useState("");
const gearRef = useRef<HTMLButtonElement>(null);
```

6. Render the gear beside the select:

```tsx
<button
  type="button"
  ref={gearRef}
  className="flow-clr-palette__gear"
  aria-label="Palette actions"
  aria-haspopup="menu"
  aria-expanded={menuOpen}
  onClick={() => setMenuOpen((o) => !o)}
>
  ⚙
</button>
```

7. Render the menu when open, closing it as each action opens its dialog:

```tsx
{menuOpen && (
  <PaletteMenu
    anchor={anchorFromGear()}
    hasSelection={selected.length > 0}
    canDeletePalette={current.id !== RECENT_PALETTE_ID}
    canCopy={palettes.length > 1}
    onRename={() => { setDraftName(current.name); openDialog("rename"); }}
    onAdd={() => { setDraftName(nextSetName(palettes)); openDialog("add"); }}
    onDeletePalette={() => openDialog("delete")}
    onDeleteSwatches={() => {
      removeSwatches(current.id, selected);
      setSelected([]);
      setMenuOpen(false);
    }}
    onCopy={() => openDialog("copy")}
    onClose={() => setMenuOpen(false)}
  />
)}
```

where `openDialog` closes the menu and opens the dialog in one step, so no action can leave both on screen:

```tsx
const openDialog = (kind: "rename" | "add" | "delete" | "copy") => {
  setMenuOpen(false);
  setDialog({ kind });
};
```

and `anchorFromGear` mirrors `RailColorControl`'s anchor helper:

```tsx
const anchorFromGear = (): MenuPoint => {
  const r = gearRef.current?.getBoundingClientRect();
  return { top: r?.bottom ?? 0, left: r?.left ?? 0 };
};
```

8. Render the three dialogs (copy lands in Task 5):

```tsx
{dialog?.kind === "rename" && (
  <PaletteDialog
    title="Rename palette"
    confirmLabel="OK"
    confirmDisabled={draftName.trim() === ""}
    onConfirm={() => { renamePalette(current.id, draftName.trim()); setDialog(null); }}
    onCancel={() => setDialog(null)}
  >
    <input
      className="flow-clr-palette__name"
      aria-label="Palette name"
      autoFocus
      value={draftName}
      onChange={(e) => setDraftName(e.target.value)}
    />
  </PaletteDialog>
)}

{dialog?.kind === "add" && (
  <PaletteDialog
    title="Add palette"
    confirmLabel="OK"
    confirmDisabled={draftName.trim() === ""}
    // Creating AND switching is what the `+` button did; a new palette is
    // empty, so creating without switching looks like nothing happened.
    onConfirm={() => { choosePalette(addPalette(draftName.trim()).id); setDialog(null); }}
    onCancel={() => setDialog(null)}
  >
    <input
      className="flow-clr-palette__name"
      aria-label="Palette name"
      autoFocus
      value={draftName}
      onChange={(e) => setDraftName(e.target.value)}
      onFocus={(e) => e.target.select()}
    />
  </PaletteDialog>
)}

{dialog?.kind === "delete" && (
  <PaletteDialog
    title="Delete palette"
    confirmLabel="Delete"
    onConfirm={() => { removePalette(current.id); setSelected([]); setDialog(null); }}
    onCancel={() => setDialog(null)}
  >
    <p>Delete the &ldquo;{current.name}&rdquo; palette?</p>
  </PaletteDialog>
)}
```

- [ ] **Step 4: Style the gear, retire the confirm styles**

In `color.css`: add a `.flow-clr-palette__gear` rule matching the retired `.flow-clr-palette__icon`'s sizing and hover, and **delete** `.flow-clr-palette__confirm` and `.flow-clr-palette__confirm-actions`. If `.flow-clr-palette__icon` now has no users, delete it too — confirm with `grep -rn "flow-clr-palette__icon" src/ e2e/` first.

- [ ] **Step 5: Rewrite the two e2e tests this task breaks — do not defer them**

Retiring the gestures in Step 3 breaks two existing tests in `e2e/color-panel.spec.ts`. **Fix them here, in the task that breaks them**, not in Task 6.

> Why this step exists: on the immediately preceding feature, an e2e test broke in one task and stayed red for two more, because task reviews are unit-scoped and nothing ran e2e in between. It was found only at the very end. A task that retires a user-facing gesture owns the e2e tests that drive it.

- `"Escape abandons an in-progress palette rename"` — double-click rename is gone. Rewrite against the gear: open the menu, choose `Rename palette…`, type, press Escape, assert the palette name is unchanged.
- `"the Recent palette cannot be deleted"` — it `force`-clicks the footer trash, which no longer exists. Rewrite: with Recent current, open the gear and assert `Delete palette…` carries `aria-disabled="true"`; then `click({ force: true })` it and assert no dialog opened. **Keep the forced click** — Playwright will not dispatch to an `aria-disabled` element otherwise, and without a real dispatch the test can only detect a missing attribute, not a missing handler guard.

- [ ] **Step 6: Run tests, full suite, typecheck, and the e2e spec you touched**

```bash
npx vitest run && npm run typecheck
pkill -f vite
npx playwright test e2e/color-panel.spec.ts
```

Expected: unit green, typecheck exit 0, and `color-panel.spec.ts` fully green. A full e2e run is not required here — Task 6 does that — but this spec must not be left red.

- [ ] **Step 7: Commit**

```bash
git add src/ui/color/PaletteSection.tsx src/ui/color/PaletteSection.test.tsx src/ui/color/color.css e2e/color-panel.spec.ts
git commit -m "feat(color): the palette gear menu replaces the add/delete buttons"
```

---

### Task 5: Copy selected swatches to another palette

**Files:**
- Modify: `src/ui/color/PaletteSection.tsx`
- Test: `src/ui/color/PaletteSection.test.tsx`

**Interfaces:**
- Consumes: `copySwatchesTo` (Task 1), `PaletteDialog` (Task 2).

- [ ] **Step 1: Write the failing tests**

```tsx
describe("copying swatches between palettes", () => {
  it("copies the selected swatches into the chosen palette", () => {
    renderSection();
    addPaletteNamed("Target");
    selectPalette(SOURCE_NAME);
    selectFirstSwatch();
    const hex = firstSwatchHex();

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy selected swatches to…" }));
    fireEvent.change(screen.getByLabelText("Target palette"), { target: { value: targetId() } });
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    selectPalette("Target");
    expect(screen.getByRole("button", { name: `Swatch ${hex}` })).toBeInTheDocument();
  });

  it("leaves the source palette untouched", () => {
    // Copy, not move. A "move" regression is invisible unless the source is
    // re-checked after switching away and back.
    renderSection();
    addPaletteNamed("Target");
    selectPalette(SOURCE_NAME);
    selectFirstSwatch();
    const hex = firstSwatchHex();
    copySelectedTo("Target");
    selectPalette(SOURCE_NAME);
    expect(screen.getByRole("button", { name: `Swatch ${hex}` })).toBeInTheDocument();
  });

  it("keeps the selection after copying", () => {
    renderSection();
    addPaletteNamed("Target");
    selectPalette(SOURCE_NAME);
    selectFirstSwatch();
    copySelectedTo("Target");
    expect(screen.getAllByRole("button", { pressed: true }).length).toBe(1);
  });

  it("excludes the current palette from the target list", () => {
    renderSection();
    selectFirstSwatch();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy selected swatches to…" }));
    const options = Array.from(
      screen.getByLabelText("Target palette").querySelectorAll("option"),
    ).map((o) => o.textContent);
    expect(options).not.toContain(currentPaletteName());
  });

  it("copies nothing on Cancel", () => {
    renderSection();
    addPaletteNamed("Target");
    selectPalette(SOURCE_NAME);
    selectFirstSwatch();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy selected swatches to…" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    selectPalette("Target");
    expect(screen.queryAllByRole("button", { name: /^Swatch #/ })).toHaveLength(0);
  });
});
```

Write `addPaletteNamed`, `copySelectedTo`, `targetId`, and `SOURCE_NAME` as small helpers over the gestures already used in Task 4's tests.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/ui/color/PaletteSection.test.tsx`
Expected: FAIL — no "Target palette" control.

- [ ] **Step 3: Implement**

Add `copySwatchesTo` to the `palette-store` import, a `copyTarget` state, and the dialog:

```tsx
const [copyTarget, setCopyTarget] = useState("");
```

Seed it when the dialog opens (in `onCopy`): `setCopyTarget(others[0]?.id ?? "")`, where

```tsx
// Every palette except the one being copied FROM — copying into itself is
// a no-op the store would swallow silently, so it should not be offerable.
const others = palettes.filter((p) => p.id !== current.id);
```

```tsx
{dialog?.kind === "copy" && (
  <PaletteDialog
    title="Copy swatches to"
    confirmLabel="Copy"
    confirmDisabled={copyTarget === ""}
    onConfirm={() => {
      copySwatchesTo(copyTarget, selected.map((i) => current.colors[i]));
      // The selection deliberately survives: copying is non-destructive and
      // sending the same set to a second palette is a plausible next action.
      setDialog(null);
    }}
    onCancel={() => setDialog(null)}
  >
    <select
      className="flow-clr-palette__select"
      aria-label="Target palette"
      autoFocus
      value={copyTarget}
      onChange={(e) => setCopyTarget(e.target.value)}
    >
      {others.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  </PaletteDialog>
)}
```

- [ ] **Step 4: Run tests, full suite, typecheck, commit**

```bash
npx vitest run src/ui/color/PaletteSection.test.tsx
npx vitest run && npm run typecheck
git add src/ui/color/PaletteSection.tsx src/ui/color/PaletteSection.test.tsx
git commit -m "feat(color): copy selected swatches into another palette"
```

---

### Task 6: e2e, verification, memory

**Files:**
- Modify: `e2e/color-panel.spec.ts`
- Modify: `.claude/memory/recent-palette.md`, `.claude/memory/MEMORY.md`

- [ ] **Step 1: Confirm the retired-gesture e2e tests are already fixed**

Task 4 rewrote `"Escape abandons an in-progress palette rename"` and `"the Recent palette cannot be deleted"` against the gear menu, in the task that broke them. Confirm both exist in their rewritten form and pass; if either is still driving a retired gesture, fix it here and note that Task 4's step was missed.

- [ ] **Step 2: Add the new e2e tests**

```ts
test("renaming a palette through the gear updates the dropdown", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  const select = page.locator(panel).getByLabel("Palette", { exact: true });
  const before = await select.inputValue();

  await page.locator(panel).getByRole("button", { name: "Palette actions" }).click();
  await page.getByRole("menuitem", { name: "Rename palette…" }).click();
  await page.getByLabel("Palette name").fill("Renamed in a browser");
  await page.getByRole("button", { name: "OK" }).click();

  await expect(select.locator(`option[value="${before}"]`)).toHaveText("Renamed in a browser");
});

test("copying a swatch from Recent lands it in another palette", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);
  const applied = await pickInRailPopup(page);

  await selectPalette(page, RECENT_PALETTE_NAME);
  await page.locator(panel).getByRole("button", { name: `Swatch ${applied}` })
    .click({ modifiers: ["ControlOrMeta"] });

  await page.locator(panel).getByRole("button", { name: "Palette actions" }).click();
  await page.getByRole("menuitem", { name: "Copy selected swatches to…" }).click();
  await page.getByLabel("Target palette").selectOption({ label: "Pastel" });
  await page.getByRole("button", { name: "Copy" }).click();

  await selectPalette(page, "Pastel");
  await expect(page.locator(panel).getByRole("button", { name: `Swatch ${applied}` }))
    .toBeVisible();
  // Copy, not move.
  await selectPalette(page, RECENT_PALETTE_NAME);
  await expect(page.locator(panel).getByRole("button", { name: `Swatch ${applied}` }))
    .toBeVisible();
});
```

Reuse the file's existing `panel`, `drawRect`, `selectPalette`, and `pickInRailPopup` helpers. `getByLabel("Palette", { exact: true })` is required — the existing file documents that a non-exact match is ambiguous.

- [ ] **Step 3: Full verification**

```bash
npx vitest run 2>&1 | tail -5
npm run typecheck
pkill -f vite
npx playwright test 2>&1 | tail -20
```

Expect e2e at **137 passed / 2 failed** (135 + 2 new; the two `text-panel.spec.ts` container-padding failures remain). A third failure name is the documented parallel-load flake — re-run that spec alone before investigating.

- [ ] **Step 4: Manual smoke — report, do not claim**

If you cannot drive a browser, skip this and say so plainly. Items for a human:
1. Gear → Rename, type, Enter — commits without touching OK.
2. Gear → Add, accept the prefilled name — new empty palette becomes current.
3. Select two swatches, gear → Copy to, choose a target — both land, source unchanged.
4. With Recent current, gear → Delete palette is visibly greyed and does nothing.
5. Dock the Color panel against the right edge, then open the gear — the menu clamps on-screen rather than clipping.

- [ ] **Step 5: Update the memory**

`.claude/memory/recent-palette.md` describes the palette footer as it was. Update it, and add a short section (or a new memory with a `MEMORY.md` pointer) recording:
- The gear replaced a `+`/`🗑` pair whose trash changed meaning based on selection.
- **Three different disabled rules now coexist in this component**, for three different reasons — menu items (`aria-disabled`, focusability), dialog buttons (native, `.flow-btn:disabled` exists), the grid trash tile (`aria-disabled`, Chrome suppresses mouse events on disabled drop targets). Anyone unifying them breaks one of the three.
- `abandonRename` and the blur-ordering workaround are gone because the dialog has an explicit Cancel.
- `PaletteDialog` portals while `LayoutManagerDialog` does not, and why.
- `copySwatchesTo` commits once by design; a loop of `addSwatch` is the regression.

- [ ] **Step 6: Commit**

```bash
git add e2e/ .claude/memory/
git commit -m "test(e2e): palette gear menu, rename and copy-to"
```

---

## Self-review notes

**Spec coverage.** Menu shape and inert conditions → Task 3, wired in Task 4. Dialog system → Task 2. Rename/Add/Delete → Task 4. Copy semantics and `copySwatchesTo` → Tasks 1 and 5. Retirements → Task 4. Recent interaction → Tasks 3 and 4. Testing → throughout, e2e in Task 6.

**Decided here, not in the spec:**
- `PaletteDialog` wraps its content in a `<form>` so Enter-to-submit comes from the platform rather than a per-dialog key handler, and so `disabled` on the submit button blocks Enter for free.
- Dialog state is one nullable discriminated field rather than four booleans, which makes "renaming and deleting at once" unrepresentable.
- The copy dialog's target `<select>` excludes the current palette, so copy-onto-itself is not offerable rather than being a silently swallowed no-op.
