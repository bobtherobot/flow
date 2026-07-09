import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertiesDialog } from "./PropertiesDialog";
import type { ExcalidrawAPI } from "../lib/excalidraw-scene";
import type { LibraryProvider } from "../storage/types";

function fakeApi(elementCount: number, imageCount: number): ExcalidrawAPI {
  return {
    getSceneElements: () => Array.from({ length: elementCount }, (_, i) => ({ id: `e${i}` })),
    getFiles: () => Object.fromEntries(Array.from({ length: imageCount }, (_, i) => [`f${i}`, {}])),
  } as unknown as ExcalidrawAPI;
}

function fakeProvider(docCount: number): LibraryProvider {
  return {
    list: () => Promise.resolve(Array.from({ length: docCount }, (_, i) => ({ id: `d${i}`, name: `Doc ${i}`, createdAt: 0, updatedAt: 0 }))),
    load: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  };
}

describe("PropertiesDialog", () => {
  it("shows version, scene totals, and document/storage info", async () => {
    render(
      <PropertiesDialog
        appName="Flow"
        sceneName="My Diagram"
        api={fakeApi(7, 2)}
        provider={fakeProvider(3)}
        onClose={() => {}}
      />,
    );

    expect(screen.getByRole("heading", { name: "Properties" })).toBeInTheDocument();
    // Scene totals (document-level, not selection).
    expect(screen.getByText("My Diagram")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument(); // elements
    expect(screen.getByText("2")).toBeInTheDocument(); // images
    // Storage: document count resolves asynchronously.
    expect(await screen.findByText("3")).toBeInTheDocument();
  });

  it("does not show selection dimensions like width or height", () => {
    render(
      <PropertiesDialog appName="Flow" sceneName="X" api={fakeApi(1, 0)} provider={fakeProvider(0)} onClose={() => {}} />,
    );
    expect(screen.queryByText(/width/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/height/i)).not.toBeInTheDocument();
  });

  it("closes on the Close button", async () => {
    const onClose = vi.fn();
    render(
      <PropertiesDialog appName="Flow" sceneName="X" api={null} provider={fakeProvider(0)} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
