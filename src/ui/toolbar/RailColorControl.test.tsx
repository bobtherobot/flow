import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

// The eyedropper bridge (src/lib/eyedropper.ts) imports the real vendor
// package; stub the two exports it touches with a minimal real store (`get`
// reflects whatever `set` last wrote) so the unmount-cancellation tests below
// can exercise the real identity check in `cancelEyeDropper`, not just spy on
// calls. `vi.hoisted` avoids vitest's "cannot access before initialization"
// hoisting trap (see src/lib/eyedropper.test.ts).
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

import { RailColorControl } from "./RailColorControl";
import { reloadColorStore } from "../../lib/color-store";
import {
  recordUsedColor,
  reloadPaletteStore,
  getRecentPaletteColors,
} from "../../lib/palette-store";
import type { SelectionStyle } from "../panels/useSelectionStyle";

// jsdom/Node's native `localStorage` global does not implement a usable
// Storage in this project's vitest setup (see src/lib/color-store.test.ts and
// src/ui/color/useColorTarget.test.tsx, which use this same in-memory mock for
// the identical reason). Without this stub, `localStorage.clear()` throws
// "not a function" — an environment gap, not a behavior change to this task.
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
    for (const key in mockStorage) {
      delete mockStorage[key];
    }
  },
  key: (index: number) => {
    const keys = Object.keys(mockStorage);
    return keys[index] ?? null;
  },
  get length() {
    return Object.keys(mockStorage).length;
  },
};

vi.stubGlobal("localStorage", mockLocalStorage);

const rect = {
  id: "r1", type: "rectangle",
  strokeColor: "#111111", backgroundColor: "#eeeeee", strokeWidth: 2,
};

function fakeSel(over: Partial<SelectionStyle> = {}): SelectionStyle {
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
    ...over,
  } as unknown as SelectionStyle;
}

beforeEach(() => {
  localStorage.clear();
  reloadColorStore();
  reloadPaletteStore();
  store.get.mockClear();
  store.set.mockClear();
  store.reset();
});

describe("RailColorControl", () => {
  it("renders the compact part chooser", () => {
    render(<RailColorControl sel={fakeSel()} />);
    expect(screen.getByRole("radiogroup", { name: /color target/i })).toBeInTheDocument();
  });

  it("keeps the popup closed initially", () => {
    render(<RailColorControl sel={fakeSel()} />);
    expect(screen.queryByRole("dialog", { name: /color picker/i })).not.toBeInTheDocument();
  });

  it("opens the popup from the active box", () => {
    render(<RailColorControl sel={fakeSel()} />);
    fireEvent.click(screen.getByRole("radio", { name: /fill/i }));
    expect(screen.getByRole("dialog", { name: /color picker/i })).toBeInTheDocument();
  });

  it("switches part rather than opening when a back box is clicked", () => {
    render(<RailColorControl sel={fakeSel()} />);
    fireEvent.click(screen.getByRole("radio", { name: /stroke/i }));
    expect(screen.queryByRole("dialog", { name: /color picker/i })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /stroke/i })).toBeChecked();
  });

  it("shows the picker controls but no palette dropdown", () => {
    render(<RailColorControl sel={fakeSel()} />);
    fireEvent.click(screen.getByRole("radio", { name: /fill/i }));
    expect(screen.getByRole("application", { name: /saturation/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /hue/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /opacity/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Palette")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Hue", { selector: "input" })).not.toBeInTheDocument();
  });

  it("renders six recent slots", () => {
    render(<RailColorControl sel={fakeSel()} />);
    fireEvent.click(screen.getByRole("radio", { name: /fill/i }));
    expect(screen.getAllByRole("button", { name: /recent color slot/i })).toHaveLength(6);
  });

  it("fills slots from the Recent palette and applies one on click", () => {
    recordUsedColor("#00ff00");
    const sel = fakeSel();
    render(<RailColorControl sel={sel} />);
    fireEvent.click(screen.getByRole("radio", { name: /fill/i }));
    fireEvent.click(screen.getByRole("button", { name: "Recent color #00ff00" }));
    // Asserting only `toHaveBeenCalled()` would pass even if the wrong recent
    // (or a hardcoded color) were applied — check the actual payload: the fill
    // default is set to the clicked recent, and the element patch carries the
    // same hex.
    expect(sel.update).toHaveBeenCalledTimes(1);
    const [, updater, currentItems] = vi.mocked(sel.update).mock.calls[0];
    expect(currentItems).toEqual({ currentItemBackgroundColor: "#00ff00" });
    expect(updater(rect as never)).toEqual({ backgroundColor: "#00ff00" });
  });

  it("closes on Escape", () => {
    render(<RailColorControl sel={fakeSel()} />);
    fireEvent.click(screen.getByRole("radio", { name: /fill/i }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /color picker/i })).not.toBeInTheDocument();
  });

  it("returns focus to the active box after Escape", () => {
    render(<RailColorControl sel={fakeSel()} />);
    const fillBox = screen.getByRole("radio", { name: /fill/i });
    fireEvent.click(fillBox);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(fillBox).toHaveFocus();
  });

  it("closes on an outside pointer press", () => {
    render(
      <>
        <button>outside</button>
        <RailColorControl sel={fakeSel()} />
      </>,
    );
    fireEvent.click(screen.getByRole("radio", { name: /fill/i }));
    fireEvent.pointerDown(screen.getByText("outside"));
    expect(screen.queryByRole("dialog", { name: /color picker/i })).not.toBeInTheDocument();
  });

  it("closes from the X button", () => {
    render(<RailColorControl sel={fakeSel()} />);
    fireEvent.click(screen.getByRole("radio", { name: /fill/i }));
    fireEvent.click(screen.getByRole("button", { name: /close color picker/i }));
    expect(screen.queryByRole("dialog", { name: /color picker/i })).not.toBeInTheDocument();
  });

  it("does not open the popup when arrow-key navigation lands back on the only available part", () => {
    // A bare text element exposes exactly one part ("text"), so the diagonal's
    // arrow-key cycle wraps onto the same part every time — that must stay a
    // no-op, not an accidental toggle of the popup.
    const textEl = { id: "t1", type: "text", strokeColor: "#123456" };
    const sel = fakeSel({
      elements: [textEl] as unknown as SelectionStyle["elements"],
      selectedIds: { t1: true },
    });
    render(<RailColorControl sel={sel} />);
    const radio = screen.getByRole("radio", { name: /text/i });
    radio.focus();
    fireEvent.keyDown(radio, { key: "ArrowRight" });
    expect(screen.queryByRole("dialog", { name: /color picker/i })).not.toBeInTheDocument();
  });

  it("still switches part on arrow-key navigation among multiple parts", () => {
    render(<RailColorControl sel={fakeSel()} />);
    const fillBox = screen.getByRole("radio", { name: /fill/i });
    fillBox.focus();
    fireEvent.keyDown(fillBox, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: /stroke/i })).toBeChecked();
    expect(screen.queryByRole("dialog", { name: /color picker/i })).not.toBeInTheDocument();
  });

  it("closes on a second press of the active box", () => {
    // fireEvent.click alone never fires pointerdown, so this interleaving is
    // invisible to a click-only test: the popup's outside-press handler closes
    // on pointerdown (the trigger box lives outside the portal) and the click
    // that follows then reopens it, making the toggle's close branch dead.
    render(<RailColorControl sel={fakeSel()} />);
    const box = screen.getByRole("radio", { name: /fill/i });
    fireEvent.click(box);
    expect(screen.getByRole("dialog", { name: /color picker/i })).toBeInTheDocument();
    fireEvent.pointerDown(box);
    fireEvent.click(box);
    expect(screen.queryByRole("dialog", { name: /color picker/i })).not.toBeInTheDocument();
  });

  it("a stray arrow key on a quartet chip does not swallow the next open", () => {
    // The chips sit outside the radiogroup, so an arrow key pressed there has
    // no setPart call to consume the arrow-nav flag; if it latched, the next
    // click on the active box would be silently eaten.
    render(<RailColorControl sel={fakeSel()} />);
    fireEvent.keyDown(screen.getByRole("button", { name: /^white$/i }), { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("radio", { name: /fill/i }));
    expect(screen.getByRole("dialog", { name: /color picker/i })).toBeInTheDocument();
  });

  it("does not touch the atom on unmount if it never opened a pick", () => {
    // Opening the popup itself does not open a pick — only its eyedropper
    // button does. Unmounting without ever clicking it must not touch the
    // shared atom at all.
    const { unmount } = render(<RailColorControl sel={fakeSel()} />);
    fireEvent.click(screen.getByRole("radio", { name: /fill/i }));
    expect(screen.getByRole("dialog", { name: /color picker/i })).toBeInTheDocument();
    expect(store.set).not.toHaveBeenCalled();

    unmount();

    expect(store.set).not.toHaveBeenCalled();
  });

  it("cancels its own in-flight eyedropper pick if the popup unmounts programmatically", () => {
    // Not the popup's own Escape/outside-click path — those cancel through the
    // vendor's own handlers. This is the case those don't cover: something
    // else (View ▸ Show Toolbar hiding the whole rail, a selection change that
    // tears down the tree) unmounts the popup out from under a pending pick.
    const { unmount } = render(<RailColorControl sel={fakeSel()} />);
    fireEvent.click(screen.getByRole("radio", { name: /fill/i }));
    const dialog = screen.getByRole("dialog", { name: /color picker/i });

    fireEvent.click(
      within(dialog).getByRole("button", { name: /pick a color from the canvas/i }),
    );
    expect(store.set).toHaveBeenCalledTimes(1); // opening the pick

    unmount();

    expect(store.set).toHaveBeenCalledTimes(2);
    expect(store.set).toHaveBeenLastCalledWith({ __atom: true }, null);
  });
});

describe("recording the popup session's color", () => {
  /**
   * A selection whose fill is **saturated**.
   *
   * This matters more than it looks. The shared `rect` fixture's fill is
   * `#eeeeee`, which has s=0 — and a hue change on an achromatic color yields
   * the identical hex every time. Every write in a session would then be the
   * same color, `recordUsedColor` would dedupe them, and the "exactly one
   * color per session" test below would pass even against a broken
   * record-on-every-write implementation. A saturated fill makes each hue step
   * a genuinely distinct hex, so that test can actually fail.
   */
  const satSel = () =>
    fakeSel({
      elements: [{ ...rect, backgroundColor: "#ff0000" }] as unknown as SelectionStyle["elements"],
    });

  /**
   * Nudge the hue by N arrow presses. `HueSlider` handles arrows only — it has
   * no Home/End (see `slider-keys.ts`), so there is no jump-to-a-known-value
   * shortcut. Each press is one write through the draft.
   *
   * `sel.update` is a mock, so the element never actually changes and the
   * draft's prop stays `#ff0000` across renders. That is fine and intended:
   * `useColorDraft` holds the live HSV itself and only re-seeds on a genuine
   * outside change, so successive presses accumulate rather than snapping back.
   */
  const nudgeHue = (steps: number) => {
    const slider = screen.getByRole("slider", { name: /hue/i });
    for (let i = 0; i < steps; i++) fireEvent.keyDown(slider, { key: "ArrowRight" });
  };

  const openPopup = () => fireEvent.click(screen.getByRole("radio", { name: /fill/i }));

  it("records nothing when the popup is opened and closed untouched", () => {
    render(<RailColorControl sel={satSel()} />);
    openPopup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(getRecentPaletteColors()).toEqual([]);
  });

  it("records nothing while the popup is still open", () => {
    // The whole point of the deferral: a color joins the list when the session
    // ends, not while the user is still hunting for it.
    render(<RailColorControl sel={satSel()} />);
    openPopup();
    nudgeHue(30);
    expect(getRecentPaletteColors()).toEqual([]);
  });

  it("records the color on close", () => {
    render(<RailColorControl sel={satSel()} />);
    openPopup();
    nudgeHue(30);
    fireEvent.click(screen.getByRole("button", { name: /close color picker/i }));
    expect(getRecentPaletteColors()).toHaveLength(1);
  });

  it("records exactly one color for a session of many distinct writes", () => {
    // 60 arrow presses, 60 distinct hexes, one entry.
    render(<RailColorControl sel={satSel()} />);
    openPopup();
    nudgeHue(60);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(getRecentPaletteColors()).toHaveLength(1);
  });

  it("records the LAST color the session wrote, not an earlier one", () => {
    // Seed an entry, then end the session ON it: hue-drag first (distinct
    // hexes that must NOT be recorded), then click the seeded slot last. If
    // any write but the last were recorded, the palette would grow.
    recordUsedColor("#0000ff");
    render(<RailColorControl sel={satSel()} />);
    openPopup();
    nudgeHue(40);
    fireEvent.click(screen.getByRole("button", { name: "Recent color #0000ff" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(getRecentPaletteColors()).toEqual(["#0000ff"]);
  });

  it("records the hue color when the drag is what comes last", () => {
    // The mirror of the test above, so neither can pass by ordering accident.
    recordUsedColor("#0000ff");
    render(<RailColorControl sel={satSel()} />);
    openPopup();
    fireEvent.click(screen.getByRole("button", { name: "Recent color #0000ff" }));
    nudgeHue(40);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(getRecentPaletteColors()).toHaveLength(2);
    expect(getRecentPaletteColors()[1]).toBe("#0000ff");
  });

  it("records on an unmount while the popup is still open", () => {
    // Not the Escape/outside-click path. View ▸ Show Toolbar makes ToolBar
    // return null, unmounting this component with the popup open — the same
    // hazard cancelEyeDropper guards in this file. A session's color must not
    // be lost to it.
    const { unmount } = render(<RailColorControl sel={satSel()} />);
    openPopup();
    nudgeHue(45);
    unmount();
    expect(getRecentPaletteColors()).toHaveLength(1);
  });

  it("does not record twice when a close is followed by an unmount", () => {
    const { unmount } = render(<RailColorControl sel={satSel()} />);
    openPopup();
    nudgeHue(45);
    fireEvent.keyDown(window, { key: "Escape" });
    const after = getRecentPaletteColors();
    expect(after).toHaveLength(1);
    unmount();
    expect(getRecentPaletteColors()).toEqual(after);
  });

  it("records when the active box is clicked a second time to close", () => {
    // The active box toggles `open` directly and never reaches `closePopup` —
    // the most common way of closing the popup, and the one a flush wired only
    // into `closePopup` would silently miss.
    render(<RailColorControl sel={satSel()} />);
    const box = screen.getByRole("radio", { name: /fill/i });
    fireEvent.click(box);
    nudgeHue(30);
    fireEvent.pointerDown(box);
    fireEvent.click(box);
    expect(screen.queryByRole("dialog", { name: /color picker/i })).not.toBeInTheDocument();
    expect(getRecentPaletteColors()).toHaveLength(1);
  });

  it("does not record a write made outside the popup", () => {
    // The quartet chips sit on the rail, outside the popup, and already
    // deliberately skip recording — white/grey/black have permanent chips one
    // click away, so caching them would evict colors the user actually chose.
    const { unmount } = render(<RailColorControl sel={satSel()} />);
    fireEvent.click(screen.getByRole("button", { name: /^white$/i }));
    unmount();
    expect(getRecentPaletteColors()).toEqual([]);
  });
});
