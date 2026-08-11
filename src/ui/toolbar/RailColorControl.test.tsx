import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RailColorControl } from "./RailColorControl";
import { reloadColorStore, recordRecent } from "../../lib/color-store";
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

  it("fills slots from the store and applies one on click", () => {
    recordRecent("#00ff00");
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
});
