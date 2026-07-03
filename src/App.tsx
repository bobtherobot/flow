import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

// Phase 0: embed Excalidraw with a clean/precise theme (no sketchy roughness,
// normal font). Storage layer + custom menu land in Phase 1.
export default function App() {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Excalidraw
        theme="light"
        initialData={{
          appState: {
            currentItemRoughness: 0, // 0 = clean/architect, not hand-drawn
            currentItemFontFamily: 2, // 2 = normal font, not Virgil (hand-drawn)
          },
        }}
      />
    </div>
  );
}
