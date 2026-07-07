import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MenuBar } from "./MenuBar";

const noop = () => {};
const props = {
  onNew: noop, onOpen: noop, onSave: noop, onExport: noop, onPreferences: noop,
  onClearCanvas: noop, onZoomIn: noop, onZoomOut: noop, onZoomToFit: noop,
  onResetZoom: noop, onToggleGrid: noop, onAbout: noop,
};

describe("MenuBar", () => {
  it("renders File, View, and Help triggers", () => {
    render(<MenuBar {...props} />);
    expect(screen.getByRole("menuitem", { name: "File" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Help" })).toBeInTheDocument();
  });

  it("exposes an accessible menubar", () => {
    render(<MenuBar {...props} />);
    expect(screen.getByRole("menubar", { name: "Application menu" })).toBeInTheDocument();
  });
});
