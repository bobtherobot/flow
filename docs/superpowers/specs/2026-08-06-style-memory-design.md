# Per-category style memory — design

**Date:** 2026-08-06
**Status:** approved, ready to plan

Remember the style of the last element you touched, per category, and apply it
to the next element you draw in that category. Four independent memories —
shapes, arrows/lines, text, freedraw — so recolouring an arrow never changes
what the next rectangle looks like.

## Problem

Excalidraw keeps exactly one flat set of new-element defaults on `appState`:
`currentItemStrokeColor`, `currentItemBackgroundColor`, `currentItemFontSize`
and friends (`vendor/excalidraw/packages/excalidraw/appState.ts:30-47`). Every
creation site reads them directly — `newElement({ strokeColor:
this.state.currentItemStrokeColor, … })` — so whatever was written last wins for
everything drawn next, regardless of type.

flow's panels feed that same single set: `useSelectionStyle.setProp` takes a
`currentItemKey` and writes it alongside the element property
(`src/ui/panels/useSelectionStyle.ts:112`), and the panels pass one per control
(`src/ui/panels/ColorPanel.tsx:113`, `:123`, `:132`;
`src/ui/panels/StrokePanel.tsx:276`, `:292`, `:336`).

Three consequences:

1. **Cross-contamination.** Give an arrow a thick red stroke and the next
   rectangle is drawn thick and red. The categories have genuinely different
   style vocabularies — a box wants a fill, an arrow wants arrowheads — but they
   share one slot per property.
2. **No memory at all for flow's own fields.** `cornerRadius` and `padding` are
   flow fork element fields (vendor commit `bcfbfff6`, "fork hooks for flow's
   Transform panel"). Neither has a `currentItem*` counterpart, so a radius set
   on one box is simply not inherited by the next — the new box falls back to
   the derived default.
3. **Re-styling is repetitive.** Drawing five boxes in a house style means
   applying the same four or five properties five times.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Number of buckets | 4 — shape, linear, text, freedraw | Freedraw's stroke vocabulary is close to linear's but users treat pencil colour as its own thing |
| What updates a bucket | Selecting **or** editing | Selecting an existing element adopts its look, so "make the next one like that one" needs no edit |
| Multi-select adopt | Single-element adds only | A marquee or Ctrl+A has no last-clicked element; silently rewriting defaults from an arbitrary member is worse than doing nothing |
| Edit capture | Selection-derived, via `currentItem*` drift | One mechanism catches panel writes, `executeAction` writes, and vendor-side writes alike |
| Load point | `activeTool` change | Creation reads `currentItem*` at creation time, and every contended key is reachable only via an explicit tool activation |
| What is swapped | Contended keys only | A key just one category can use is already correct in vendor's single slot; swapping it would be motion without effect |
| Applying a key | Only where it renders | Never stamp `cornerRadius` on an ellipse or arrowheads on a line |
| Persistence | Session-only | Buckets reset on reload; no storage schema, no migration, no interaction with `FLOW_GLOBAL_APP_STATE_KEYS` |
| Roughness | Excluded from all buckets | Sloppiness is already an app-wide flow preference re-asserted at the call site |

## The categories

Derived from element type on the read side, from active tool on the write side.

| Bucket | Elements | Tools |
|---|---|---|
| `shape` | rectangle, diamond, ellipse | rectangle, diamond, ellipse |
| `linear` | arrow, line | arrow (all three variants), line |
| `text` | text (loose and bound) | text |
| `freedraw` | freedraw | freedraw |
| — | image, frame, iframe, embeddable | image, frame, laser, eraser, hand, selection — never adopted from, never applied to |

### Only contended keys are bucketed

A `currentItem*` key needs a bucket only if **two or more categories can
actually render it**. A key just one category uses is already correct in
vendor's single flat slot — nothing else ever overwrites it — so bucketing it
would be motion without effect. That splits the keys in two:

**Contended — bucketed and swapped on tool change:**

| Key | Contended between | Why |
|---|---|---|
| `currentItemStrokeColor` | shape, linear, freedraw | all three stroke |
| `currentItemStrokeWidth` | shape, linear, freedraw | " |
| `currentItemStrokeStyle` | shape, linear, freedraw | " |
| `currentItemOpacity` | all four | every creation site reads it |
| `currentItemBackgroundColor` | shape, linear | a **closed line renders its fill**, and flow's Fill row writes to any selected element |
| `currentItemFillStyle` | shape, linear | same |
| `currentItemRoundness` | shape, linear | rectangles/diamonds *and* `newLinearElement` read it (`App.tsx:7782`); arrows do not — they derive roundness from `currentItemArrowType` (`:7752`) |
| `currentItemCornerRadius` | shape, linear | rectangle/diamond corners vs elbow-arrow bends |

Per bucket, that is: `shape` and `linear` carry all eight; `freedraw` carries
strokeColor, strokeWidth, strokeStyle, opacity; `text` carries opacity alone.

**Resident — left in `currentItem*`, never swapped:** `currentItemTextColor`,
`currentItemFontFamily`, `currentItemFontSize`, `currentItemTextAlign`,
`currentItemPadding`, `currentItemArrowType`, `currentItemStartArrowhead`,
`currentItemEndArrowhead`, `currentItemStartArrowheadSize`,
`currentItemEndArrowheadSize`.

Residency is about the *swap*, not about adoption: adopt-on-select still writes
resident keys, because vendor never adopts from a selection at all. Selecting an
arrow with a big dot arrowhead must still make the next arrow match, and
selecting a 40px caption must still size the next text — those writes just go
straight to `currentItem*` with no bucket in between.

`currentItemArrowType` is resident by the same rule, which also removes an
ambiguity: the rail's Curved/Elbow buttons set it before activating the shared
`"arrow"` tool (`useActiveTool.ts:45`), so the rail stays its sole owner and can
never be fought by a bucket. The load still *reads* the live value to decide
whether `cornerRadius` applies.

Buckets are **partial**. All four start empty, so before anything is touched the
vendor's own defaults apply unchanged. Only keys that have actually been
recorded are ever written back.

### `roundness` is not `cornerRadius`

They are separate concerns and both are remembered:

- `roundness` is a **mode flag** on the element: `null` for sharp, or
  `{ type }` where the type selects the algorithm (`ADAPTIVE_RADIUS` for
  rectangles, `PROPORTIONAL_RADIUS` for diamonds and linear elements —
  `vendor/excalidraw/packages/excalidraw/constants.ts:366`). Its new-element
  default `currentItemRoundness: "round" | "sharp"` is upstream.
- `cornerRadius: number` is the **magnitude**, a flow fork field. Unset, the
  radius is derived: 32px adaptive for rectangles, 0.25 × min-dimension
  proportional, 16px for elbow arrows (`src/lib/corner-radius.ts`).

`cornerRadius` therefore appears in two buckets. That is the point of the swap:
the tool change decides whether the one appState key holds your remembered box
radius or your remembered elbow-bend softness. flow's Radius control already
targets rectangle, diamond and elbow arrow (`radiusTargetIds`,
`src/lib/corner-radius.ts`), and the buckets match that exactly.

### `padding` is resident

`padding` is also a fork field, on the **container** (rectangle/ellipse/diamond
holding bound text), defaulting to `BOUND_TEXT_PADDING` = 5 when unset
(`src/lib/padding.ts`, `vendor/…/element/textElement.ts:351`). Only shape
containers can carry it, so it is uncontended and stays resident: adopting a
captioned container writes `currentItemPadding` straight to appState, and it is
read back at container-shape creation. No bucket in between.

## Change 1 — `src/lib/style-memory.ts`

Pure module, no Excalidraw imports, so it unit-tests under jsdom. Mirrors the
convention already set by `selection-style.ts`, `corner-radius.ts` and
`padding.ts`.

```ts
export type StyleCategory = "shape" | "linear" | "text" | "freedraw";
export type StyleBucket = Partial<Record<string, unknown>>; // currentItem* keys

/** The contended currentItem* keys each category buckets. */
export const CATEGORY_KEYS: Record<StyleCategory, readonly string[]>;

/** Every contended key, across all categories — what the drift watcher folds. */
export const CONTENDED_KEYS: readonly string[];

export function categoryOfElement(type: string): StyleCategory | null;
export function categoryOfTool(toolType: string): StyleCategory | null;

/** Element props → currentItem* keys, for adopt-on-select. */
export function snapshotElement(el: StyleElement): StyleBucket;

/** The subset of `bucket` that renders on the given creation target. */
export function applicableKeys(target: LoadTarget): readonly string[];
```

`snapshotElement` owns the non-obvious mappings:

| Element | Reads | Writes |
|---|---|---|
| any | `strokeColor` | `currentItemStrokeColor` |
| **text** | `strokeColor` | `currentItemTextColor` — text colour is independent of stroke in the fork (`App.tsx:5314`) |
| rectangle, diamond, line | `roundness` | `currentItemRoundness`: `el.roundness ? "round" : "sharp"` |
| arrow | `elbowed`, `roundness` | `currentItemArrowType`: `elbowed ? "elbow" : roundness ? "round" : "sharp"` — same derivation the Stroke panel already reads with (`StrokePanel.tsx:173`) |
| rectangle, diamond, elbow arrow | `cornerRadius` | `currentItemCornerRadius`, via `effectiveCornerRadius` so an unset field records what is actually drawn |
| container with bound text | `padding` | `currentItemPadding`, via `effectivePadding` |

`applicableKeys` is the filter that honours "ignore a setting with no real
meaning". The load resolves a target from the tool and drops everything that
would be inert or wrong on it:

| Target | Dropped from the bucket's contended keys |
|---|---|
| rectangle, diamond | — |
| ellipse | `cornerRadius` — `radiusTargetIds` excludes ellipses |
| arrow, sharp or round | `cornerRadius` — only elbows have bends to soften; also `roundness`, which arrows never read |
| arrow, elbow | `roundness` — same reason |
| line | `cornerRadius` — a plain line has no numeric radius; `roundness` is kept, `newLinearElement` reads it |
| freedraw | `roundness` — the `freedraw` bucket already excludes background and fill |
| text | everything — the `text` bucket holds only `opacity`, which a tool change to `text` does load |
| image, frame, laser, eraser, hand, selection | everything — no load at all |

`cornerRadius` and `padding` are stamped **at creation only**, never toggled on
an existing element. That sidesteps the optional-prop hazard recorded in
`.claude/memory/flow-optional-prop-undo.md`: a fork-added optional prop can
never be undone back to never-set, but a prop born with its element disappears
when undo removes the element.

## Change 2 — `src/lib/style-memory-store.ts`

Session-only module singleton holding the four buckets plus an
`activeCategory`, following the `useSyncExternalStore` precedent from the
palette work (`.claude/memory/color-swatches.md`). Session-only means no
localStorage key and no entry in `FLOW_GLOBAL_APP_STATE_KEYS`
(`src/lib/flow-app-state.ts`) — there is nothing a saved document could clobber.

```ts
/** Snapshot a whole element into its bucket, and make it active. */
export function adopt(category: StyleCategory, snapshot: StyleBucket): void;

/** Fold changed currentItem* keys into every given category. */
export function record(categories: readonly StyleCategory[], patch: StyleBucket): void;

/** The appState patch to apply for a creation target, already filtered. */
export function resolveLoad(target: LoadTarget): StyleBucket;

export function getActiveCategory(): StyleCategory;
export function setActiveCategory(category: StyleCategory): void;

/** Clear every bucket. For tests — the app never resets mid-session. */
export function resetStyleMemory(): void;
```

`activeCategory` starts at `"shape"` and is set by both `adopt` and a tool-change
load. It is the fallback target for edits made with an empty selection.

## Change 3 — `src/ui/useStyleMemory.ts`

The reactive bridge, mounted once in `App`. Subscribes to `api.onChange` in the
same shape as `useSelectionStyle` and `useActiveTool`, and holds its previous
observations in refs. Three responsibilities:

**Adopt on select.** Diff `appState.selectedElementIds` against the previous
snapshot. If exactly one id was *added*, `adopt` that element's
`snapshotElement` into its category. Bulk adds — marquee, Ctrl+A, select-all of
a group — change nothing. Selecting a captioned container adopts twice: the
container into `shape`, its bound text into `text`, matching how the Text panel
already resolves bound text as a target (`resolveTextTargetIds`,
`src/lib/selection-style.ts`).

Adopting also **writes the whole snapshot straight through** to `currentItem*` in
the same pass, contended keys included. Resident keys have no other write point
— vendor never adopts from a selection, so without this, selecting a 40px
caption would not size the next text and selecting a dot-headed arrow would not
head the next arrow. Writing the contended keys through as well is safe because
the next tool change reloads them from the correct bucket regardless, and it
keeps the panels' empty-selection fallbacks showing what was just adopted.

**Capture edits from `currentItem*` drift.** Diff the **contended** keys against
the previous snapshot, ignoring any change this hook itself just wrote. Fold
whatever changed into the categories present in the **current selection**; with
an empty selection, into `activeCategory`. Resident keys need no folding — they
already live authoritatively in appState.

Drift is the single capture mechanism because writes reach `currentItem*` by
more than one route: `setProp`'s `currentItemKey`
(`useSelectionStyle.ts:112`), `executeAction` dispatches that carry their own
defaults (`TextPanel.tsx:123` passes `{ currentItemFontFamily }`), and vendor
keyboard shortcuts. Watching the destination rather than the callers catches all
three and needs no change to `useSelectionStyle`.

Deriving the categories from the selection rather than from `activeCategory`
alone is what makes a multi-category edit correct: with a box and an arrow
selected, one stroke-colour change folds into both buckets. It slightly
over-captures when an edit targets a subset of the selection — a radius change
in a mixed selection folds `cornerRadius` into `linear` as well as `shape` —
which is harmless, because `applicableKeys` refuses to apply it to anything but
an elbow arrow.

**Load on tool change.** Watch the pair `(activeTool.type,
currentItemArrowType)`, not the tool type alone: elbow-ness decides whether
`cornerRadius` applies, so cycling arrow variants with `A` must re-resolve.
On change, map the tool to a category and target, `resolveLoad`, and write:

```ts
api.updateScene({
  appState: patch,
  captureUpdate: CaptureUpdateAction.NEVER,
});
```

`NEVER` because this changes defaults only and touches no element — a defaults
swap must not become an undo entry.

The load never writes `currentItemArrowType` — it is resident, owned by the
rail, and only *read* here to resolve elbow-ness.

**Loop guard.** Both writes are conditional: `updateScene` is called only when
at least one resolved key differs from live appState, and the trigger diffs are
ref-tracked, so the `onChange` a write provokes resolves to a no-op.

## Change 4 — fork: two new `currentItem*` fields

Additive vendor edit extending `bcfbfff6`, the commit that already owns
`cornerRadius` and `padding`:

- `currentItemCornerRadius` and `currentItemPadding` added to `appState.ts` —
  defaults, and `browser: true, export: false, server: false` alongside the
  other `currentItem*` entries (`appState.ts:154-178`).
- Two read sites only. Rectangle, diamond and ellipse all come from one
  function: `baseElementAttributes` in `createGenericElementOnPointerDown`
  (`App.tsx:7856`), which is also where `roundness` is already resolved
  per-type via `getCurrentItemRoundness(elementType)` — `cornerRadius` and
  `padding` follow the same per-type gating there. Elbow arrows take
  `cornerRadius` at `newArrowElement` (`App.tsx:7740`), which already branches on
  `currentItemArrowType === ARROW_TYPE.elbow`.
- Both stay optional: when the bucket has no value, the field is left unset and
  the derived default stands.

Same shape as the shipped arrowhead-size fork edit
(`.claude/memory/arrowhead-size.md`). Per `.claude/memory/selection-mode.md`
this needs a vendor rebuild with types regenerated, not a source edit alone.

## Known gap

Double-click-to-text and Enter-on-a-container create text without a tool change,
so they miss the load. `currentItemOpacity` is the only text-relevant key that
is swap-managed, so a double-clicked text picks up whatever opacity the last
drawing tool loaded rather than the text bucket's. Every other text key —
`currentItemTextColor`, fontFamily, fontSize, textAlign, padding — is resident
and correct on that path.

In practice the gap is close to theoretical: flow's Color panel folds alpha into
an 8-digit hex on the colour itself rather than moving element opacity
(`ColorPanel.tsx` `ColorRow`, `combineColorAlpha`), so no flow control writes
`currentItemOpacity` at all today. It is bucketed for correctness against vendor
shortcuts, not because flow's UI moves it.

## Testing

**Unit — `style-memory.ts`:** `snapshotElement` mappings, one test per
non-obvious row: text `strokeColor` → `currentItemTextColor`; elbow, round and
sharp arrows → the three `arrowType` values; `roundness` → `"round"`/`"sharp"`;
unset `cornerRadius` recording its derived value. `applicableKeys` per target:
ellipse drops `cornerRadius`, sharp arrow drops it, elbow keeps it, line keeps
`roundness` while arrows drop it, and no target ever yields a resident key.

**Unit — `style-memory-store.ts`:** buckets stay isolated (recording into
`linear` leaves `shape` untouched); a `record` spanning two categories writes
both; `resolveLoad` returns only recorded keys, so an empty bucket yields an
empty patch.

**Hook — `useStyleMemory.test.tsx`,** jsdom against a fake API, mirroring
`useSelectionStyle.test.tsx`: a single-element selection add adopts; a two-element
add does not; a tool change emits the filtered payload with `captureUpdate:
NEVER`; a tool change whose values already match emits no `updateScene` at all;
a `currentItem*` change with a box and arrow selected folds into both buckets.

**E2E — `e2e/`:** draw a box, recolour it, draw a second box, assert it
inherits. Then select an arrow, change its stroke, draw a box, assert the box
keeps the shape bucket's stroke rather than the arrow's. Third: set a radius on
a box, draw another box, assert the radius carries — the case that motivates the
fork edit.

## Out of scope

- Persistence across reloads. Session-only by decision; revisit if it proves
  annoying in use.
- Image and frame styles. Neither category adopts or is applied to.
- Per-document buckets. The memory is app-level, like the tool rail's state.
- Any UI to inspect or reset the buckets. The panels already show the loaded
  values through their existing `currentItem*` fallbacks.
