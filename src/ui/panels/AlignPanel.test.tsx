import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AlignPanel } from "./AlignPanel";
import type { SelectionStyle } from "./useSelectionStyle";

function mockSel(selectedCount: number): { sel: SelectionStyle; executeAction: ReturnType<typeof vi.fn> } {
  const executeAction = vi.fn();
  const sel = { selectedCount, executeAction } as unknown as SelectionStyle;
  return { sel, executeAction };
}

const LABEL_TO_ACTION: [label: string, action: string][] = [
  ["Align left", "alignLeft"],
  ["Align center", "alignHorizontallyCentered"],
  ["Align right", "alignRight"],
  ["Align top", "alignTop"],
  ["Align middle", "alignVerticallyCentered"],
  ["Align bottom", "alignBottom"],
  ["Distribute horizontally", "distributeHorizontally"],
  ["Distribute vertically", "distributeVertically"],
];

describe("AlignPanel", () => {
  it.each(LABEL_TO_ACTION)("dispatches %s as %s", async (label, action) => {
    const { sel, executeAction } = mockSel(3);
    render(<AlignPanel sel={sel} />);
    await userEvent.click(screen.getByRole("button", { name: label }));
    expect(executeAction).toHaveBeenCalledWith(action);
  });

  it("greys align (<2) and distribute (<3) rows below their thresholds", () => {
    const { sel } = mockSel(1);
    render(<AlignPanel sel={sel} />);
    expect(screen.getByRole("button", { name: "Align left" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Distribute horizontally" })).toBeDisabled();
  });

  it("enables align at 2 but keeps distribute disabled until 3", () => {
    const { sel } = mockSel(2);
    render(<AlignPanel sel={sel} />);
    expect(screen.getByRole("button", { name: "Align left" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Distribute vertically" })).toBeDisabled();
  });

  it("enables distribute at 3", () => {
    const { sel } = mockSel(3);
    render(<AlignPanel sel={sel} />);
    expect(screen.getByRole("button", { name: "Distribute vertically" })).toBeEnabled();
  });
});
