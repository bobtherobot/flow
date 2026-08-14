# Parametric shapes — design

**Date:** 2026-08-13
**Status:** draft

Ten new shapes join the shapebar — triangle, star, cylinder, cube,
parallelogram, fat arrow, cloud, trapezoid, tape and summing junction — seven of
them carrying draggable orange dots that reshape them. Each is an ordinary
Excalidraw element carrying flow's own geometry in `customData`, so arrow
binding, text labels, resize, snapping, undo and save all keep working natively.

Second of two specs. The first,
[the toolbar/shapebar split](2026-08-12-toolbar-shapebar-split-design.md),
built the rail these land in.

## Problem

flow's shapebar offers six shapes: three arrow variants, rectangle, diamond,
ellipse. Everything a diagram actually needs beyond that — a triangle, a
cylinder for a datastore, a cube, a cloud, a summing junction — has to be drawn
by hand out of lines, and cannot then be resized as a unit or bound to an arrow.

Upstream has none of these, and no concept of a shape with adjustable
parameters: `TransformHandleType` is eight directions plus rotation, and nothing
in the fork carries a user-adjustable geometry knob.

## The shape

### One carrier, parameters in `customData`

A triangle **is** a rectangle element. What makes it a triangle is:

```ts
type FlowShapeKind =
  | "triangle" | "star" | "cylinder" | "cube" | "parallelogram"
  | "fatArrow" | "cloud" | "trapezoid" | "tape" | "sumJunction";

interface FlowShape {
  kind: FlowShapeKind;
  /** Parameters as fractions of the element box, each clamped to 0..1. */
  p: Record<string, number>;
}

// element.customData = { flowShape: FlowShape }
```

`customData` is a first-class vendor field — declared on every element
(`packages/element/src/types.ts:88`), carried through `newElement`
(`newElement.ts:157`) and preserved by `restore` (`restore.ts:507-509`). Storing
parameters there costs **zero** fork edits and survives save, reload, copy,
paste and duplication for free.

Rectangle is the carrier for all ten, including the round ones. One carrier
means one dispatch site rather than one per type, and rectangle is a member of
`isBindableElement` (`typeChecks.ts:184-191`) — which is the whole point of the
choice. A shape built as a closed `line` element would have been zero fork
edits, but lines are not bindable and cannot hold bound text, so no arrow could
ever attach to a triangle. That trade decided the architecture.

### Parameters are normalized, and geometry stays inside the box

Every parameter is a fraction of the element's own width or height, so geometry
is recomputed from `(w, h, p)` on every render and **resize needs no code at
all**.

**The load-bearing rule: no shape's geometry leaves `[0, 0, w, h]`.** Bounds,
selection chrome, snapping, alignment, export and rotation are all inherited
from rectangle and stay correct only while this holds. The cube is drawn
inscribed — its front face is smaller than the box, with the extrusion filling
the remainder — rather than projecting outside it. Handle drags clamp to the
box for the same reason.

### The ten shapes

| Shape | Parameters | Dot means |
|---|---|---|
| triangle | — | — |
| star | `ir` inner radius, `rot` rotation | an inner vertex — sharpness and rotation together |
| cylinder | `cap` cap half-height | top of the cap ellipse (vertical only) |
| cube | `dx`, `dy` | the extrusion tip — depth and direction in one |
| parallelogram | `skew` | the top-left corner |
| fatArrow | `head`, `stem` | head corner **and** stem edge (two dots) |
| cloud | — | — |
| trapezoid | `inset` | the top-left corner |
| tape | `amp`, `wave` | the wave crest — amplitude and wavelength |
| sumJunction | — | — |

Seven shapes carry dots; eight dots in total. The star is fixed at five points:
a point count was not asked for, and adding one invents UI nobody requested.

The dot convention throughout: **the dot is a defining point of the outline**,
so dragging it moves that part of the shape directly, the way live shapes behave
in Illustrator and Figma. It is not an abstract slider and not a bearing in
degrees.

## Architecture

### Where geometry lives, and the seam that costs

Geometry functions live in flow's `src/ui/shapes/geometry/`, each a pure
`(w, h, p) => { points } | { path }`, and are registered into a small vendor-side
registry by a module-scope side-effect import that runs before `<Excalidraw>`
mounts.

The honest trade: this adds an injection seam and a startup-order rule that a
future reader can break silently. It buys fast iteration — ten geometries tuned
under flow's vitest with no `npm run build:excalidraw` per tweak — which is
where nearly all the work in this project actually is. An unregistered kind
falls back to drawing the plain carrier box, so a broken registration is a
visual fallback, never a crash or a blank canvas.

### The four fork edits

| Site | Change |
|---|---|
| `packages/element/src/flowShapes.ts` *(new)* | The registry: `registerFlowShape(kind, fn)`, plus a lookup that reads `element.customData?.flowShape` and returns geometry or `null`. Additive file — nothing upstream to conflict with on rebase. |
| `shape.ts:798`, `_generateElementShape` | In the `rectangle` case, a registered `flowShape` draws via `generator.polygon(points)` or `generator.path(d)` instead of the box. Diamond already renders exactly this way (`shape.ts:844-890`), so this is the established pattern. |
| `shape.ts:~1106`, `getElementShape` | The same dispatch for hit-testing. **Not optional**: without it a transparent triangle hit-tests on its invisible bounding-box edges — clicking the visible shape would miss, clicking empty space would hit. |
| `App.tsx` + `appState` | New `currentItemFlowShape` field, stamped into `customData` when a generic element is created. |

`ShapeCache` needs no invalidation work: it is a `WeakMap` keyed on element
object identity (`shape.ts:84`), and this project's existing rule is that
flow-added properties are written through `newElementWith`, which mints a new
object. The in-place `mutateElement` path already calls `ShapeCache.delete`.

### Two traps in the appState field

1. `currentItemFlowShape` must be added to **both** `FLOW_GLOBAL_APP_STATE_KEYS`
   and `flowSeedAppState`. The memory records what missing the second one did
   last time: File ▸ New wiped the seed, and the resulting mismatch made the
   onChange normalizer clone mid-drag, so boxes drew 0×0.
2. Selecting any non-shape tool must **clear** the field. Otherwise the next
   plain rectangle is silently stamped as whatever shape was last used — a bug
   that would look like random shapes appearing.

### The handle overlay

`ShapeHandles`, a flow-level component mounted as a sibling of `<Excalidraw>` —
never inside App, per the non-terminating-`onChange` rule that
`useSelectionStyle` and `useActiveTool` already follow.

It reads the selection through an onChange bridge and renders dots only for a
single, unlocked, `flowShape`-carrying selection. Scene→screen uses the public
`sceneCoordsToViewportCoords`, screen→scene the public
`viewportCoordsToSceneCoords` (both exported at `index.tsx:446-447`), and dot
positions rotate with the element's `angle`. A drag writes transient updates and
commits once on pointer-up, following the `scrub-numeric-inputs` batching
precedent so one drag is one undo entry rather than forty.

### Shapebar integration

Ten new `SHAPES` entries, each with an icon; the shapebar goes from 6 to 16
tools and stays two columns. `ToolDef` gains `flowShape?: FlowShapeKind`, and
`setTool` writes `currentItemFlowShape` before activating the `rectangle` tool —
structurally identical to what `arrowType` already does for the three arrow
variants.

`tools.test.ts` asserts every shape tool except the curved/elbow arrows has a
non-empty shortcut. All ten new shapes carry `shortcut: ""`, so that assertion
is deliberately widened — it is a tripwire doing its job, not a bug.

## Testing

Geometry is tested by **invariant, not by coordinate snapshot** — snapshots of
ten point-lists would be brittle and would prove only that the numbers have not
changed:

- every generated point lies within `[0, 0, w, h]` (the load-bearing rule);
- paths close, and vertex counts match the shape;
- parameters are monotonic in the dot's position, and clamp at 0 and 1;
- an unregistered kind falls back to the carrier box.

Component/unit: the tool writes `currentItemFlowShape` and clears it on a
non-shape tool; the overlay shows dots only for a single unlocked flowShape
selection; a drag produces one history entry.

e2e: draw each of the ten and assert the resulting element's `customData`; drag
a handle and confirm the rendered geometry changed; undo; save and reload; and
the one test that earns the entire architecture — **an arrow binding to a
triangle**.

## Out of scope

- A point-count control for the star, or any per-shape properties-panel row.
  The dots are the only parameter UI.
- Converting an existing rectangle into a flow shape (or between shapes) via the
  Stroke/Transform panels.
- New shapes beyond the ten listed.
