import { useEffect, useRef } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawAPI } from "../lib/excalidraw-scene";
import {
  CONTENDED_KEYS,
  categoryOfElement,
  categoryOfTool,
  contendedOnly,
  snapshotContainerPadding,
  snapshotElement,
  type StyleBucket,
  type StyleCategory,
  type StyleElement,
} from "../lib/style-memory";
import {
  adopt,
  getActiveCategory,
  record,
  resolveLoad,
  setActiveCategory,
} from "../lib/style-memory-store";

type UpdateAppState = NonNullable<Parameters<ExcalidrawAPI["updateScene"]>[0]>["appState"];
type SelectedIds = Record<string, boolean | undefined>;

const selectedIdSet = (ids: SelectedIds): Set<string> =>
  new Set(Object.keys(ids).filter((id) => ids[id] === true));

/** The `currentItem*` values currently live on appState, contended keys only. */
function readContended(appState: Record<string, unknown>): StyleBucket {
  const out: StyleBucket = {};
  for (const key of CONTENDED_KEYS) out[key] = appState[key];
  return out;
}

/** Keys of `next` whose value differs from `prev`. */
function changedKeys(prev: StyleBucket, next: StyleBucket): string[] {
  return CONTENDED_KEYS.filter((key) => !Object.is(prev[key], next[key]));
}

/**
 * Per-category style memory, wired to the live canvas.
 *
 * Renders nothing and holds no state — every prior observation lives in a ref,
 * so the hook never re-renders App. Three jobs, all driven off one `onChange`:
 *
 *  - **Adopt on select.** A selection change that adds exactly one element
 *    snapshots that element's style into its bucket and writes the whole
 *    snapshot through to `currentItem*`. Bulk adds (marquee, Ctrl+A) are
 *    deliberately ignored: there is no last-clicked element, and rewriting the
 *    defaults from an arbitrary member of a crowd is worse than doing nothing.
 *  - **Capture edits.** Any other movement in a contended `currentItem*` key is
 *    folded into the buckets of the categories present in the selection, or the
 *    active category when nothing is selected. Watching the destination rather
 *    than the callers catches panel writes, `executeAction` dispatches that
 *    carry their own defaults, and vendor keyboard shortcuts alike.
 *  - **Load on tool change.** Activating a drawing tool swaps that category's
 *    bucket into `currentItem*`, filtered to the keys that render on what is
 *    about to be created.
 *
 * Every write goes through `updateScene`, which fires `onChange` again — so the
 * refs are updated *before* writing and each write is skipped when it would
 * change nothing, leaving the re-entrant callback a no-op.
 */
export function useStyleMemory(api: ExcalidrawAPI | null): void {
  const prevSelected = useRef<Set<string>>(new Set());
  const prevContended = useRef<StyleBucket>({});
  const prevToolKey = useRef<string>("");
  const primed = useRef(false);

  useEffect(() => {
    if (!api) return;

    /**
     * Write a `currentItem*` patch. Keys already holding that value are dropped,
     * and `prevContended` is advanced to the post-write values *before* the write
     * lands — so the `onChange` this provokes sees no drift and folds nothing.
     * Without that ordering the hook would fold its own load into whichever
     * bucket happens to be active, silently corrupting it.
     */
    const applyPatch = (patch: StyleBucket, appState: Record<string, unknown>) => {
      const next: StyleBucket = {};
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        if (Object.is(appState[key], value)) continue;
        next[key] = value;
      }
      if (Object.keys(next).length === 0) return;

      prevContended.current = { ...prevContended.current, ...contendedOnly(next) };

      api.updateScene({
        appState: next as UpdateAppState,
        // Defaults only, no element touched — never an undo entry.
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    };

    const sync = () => {
      const appState = api.getAppState() as unknown as Record<string, unknown>;
      const elements = api.getSceneElements() as unknown as readonly StyleElement[];

      const selected = selectedIdSet((appState.selectedElementIds ?? {}) as SelectedIds);
      const added = [...selected].filter((id) => !prevSelected.current.has(id));
      prevSelected.current = selected;

      const contended = readContended(appState);
      const drift = changedKeys(prevContended.current, contended);
      prevContended.current = contended;

      const toolType =
        ((appState.activeTool as { type?: string } | undefined)?.type ?? "selection") as string;
      const arrowType = (appState.currentItemArrowType as string) ?? "sharp";
      const toolKey = `${toolType}:${arrowType}`;
      const toolChanged = toolKey !== prevToolKey.current;
      prevToolKey.current = toolKey;

      // The first pass only primes the refs. Without this every contended key
      // reads as drift on mount and the vendor defaults get folded into a bucket.
      if (!primed.current) {
        primed.current = true;
        return;
      }

      // 1. Adopt on select — exactly one element newly added to the selection.
      //    A bulk add (marquee, Ctrl+A) has no last-clicked element and is
      //    deliberately ignored.
      if (added.length === 1) {
        const el = elements.find((e) => e.id === added[0]);
        const category = el ? categoryOfElement(el.type) : null;
        if (el && category) {
          const snapshot = snapshotElement(el);
          adopt(category, snapshot);

          // A captioned container carries text settings too: its bound text
          // feeds the text bucket, and the container's own padding rides along,
          // because padding lives on the shape but belongs to the caption.
          const boundTextId = (
            (el.boundElements ?? []) as readonly { id: string; type: string }[]
          ).find((b) => b.type === "text")?.id;
          const boundText = boundTextId ? elements.find((e) => e.id === boundTextId) : undefined;
          const textSnapshot = boundText
            ? { ...snapshotElement(boundText), ...snapshotContainerPadding(el) }
            : {};
          if (boundText) {
            adopt("text", textSnapshot);
            // Adopting the caption made "text" active; the clicked element wins.
            setActiveCategory(category);
          }

          // Resident keys have no other write point, so the whole snapshot goes
          // through. Contended keys are safe to write too — the next tool change
          // reloads them from the correct bucket regardless.
          applyPatch({ ...snapshot, ...textSnapshot }, appState);
          return;
        }
      }

      // 2. Capture edits. Any contended movement this hook did not cause is a
      //    user edit; fold it into every category the selection contains, or the
      //    active one when nothing is selected.
      if (drift.length > 0) {
        const categories = categoriesInSelection(elements, selected);
        const patch: StyleBucket = {};
        for (const key of drift) patch[key] = contended[key];
        record(categories.length > 0 ? categories : [getActiveCategory()], patch);
      }

      // 3. Load on tool change. The pair (tool, arrowType) is the trigger, not
      //    the tool alone: elbow-ness decides whether cornerRadius applies, so
      //    cycling arrow variants with `A` must re-resolve.
      if (toolChanged) {
        const category = categoryOfTool(toolType);
        if (!category) return;
        setActiveCategory(category);
        applyPatch(resolveLoad({ category, toolType, arrowType }), appState);
      }
    };

    sync();
    return api.onChange(sync);
  }, [api]);
}

/** The categories represented by the currently selected elements. */
function categoriesInSelection(
  elements: readonly StyleElement[],
  selected: Set<string>,
): StyleCategory[] {
  const found = new Set<StyleCategory>();
  for (const el of elements) {
    if (!selected.has(el.id)) continue;
    const category = categoryOfElement(el.type);
    if (category) found.add(category);
  }
  return [...found];
}
