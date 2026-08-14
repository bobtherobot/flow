---
name: parametric-shapes
description: "Ten flow shapes drawn as rectangle carriers with customData.flowShape — why rectangle, the four fork sites, and the hit-test/handle traps"
metadata:
  type: project
---

# Parametric shapes

Shipped 2026-08-14 (branch `feat/parametric-shapes`, 12 tasks). Spec:
`docs/superpowers/specs/2026-08-13-parametric-shapes-design.md`. Plan:
`docs/superpowers/plans/2026-08-13-parametric-shapes.md`. Full build ledger
(now deleted): `.superpowers/sdd/2026-08-13-parametric-shapes/progress.md`.

Ten shapes — triangle, star, cylinder, cube, parallelogram, fat arrow, cloud,
trapezoid, tape, summing junction — added to the shapebar (`SHAPES` in
`src/ui/toolbar/tools.ts`), which now holds 16 tools total: the pre-existing
arrow×3 + rectangle + diamond + ellipse, plus these ten. See
[[vertical-toolbar]] for the toolbar/shapebar split itself. Each shape is an
ordinary Excalidraw `rectangle` element carrying `customData.flowShape =
{ kind, p }`, `p` a `Record<string, number>` of parameters normalized 0..1 as
fractions of the element's own box.

## Why the carrier is a rectangle, not a polygon line

**This is the single most important fact in this file.** `isBindableElement`
(`vendor/excalidraw/packages/element/src/typeChecks.ts`) covers `rectangle`,
`diamond`, `ellipse`, `image`, `iframe`, `embeddable`, `frame`, `magicframe`
and unbound `text` — and explicitly excludes `line`. The rejected alternative
design (a closed polygon `line` element with `polygon: true`) would have
needed **zero fork edits anywhere** — but a `line` can never be an arrow's
`endBinding.elementId` target, full stop, no matter how correct its geometry
is. Every shape is a `rectangle` skin specifically so `e2e/shapes.spec.ts`'s
"an arrow ending inside a triangle binds to it" test can exist at all, let
alone pass. If the carrier type is ever revisited, that test is the one that
will fail first.

**Geometry never leaves the box.** A shape's `points`/`path` are always
computed from `(w, h, p)` in local 0..w/0..h coordinates, never absolute
scene coordinates. Break this and bounds, snapping, export and selection
chrome (which all read `x, y, width, height` and assume geometry lives
inside it) go wrong silently, not loudly.

## The four fork sites, by file

1. `packages/common/src/flowShapes.ts` — the registry itself:
   `registerFlowShape`, `getFlowShapeGeometry` (returns `null` for anything
   unregistered, absent `customData.flowShape`, a non-string `kind`, or
   fewer than 3 resulting points — never throws), `clearFlowShapes`.
2. `packages/element/src/shape.ts` — render dispatch, the `rectangle` case
   only (guarded so diamond/ellipse/embeddable are untouched).
3. `packages/element/src/distance.ts` — outline hit-test
   (`distanceToRectanguloidElement`), used by click-to-select.
4. `packages/element/src/collision.ts` — interior hit-test
   (`intersectRectanguloidWithLineSegment`, which backs both
   `isPointInElement` — arrow binding's real containment test — and the
   filled-shape click path).

Sites 3 and 4 both dispatch through one shared `getFlowShapeSides` helper in
`packages/common`, so hit-testing and binding can't drift apart from each
other.

**Why `packages/common`, not `packages/element`:** `packages/element`
already depends on `@excalidraw/common` (declared in its `package.json`),
and `packages/utils/src/shape.ts` (home of `getPolygonShape`, the plan's
originally-intended-but-wrong hit-test site — see below) also imports from
`@excalidraw/common` at runtime. Every consumer already points at `common`;
putting the registry in `element` instead would mean `common`-adjacent code
importing forward into `element`, inverting the dependency graph. `common`
is upstream of everything that needs it.

**`npm run build:excalidraw` after every vendor change, or nothing sees it**
— `dist/` is gitignored and flow's own `tsc`/Vite resolve `@excalidraw/*`
packages from the built `dist/`, not from `vendor/excalidraw/packages/*/src`
directly.

## The hit-test site the plan got wrong

The plan named `getPolygonShape` (`packages/utils/src/shape.ts`) as the
hit-test site. **It is not on the click-to-select path at all** — proven
empirically with a grid-scan probe against `app.getElementAtPosition` on a
rebuilt dev build showing the hit region stayed a perfect box even with that
function patched. The real path is `App.hitElement` →
`distanceToElement` → `distanceToRectanguloidElement` (site 3 above), which
builds sides from `x/y/w/h` via `deconstructRectanguloidElement`
(`packages/element/src/utils.ts`).

**`deconstructRectanguloidElement` must never be patched.** It also feeds
`bounds.ts` (element bounds) and `binding.ts` (a bindable element's focus
point) — patching it would shrink a star's *reported* bounds down to its
point extent, moving its resize handles off the visible box and breaking the
inscribed-geometry contract the orange-dot handle overlay depends on (every
handle's `at()` is defined in terms of the box, not the point extent).
`distance.ts`/`collision.ts` were extended instead, leaving
`deconstructRectanguloidElement` and `bounds.ts`/`binding.ts` untouched.

## Known limitation: four features still see the box

`getElementLineSegments` (`bounds.ts`) tests `_isRectanguloidElement`
*before* its polygon branch, and that predicate is true for every rectangle
— so **bucket-fill, frame containment, lasso-select and eraser all still
operate on the bounding box for flow shapes**, not the real outline. Fixing
it means reordering that branch, which would newly route four unrelated
features through flow outlines — a real behavior change, deliberately not
taken in this project.

## The concave-offset gate

The binding-gap miter inside `getFlowShapeSides` is exact only for convex
outlines; at reflex vertices it produces self-intersecting inward spikes
(safe — no NaN/crash — but geometrically wrong). Four shapes are concave:
star, cloud, fat arrow, tape. The function detects concavity via
cross-product sign changes and falls through to the plain box path whenever
`offset !== 0` *and* the outline is concave — `offset === 0` (plain
click-select) always gets the real outline regardless of convexity; only the
binding-gap miter degrades.

## The `ShapeCache` trap

`mutateElement` calls `ShapeCache.delete(element)` **only** when
`width`/`height`/`fileId`/`points` change. A `customData`-only write bumps
`version` and sets `didChange`, but never invalidates the cache — so a
handle drag that rewrites `customData.flowShape.p` in place on the same
element object visually freezes while the underlying data updates. Every
handle drag mints a fresh element object (`newElementWith` /
`updateScene({ elements: [...] })` with a new object literal) instead — a new
object is simply absent from the `WeakMap`, so this is a guaranteed cache
miss, not a fix for a bug that could otherwise be triggered.

## The handle lesson

A `HandleDef`'s `at(w, h, p)` must be verified against the geometry's
**drawn** vertices (the actual `points`/`path` coordinates), never against a
parameter's nominal meaning. Round-trip tests (`at` then `from` then `at`
again) are structurally blind to a consistently-wrong pair, because a wrong
`at` and its matching wrong `from` invert each other perfectly. This is how
the cylinder's `cap` handle almost shipped: the plan's `at = [w/2, cap*h]` is
the cap ellipse's *centre*, which lies on neither drawn arc (the front arc's
apex at `x=w/2` is `y = 2*cap*h`; the silhouette's own peak at `x=w/2` is
always `y=0`, invariant to `cap`, i.e. a dead handle). Every round-trip test
passed anyway. `handles.test.ts` now has a data-driven assertion that every
handle's `at()` lands within `1e-6` of an actual drawn vertex — parsed from
`geometry().points` plus every `M`/`L` coordinate in `geometry().path` —
which was proven to fail against the old (wrong) cylinder handle by
reverting it and confirming the new test alone catches it. This generalizes
to every future shape automatically.

## The two `appState` traps

Adding `currentItemFlowShape` (the shape a newly-armed shapebar tool stamps
new rectangles with) required both:

- **`FLOW_GLOBAL_APP_STATE_KEYS`** (`src/lib/flow-app-state.ts`) — so a
  saved document can't clobber it on open, same protection every other
  flow-owned global gets.
- **`flowSeedAppState`** — the shared seed both `initialData` (mount) and
  File ▸ New read, or a fresh/new scene loses the field's default entirely.

And **every non-shape tool must explicitly clear `currentItemFlowShape`**,
or the next plain rectangle drawn after using a flow-shape tool gets stamped
with the previous shape's `kind` by accident.

## Two pre-existing bugs found along the way (not caused by this project)

- **Transform panel Width/Height throw `scene.getNonDeletedElementsMap is
  not a function`.** The throwing call is inside **vendor** code reached
  from flow's resize path (verified by grep: no occurrence of that method
  name anywhere in `src/`) — do not trust an attribution to
  `TransformPanel.tsx` or `lib/transform.ts`; likely fallout from the
  2026-08-11 Excalidraw upgrade (see [[excalidraw-upgrade]]). Not fixed
  here. This is why Task 12's "resize keeps it a shape" e2e test drags the
  native corner transform handle directly rather than using the Transform
  panel's numeric fields.
- **Cloud facets under-sample at large sizes** (6 samples per bump). Worth
  revisiting because `points` doubles as the hit-test outline, so more
  samples would improve fidelity and hit accuracy together, not just visual
  smoothness.

## e2e coordinate gotcha: page-viewport ≠ scene coordinates

The canvas is inset by the rails (`offsetLeft`/`offsetTop` in `appState`,
124px/36px in this app's default layout), so `element.x/y` is **not** equal
to the page-viewport pixel you dragged from. This never broke any test in
`e2e/shapes.spec.ts`, because every test draws *and* clicks/drags in the
same page-viewport coordinate frame — the same `screenToScene` transform
applies both times, so box-relative math (e.g. "the triangle's apex is at
the drawn box's top-mid point") stays internally consistent. It only bites
if you read `element.x/y` back and reason about it in page-viewport terms
directly (as a throwaway resize-handle debug probe here briefly did).

## Task 12 (e2e proof) notes

- **Arrow-binding test**: draw a triangle, draw an arrow from well outside
  its box to a point deep in its interior (not just past an edge — the
  centroid), assert `endBinding.elementId` is the triangle's id. Passed on
  the first real run once the geometry above was understood; this is the
  test that retroactively justifies every fork edit in this project.
- **Save/reload test**: this app does **not** restore the scene from a bare
  `page.reload()` — there's no `initialData` element restore and no
  auto-reopen of the last document, unlike the `flow.*` appState
  preferences other specs reload-test. Proving persistence for real means
  File ▸ Save (Store internally, IndexedDB) → reload → File ▸ Open → find
  the shape by `kind` and compare its dragged parameter. This is a stronger
  test than an in-memory scene check: it round-trips `customData.flowShape`
  through actual JSON serialization.
- **Resize test**: flow's tool lock keeps a shape tool armed after drawing
  (Illustrator-style, not vanilla Excalidraw) — switch to Selection before
  grabbing a resize handle, or the next drag draws a second, smaller shape
  instead of resizing the first one (this is exactly what happened on the
  first draft: `width`/`height` came back unchanged because `.at(-1)` was
  reading a freshly-drawn 100×100 shape, not the resized original). No
  reselect click is needed once Selection is active — the just-drawn
  element stays selected across a tool switch on its own — and a reselect
  click is actively wrong for a transparent shape's hollow interior, since
  a click that misses the real outline deselects instead of refocusing
  (this broke the cylinder handle-drag test in the same draft, for the same
  underlying reason: clicking the *box* edge instead of the shape's real
  outline). The corner handle itself is exact, not approximate: flow's tight
  selection chrome (`SELECTION_SPACING = 0`, see [[drawing-defaults]]) means
  the 8px `se` resize handle is centered exactly on the element's bounding
  corner, so the same page-viewport point used to draw the box's corner can
  be reused verbatim to grab its resize handle.
- **Unregistered-kind test**: stamped via the same vendor test hook
  (`window.h.app.updateScene`) the existing hit-test tests already used —
  `getFlowShapeGeometry` returns `null` for it, the renderer falls back to
  the plain rectangle, and it stays selectable via its box outline.

See also [[flow-fork-strategy]] (general fork discipline),
[[flow-global-appstate]] (the appState protection mechanism),
[[drawing-defaults]] (`SELECTION_SPACING`), [[vertical-toolbar]] (the
shapebar the ten tools live in).
