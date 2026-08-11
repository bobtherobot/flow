import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useColorDraft } from "./useColorDraft";

function Harness({
  hex, alpha, onCommit,
}: { hex: string; alpha: number; onCommit: (h: string, a: number, t: boolean) => void }) {
  const d = useColorDraft({ hex, alpha, onCommit });
  return (
    <>
      <output data-testid="hsv">{`${Math.round(d.hsv.h)},${Math.round(d.hsv.s)},${Math.round(d.hsv.v)}`}</output>
      <output data-testid="none">{String(d.isNone)}</output>
      <button onClick={() => d.setSv({ s: 100, v: 0 }, false)}>to black</button>
      <button onClick={() => d.setSv({ s: 100, v: 100 }, false)}>to bright</button>
      <button onClick={() => d.setHue(300, false)}>hue 300</button>
      <button onClick={() => d.setAlpha(50, true)}>half alpha</button>
    </>
  );
}

describe("useColorDraft", () => {
  it("seeds hsv from the incoming hex", () => {
    render(<Harness hex="#ff0000" alpha={100} onCommit={vi.fn()} />);
    expect(screen.getByTestId("hsv")).toHaveTextContent("0,100,100");
  });

  it("flags transparent and still exposes a usable hsv", () => {
    render(<Harness hex="transparent" alpha={0} onCommit={vi.fn()} />);
    expect(screen.getByTestId("none")).toHaveTextContent("true");
    expect(screen.getByTestId("hsv")).toHaveTextContent("0,0,0");
  });

  it("emits the composed hex on a change", () => {
    const onCommit = vi.fn();
    render(<Harness hex="#ff0000" alpha={100} onCommit={onCommit} />);
    fireEvent.click(screen.getByText("hue 300"));
    expect(onCommit).toHaveBeenCalledWith("#ff00ff", 100, false);
  });

  it("passes the transient flag straight through", () => {
    const onCommit = vi.fn();
    render(<Harness hex="#ff0000" alpha={100} onCommit={onCommit} />);
    fireEvent.click(screen.getByText("half alpha"));
    expect(onCommit).toHaveBeenCalledWith("#ff0000", 50, true);
  });

  it("KEEPS THE HUE through a round trip to black", () => {
    // The reason this hook exists.
    const onCommit = vi.fn();
    const { rerender } = render(<Harness hex="#0000ff" alpha={100} onCommit={onCommit} />);
    fireEvent.click(screen.getByText("to black"));
    expect(onCommit).toHaveBeenLastCalledWith("#000000", 100, false);
    // The scene echoes the write back as a prop.
    rerender(<Harness hex="#000000" alpha={100} onCommit={onCommit} />);
    fireEvent.click(screen.getByText("to bright"));
    expect(onCommit).toHaveBeenLastCalledWith("#0000ff", 100, false);
  });

  it("re-seeds when the color changes from outside", () => {
    const onCommit = vi.fn();
    const { rerender } = render(<Harness hex="#0000ff" alpha={100} onCommit={onCommit} />);
    rerender(<Harness hex="#00ff00" alpha={100} onCommit={onCommit} />);
    expect(screen.getByTestId("hsv")).toHaveTextContent("120,100,100");
  });

  it("re-seeds when only the alpha changes from outside", () => {
    const onCommit = vi.fn();
    const { rerender } = render(<Harness hex="#0000ff" alpha={100} onCommit={onCommit} />);
    rerender(<Harness hex="#0000ff" alpha={40} onCommit={onCommit} />);
    fireEvent.click(screen.getByText("hue 300"));
    expect(onCommit).toHaveBeenLastCalledWith("#ff00ff", 40, false);
  });

  it("keeps the hue when only the alpha changes from outside at an achromatic hex", () => {
    // The rail popup (or an undo) changing opacity while the draft sits at black
    // must not discard the hue — re-seeding from "#000000" would lose it.
    const onCommit = vi.fn();
    const { rerender } = render(<Harness hex="#0000ff" alpha={100} onCommit={onCommit} />);
    fireEvent.click(screen.getByText("to black"));
    rerender(<Harness hex="#000000" alpha={100} onCommit={onCommit} />);
    rerender(<Harness hex="#000000" alpha={40} onCommit={onCommit} />);
    fireEvent.click(screen.getByText("to bright"));
    expect(onCommit).toHaveBeenLastCalledWith("#0000ff", 40, false);
  });

  it("leaves the none state as soon as a control moves", () => {
    const onCommit = vi.fn();
    render(<Harness hex="transparent" alpha={0} onCommit={onCommit} />);
    fireEvent.click(screen.getByText("to bright"));
    expect(onCommit).toHaveBeenLastCalledWith("#ff0000", 100, false);
  });
});
