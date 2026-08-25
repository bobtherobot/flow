---
name: quick-arrows
description: "Hover-driven quick-connect arrows — the movement-gate click/drag fix, the focus loss, the gesture-vs-mount collision, and why the early false lead about pointerup mattered"
metadata:
  type: project
---

# Quick arrows (shipped 2026-08-25)

Hover a bindable shape with the selection tool in hand and four translucent
triangles appear at its edge midpoints; press one and drag to draw an elbow
arrow bound to that shape. Spec:
`docs/superpowers/specs/2026-08-25-quick-arrows-design.md`.

## flow does not draw the arrow

Once a press turns into a drag, the overlay arms the elbow arrow tool and
dispatches **one synthesized `pointerdown`** on `canvas.interactive`.
Everything after that is vendor's, because `handleCanvasPointerDown` registers
its move/up listeners on **`window`**, not on the pointerdown target — so
binding, elbow routing, the binding highlight, snapping, escape-to-cancel and
single-entry undo all come for free. This was measured by spike before the
design was written, not assumed. See [[flow-fork-strategy]] for why reaching
for vendor's own machinery beats reimplementing it.

## A click doing nothing is a movement gate, not a race — and the race version shipped a real bug

The design requires a plain click to be a total no-op. The first
implementation tried to detect a click by racing `pointerup` against the
`requestAnimationFrame` wait before the dispatch ("if pointerup fires first,
cancel"), on the assumption a real click is fast enough to win. **Measured: it
is not.** A frame is ~16.7ms; a real human click is 40-100ms. The cancel path
almost never fired, so every plain click quietly armed the tool and minted a
degenerate, start-only-bound arrow — reproduced at 0ms, 25ms, 45ms and 120ms
holds, every duration tested.

Fixed in `src/ui/quick-arrows/useQuickArrowDrag.ts`: nothing is armed —
no focus change, no tool change, no dispatch — until the pointer clears
`MOVE_THRESHOLD_SQ = 4` (same units and default as
`src/ui/panels/dock/useDrag.ts`'s threshold). The early-`pointerup` cancel
still exists in the code, but only as a secondary guard for a release inside
the one frame *after* movement is confirmed and arming has started — it is not
what makes a click a no-op, and no future edit should credit it with that.

One flag is the exception to "wait for movement": `beginToolGesture()` is
claimed at pointerdown itself, before movement is confirmed. `useHoverTarget`'s
120ms grace timer doesn't re-check the flag once armed, so waiting for `arm()`
to claim it leaves a window where a button is already held but the flag isn't
set — long enough for that timer to fire and unmount the very triangle
mid-gesture (measured: ~120ms after pointerdown). `onUnarmedEnd` releases the
flag again if the press never becomes a drag, so a genuine no-op click still
leaves `isToolGestureActive()` false when it's done.

## Four more things that are silent if you get them wrong

1. **The origin must be the grabbed edge's midpoint, not the pointer.**
   `maxBindingDistance_simple` (vendor `element/src/binding.ts`) is only ~15px
   at zoom 1, and the triangle sits further out than that — so a gesture
   starting under the user's finger **silently fails to bind to the source**,
   with no error and a plausible-looking arrow. It also gives the elbow route
   its outgoing heading (`quick-arrow-geometry.ts`'s `edgeMidpoint`).
2. **The dispatch must wait an animation frame, AND arming must `flushSync`.**
   Arming used to be assumed safe because React auto-flushes state from its
   own synthetic event handlers. It no longer is: `arm()` now runs from a
   plain native `window.addEventListener("pointermove", ...)` callback (a
   consequence of the movement gate above), where that auto-flush guarantee
   does not hold. Without wrapping the tool-arm in `flushSync`, the rAF can
   fire before the commit lands — sometimes in under a millisecond — and the
   dispatch reaches vendor with `activeTool` still `"selection"`, drawing a
   marquee instead of an arrow. Measured.
3. **The restore listener must be registered AFTER the dispatch, not at
   pointerdown.** Window `pointerup` listeners fire in registration order and
   vendor registers its own inside the dispatch; registering ours a frame
   earlier puts it first, switching the tool out from under the in-flight
   drag.
4. **Keyboard focus is not automatic.** The glyph's `preventDefault()` on
   pointerdown suppresses the focus transfer a genuine canvas pointerdown
   performs. Without an explicit `.focus({preventScroll: true})` on
   `.excalidraw-container` (called at arm time), focus stays on flow's own
   rail button and every subsequent keyboard shortcut — undo, Escape, Delete —
   is silently dead. The tell that isolated it: the arrow was present in
   `h.history.undoStack` while Ctrl+Z did nothing, proving the entry was
   captured and the keystroke never arrived. Same family of bug as the
   pre-existing one below, not the same bug.

## The gesture and the overlay's mount lifetime collided, twice

`useHoverTarget` hides the arrows while any button is held — first pass hid
them by *unmounting* the hovered triangle, which tore down the very listener
that restores the tool, mid-drag. Fixed by holding the hover target while
`isToolGestureActive()` is true, so the component now survives its own drag.

That fix removed the only cleanup path for a different failure. Vendor's own
missing-`pointerup` recovery (`maybeCleanupAfterMissingPointerUp`) calls its
stored handler **directly as a function**, never dispatching a DOM event — so
a `window` `"pointerup"` listener can never observe that path. While the
component still unmounted on hover-loss, an abandoned drag got cleaned up as a
side effect of the unmount. With the component no longer unmounting, an
alt-tab mid-drag stranded `gestureActive` **forever**, permanently disabling
the Cmd/Ctrl override's restore (`useToolOverride` early-returns whenever
`isToolGestureActive()`). Fixed by listening for `pointerup`, `pointercancel`
**and** window `blur` together (`GESTURE_END_EVENTS` in
`useQuickArrowDrag.ts`) — the same idiom `src/ui/panels/controls/useScrubDrag.ts`
already uses, whose own comment says plainly that neither pointerup nor
pointercancel is guaranteed to arrive.

## The rotation handle: tried on the corner, reverted — this branch has zero fork edits of its own

An earlier pass on this branch moved the rotation handle from above the top
edge to diagonally outside the NE corner (`ROTATION_HANDLE_CORNER_GAP` in
`packages/element/src/transformHandles.ts`) so the quick arrows could own the
edge midpoints without competing for the same pixels. **That broke rotation
itself and was reverted** (`git -C vendor/excalidraw revert 49b08582`). The
handle is back at vendor's stock top-centre position, build stage 9 (the
guard for the deleted edit) is removed, and the quick arrows were moved out
instead — `ARROW_GAP` went from 14 to 24 (`quick-arrow-geometry.ts`) so the
top glyph clears vendor's handle (`ROTATION_RESIZE_HANDLE_GAP = 16`) by 4px.

**Why it broke rotation, precisely — this is expensive knowledge, worth not
re-learning:** `rotateSingleElement` and `rotateMultipleElements`
(`vendor/excalidraw/packages/element/src/resizeElements.ts:203` and its
multi-element sibling) compute the element's new angle from the pointer's
**ABSOLUTE direction from the element centre** —
`angle = 5π/2 + atan2(pointerY - cy, pointerX - cx)` — with **no grab offset**.
That formula hard-codes the assumption that the handle sits due north of the
centre. Displace the handle anywhere else and grabbing it snaps the element's
angle instantly to the handle's angular offset from north, before the pointer
even moves. Measured on the NE-corner placement: **60.6°** on a 300×160 shape,
**73.8°** on 400×100, **45.3°** on 150×150 — the snap angle is aspect-ratio
dependent, so no single corrective constant can fix it; the fix has to change
where the angle comes from, not add a compensating offset.

The agreed follow-up (separate branch, not this one): **four-corner rotation
handles**, done by capturing a grab offset at pointerdown —
`offset = computed_angle_at_grab − element.angle`, subtracted every frame
— rather than per-corner geometry. That needs no corner identity, no gap
constant, and no zoom threading, and it fixes the same bug for *any* handle
placement, not just one corner.

`e2e/rotate-cursor.spec.ts` reflects the revert: `ROTATE_HANDLE` is back at
the top-centre point (650, 284) for its test box, and the invariant that used
to assert the top quick-arrow glyph *covers* that point now asserts the
opposite — the glyph's bounding box and the handle's rect must be disjoint.

The `895ada0e` rotate-cursor edit predates this branch and is unaffected. With
the corner-placement commit reverted, **`feat/quick-arrows` now contains zero
fork edits of its own** — every vendor-side thing this feature needed turned
out to be reachable without touching the fork. Worth knowing before assuming
this branch left a submodule diff behind.

## Deliberate divergence

Hover uses the element's **rotated bounding box expanded by the halo**
(`isInHaloRegion`), not Excalidraw's own hit test (`getElementAtPosition` is an
App private). A transparent-filled rectangle's empty middle counts as a hover
for us and does not for Excalidraw. That is the right call for a "connect from
here" affordance, and the halo has to cover the glyphs themselves
(`HALO = ARROW_GAP + ARROW_DEPTH`) or the arrows dismiss just as the pointer
travels toward them.

## Not built, on purpose

Click-to-duplicate-a-shape, a shape picker on drop-to-empty, a quick-arrow-type
preference, and quick arrows on multi-selection. A click is currently a total
no-op (see the movement-gate section above), so click-to-duplicate can be
added later without breaking anything already shipped.

## Known limitation

The arrows are mouse-only. The triangles are focusable buttons once rendered,
but nothing renders them without a pointer to hover with, so a keyboard-only
user cannot reach them. Hover-gating was a deliberate product decision (see the
spec); the gap is documented here, not hidden.

## Pre-existing flow bug found by this work, NOT fixed here

Ctrl+Z is dead after clicking any toolbar button, until the next canvas
interaction — focus sits on the rail button and Excalidraw's shortcut handling
only fires inside its own container. Reproducible with zero quick-arrow
involvement; this feature's own focus fix (above) only covers the path its own
gesture creates. Same family as the existing [[pending-followups]] entry about
Ctrl+Z going dead right after committing a panel number field — same root
cause shape (focus lands somewhere neither flow's dock handler nor
Excalidraw's own keydown listener covers), different trigger. Logged there.
