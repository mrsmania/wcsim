import { useEffect, useMemo, useState } from 'react';
import type { RoundRecord, RunState } from '../domain/run';

/**
 * The Cup Run's round-review navigation: which round the content column is showing, which
 * rounds can be opened at all, and the record for whichever is open. Extracted whole from
 * `CupRunScreen` (hygiene H147).
 *
 * The index scheme is the thing to hold on to: **0 is the GROUP** and knockout round `r` is
 * `r + 1`, which is why the tree's cells pass `r + 1` and the group cell passes 0. `null`
 * means "showing the live round", not "showing nothing".
 */
export function useRoundReview(run: RunState | null): {
  /** null = the live round; otherwise the index being reviewed (0 = group). */
  reviewIndex: number | null;
  setReviewIndex: (i: number | null) => void;
  /** The live round's own index, on the same scheme. */
  currentRoundIndex: number;
  /** Knockout rounds a review can be opened for: exactly those with a history record. */
  reviewableRounds: number[];
  /** The group's record, which the group cell opens. */
  groupRecord: RoundRecord | undefined;
  /** The record for whatever is currently being reviewed. */
  reviewRecord: RoundRecord | undefined;
} {
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);

  // Three-way, and the group-exit case is the one that is easy to drop: a run that ended in
  // the group is still SHOWING the group, so its live index is 0 rather than a knockout one.
  const currentRoundIndex = run
    ? run.phase === 'group' || (run.phase === 'ended' && run.outcome === 'group')
      ? 0
      : run.koRound + 1
    : 0;

  // Snap back to live when the run advances a round. Keyed on `currentRoundIndex` ONLY:
  // keying it on `run` would cancel an open review on every state write, which means every
  // save, and the review would close under the player as they read it.
  useEffect(() => {
    setReviewIndex(null);
  }, [currentRoundIndex]);

  // A record is written as the round is played and `koRound` advances in the same breath, so
  // the live round never has one - except on an ended run, where reviewing the last tie is
  // the point (the content column is the end panel by then).
  const reviewableRounds = useMemo(
    () =>
      (run?.history ?? [])
        .map((h) => h.stage)
        .filter((st): st is number => typeof st === 'number'),
    [run?.history],
  );

  // Written the moment the group is played, so it is there for every run that got past
  // matchday three - including one that went out in the group, where there is no bracket
  // for the cell to lead and the group cell is mounted on its own.
  const groupRecord = useMemo(
    () => (run?.history ?? []).find((h) => h.stage === 'group'),
    [run?.history],
  );

  const reviewRecord: RoundRecord | undefined =
    run && reviewIndex !== null
      ? reviewIndex === 0
        ? groupRecord
        : (run.history ?? []).find((h) => h.stage === reviewIndex - 1)
      : undefined;

  return {
    reviewIndex,
    setReviewIndex,
    currentRoundIndex,
    reviewableRounds,
    groupRecord,
    reviewRecord,
  };
}
