# Quick arrows — design

**Date:** 2026-08-25
**Status:** Approved, ready for planning

## Goal

Add four fat, light-blue, semi-transparent arrow affordances around a hovered
shape. Press one and drag, and you draw an elbow arrow from that shape to
wherever you release — bound at both ends if you land on another shape —
without ever picking up the arrow tool.

This is the standard "quick connect" affordance from FigJam/Miro/draw.io,
which flow currently lacks: connecting two shapes today costs a tool change,
a drag, and (because flow forces tool lock permanently on) a tool change back.

## Scope, as decided

| Decision | Value |
|---|---|
| Shown for | A **single** bindable element under the pointer |
| Trigger | **Hover** — no selection required |
| Tool gate | Only when the *effective* tool is selection (see "Tool gate") |
| Gesture | **Drag only** — a click that never moves does nothing at all |
| Arrow type | **Always elbow.** No preference, no modifier override |
| Start | Bound to the source shape, at the grabbed edge's midpoint |
| Drop on a shape | End bound to it |
| Drop on empty canvas | Arrow kept, end unbound — exactly what the arrow tool does today |
| Rotation handle | Relocated to the upper-right corner (mockup option 2) |

Not in scope, deliberately: click-to-duplicate-a-shape (the FigJam behaviour
where clicking an arrow drops a copy in that direction), a shape picker on
release over empty canvas, quick arrows on multi-selection, and quick arrows
on non-bindable elements (arrow/line/freedraw). Each was considered and
declined; see "Rejected".

Reference mockups: `working/quick arrows.png` (rotation at top-center) and
`working/quick arrow option 2.png` (rotation at the corner — the one chosen).

## The load-bearing question, answered by spike

The whole design turns on one question: **how does a flow-owned DOM overlay
start a *real* Excalidraw arrow-draw gesture?** Everything valuable about
drawing an arrow — binding, elbow routing, the binding highlight, snapping,
escape-to-cancel, single-entry undo — already lives in vendor. Reimplementing
any of it in flow would mean maintaining a second, worse copy of
`updateElbowArrowPoints` forever.

The answer: the overlay **synthesizes one `pointerdown` and dispatches it on
`canvas.interactive`**, then gets out of the way. This works because vendor's
`handleCanvasPointerDown` (`vendor/…/excalidraw/components/App.tsx:8423`)
registers its move/up listeners on **`window`**, not on the pointerdown target
(`App.tsx:8919`). So one synthetic event is enough to hand the entire rest of
the gesture — driven by the user's genuine pointer — to vendor.

This was **measured, not assumed.** A throwaway Playwright spike (written to a session scratchpad outside the
repo, deliberately not committed) installed a real DOM button over the canvas, drove it with Playwright's real mouse, and asserted on
the resulting scene:

| Probe | Result |
|---|---|
| Synthesized `pointerdown` starts a real gesture | **Yes** — `type: "arrow"`, `elbowed: true`, 4-point elbow route |
| Start binds to the source shape | **Yes** — `startBinding.elementId` === the rect's id |
| `setPointerCapture` with a transferred `pointerId` (`App.tsx:8470`) | **No error** — zero `pageerror` events across the gesture |
| Drop on a second shape | **Yes** — `endBinding.elementId` === the drop target |
| Undo | **One** Ctrl+Z removes the whole arrow — vendor's own batching, nothing to add |
| Active tool after release | Still `"arrow"` — **restore is mandatory**, see below |
| Dispatching in the same tick as arming the tool | **Fails** — `activeTool` was still `"selection"` at dispatch and no arrow was created |

That last row is why step 4 of the gesture waits a frame, and it is the single
least obvious thing in this design.

### Alternatives rejected

- **Pass vendor the real event through a new API method.** flow already owns
  two additive `ExcalidrawImperativeAPI` methods (`redrawBoundText`,
  `executeAction`), so the pattern exists. But it needs an *origin override*
  threaded into `pointerDownState`, i.e. into vendor's gesture state machine —
  a materially larger and more rebase-fragile edit than the zero this approach
  costs. Kept as the fallback if the synthetic route ever breaks on a rebase.
- **flow owns the whole drag.** Rejected: elbow routing and binding focus/gap
  are not exported at the level this would need.

## Geometry

### The one fork edit: rotation handle → upper-right corner

`getTransformHandlesFromCoords`
(`vendor/…/element/src/transformHandles.ts:200`) currently places the rotation
handle at top-center, `ROTATION_RESIZE_HANDLE_GAP` (16) above the bounds. It
moves to a diagonal offset outside the NE corner.

This is cheap in a way that matters: `resizeTest` and flow's existing
rotate-cursor edit both read `getTransformHandlesFromCoords`, so **hit-testing
and the cursor follow automatically** — one site, not three. It applies to the
multi-selection bounding box too (same function), which keeps single and
multi-selection consistent.

`SELECTION_SPACING` is 0 in flow (`common/src/constants.ts:225` — flow's tight
selection chrome), so "the bounds" and "the selection rectangle" are the same
line here.

Why relocate at all, given the arrows are hover-driven and the rotation handle
only exists on *selected* elements? Because hovered-and-selected is the common
case — you select a shape, then connect it — and in that state a top-center
rotation handle and a top quick arrow compete for the same pixels. Keeping
rotation at top-center would force every arrow outward to clear it (mockup
option 1), giving every selected shape a wide halo on all four sides. Moving
one handle instead lets all four arrows hug the bounds.

**Guard:** a flow unit test asserts the rotation handle's x now sits beyond the
element's right edge. That is the rebase alarm — a submodule rebase that drops
the edit fails a test rather than silently restoring the collision.

### Anchors

Each arrow anchors at the N/E/S/W midpoint of the element's bounds, offset
outward by a fixed **screen-space** distance of **14px** from the bounds to the
triangle's base, with a triangle roughly **18px** wide and **12px** deep. Those
three numbers are the starting point, tunable during implementation against the
mockup; nothing else in the design depends on their exact values. Screen-space,
not scene-space:
like `ShapeHandles`' fixed 10px dot, the affordance stays the same physical
size and the same physical distance out at every zoom level, so it is equally
grabbable zoomed in or out.

On a rotated element the anchor rotates about the element centre (reusing the
`rotateAboutCenter` convention from `src/ui/shapes/ShapeHandles.tsx`) and the
triangle glyph rotates with it, so it always points away from the shape.

Below **20px** of viewport width or height, the arrows on that axis are
suppressed — otherwise a tiny shape disappears inside its own chrome.

## Hover model

`useHoverTarget` resolves the topmost bindable element under the pointer.

**The hit region is the element's rotated bounding box expanded by the halo,
as a single region.** This is not a detail — it is what makes the feature
usable. The arrows live *outside* the bounds, so if the region were the
element's own hit area, moving the pointer toward an arrow would dismiss it
before you reached it. One region covering shape *and* halo means the journey
from shape to arrow never drops the hover.

A **120ms** grace period on leave kills flicker at the region boundary.

**Deliberate divergence:** this is bounding-box hover, not Excalidraw's own hit
test — `getElementAtPosition` is an App private with no public equivalent. The
visible difference is a transparent-filled rectangle: Excalidraw does not treat
its empty middle as a hit, we do. For a "connect from this shape" affordance
that is the better behaviour (and matches FigJam), but it is a choice, not an
oversight.

Hidden for: non-bindable types (arrow, line, freedraw), locked elements,
multi-selection, while a linear element is being edited, and while any gesture
is in flight.

### Tool gate

The arrows appear only when the **effective** tool is selection.

The motivation is concrete: flow forces tool lock permanently on, so the
rectangle tool stays armed after you draw a rectangle. If the arrows showed
then, hovering a shape to draw beside it would pop four triangles up *and those
triangles would swallow the pointerdown meant for the canvas* — a misfire, not
just visual noise.

"Effective" costs nothing to implement. `useToolOverride` engages the Cmd/Ctrl
temporary-selection override by calling `api.setActiveTool({type: "selection",
locked: true})` (`src/ui/toolbar/useToolOverride.ts:113`), so during a hold
`appState.activeTool.type` genuinely **is** `"selection"`. Reading `activeTool`
covers both cases with one condition.

Two consequences, both bugs if missed:

1. **Holding Cmd without moving the mouse must reveal the arrows.** Hover
   cannot be derived from pointer events alone here, because the pointer is not
   moving. `useHoverTarget` retains the last pointer position and recomputes on
   `api.onChange`, so the tool change alone reveals them — and releasing Cmd
   hides them immediately.
2. **Releasing Cmd mid-drag must not yank the tool out from under vendor.**
   `useToolOverride.restore` fires on keyup and would switch back to (say) the
   rectangle tool while vendor is mid-arrow-drag. `useQuickArrowDrag` therefore
   owns the restore for the duration of its gesture, and `restore` early-returns
   while one is in flight. This is an intentional coupling between the two
   hooks and must be written as such, with a test.

## The gesture

`useQuickArrowDrag`, on pointerdown on a triangle:

1. `stopPropagation()` + `preventDefault()`. Capture `pointerId` and the
   currently active tool.
2. Compute the **edge midpoint of the grabbed side** in viewport coords.
3. Arm `currentItemArrowType: "elbow"` and
   `setActiveTool({type: "arrow", locked: true})`.
4. **On the next animation frame**, dispatch a `PointerEvent("pointerdown", …)`
   on `canvas.interactive`, carrying the original `pointerId` / `pointerType` /
   `button` / `buttons` and `clientX`/`clientY` at that edge midpoint, with
   `bubbles: true` so React's root-level delegation sees it. Vendor takes over.
5. A one-shot window `pointerup` handler:
   - If it fires **before** the frame elapses — a very fast click — it cancels
     the pending dispatch. Without this, vendor would receive a `pointerdown`
     with no matching `pointerup` and hang in drag state. This guard is also
     precisely what makes "a click does nothing" true.
   - Otherwise it restores the previous tool, selection and style-memory
     category, the way `useToolOverride.restore` already does (that restore's
     three-part shape — re-set the tool, put the selection back because vendor
     clears it, then reload the style-memory category through
     `styleMemory.reloadCategory` rather than a hand-rolled `updateScene` — is
     load-bearing and should be reused, not re-derived).

### Why the origin is the edge midpoint, not the pointer

Two independent reasons converge, and either alone would be sufficient:

1. **Binding.** `maxBindingDistance_simple`
   (`vendor/…/element/src/binding.ts:136`) is ~15px at zoom 1. The triangle
   sits further out than that, so a gesture originating under the user's actual
   finger would **silently fail to bind to the source shape** — the most
   important half of the feature, lost with no error.
2. **Heading.** An elbow arrow routes from its start heading. Originating at
   the grabbed edge's midpoint is what makes the top arrow produce an arrow
   that leaves upward. Originating at the pointer would not.

### Step 4's frame delay

React has not committed the tool change from step 3 by the time the pointerdown
handler returns, so a same-tick dispatch reaches vendor with `activeTool` still
`"selection"` — measured, and it produces a selection marquee instead of an
arrow. `requestAnimationFrame` is the portable fix and is what the spike
validated. `flushSync` from `react-dom` would make step 4 same-tick and is
worth trying during implementation, but rAF is the known-good baseline and the
early-pointerup guard in step 5 makes the one-frame window safe.

## Files

```
src/ui/quick-arrows/quick-arrow-geometry.ts   anchors, glyph rotation, hit region (pure)
src/ui/quick-arrows/useHoverTarget.ts         which element is under the pointer
src/ui/quick-arrows/useQuickArrowDrag.ts      arm → dispatch → restore
src/ui/quick-arrows/QuickArrows.tsx           the overlay
src/ui/quick-arrows/quick-arrows.css
src/App.tsx                                   mount
src/ui/toolbar/useToolOverride.ts             early-return on restore during a gesture
vendor/…/element/src/transformHandles.ts      rotation → NE corner   ← the one fork edit
e2e/quick-arrows.spec.ts
```

`QuickArrows` mounts as a **sibling of `<Excalidraw>`**, never inside `App` —
the same non-terminating-`onChange` constraint documented on
`useShapeSelection` and `useActiveTool`: a state bump driven by `onChange`
re-rendering `<Excalidraw>` makes its `componentDidUpdate` re-fire `onChange`,
looping forever.

The overlay follows `src/ui/shapes/ShapeHandles.tsx` closely: a
`position: fixed; inset: 0; pointer-events: none` container at `z-index: 80`
(below both rail tiers and the quickbar/bottombar), with each triangle a real
`<button>` at `pointer-events: auto`, positioned by `transform: translate(...)`
rather than `top`/`left` so pan and zoom move a compositor-friendly property.
Real buttons, with `aria-label`s ("Quick arrow up" …), keep the feature
keyboard-reachable and give e2e a stable handle.

Triangles are drawn with `clip-path`, filled from a CSS custom property at 50%
alpha so the colour is themeable in one place.

## Testing

**Unit (vitest).** The geometry module is pure and carries the bulk: anchors at
all four sides, rotated elements, the min-size suppression, the halo hit
region. Plus the fork-edit guard asserting the rotation handle now sits beyond
the element's right edge.

**e2e (Playwright)**, seeded from the spike's assertions:

- hover over a bindable shape shows four arrows; leaving hides them
- nothing shows for arrow/line/freedraw, locked elements, or multi-selection
- nothing shows while a drawing tool is armed; **holding Cmd/Ctrl without
  moving the pointer reveals them**; releasing hides them
- dragging from each of the four sides produces an elbow arrow whose
  `startBinding` is the source
- dropping on a second shape sets `endBinding`; dropping on empty canvas leaves
  the end unbound
- a click with no movement creates no element **and mints no undo entry**
- the previous tool is restored after release
- releasing Cmd mid-drag does not break the in-flight gesture
- the arrows track pan, zoom, element move, resize and rotate

## Risks

| Risk | Mitigation |
|---|---|
| A rebase changes vendor's pointer-down flow so window-level move/up listeners no longer apply | The e2e binding assertions fail loudly; fallback is the additive API method described above |
| A rebase drops the rotation-handle edit | Unit guard test on rotation handle x |
| Very fast click leaves vendor mid-drag | Early-pointerup cancel (step 5) plus an e2e test |
| Cmd released mid-drag restores the tool underneath vendor | `restore` early-returns during a gesture, with a test |
| Bounding-box hover disagrees with Excalidraw's hit test on transparent shapes | Accepted and documented above as a deliberate product choice |

## Rejected

- **Click-to-duplicate** (click the right-hand arrow → a copy of the shape
  appears to the right, connected). Genuinely useful for flowcharts, but drags
  in shape cloning, placement and collision rules, and style inheritance. The
  design leaves room for it: a click is currently a no-op, so adding a
  behaviour there later breaks nothing.
- **Shape picker on release over empty canvas.** A feature in its own right.
- **A `flow.quickArrowType` preference** (elbow/straight/curved). Declined in
  favour of always-elbow: no setting to persist, factory-reset, or test.
- **A modifier to override the arrow type.** Shift already constrains the drag
  angle, and flow has deliberately reduced Cmd/Ctrl to exactly one canvas
  meaning (see `[[tool-override]]`); adding a sixth meaning would undo that
  work.
- **Quick arrows on multi-selection.** Excalidraw has no notion of binding to a
  group, so what the start binds to would be arbitrary.
