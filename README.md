# flow

**A fast, self-hosted visual workspace for diagrams, sketches, and whiteboarding — built on a fork of [Excalidraw](https://github.com/excalidraw/excalidraw).**

flow is a standalone, single-bundle web app. It ships as plain static files with **no backend, no database, no sign-in, and no runtime calls to any CDN or third-party service.** Download it, drop it on any web server (or run it locally), and it just works — online or fully offline.

> flow reshapes Excalidraw into a desktop-style application: a traditional menu bar, an Illustrator-style dockable properties panel, and local-first storage — while keeping Excalidraw's excellent hand-drawn rendering engine underneath.

---

## Features

- **Desktop menu bar** — File (New / Open / Save / Export / Preferences / Clear), Edit (duplicate, delete, group, z-order, align), View (zoom, fit, grid), and Help.
- **Dockable control panel** — an Illustrator-style accordion docked on the right edge with **Style**, **Stroke**, and **Text** panels. Each sub-panel can float, tear off, reorder, resize, and be saved as a named layout. (A **Layers** panel is on the way.)
- **Style controls** — fill / stroke / text color with per-item opacity, stroke width (unit-aware), dash style, arrow type and arrowheads, and font family / size / alignment.
- **Consistent hand-drawn look** — sloppiness is an app-wide preference (Architect / Artist / Cartoonist), set once in Preferences.
- **Export** — PNG, SVG, or JPG.
- **Local-first storage** — automatic autosave to your browser (IndexedDB) plus open/save of standard `.excalidraw` files. *(Google Drive sync is planned.)*
- **Private & offline by default** — everything runs in your browser. No accounts, no telemetry, self-hosted fonts, no external network requests.

---

## Run it — download and go (no build tools needed)

The entire app is just a folder of static files (`dist/`). You only need Node/npm to *build* flow, never to *run* it.

1. **Get a `dist/` bundle** — either:
   - Download the latest prebuilt bundle from the [**Releases**](https://github.com/bobtherobot/flow/releases) page, **or**
   - Build your own (see [Build from source](#build-from-source)).
2. **Serve the contents of `dist/`** from any static web server.

> ⚠️ It must be served over **HTTP(S)** — opening `index.html` straight off disk (`file://`) will not work, because browsers block ES-module scripts loaded from the filesystem.

Serve it locally with any of:

```bash
npx serve dist                    # Node — zero install beyond npx
python3 -m http.server -d dist    # Python 3
# …or, from a clone of this repo:
npm run serve                     # builds, then serves at http://localhost:4173
```

**Deploy to your own server:** upload the *contents* of `dist/` into any folder on your host (a subfolder is fine — all paths are relative). See [DEPLOY.md](DEPLOY.md) for cPanel/Apache specifics, cache headers, and per-deployment configuration.

---

## Configuration

Runtime settings live in `dist/config.json` and can be edited **in place on the server — no rebuild required**:

```json
{
  "appName": "Flow",
  "googleClientId": "",
  "driveFolderName": "My Drawings"
}
```

| Key | Purpose |
| --- | --- |
| `appName` | Name shown in the window title and About dialog. |
| `googleClientId` | Google OAuth client ID. Leave empty to keep Drive sync disabled. |
| `driveFolderName` | Destination folder for Google Drive sync (when it lands). |

---

## Build from source

flow is built on a **fork of Excalidraw**, vendored as a git submodule at `vendor/excalidraw` and compiled locally (rather than the prebuilt npm package). This lets flow customize Excalidraw's internals while still shipping a single self-hosted bundle.

**Requirements:** Node **20–22** (the Excalidraw fork rejects newer Node; `.nvmrc` pins Node 22) and Git.

```bash
git clone https://github.com/bobtherobot/flow.git
cd flow
git submodule update --init      # pull the Excalidraw fork source
nvm use                          # Node 22 (required to build the fork)
npm run build:excalidraw         # compile the fork
npm install                      # link the built fork + install deps
npm run build                    # → ./dist
```

Bundle the ~12.7 MB CJK font set for fully-offline Chinese text:

```bash
INCLUDE_CJK=1 npm run build
```

The vendored fork's build output is git-ignored, so `npm run build:excalidraw` must be re-run after a fresh clone and whenever you edit files under `vendor/excalidraw/`. Full setup notes and troubleshooting are in [DEPLOY.md](DEPLOY.md).

---

## Development

```bash
npm run dev        # hot-reloading dev server → http://localhost:5173
npm test           # unit tests (Vitest)
npm run test:e2e   # end-to-end tests (Playwright)
npm run typecheck  # type-check (tsc --noEmit)
npm run preview    # serve an existing production build
```

---

## How it works

- **Frontend:** React 19 + Vite, compiled into one `app.js` / `app.css`. A relative asset base (`base: "./"`) means the bundle runs from any folder or subfolder without reconfiguration.
- **Rendering:** a forked `@excalidraw/excalidraw` (submodule), with fonts copied into the bundle so there is no runtime CDN dependency.
- **Storage:** browser **IndexedDB** for autosave plus local `.excalidraw` file import/export. Google Drive sync is planned. There is no server component — all state lives in your browser.

**Stack:** React 19 · TypeScript · Vite 6 · Radix UI · idb · Excalidraw (forked). Tested with Vitest and Playwright.

---

## Roadmap

- Layers panel
- Google Drive sync

---

## Credits

Built on the excellent [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT). flow tracks its own fork at [bobtherobot/excalidraw](https://github.com/bobtherobot/excalidraw).

## License

[MIT](LICENSE) © 2026 Mike Gieson.
