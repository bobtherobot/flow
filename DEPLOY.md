# Deploying Wimp

Wimp builds to a fully static, self-contained bundle. There is no server, no
database, and no external CDN dependency at runtime.

## First-time setup (building from source)

Wimp is built on a **fork of Excalidraw**, vendored as a git submodule at
`vendor/excalidraw` and compiled locally (not the prebuilt npm package). This
lets us customize Excalidraw's internals while keeping a single self-hosted
bundle. First-time setup, or after cloning fresh:

```bash
git submodule update --init          # pull the Excalidraw fork source
nvm use                              # node 22 (see .nvmrc) — REQUIRED for the fork build
npm run build:excalidraw             # build the fork -> vendor/excalidraw/packages/excalidraw/dist
npm install                          # links the built fork via a file: dependency
```

> **Node version matters.** The Excalidraw fork builds only under **node 20–22**
> (upstream rejects newer node). `.nvmrc` pins node 22 for the whole project.
> wimp's own tooling tolerates newer node, but standardize on 22 to avoid surprises.

The fork's built `dist/` is git-ignored, so it must be rebuilt after a fresh
clone and whenever you change files under `vendor/excalidraw/` — re-run
`npm run build:excalidraw` (then restart `npm run dev`).

## Build

```bash
npm install
npm run build      # outputs to ./dist
```

`npm run build` also copies Excalidraw's Latin fonts into the bundle. To include
the ~12.7MB CJK (Chinese) font for offline CJK text:

```bash
INCLUDE_CJK=1 npm run build
```

## What's in `dist/`

```
dist/
├── index.html    # thin shell → references ./app.js and ./app.css
├── app.js        # the whole app (single stable filename)
├── app.css       # styles (single stable filename)
├── config.json   # runtime config — edit in place, no rebuild needed
├── .htaccess     # sends no-cache headers for app.js/app.css/config.json
├── assets/       # UI fonts
└── fonts/        # Excalidraw drawing fonts (self-hosted, no CDN)
```

## Upload to cPanel

1. Upload the **contents of `dist/`** into your target folder (e.g. `public_html`
   or `public_html/wimp`). Paths are relative, so any subfolder works.
2. Ensure `.htaccess` uploaded (it may be hidden — enable "Show Hidden Files" in
   File Manager). It keeps browsers from serving a stale `app.js` after updates.

### Updating later
Re-upload **`app.js`** (and `app.css` if styles changed). Nothing else moves.

### Configuring per deployment
Edit `config.json` directly on the server:

```json
{
  "appName": "Wimp",
  "googleClientId": "<your-google-oauth-client-id>",
  "driveFolderName": "My Drawings"
}
```

Google Drive sync (added in a later phase) stays disabled until `googleClientId`
is set and your domain is registered as an authorized JavaScript origin in the
Google Cloud console.

## Local preview of the production build

```bash
npm run preview
```

## Notes
- `.htaccess` uses Apache `mod_headers`. On non-Apache static hosts, configure an
  equivalent `Cache-Control: no-cache` on `app.js` / `app.css` / `config.json`.
- The app runs fully anonymously (local + IndexedDB storage). No account required.
