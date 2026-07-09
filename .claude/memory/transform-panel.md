# Transform sub-panel (W/H/X/Y/rotation + radius/padding)

Controls-dock sub-panel for numeric editing of a selected element. Pinned at the
TOP of the accordion (above Color). **All 3 phases shipped 2026-07-09**:
W/H/X/Y/rotation, corner radius, text padding.

## Phase 1 — shipped (X/Y/W/H/Rotation)
- `src/ui/panels/TransformPanel.tsx` — five `NumberInput`s (Size W/H, Position
  X/Y, Rotation°) + Radius/Padding rows that are **always disabled** (Phase 2/3
  stubs). Single-selection only: empty/multi greys everything (`soleSelected`).
  W/H greyed for `text`; Rotation greyed for `frame`.
- Registered FIRST in `PanelsRoot.tsx` `defs` → fresh layouts show it on top.
  NOTE: existing persisted `flow.dock` layouts APPEND it at the BOTTOM
  (`panel-dock-state.syncPanelDefs`); drag it up or reset layout. e2e uses a
  fresh context so it asserts top position.
- **X/Y/rotation** write immutably via the shared `sel.update` (one undo step).
  The renderer recomputes bound-text position from the container each frame
  (`renderElement.ts` getContainerCoords/getBoundTextElementPosition), so move
  needs only the container x/y; rotation also sets the bound text's own `angle`
  (find text whose `containerId===id`).
- **W/H** reuse Excalidraw's real resize (linear points, bound-text reflow,
  roundness) — see fork + `src/lib/transform.ts`.
- `.flow-ctl-axis` CSS (panels.css) = the small W/H/X/Y letter before each field.

## Fork change (Phase 1) — ONE additive export
- `vendor/.../packages/excalidraw/index.tsx`: `export { resizeSingleElement }
  from "./element/resizeElements"` (mirrors the getSearchMatches "flow addition").
- Typed flow-side in `src/excalidraw-fork.d.ts` (module augmentation; the esbuild
  dist doesn't regen `.d.ts`). Signature is generic `<T>` over element+maps.
- `resizeSingleElement(w,h,latest,orig,elementsMap,origMap,dir,opts)` is
  **scene-free** — needs only element maps + a handle dir ("e"=width/"s"=height,
  both anchor top-left). `src/lib/transform.ts resizeElementDimension` clones
  elements into two maps, runs it (mutates the `map` clones in place), and pushes
  the new array via `updateScene({captureUpdate: IMMEDIATELY})`.
- **Rebuild:** `cd vendor/excalidraw/packages/excalidraw && node
  ../../scripts/buildPackage.js` (esbuild; builds BOTH dist/dev + dist/prod, fast,
  Node 25 worked). Skips the slow `yarn gen:types`. Verify the symbol lands:
  `grep resizeSingleElement dist/prod/index.js`.

## Testing notes
- `TransformPanel.test.tsx`: **must `vi.mock("../../lib/transform")`** — importing
  `resizeSingleElement` from the barrel pulls Excalidraw runtime (ImageExportDialog
  getContext) that dies under jsdom. Unit tests cover render/disabled + x/y/angle
  (pure `sel.update`); W/H resize is e2e-only.
- `e2e/transform-panel.spec.ts`: drives real resize/move/rotate; asserts the field
  re-reads the element after `blur` (value sticks ⇒ mutation stuck). `getByLabel`
  needs `{exact:true}` ("Width" ⊂ Stroke panel "Stroke width").
- Full suite green: 309 unit + 61 e2e.

## Phase 2 — corner radius — shipped 2026-07-09
Numeric radius for rectangle/diamond + elbow arrow (ellipse/plain-arrow/text
greyed). Added a per-element `cornerRadius?: number`.
- **Fork (4 edits, then rebuild):**
  1. `element/types.ts` `_ExcalidrawElementBase` — `cornerRadius?: number` (base,
     so all element types carry it).
  2. `shapes.tsx getCornerRadius` — at the TOP, `if typeof cornerRadius ===
     "number" return max(0, min(cornerRadius, x/2))` (exact radius, capped at half
     the short side; overrides the roundness presets).
  3. `scene/Shape.ts:448` — `generateElbowArrowShape(points, element.cornerRadius
     ?? 16)` (was hardcoded 16).
  4. `data/restore.ts` — one line `cornerRadius: element.cornerRadius` in the
     shared `base` of `restoreElementWithProperties`. Covers ALL types incl.
     arrows: the arrow branch passes its own object as `extra`, but `extra` lacks
     cornerRadius so it doesn't override base. (Verified in dist via grep.)
- **RENDER GATE:** rounded rect/diamond only render via `getCornerRadius` when
  `element.roundness` is truthy (Shape.ts:327/368). So the flow write sets BOTH:
  rect/diamond r>0 → `{cornerRadius, roundness:{type:2}}`, r=0 →
  `{cornerRadius:0, roundness:null}`; elbow arrows read cornerRadius directly →
  `{cornerRadius}` only (elbow path ignores roundness).
- **flow:** `src/lib/corner-radius.ts` (PURE — inlines ROUNDNESS ids 2/3 +
  consts, so NO barrel import → unit-testable under jsdom): `cornerRadiusApplies`,
  `effectiveCornerRadius` (explicit value, else mirrors getCornerRadius/elbow-16
  so the field shows what's drawn), `cornerRadiusUpdate`. TransformPanel wires the
  Radius row from these; write via `sel.update`.
- Rendering visually confirmed (rect rounds at 40; elbow corners tighten at 2).
  319 unit + 64 e2e green.

## Phase 3 — text padding — shipped 2026-07-09
Per-container `padding?: number` = gap before bound text wraps. Applies to shape
containers (rectangle/ellipse/diamond) that HOLD bound text (arrow labels use a
separate padding model — left alone).
- **Fork (3 edits, then rebuild):**
  1. `element/types.ts` base — `padding?: number` (next to cornerRadius).
  2. `element/textElement.ts` — `getContainerCoords` (text offset),
     `getBoundTextMaxWidth`, `getBoundTextMaxHeight`: non-arrow branches use
     `container.padding ?? BOUND_TEXT_PADDING` instead of the constant. (Left
     `element/textMeasurements.ts` min-size floors at default 5 — good enough.)
  3. `data/restore.ts` — one line `padding: element.padding` in the shared base.
- **REWRAP is the catch:** wrapped text is PRECOMPUTED and stored on the text
  element, so setting `padding` alone won't rewrap. `transform.ts
  setContainerPadding` sets padding on a clone then runs a SAME-SIZE
  `resizeSingleElement`, whose `handleBindTextResize` (resizeElements.ts:971,
  unconditional) rewraps the bound text against the new `getBoundTextMaxWidth`.
  One undo step.
- **flow:** `src/lib/padding.ts` (PURE): `paddingApplies` (container type + has
  bound text via `elements.some(e=>e.type==="text" && e.containerId===id)`),
  `effectivePadding` (value ?? 5). Panel wires the Padding row; write via
  `setContainerPadding`.
- Visually confirmed: padding 70 rewrapped a label to 3 tight lines (container
  auto-grew H). 323 unit + 66 e2e green.

## Number inputs commit on blur/Enter (2026-07-09)
ALL flow control number fields (`NumberInput`, `SliderInput`'s numeric field) now
commit via `onChange` only on **blur or Enter** — not per keystroke — so values
don't churn mid-typing. Escape reverts. Shared logic in
`src/ui/panels/controls/useNumberField.ts` (dedupes via a `committed` ref;
`cancelled` ref makes Escape's blur revert instead of commit). SliderInput's
range DRAG stays live. Test implication: unit tests must type then
`{Enter}`/`tab()` (typing alone no longer fires onChange); e2e uses `.fill()` +
`.blur()` (already did). Range-slider `.fill()` commits live (no blur needed).

## e2e gotcha — adding BOUND text
Double-clicking a hollow shape's interior makes a FREE text element, not bound.
To bind: draw shape (auto-selected) → **press Enter** → type → Escape → container
stays selected with the label bound (padding enabled). See `transform-panel.spec`.
