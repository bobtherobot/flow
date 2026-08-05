/**
 * Tracks whether transient (`EVENTUALLY`) scene writes are awaiting a commit.
 *
 * The vendor's `updateScene` filters out elements whose live version has run
 * ahead of the history snapshot, which is exactly what a gesture's deferred
 * frames look like. The write that ends the gesture has to opt out of that
 * filter — but an ordinary panel write, with no deferred frames behind it,
 * must keep the filter's protection. This is the one bit that tells them apart.
 *
 * Module-level state is safe with respect to *concurrency*: only one pointer
 * gesture can be in flight at a time, and `markDeferred`/`consumeDeferred` are
 * both called synchronously within the same write path, never interleaved
 * across gestures. The risk here is *lifetime*, not concurrency — a mark with
 * no matching consume (the gesture's closing write never runs, e.g. its
 * component unmounts mid-drag) leaves `pending` stuck `true` for the rest of
 * the session, so the next unrelated write would wrongly skip the filter.
 * `resetDeferred` exists to close that gap: callers whose gesture ends without
 * a closing write must call it so the bit cannot outlive the gesture that set it.
 */
let pending = false;

/** Record that a transient write has deferred its history. */
export const markDeferred = (): void => {
  pending = true;
};

/** True if a deferred sequence is awaiting commit; resets on read. */
export const consumeDeferred = (): boolean => {
  const was = pending;
  pending = false;
  return was;
};

/**
 * Clear a pending mark without treating it as a real commit. Callers must
 * invoke this when a gesture ends *without* its closing write — e.g. a
 * scrubbable control unmounts mid-drag (panel collapsed, a layout applied, the
 * selection changing while the pointer is still down). Without this release, a
 * leaked `true` would make the next, unrelated panel write pass
 * `commitDeferredChanges: true` and skip `filterUncomittedElements` for it too
 * — which drops not just the intended stale-snapshot revert but also the
 * guard that deletes elements with no snapshot entry (an element the user is
 * currently drawing), so a leaked flag plus an unrelated write mid-draw could
 * commit a half-created element into history.
 */
export const resetDeferred = (): void => {
  pending = false;
};
