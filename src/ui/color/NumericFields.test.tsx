import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NumericFields } from "./NumericFields";
import { hsvToHsl, hsvToRgb } from "../../lib/color-convert";

const hsv = { h: 200, s: 25, v: 91 };

function setup(mode: "hsla" | "rgba" | "hex" = "hsla") {
  const onChange = vi.fn();
  const onModeChange = vi.fn();
  const onHexCommit = vi.fn();
  render(
    <NumericFields
      hsv={hsv}
      alpha={100}
      mode={mode}
      onChange={onChange}
      onModeChange={onModeChange}
      onHexCommit={onHexCommit}
    />,
  );
  return { onChange, onModeChange, onHexCommit };
}

describe("NumericFields", () => {
  it("shows rounded HSLA by default", () => {
    setup();
    expect(screen.getByLabelText("Hue")).toHaveValue(200);
    // 56, not 25: the fields show HSL, the draft carries HSV. Different spaces.
    expect(screen.getByLabelText("Saturation")).toHaveValue(56);
    expect(screen.getByLabelText("Lightness")).toHaveValue(80);
    expect(screen.getByLabelText("Alpha")).toHaveValue(1);
  });

  it("shows RGBA in rgba mode", () => {
    setup("rgba");
    expect(screen.getByLabelText("Red")).toHaveValue(174);
    expect(screen.getByLabelText("Green")).toHaveValue(213);
    expect(screen.getByLabelText("Blue")).toHaveValue(232);
  });

  it("shows a single hex field in hex mode", () => {
    setup("hex");
    expect(screen.getByLabelText("Hex")).toHaveValue("#aed5e8");
    expect(screen.queryByLabelText("Hue")).not.toBeInTheDocument();
  });

  it("switches mode through the select", () => {
    const { onModeChange } = setup();
    fireEvent.change(screen.getByLabelText(/color format/i), { target: { value: "rgba" } });
    expect(onModeChange).toHaveBeenCalledWith("rgba");
  });

  it("emits a new hsv when hue is typed", () => {
    const { onChange } = setup();
    const field = screen.getByLabelText("Hue");
    fireEvent.change(field, { target: { value: "300" } });
    fireEvent.blur(field);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ hsv: expect.objectContaining({ h: 300 }) }),
      false,
    );
  });

  // These three prove the FIELDS ARE WIRED TO THE RIGHT CHANNEL. Without them a
  // transposition of s/l or g/b passes the whole suite, because the display
  // assertions read from the same correct object regardless of which key the
  // edit path writes. Values chosen to round-trip exactly through HSV; the
  // untouched channel is asserted too, which is what catches a swap.
  it("routes a typed saturation to saturation, leaving lightness alone", () => {
    const { onChange } = setup();
    const field = screen.getByLabelText("Saturation");
    fireEvent.change(field, { target: { value: "40" } });
    fireEvent.blur(field);
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    const back = hsvToHsl(lastCall[0].hsv);
    expect(Math.round(back.s)).toBe(40);
    expect(Math.round(back.l)).toBe(80);
  });

  it("routes a typed lightness to lightness, leaving saturation alone", () => {
    const { onChange } = setup();
    const field = screen.getByLabelText("Lightness");
    fireEvent.change(field, { target: { value: "40" } });
    fireEvent.blur(field);
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    const back = hsvToHsl(lastCall[0].hsv);
    expect(Math.round(back.l)).toBe(40);
    expect(Math.round(back.s)).toBe(56);
  });

  it("routes a typed green channel to green, leaving red and blue alone", () => {
    const onChange = vi.fn();
    render(
      <NumericFields
        hsv={hsv}
        alpha={100}
        mode="rgba"
        onChange={onChange}
        onModeChange={vi.fn()}
        onHexCommit={vi.fn()}
      />,
    );
    const field = screen.getByLabelText("Green");
    fireEvent.change(field, { target: { value: "100" } });
    fireEvent.blur(field);
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    const back = hsvToRgb(lastCall[0].hsv);
    expect(Math.round(back.g)).toBe(100);
    expect(Math.round(back.r)).toBe(174);
    expect(Math.round(back.b)).toBe(232);
  });

  it("converts a typed alpha from 0-1 back to 0-100", () => {
    const { onChange } = setup();
    const field = screen.getByLabelText("Alpha");
    fireEvent.change(field, { target: { value: "0.5" } });
    fireEvent.blur(field);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ alpha: 50 }), false);
  });

  it("commits a typed hex on Enter through onHexCommit, not onChange", () => {
    const { onChange, onHexCommit } = setup("hex");
    const field = screen.getByLabelText("Hex");
    fireEvent.change(field, { target: { value: "#ff0000" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onHexCommit).toHaveBeenCalledWith("#ff0000", 100);
    // The Hex field is a whole colour: it must not also fire the
    // channel-adjustment callback, or a caller wiring the two to different
    // writes (record vs. don't) would double-write.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores an unparseable hex", () => {
    const { onChange, onHexCommit } = setup("hex");
    const field = screen.getByLabelText("Hex");
    fireEvent.change(field, { target: { value: "nope" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
    expect(onHexCommit).not.toHaveBeenCalled();
  });

  it("reads an 8-digit hex as color plus alpha", () => {
    const { onHexCommit } = setup("hex");
    const field = screen.getByLabelText("Hex");
    fireEvent.change(field, { target: { value: "#ff000080" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onHexCommit).toHaveBeenCalledWith("#ff0000", 50);
  });
});
