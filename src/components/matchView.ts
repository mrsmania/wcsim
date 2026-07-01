import type { MatchEvent } from '../domain/match';

/** The user-perspective score of a match card. */
export interface MatchScore {
  user: number;
  opp: number;
}

/** A tag shown beside a matchday/round label, described as data so the caller
 *  renders the shared `ResultTag`. `kind` maps straight onto `ResultTag.kind`. */
export interface MatchTag {
  kind: 'w' | 'l' | 'd' | 'next';
  label: string;
}

/** The shared per-match display view-model built once from the raw inputs, used
 *  by both the group and knockout screens. Everything a match card needs to draw
 *  the fixture header + goal feed, derived identically in one place. */
export interface MatchView {
  /** User-perspective score, or undefined for a not-yet-started fixture. */
  score?: MatchScore;
  /** Clock/status label under the score ("73'", "HT", "Full time", "a.e.t."). */
  status?: string;
  /** Dim the status (used for a settled, non-live "Full time"). */
  statusDim: boolean;
  /** Goals to show in the feed (live-filtered while playing, all when finished). */
  feedEvents: MatchEvent[] | null;
  /** True while the match is still being revealed (pre full-time). */
  live: boolean;
}

/** A finished result normalised to the user's perspective. */
export interface FinishedResult {
  /** Goals for the user's XI. */
  userGoals: number;
  /** Goals for the opponent. */
  oppGoals: number;
  /** Status label to show ("Full time", "a.e.t.", "Penalties"). */
  status: string;
  /** Whether the status should be dimmed (a plain, settled full time). */
  statusDim: boolean;
  events: MatchEvent[];
}

/** Inputs to {@link liveMatchView}. Either the match is playing (with a live
 *  result whose events reveal minute by minute) or it is finished (normalised to
 *  the user's perspective) or it is neither (pending). */
export interface LiveMatchInput {
  /** True when this card is the one currently being revealed by the clock. */
  playing: boolean;
  /** Which event side is the user's XI (home in the knockout, either in a group). */
  userSide: 'home' | 'away';
  /** Current revealed minute + last minute of this match (90, or 120 for a.e.t.). */
  liveMinute: number;
  liveMax: number;
  /** Clock label from the running clock (empty until the first tick). */
  clockLabel: string;
  /** The events of the match being revealed (only read while `playing`). */
  playingEvents?: MatchEvent[];
  /** The settled result, normalised to the user's perspective (read when idle). */
  finished?: FinishedResult;
}

/**
 * Build the live match view-model. While playing, goals are filtered to the events
 * revealed so far (minute <= liveMinute) and the score is counted from the user's
 * side; when finished it shows the settled score/label; otherwise it is a pending
 * "v" fixture. This is the single source of the scoreline/status/feed logic shared
 * by the group and knockout screens.
 */
export function liveMatchView(input: LiveMatchInput): MatchView {
  const { playing, userSide, liveMinute, liveMax, clockLabel, playingEvents, finished } = input;

  if (playing && playingEvents) {
    const shown = playingEvents.filter((e) => e.minute <= liveMinute);
    const userGoals = shown.filter((e) => e.side === userSide).length;
    return {
      score: { user: userGoals, opp: shown.length - userGoals },
      status: clockLabel || undefined,
      statusDim: false,
      feedEvents: shown,
      live: liveMinute < liveMax,
    };
  }

  if (finished) {
    return {
      score: { user: finished.userGoals, opp: finished.oppGoals },
      status: finished.status,
      statusDim: finished.statusDim,
      feedEvents: finished.events,
      live: false,
    };
  }

  return { statusDim: false, feedEvents: null, live: false };
}

/** The win/loss/draw tag for a settled result, from the user's perspective. Used
 *  by the group screen (plain Won/Lost/Draw). */
export function resultTag(score: MatchScore): MatchTag {
  if (score.user > score.opp) return { kind: 'w', label: 'Won' };
  if (score.user < score.opp) return { kind: 'l', label: 'Lost' };
  return { kind: 'd', label: 'Draw' };
}
