import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build target: a thin index.html referencing a single stable `app.js` + `app.css`,
// with binary assets (fonts) under `assets/`. Updating the app = re-upload `app.js`.
// `base: "./"` keeps all references relative so the bundle runs from any subfolder
// on a cPanel host without rebuilding.
/** Today's date as YYYY-MM-DD in the builder's LOCAL timezone. Not
 *  `toISOString().slice(0,10)` — that is UTC, so an evening build anywhere west
 *  of UTC stamped tomorrow's date into the About dialog. */
function localBuildDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default defineConfig({
  base: "./",
  plugins: [react()],
  // Stamp the build date (YYYY-MM-DD) into the bundle for the About dialog.
  define: {
    __FLOW_BUILD_DATE__: JSON.stringify(localBuildDate()),
  },
  build: {
    rollupOptions: {
      output: {
        // Collapse the whole app into one JS chunk (no code-splitting).
        inlineDynamicImports: true,
        entryFileNames: "app.js",
        assetFileNames: (info) => {
          if (info.name && info.name.endsWith(".css")) return "app.css";
          return "assets/[name][extname]";
        },
      },
    },
  },
});
