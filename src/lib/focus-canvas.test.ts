import { describe, it, expect, afterEach, vi } from "vitest";
import { focusCanvas } from "./focus-canvas";

describe("focusCanvas", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("focuses the excalidraw container", () => {
    const container = document.createElement("div");
    container.className = "excalidraw-container";
    container.tabIndex = 0;
    document.body.appendChild(container);

    focusCanvas();

    expect(document.activeElement).toBe(container);
  });

  it("passes preventScroll: true so it never scrolls the page", () => {
    const container = document.createElement("div");
    container.className = "excalidraw-container";
    container.tabIndex = 0;
    document.body.appendChild(container);
    const focusSpy = vi.spyOn(container, "focus");

    focusCanvas();

    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("is safe to call when the container is not mounted", () => {
    expect(() => focusCanvas()).not.toThrow();
  });
});
