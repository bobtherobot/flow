import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Registers flow's shape geometry with the vendor renderer. Must be imported
// before <Excalidraw> first renders — a restored scene may contain flow shapes,
// and an unregistered kind draws as a plain box.
import "./ui/shapes/register";

// Self-host Excalidraw fonts from ./fonts (no external CDN). Resolve relative to
// the directory index.html is served from, so subfolder deploys on cPanel work.
(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH =
  new URL(".", document.baseURI).href;

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
