import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FontDropdown, type FontOption } from "./FontDropdown";
import { MIXED } from "../../../lib/selection-style";

const OPTS: FontOption[] = [
  { value: 5, label: "Excalifont", css: "Excalifont" },
  { value: 6, label: "Nunito", css: "Nunito" },
];

describe("FontDropdown", () => {
  it("shows the current family and opens the listbox", async () => {
    render(<FontDropdown options={OPTS} value={6} onChange={() => {}} ariaLabel="Font family" />);
    expect(screen.getByRole("button", { name: "Font family" })).toHaveTextContent("Nunito");
    await userEvent.click(screen.getByRole("button", { name: "Font family" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Nunito" })).toHaveAttribute("aria-selected", "true");
  });

  it("reports the chosen family and closes", async () => {
    const onChange = vi.fn();
    render(<FontDropdown options={OPTS} value={6} onChange={onChange} ariaLabel="Font family" />);
    await userEvent.click(screen.getByRole("button", { name: "Font family" }));
    await userEvent.click(screen.getByRole("option", { name: "Excalifont" }));
    expect(onChange).toHaveBeenCalledWith(5);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows an em dash for a mixed value", () => {
    render(<FontDropdown options={OPTS} value={MIXED} onChange={() => {}} ariaLabel="Font family" />);
    expect(screen.getByRole("button", { name: "Font family" })).toHaveTextContent("—");
  });

  it("does not open when disabled", async () => {
    render(<FontDropdown options={OPTS} value={6} onChange={() => {}} ariaLabel="Font family" disabled />);
    await userEvent.click(screen.getByRole("button", { name: "Font family" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
