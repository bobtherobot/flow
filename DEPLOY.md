# Deploying Wimp

Wimp builds to a fully static, self-contained bundle. There is no server, no
database, and no external CDN dependency at runtime.

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
