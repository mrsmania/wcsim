import type { MatchEvent } from '../domain/match';
import type { KoDecided } from '../domain/knockout';

/** The side of a MatchEvent that belongs to the user's XI. Not a parameter: `createGroup`
 *  schedules the user as home in every fixture and `prepareGroupStage` throws if they are
 *  not, which is the same invariant the bracket relies on (game 0, home seed). */
export const USER_SIDE = 'home' as const;

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
/** A match still being revealed by the clock. */
interface PlayingInput {
  playing: true;
  /** The events of the match being revealed. */
  playingEvents: MatchEvent[];
  finished?: undefined;
}

/** A settled match, normalised to the user's perspective. */
interface SettledInput {
  playing: false;
  finished: FinishedResult;
  playingEvents?: undefined;
}

/** A fixture with no result yet - the pending "v". */
interface PendingInput {
  playing: false;
  finished?: undefined;
  playingEvents?: undefined;
}

/** Clock readings, which every case carries. */
interface ClockInput {
  /** Current revealed minute + last minute of this match (90, or 120 for a.e.t.). */
  liveMinute: number;
  liveMax: number;
  /** Clock label from the running clock (empty until the first tick). */
  clockLabel: string;
}

/** Inputs to {@link liveMatchView}. Three states, and the union says so: the doc used to
 *  spell them out in prose while modelling them as a boolean plus two optionals, so a
 *  settled card passed four fields it could not use (hygiene H148). */
export type LiveMatchInput = ClockInput & (PlayingInput | SettledInput | PendingInput);

/**
 * Build the live match view-model. While playing, goals are filtered to the events
 * revealed so far (minute <= liveMinute) and the score is counted from the user's
 * side; when finished it shows the settled score/label; otherwise it is a pending
 * "v" fixture. This is the single source of the scoreline/status/feed logic shared
 * by the group and knockout screens.
 */
export function liveMatchView(input: LiveMatchInput): MatchView {
  const { playing, liveMinute, liveMax, clockLabel, playingEvents, finished } = input;

  if (playing) {
    const shown = playingEvents.filter((e) => e.minute <= liveMinute);
    const userGoals = shown.filter((e) => e.side === USER_SIDE).length;
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

/** The short end-of-match label fed to the match clock's `endLabel`, by how a
 *  knockout tie was settled ('FT' / 'a.e.t.' / 'pens'). */
export function koEndLabel(decided: KoDecided): string {
  return decided === 'reg' ? 'FT' : decided === 'aet' ? 'a.e.t.' : 'pens';
}

/** The settled status line for a finished knockout tie ('Full time' / 'a.e.t.' /
 *  'Penalties'), with `statusDim` true only for a plain full-time regulation win. */
export function koFinishedStatus(decided: KoDecided): { status: string; statusDim: boolean } {
  if (decided === 'aet') return { status: 'a.e.t.', statusDim: false };
  if (decided === 'pens') return { status: 'Penalties', statusDim: false };
  return { status: 'Full time', statusDim: true };
}

/** The win/loss result-tag label for a settled knockout tie, from the user's
 *  perspective ('Won' / 'Won a.e.t.' / 'Won on penalties' / 'Lost' /
 *  'Lost on penalties'). */
export function koResultLabel(won: boolean, decided: KoDecided): string {
  if (won) {
    return decided === 'pens' ? 'Won on penalties' : decided === 'aet' ? 'Won a.e.t.' : 'Won';
  }
  return decided === 'pens' ? 'Lost on penalties' : 'Lost';
}

/** The same fact worded for a BANNER rather than a tag, so it carries the score:
 *  "Won 2-1", "Won 2-1 (a.e.t.)", "Won on penalties".
 *
 *  Beside its sibling on purpose. The two were in different modules with different
 *  wording for the same three cases, which is two places to change if "a.e.t." is ever
 *  spelled differently (hygiene H68). They stay separate functions because the difference
 *  is real - a tag has no room for a scoreline - but they are now one edit apart. */
export function koWinHeading(m: { decided: KoDecided; userGoals: number; oppGoals: number }): string {
  if (m.decided === 'pens') return 'Won on penalties';
  if (m.decided === 'aet') return `Won ${m.userGoals}-${m.oppGoals} (a.e.t.)`;
  return `Won ${m.userGoals}-${m.oppGoals}`;
}
