import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, within, screen } from "@testing-library/react";

// The Color panel (docked accordion) and the rail's ColorPopup are
// independent siblings mounted simultaneously from App.tsx, and BOTH read
// `openEyeDropper`/`cancelEyeDropper` from src/lib/eyedropper.ts, which in
// turn reads/writes ONE global jotai atom via `@excalidraw/excalidraw`. Unlike
// ColorPanel.test.tsx and RailColorControl.test.tsx — which each mock this
// module independently and so can only prove a surface behaves correctly in
// isolation — this file mocks it ONCE and renders both real components
// against that single shared store, so a bug where one surface's unmount
// clobbers the other surface's in-flight pick is actually observable.
const store = vi.hoisted(() => {
  let value: unknown = null;
  return {
    get: vi.fn((_atom?: unknown) => value),
    set: vi.fn((_atom: unknown, v: unknown) => {
      value = v;
    }),
    reset: () => {
      value = null;
    },
  };
});
vi.mock("@excalidraw/excalidraw", () => ({
  activeEyeDropperAtom: { __atom: true },
  editorJotaiStore: { get: store.get, set: store.set },
}));

import { ColorPanel } from "./panels/ColorPanel";
import { RailColorControl } from "./toolbar/RailColorControl";
import { reloadColorStore } from "../lib/color-store";
import { reloadPaletteStore } from "../lib/palette-store";
import type { SelectionStyle } from "./panels/useSelectionStyle";

// Same in-memory localStorage stub ColorPanel.test.tsx and
// RailColorControl.test.tsx each carry, for the identical reason (color-store
// and palette-store persist through it; jsdom's native localStorage isn't a
// usable Storage in this vitest setup).
const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, value: string) => {
    mockStorage[key] = String(value);
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
  clear: () => {
    for (const key in mockStorage) delete mockStorage[key];
  },
  key: (index: number) => Object.keys(mockStorage)[index] ?? null,
  get length() {
    return Object.keys(mockStorage).length;
  },
};
vi.stubGlobal("localStorage", mockLocalStorage);

const rect = {
  id: "r1", type: "rectangle",
  strokeColor: "#111111", backgroundColor: "#eeeeee", strokeWidth: 2,
};

function fakeSel(): SelectionStyle {
  return {
    elements: [rect],
    appState: {
      currentItemBackgroundColor: "transparent",
      currentItemStrokeColor: "#1e1e1e",
      currentItemTextColor: "#1e1e1e",
    },
    selectedIds: { r1: true },
    textTargetIds: {},
    hasSelection: true,
    selectedCount: 1,
    hasText: false,
    hasLinear: false,
    setProp: vi.fn(),
    update: vi.fn(),
    executeAction: vi.fn(),
  } as unknown as SelectionStyle;
}

const pickBtn = { name: /pick a color from the canvas/i };

beforeEach(() => {
  localStorage.clear();
  reloadColorStore();
  reloadPaletteStore();
  store.get.mockClear();
  store.set.mockClear();
  store.reset();
});

describe("eyedropper ownership across the two picker surfaces", () => {
  it("the rail popup's unmount does not clobber a pick the Color panel opened", () => {
    const panel = render(<ColorPanel sel={fakeSel()} />);
    const rail = render(<RailColorControl sel={fakeSel()} dockedPopupLeft={null} />);

    fireEvent.click(within(panel.container).getByRole("button", pickBtn));
    expect(store.set).toHaveBeenCalledTimes(1);
    const panelHandle = store.get(undefined);
    expect(panelHandle).not.toBeNull();

    // Open the rail's popup — mounting `ColorPopup` and its cleanup effect —
    // but never click ITS eyedropper, so its own handle stays null. This is
    // the part that matters: `ColorPopup`'s cleanup must exist and run on
    // unmount for this case to be a real test of the bug, not a no-op because
    // the component holding the cleanup was never mounted at all.
    fireEvent.click(within(rail.container).getByRole("radio", { name: /fill/i }));
    screen.getByRole("dialog", { name: /color picker/i }); // sanity: popup is up

    // Not the popup's own unmount path (Escape/outside-click) — something
    // else tears down the rail (e.g. View ▸ Show Toolbar).
    rail.unmount();

    // BEFORE this fix, ColorPopup's unmount cleanup called cancelEyeDropper()
    // unconditionally and would have nulled the atom here even though this
    // rail control never opened a pick — wiping out the panel's still-active
    // one. With ownership scoping, an unmount that never opened anything
    // must be a total no-op on the shared atom.
    expect(store.set).toHaveBeenCalledTimes(1);
    expect(store.get(undefined)).toBe(panelHandle);

    panel.unmount();

    expect(store.set).toHaveBeenCalledTimes(2);
    expect(store.set).toHaveBeenLastCalledWith({ __atom: true }, null);
  });

  it("the Color panel's unmount does not clobber a pick the rail popup opened", () => {
    const panel = render(<ColorPanel sel={fakeSel()} />);
    const rail = render(<RailColorControl sel={fakeSel()} dockedPopupLeft={null} />);

    // Open the rail popup, then its eyedropper. The popup itself renders via
    // a portal to document.body (see ColorPopup.tsx), not inside
    // rail.container, so it's queried from there instead — unambiguous since
    // ColorPanel never renders a dialog of its own.
    fireEvent.click(within(rail.container).getByRole("radio", { name: /fill/i }));
    const dialog = screen.getByRole("dialog", { name: /color picker/i });
    fireEvent.click(within(dialog).getByRole("button", pickBtn));
    expect(store.set).toHaveBeenCalledTimes(1);
    const railHandle = store.get(undefined);
    expect(railHandle).not.toBeNull();

    // The Color panel never opened a pick — its accordion section collapsing
    // for an unrelated reason must not touch the rail's in-flight one.
    panel.unmount();

    expect(store.set).toHaveBeenCalledTimes(1);
    expect(store.get(undefined)).toBe(railHandle);

    rail.unmount();

    expect(store.set).toHaveBeenCalledTimes(2);
    expect(store.set).toHaveBeenLastCalledWith({ __atom: true }, null);
  });
});
