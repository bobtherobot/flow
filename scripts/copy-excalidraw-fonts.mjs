// Copies Excalidraw's font families out of node_modules into public/fonts so the
// app is fully self-hosted (no runtime CDN fetch to esm.sh). Fonts land at
// dist/fonts/<Family>/... which Excalidraw resolves via window.EXCALIDRAW_ASSET_PATH.
//
// The CJK "Xiaolai" family is ~12.7MB (vs ~440KB for all Latin families combined),
// so it is excluded by default. Set INCLUDE_CJK=1 to bundle it for offline CJK text.
import {
  existsSync,
  rmSync,
  mkdirSync,
  cpSync,
  readdirSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@excalidraw/excalidraw/dist/prod/fonts");
const dest = join(root, "public/fonts");

const includeCjk = ["1", "true"].includes(String(process.env.INCLUDE_CJK));
const EXCLUDE = includeCjk ? [] : ["Xiaolai"];

if (!existsSync(src)) {
  console.error(`[copy-fonts] source not found: ${src} — run 'npm install' first`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

let copied = 0;
for (const entry of readdirSync(src, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (EXCLUDE.includes(entry.name)) {
    console.log(`[copy-fonts] skip ${entry.name} (set INCLUDE_CJK=1 to include)`);
    continue;
  }
  cpSync(join(src, entry.name), join(dest, entry.name), { recursive: true });
  copied++;
}
console.log(`[copy-fonts] copied ${copied} font families to public/fonts`);
