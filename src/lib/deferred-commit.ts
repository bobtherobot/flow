/**
 * Tracks whether transient (`EVENTUALLY`) scene writes are awaiting a commit.
 *
 * The vendor's `updateScene` filters out elements whose live version has run
 * ahead of the history snapshot, which is exactly what a gesture's deferred
 * frames look like. The write that ends the gesture has to opt out of that
 * filter — but an ordinary panel write, with no deferred frames behind it,
 * must keep the filter's protection. This is the one bit that tells them apart.
 *
 * Module-level state is safe here: only one pointer gesture can be in flight.
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
