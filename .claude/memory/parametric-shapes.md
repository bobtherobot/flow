---
name: parametric-shapes
description: "Ten flow shapes drawn as rectangle carriers with customData.flowShape — why rectangle, the ten fork sites, and the hit-test/handle/fill traps"
metadata:
  type: project
---

# Parametric shapes

Shipped 2026-08-14 (branch `feat/parametric-shapes`, 12 tasks). Spec:
`docs/superpowers/specs/2026-08-13-parametric-shapes-design.md`. Plan:
`docs/superpowers/plans/2026-08-13-parametric-shapes.md`. Full build ledger:
`.superpowers/sdd/2026-08-13-parametric-shapes/progress.md`. **Final review
pass, same day**: a whole-branch review found six IMPORTANT-severity gaps
(this file's original "four fork sites" claim being one of them — see below)
plus several minor ones; fixed in
`.superpowers/sdd/2026-08-13-parametric-shapes/final-fix-report.md`.

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

## The ten fork sites, by file

**Correction (final review pass):** this file originally said "the four fork
sites" — that undercounted the real surface by more than half. A rebase
reader following the old list would have missed six real vendor edits. The
actual fork surface is ten files: the four geometry/hit-test sites below,
plus five more that wire the `currentItemFlowShape` appState field through
the app (types, re-exports, defaults, seeding, and two separate `App.tsx`
edit sites — element creation and the keyboard-shortcut branch).

1. `packages/common/src/flowShapes.ts` — the registry itself:
   `registerFlowShape`, `getFlowShapeGeometry` (returns `null` for anything
   unregistered, absent `customData.flowShape`, a non-string `kind`, or fewer
   than 3 resulting points), `clearFlowShapes`, and `getFlowShapeSides` (the
   shared hit-test/binding-offset geometry sites 3 and 4 both dispatch
   through). **Softening a claim in the previous version of this file: the
   guards here don't *throw* on bad input, but the registered geometry
   function itself is invoked unguarded** — a geometry function that throws
   for some `(w, h, p)` combination will still crash the render, this module
   just doesn't add a *second* way to crash on top of that.
2. `packages/element/src/shape.ts` — render dispatch, the `rectangle` case
   only (guarded so diamond/ellipse/embeddable are untouched); the site that
   turns a `flowShape`'s `points`/`path` into a rough.js drawable via
   `generator.polygon`/`generator.path`.
3. `packages/element/src/distance.ts` — outline hit-test
   (`distanceToRectanguloidElement`), used by click-to-select.
4. `packages/element/src/collision.ts` — interior hit-test
   (`intersectRectanguloidWithLineSegment`, which backs both
   `isPointInElement` — arrow binding's real containment test — and the
   filled-shape click path).
5. `packages/common/src/index.ts` — `export * from "./flowShapes"`, the
   barrel re-export that makes site 1's exports reachable at all from outside
   `packages/common`.
6. `packages/excalidraw/index.tsx` — re-exports `registerFlowShape`,
   `getFlowShapeGeometry`, `clearFlowShapes` at the public `@excalidraw/excalidraw`
   entry point flow's `src/ui/shapes/register.ts` actually imports from.
7. `packages/excalidraw/appState.ts` — `currentItemFlowShape: null` in the
   default appState object, plus its entry in the export-filter map (browser/
   export/server `false`) that keeps it out of serialized exports.
8. `packages/excalidraw/types.ts` — the `currentItemFlowShape?: { kind:
   string; p: Record<string, number> } | null` field declaration on
   `AppState` itself.
9. `packages/excalidraw/components/App.tsx`, **element-creation site**
   (`newElement`'s call site, ~line 10412) — stamps a newly-drawn
   `rectangle`'s `customData.flowShape` from `state.currentItemFlowShape`,
   guarded to `elementType === "rectangle"` so embeddables/the selection
   element are untouched. Deep-copies `{ kind, p: {...p} }` rather than
   handing out the appState object by reference (final-review fix — see
   below).
10. `packages/excalidraw/components/App.tsx`, **keyboard-shortcut site**
    (the `findShapeByKey` branch, ~line 5570) — a *fifth fork site added in
    the final review pass*: clears `currentItemFlowShape` whenever a
    keyboard shortcut activates a tool. Site 9 and flow's own
    `useActiveTool.setTool` (`src/ui/toolbar/useActiveTool.ts`) were the only
    two places that wrote this field before the review, and neither one is
    reachable from `App.tsx`'s own keyboard handler — pressing `R` after
    arming a shape from the shapebar left it armed, so the next plain
    rectangle silently inherited the last shape's `kind`. See
    `e2e/shapes.spec.ts`'s "pressing a tool's keyboard shortcut disarms a
    previously-armed flow shape" test.

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

## Known gaps, not fixed

Recorded here (final review pass) as the honest, current limitation list —
none of these are fixed by this project, deliberately:

- **Bucket-fill, frame containment, lasso-select and eraser all still operate
  on the bounding box for flow shapes**, not the real outline.
  `getElementLineSegments` (`bounds.ts`) tests `_isRectanguloidElement`
  *before* its polygon branch, and that predicate is true for every
  rectangle. Fixing it means reordering that branch, which would newly route
  four unrelated features through flow outlines — a real behavior change,
  deliberately not taken in this project.
- **The concave binding-gap fallback** — see "The concave-offset gate" above:
  four shapes (star, cloud, fat arrow, tape) get a box-shaped, not
  outline-shaped, arrow-binding gap whenever the binding offset is non-zero.
- **No keyboard route to any of the eight handle-driven parameters.** The
  orange dots are `<button>` elements and are Tab-focusable (real DOM focus
  order), but Enter/Space/arrow keys do nothing once focused — there is no
  keyboard equivalent of a drag. Mouse/touch only.
- **Flip (`Shift+H`) is a silent no-op on flow shapes.** The vendor's flip
  action transforms `points` for line/arrow elements and swaps other
  geometry-bearing fields for native shapes; it has no concept of
  `customData.flowShape`, so it does nothing and reports no error — a user
  pressing Shift+H on a triangle sees no visible change and no explanation.

## The concave-offset gate

The binding-gap miter inside `getFlowShapeSides` is exact only for convex
outlines; at reflex vertices it produces self-intersecting inward spikes
(safe — no NaN/crash — but geometrically wrong). Four shapes are concave:
star, cloud, fat arrow, tape. The function detects concavity via
cross-product sign changes and falls through to the plain box path whenever
`offset !== 0` *and* the outline is concave — `offset === 0` (plain
click-select) always gets the real outline regardless of convexity; only the
binding-gap miter degrades.

## Fill winding: multi-subpath `path` shapes fight the fill rule

**Not "solid = nonzero, pattern = even-odd" — canvas rendering is even-odd
for both.** roughjs's own canvas renderer (`roughjs/bin/canvas.js`,
`RoughCanvas.draw`) fills *any* `generator.path(...)`-based shape —
`fillStyle: "solid"` included — with `ctx.fill("evenodd")`; there is no
nonzero code path for a shape whose `drawable.shape === "path"`. Under
even-odd, an interior subpath (the cylinder's front-cap arc, the cube's
front-face crease lines) can render as a hole in the surrounding fill the
moment the shape has a non-transparent background — not just under pattern
fills, as an earlier draft of the design assumed.

**The fix, for both shapes: retrace interior detail so it encloses zero
area** (2026-08-14). An interior subpath only subtracts from an even-odd fill
if it *bounds* a region. Walk each interior line out and back over the
identical points and it bounds nothing: even-odd crosses every interior point
an even number of times and subtracts nothing, while the line still strokes
(twice, which under roughjs's sketchy stroke reads as a slightly firmer line,
not a doubled one). `cylinder.ts` emits its front cap as
`[...front, ...front.slice(0, -1).reverse()]`; `cube.ts` emits all three
interior lines as one retraced polyline. Both verified filled, hole-free, in
a real browser.

This superseded two earlier attempts worth knowing about, because both are
dead ends:

- **Point-order reversal (cylinder).** Reversing the front-cap subpath
  relative to the silhouette appeared to fix the cap-lens hole and was
  shipped that way. It was never a proven fix — a naive ray-casting argument
  says point order cannot matter under even-odd — and it left a gap near
  `cap`'s upper bound (verified at `cap: 0.42`) where the lens overlaps the
  bottom cap and a large fill gap reappears regardless of order. The retrace
  makes point order irrelevant.
- **Everything tried on the cube.** Reversing the front subpath, reversing
  the silhouette, rotating its starting vertex, and insetting it 20px so it
  shared no vertex or edge with the silhouette — every variant still rendered
  a hole, which is correct: a *closed* interior subpath is a hole under
  even-odd no matter how it winds. The mistake was trying to fix the winding
  of a bounded region instead of not bounding one.

Takeaway for any future shape with interior detail: **never close an interior
subpath.** Retrace it. Winding is the wrong lever; enclosed area is the right
one. And verify in a real browser — a filled render is the only thing that
shows this class of bug, and no unit test in this project would have caught
it.

## Cloud degenerates at non-square aspect ratios (fixed)

`cloud.ts`'s bump radius used to be a single scalar (`Math.min(rx, ry) *
0.32`) tied to the box's *short* axis, while the nine bump centres are placed
at equal *parametric* angle around the box's own aspect ratio. On a wide box,
consecutive centres near the long axis drift apart (their spacing scales with
the long axis) while a short-axis-derived radius stayed too small to bridge
the gap — the longest chord between consecutive outline points grew without
bound as the box widened (95.8px at 400x100, 180.6px at 600x60), a visibly
spiky polygon with flat notches. This is a **different defect** from the
"cloud facets under-sample at large sizes" note below — more samples cannot
close a 96px gap, because the underlying geometry has a real gap to close,
not an under-sampling artifact. Fixed by making the bump radius **per-axis**
(`bumpRx = rx * 0.32`, `bumpRy = ry * 0.32`) — at `w === h` this is pixel-
identical to the old formula, and at any aspect ratio it keeps the longest
chord proportional to the box's own perimeter instead of unbounded (verified
numerically and pinned by a `cloud.test.ts` assertion across square/wide/very
wide boxes).

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

**Grab offset (final review pass, `useHandleDrag.ts`).** The parameter used
to be derived straight from the pointer's absolute local position on every
move, with no memory of *where on the dot* the drag actually started —
pressing a few px off the dot's exact centre (still within its 10px hit
area) snapped the shape toward the pointer on the very first move instead of
preserving the grab point, the way dragging a real UI handle never
"teleports" the dragged thing to the cursor. Fixed by capturing the offset
between the pointer-down point and the dot's true `handle.at(...)` position
once, in `useDrag`'s `onStart`, and subtracting it from every subsequent
move. A dead-centre press yields a zero offset, so every existing drag test
(all of which happen to start dead-centre) was unaffected — the new test
specifically presses off-centre to exercise the fix.

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

**Sampled at defaults only is still structurally blind — a second class of
bug (final review pass).** The on-outline test above originally evaluated
`at()` at `def.defaults` only, so it never covered a handle that's only
*sometimes* wrong: deleting tape's crest-sampling fix (`crestTs` in
`tape.ts`) left the test green, because the default `wave: 0.5` happens to
put the crest exactly on `tape.ts`'s own uniform sample grid — most *other*
`wave` values then drift off the drawn outline by several percent of the box
height, untested. Fixed by sweeping every parameter a handle owns over
min/mid/max of its bounds (now readable as exported constants per geometry
module — see the clamp-bounds fix below) and asserting on-outline at every
combination (32 tests → 66). Verified to fail against both known-bad
handles: the tape regression above, and reverting the cylinder `cap` handle
back to the plan's dead `[w/2, cap*h]` formula.

**Clamp bounds used to be duplicated 2-3× per parameter** (the geometry
function's own clamp, plus the matching handle's `at`/`from`, sometimes
duplicated again in a comment) — ~20 duplicated literal pairs across eight
handles. Narrowing a geometry clamp without also updating its handle would
silently desync the dot from the drawn edge. Fixed by hoisting each
parameter's bounds into its geometry module as an exported constant (e.g.
`CYLINDER_BOUNDS`, `TAPE_BOUNDS`) plus a shared `clamp()` helper
(`geometry/bounds.ts`); `registry.ts`'s handles and `handles.test.ts`'s
parameter sweep both read the same constants. Parallelogram's `skew` is the
one deliberate exception: its handle clamps to a UI-only `SKEW_UI_MAX` (0.9)
tighter than the geometry's own 1.0 bound, kept as a separate named constant
rather than folded into `PARALLELOGRAM_BOUNDS` so the two different
decisions (true valid range vs. drag-reachability limit) stay visibly
distinct.

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
with the previous shape's `kind` by accident. Two sites write this field:
`useActiveTool.setTool` (the shapebar's own click handler) and, since the
final review pass, the vendor's keyboard-shortcut branch (fork site 10
above) — `findShapeByKey`-driven tool switches bypass `setTool` entirely, so
without that vendor edit a shape armed from the shapebar stayed armed after
pressing a plain tool's shortcut key.

## The quickbar had its own, separate arming bug (final review pass)

`src/ui/quickbar/actions.ts`'s `TOOL_ITEMS` — the quickbar's opt-in tool
buttons, built from the same `ALL_TOOLS` list the rails render from — dropped
`toolType`/`arrowType`/`flowShape` when mapping `ToolDef` to `QuickItem`.
Enabling a flow shape (or `arrow-curved`/`arrow-elbow`, pre-existing before
this project) from the quickbar's hamburger menu and clicking it called
`setActiveTool({ type: "triangle" })` — not a real Excalidraw tool type,
since every flow shape shares the vendor's `"rectangle"` tool and differs
only by the `currentItemFlowShape` kind — arming an inert tool that drew
nothing. Fixed by carrying `toolType`/`arrowType`/`flowShape` through
`QuickItem` and having `useQuickActions`' `trigger` call `useActiveTool`'s
own `setTool` (a second, independent subscription — safe because it's a pure
reactive read of `api`, not owned state) instead of duplicating the arming
logic. `useQuickActions.test.tsx` and `e2e/quickbar.spec.ts` both cover one
flow shape and one arrow variant end to end.

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
  smoothness. **Still open** — distinct from the aspect-ratio bug fixed above
  (that one was a real geometric gap no sample count could close; this one is
  a genuine faceting/resolution issue, present even on a square box, that
  more samples *would* improve).

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
