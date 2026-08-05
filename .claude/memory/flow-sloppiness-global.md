---
name: flow-sloppiness-global
description: Global app-wide sloppiness setting — DONE (2026-07-07), lives in flow not the fork
metadata:
  node_type: memory
  type: project
  originSessionId: 687369f5-142d-41f6-a8fd-6cdef9cf7127
---

**DONE (2026-07-07).** The deferred sloppiness rework is implemented and merged onto branch `feat/desktop-menu-bar-preferences`. Sloppiness is now a single **app-wide preference** applied to all existing + new elements at once, replacing the old lock-to-Architect hack.

**Where it lives:** `File ▸ Preferences ▸ General ▸ Sloppiness` (radio: Architect/Artist/Cartoonist = roughness 0/1/2). Persisted in `localStorage` key `flow.sloppiness` (default 0).

**How it works:**
- `src/lib/roughness.ts` — `Sloppiness` type, `SLOPPINESS_LABELS`/`_ORDER`, `isSloppiness`, `normalizeRoughness(elements, target)` (target-parameterized, defaults to Architect).
- `src/app/preferences.ts` — `getSloppiness()`/`setSloppiness()` (localStorage, corrupt/out-of-range → default).
- `src/App.tsx` — `sloppiness` state + `sloppinessRef`; `handleChangeSloppiness` writes the pref and live-applies `normalizeRoughness(getSceneElements(), next)` + `currentItemRoughness`; the `onChange` normalizer and `applyContentsToScene(api, contents, target)` both use the current target.
- The old CSS `:has()` rule hiding Excalidraw's per-object sloppiness fieldset is **kept** (the per-object picker stays hidden; control is global only).

**Key divergence from the earlier prediction:** this did NOT land in the fork. It's **100% flow-level** — no `vendor/excalidraw/` edits — per the feature's global constraint. So the note in [[flow-fork-strategy]] about moving the sloppiness lock "into the fork cleanly" is superseded: the clean home turned out to be a flow preference + the public `excalidrawAPI`, not a fork change. Shipped as part of the desktop menu-bar feature (see [[flow-desktop-menu-bar]]).
