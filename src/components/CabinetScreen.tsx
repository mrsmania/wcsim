import { Check, Plus, Trophy } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FEATURES } from '../config';
import type { Player } from '../data/types';
import type { AlbumState } from '../domain/album';
import {
  cabinetView,
  LEADERBOARD_ROWS,
  type CabinetView,
  type LadderRung,
  type PlayerRow,
  type ShelfCup,
} from '../domain/cabinet';
import { FINISH_LABEL, type CareerState, type RunHistoryEntry } from '../domain/career';
import type { BadgeRow } from '../domain/badges';
import type { RunOutcome } from '../domain/run';
import Flag from './Flag';
import { SQUAD_BY_ID } from '../data/squads';
import { CARD_SM } from './matchUi';

/** A cup's plinth by the tier it was won at: ONE hue getting deeper, plus the numeral.
 *  Tier is deliberately not a colour of its own - the challenge ledger settled that
 *  when 130 painted entries stopped reading (TIER_COLOR is gone), and a six-hue shelf
 *  is exactly the rainbow that rule exists to prevent. The top step needs a token
 *  rather than `bg-ink`, because ink is near-white in the dark theme, which would make
 *  the highest tier the LIGHTEST plinth and read the ramp backwards. */
const PLINTH = ['bg-chalk', 'bg-pitch', 'bg-pitch-dark', 'bg-cup-deep'];
/** White-on-dark from the first green step up. */
const onDark = (tier: number) => tier >= 1;

/** The shelf's trophy, and the masthead-matching glyph everywhere else. */
function Cup({ size = 26 }: { size?: number }) {
  return <Trophy size={size} strokeWidth={1.9} className="text-amber" aria-hidden="true" />;
}

/** One cup. There is no date to show and no opponent: `cupsByAscension` counts cups per
 *  tier and nothing else, which is what makes the whole screen free of new storage. */
function ShelfTile({ cup }: { cup: ShelfCup }) {
  const dark = onDark(cup.tier);
  return (
    <li className="w-[74px] shrink-0 text-center">
      <div
        className={`grid place-items-center gap-1.5 rounded-t-md rounded-b-[3px] border border-line pb-2 pt-[11px] ${
          PLINTH[Math.min(cup.tier, PLINTH.length - 1)]
        } ${dark ? 'border-transparent' : ''}`}
      >
        <Cup />
        <span
          className={`font-mono text-[9px] font-bold uppercase tracking-[0.1em] ${
            dark ? 'text-white/80' : 'text-muted'
          }`}
        >
          {cup.label === 'Base' ? 'Base' : cup.label.replace('Ascension ', 'Asc ')}
        </span>
      </div>
      <div className="mt-1 font-mono text-[9.5px] text-dim">
        {cup.nth} of {cup.ofTier}
      </div>
    </li>
  );
}

/** One rung, with both gates resolved. The underline says which: green for won here,
 *  amber for unlocked and still to win, nothing for locked. */
function LadderCell({ rung }: { rung: LadderRung }) {
  const won = rung.cups > 0;
  return (
    <div
      className={`relative px-1.5 pb-[9px] pt-2.5 text-center ${
        rung.unlocked ? 'bg-panel' : 'bg-faint'
      }`}
    >
      <div
        className={`font-mono text-[9px] font-bold uppercase tracking-[0.1em] ${
          rung.unlocked ? 'text-muted' : 'text-dim'
        }`}
      >
        {rung.label === 'Base' ? 'Base' : rung.label.replace('Ascension ', 'Asc ')}
      </div>
      <div
        className={`mt-0.5 font-display text-[20px] font-black leading-tight ${
          won ? '' : 'text-dim'
        }`}
      >
        {rung.cups}
      </div>
      <div className="mt-px font-mono text-[8.5px] text-dim">
        {!rung.unlocked
          ? 'locked'
          : rung.selectable
            ? `x${rung.rewardMult}`
            : `level ${rung.levelReq}`}
      </div>
      {(won || rung.unlocked) && (
        <span
          className={`absolute inset-x-0 bottom-0 h-[3px] ${won ? 'bg-pitch' : 'bg-amber'}`}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

/** A label / value line in the records column. */
function Rec({ k, v, dim }: { k: string; v: string; dim?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-hair py-[7px]">
      <span className="text-[12.5px] text-muted">{k}</span>
      <span
        className={`ml-auto text-right font-mono text-[12.5px] tabular-nums ${
          dim ? 'font-semibold text-dim' : 'font-bold text-ink'
        }`}
      >
        {v}
      </span>
    </div>
  );
}

/** The leaderboards' column geometry, read by BOTH the head and the rows. It was written
 *  out twice under a comment saying the two had to agree, which is the one duplication on
 *  this screen that fails silently: the cells are bare numerals, so a head drifting off
 *  its column leaves them unlabelled rather than looking broken. `runs` carries its own
 *  breakpoint for the same reason - hiding a cell in one of the two places and not the
 *  other is the identical bug. `text-right` stays at the call site, because the head's
 *  rank cell is an empty spacer and has none. */
const LEADER_COL = {
  rank: 'w-[15px] shrink-0',
  flag: 'w-4 shrink-0',
  name: 'min-w-0 flex-1',
  goals: 'w-11 shrink-0 text-right',
  cups: 'w-11 shrink-0 text-right',
  apps: 'w-12 shrink-0 text-right',
  runs: 'w-10 shrink-0 text-right max-[560px]:hidden',
} as const;

/** Earned is the only ink, as on the challenge ledger: a done badge is panel + the
 *  tifo shadow + a tick, everything else is flat and dim with its fraction. */
function BadgeTile({ row }: { row: BadgeRow }) {
  return (
    <li
      className={`flex items-start gap-2.5 rounded-md p-[10px_11px] ${
        row.done
          ? 'border border-line bg-panel shadow-hard-sm'
          : 'border border-hair bg-faint'
      }`}
    >
      <span
        className={`mt-px grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full ${
          row.done
            ? 'bg-pitch text-white'
            : 'border-[1.5px] border-dashed border-line text-dim'
        }`}
        aria-hidden="true"
      >
        {row.done ? <Check size={12} strokeWidth={3.2} /> : <Plus size={11} strokeWidth={2.4} />}
      </span>
      <span className="min-w-0">
        <span
          className={`block font-display text-[13.5px] font-extrabold leading-tight tracking-[-0.01em] ${
            row.done ? 'text-ink' : 'text-dim'
          }`}
        >
          {row.badge.name}
          <span className="sr-only">{row.done ? ' - earned' : ' - not yet earned'}</span>
        </span>
        <span
          className={`mt-0.5 block text-[11.5px] leading-[1.35] ${
            row.done ? 'text-muted' : 'text-dim'
          }`}
        >
          {row.badge.description}
        </span>
        <span className="mt-1 block font-mono text-[10px] font-semibold tabular-nums text-dim">
          {row.have} / {row.need}
        </span>
      </span>
    </li>
  );
}

/** How many archive rows are on screen. The archive holds far more (HISTORY_LIMIT);
 *  this is a readable page, not the whole ledger. */
const HISTORY_SHOWN = 12;

/** Short outcome labels for the archive, where `FINISH_LABEL`'s "Round of 16" and
 *  "Runner-up" are too long for a dense row. */
const SHORT_FINISH: Record<RunOutcome, string> = {
  group: 'Group',
  r16: 'R16',
  qf: 'QF',
  sf: 'SF',
  final: 'Final',
  champion: 'Cup',
};

/** A date, or a dash when the row predates the caller passing a clock in. */
function runDate(at?: number): string {
  if (!at) return '-';
  const d = new Date(at);
  return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })} ${String(d.getFullYear()).slice(2)}`;
}

/** One archived run. A cup is the only row that gets ink: the same "earned is the only
 *  colour" rule the honours ledger and the badges follow. */
function HistoryRow({ entry }: { entry: RunHistoryEntry }) {
  const won = entry.outcome === 'champion';
  return (
    <li className="flex items-baseline gap-2.5 border-b border-hair py-[7px] last:border-0">
      <span className="w-[66px] shrink-0 whitespace-nowrap font-mono text-[10.5px] tabular-nums text-dim">
        {runDate(entry.at)}
      </span>
      <span
        className={`w-[44px] shrink-0 font-display text-[12px] font-extrabold ${
          won ? 'text-accent' : 'text-ink'
        }`}
      >
        {entry.outcome ? SHORT_FINISH[entry.outcome] : '-'}
      </span>
      <span className="w-[42px] shrink-0 font-mono text-[10.5px] text-muted">
        {entry.ascension > 0 ? `A${entry.ascension}` : 'Base'}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] tabular-nums text-muted">
        {entry.goalsFor}-{entry.goalsAgainst}
        {entry.roundsWon > 0 && ` · ${entry.roundsWon} ${entry.roundsWon === 1 ? 'tie' : 'ties'}`}
        {entry.formation && ` · ${entry.formation}`}
        {!!entry.challenges && ` · +${entry.challenges} honours`}
      </span>
      <span className="shrink-0 text-right font-mono text-[11px] font-bold tabular-nums">
        {entry.score}
      </span>
    </li>
  );
}

/** One leaderboard row: rank, flag, name, the year he was capped in, and the numbers.
 *  `metric` is which of them this board is ranked by, so it is the bold one. */
function PlayerLeaderRow({
  row,
  rank,
  metric,
}: {
  row: PlayerRow;
  rank: number;
  metric: LeaderMetric;
}) {
  const squad = SQUAD_BY_ID[row.player.squadId];
  const { apps, goals, runs } = row.record;
  const cups = row.record.cups ?? 0;
  return (
    <li className="flex items-baseline gap-2.5 border-b border-hair py-[7px] last:border-0">
      <span className={`${LEADER_COL.rank} text-right font-mono text-[10.5px] tabular-nums text-dim`}>
        {rank}
      </span>
      {squad ? (
        <Flag code={squad.code} className={`${LEADER_COL.flag} h-2.5 self-center`} />
      ) : (
        <span className={LEADER_COL.flag} />
      )}
      <span
        className={`${LEADER_COL.name} truncate font-display text-[13px] font-bold tracking-[-0.005em]`}
      >
        {row.player.name}
        <span className="ml-1.5 font-mono text-[10px] font-normal tabular-nums text-dim">
          {squad?.year}
        </span>
      </span>
      {/* Goals and cups only on the board they rank (see `LeaderHead`). */}
      {metric === 'goals' && (
        <span className={`${LEADER_COL.goals} font-mono text-[11px] font-bold tabular-nums text-ink`}>
          {goals}
        </span>
      )}
      {metric === 'cups' && (
        <span className={`${LEADER_COL.cups} font-mono text-[11px] font-bold tabular-nums text-ink`}>
          {cups}
        </span>
      )}
      <span
        className={`${LEADER_COL.apps} font-mono text-[11px] tabular-nums ${
          metric === 'apps' ? 'font-bold text-ink' : 'text-muted'
        }`}
      >
        {apps}
      </span>
      <span className={`${LEADER_COL.runs} font-mono text-[10.5px] tabular-nums text-dim`}>
        {runs}
      </span>
    </li>
  );
}

/** Which number a board is ranked by, and so which of the optional columns it carries
 *  and which cell is the bold one. */
type LeaderMetric = 'apps' | 'goals' | 'cups';

/** The column heads of a leaderboard. Takes the board's metric because the three boards
 *  do not carry the same columns: goals are the point of Top scorers and beside the
 *  point on Most used, where they were a second number competing with the one the board
 *  is ranked by. Reads its widths from `LEADER_COL`, like the rows do: the cells are
 *  bare numbers rather than carrying a unit each ("96 mts" was the alternative), so a
 *  head that drifted off its column would leave the numbers unlabelled. */
function LeaderHead({ metric }: { metric: LeaderMetric }) {
  return (
    <div className="flex items-baseline gap-2.5 border-b border-line pb-1.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.12em] text-muted">
      <span className={LEADER_COL.rank} />
      <span className={LEADER_COL.flag} />
      <span className={LEADER_COL.name}>Player</span>
      {metric === 'goals' && <span className={LEADER_COL.goals}>Goals</span>}
      {metric === 'cups' && <span className={LEADER_COL.cups}>Cups</span>}
      <span className={LEADER_COL.apps}>Matches</span>
      <span className={LEADER_COL.runs}>Runs</span>
    </div>
  );
}

/** A card shell: the flat turf-flat card the rest of the app uses. */
function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`${CARD_SM} ${className}`}>
      {children}
    </section>
  );
}

function BlockHead({
  title,
  count,
  hint,
  link,
}: {
  title: string;
  count?: string;
  hint?: string;
  link?: { to: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-2.5 border-b border-hair px-3.5 pb-2.5 pt-3">
      <h3 className="font-display text-[14.5px] font-extrabold tracking-[-0.01em]">{title}</h3>
      {count && <span className="font-mono text-[11.5px] font-bold tabular-nums text-muted">{count}</span>}
      {hint && <span className="text-[12px] text-muted">{hint}</span>}
      {link && (
        <Link
          to={link.to}
          className="ml-auto font-display text-[10.5px] font-extrabold uppercase tracking-[0.05em] text-accent transition hover:underline"
        >
          {link.label} &rarr;
        </Link>
      )}
    </div>
  );
}

/**
 * The trophy cabinet (roadmap item 06, option B). Read-only, and every number is
 * derived from the career and the album on render - see `domain/cabinet.ts`.
 */
export default function CabinetScreen({
  career,
  album,
  allPlayers,
}: {
  career: CareerState;
  album: AlbumState;
  /** The pool's players, so album completion tracks the year filter like the album
   *  screen's does. */
  allPlayers: Player[];
}) {
  const v: CabinetView = useMemo(
    () => cabinetView(career, album, allPlayers),
    [career, album, allPlayers],
  );
  const h = v.headline;
  const r = v.records;
  const bestTier = h.bestCupAscension === null ? null : v.ladder[h.bestCupAscension];

  // No header of its own: `/records/cabinet` is the only route here and it puts one
  // StageHeader above its sub-tabs. See the note in ChallengesScreen - the `/cabinet`
  // alias that would have wanted its own was unreachable, and is now deleted.
  return (
    <>
      {/* Headline strip. The Prestige balance is here as a fact about the career,
        not as a prompt to go and spend it - the hub is where it is spent. */}
      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line shadow-hard-sm min-[560px]:grid-cols-3 min-[860px]:grid-cols-6">
        <div className="bg-pitch-dark p-[11px_13px] text-white">
          <div className="font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-white/70">
            Cups
          </div>
          <div className="mt-0.5 font-display text-[21px] font-black leading-tight tabular-nums tracking-[-0.02em]">
            {h.cups}
          </div>
          <div className="mt-px font-mono text-[10px] text-white/70">
            {bestTier ? `best: ${bestTier.label}` : 'none yet'}
          </div>
        </div>
        {[
          ['Level', String(h.level), `${h.xpInto} / ${h.xpNeeded} XP`],
          ['Prestige', String(h.prestige), `${h.prestigeSpent.toLocaleString()} spent`],
          ['Runs', String(h.runs), `${h.runsAtHighAscension} at Asc II+`],
          [
            'Honours',
            String(v.honours.completed),
            `of ${v.honours.total}`,
          ],
          ['Album', String(v.album.collected), `of ${v.album.total}`],
        ].map(([k, val, sub]) => (
          <div key={k} className="bg-panel p-[11px_13px]">
            <div className="font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted">
              {k}
            </div>
            <div className="mt-0.5 font-display text-[21px] font-black leading-tight tabular-nums tracking-[-0.02em]">
              {val}
            </div>
            <div className="mt-px font-mono text-[10px] tabular-nums text-muted">{sub}</div>
          </div>
        ))}
      </div>

      {/* ---- the shelf, which owns the tier ladder ----
        The trophies and the per-tier counts answered one question twice, so the
        ladder is a block in here rather than a card of its own. Its three-swatch
        colour key went with the merge: every rung already prints "locked" or its
        multiplier in words, so the key named a colour the cell had already named.
        `LadderNote` stays - the two-gate sentence is a fact about the career. */}
      <Card className="mb-3.5">
        <BlockHead
          title="The shelf"
          count={`${v.shelf.length} ${v.shelf.length === 1 ? 'cup' : 'cups'} won`}
        />
        <div className="p-3.5">
          {v.shelf.length > 0 ? (
            <>
              <ul className="flex flex-wrap items-end gap-2.5">
                {v.shelf.map((cup) => (
                  <ShelfTile key={`${cup.tier}-${cup.nth}`} cup={cup} />
                ))}
              </ul>
              <div className="mt-[3px] h-[5px] rounded-[2px] bg-line" />
            </>
          ) : (
            <p className="text-[13px] text-muted">
              Empty for now. Win a Cup Run and the first trophy lands here, with the
              tier it was won at.
            </p>
          )}

          <div className="mt-4 font-mono text-[9.5px] font-bold uppercase tracking-[0.15em] text-muted">
            By Ascension tier
          </div>
          <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-[5px] border border-line bg-line min-[620px]:grid-cols-6">
            {v.ladder.map((rung) => (
              <LadderCell key={rung.tier} rung={rung} />
            ))}
          </div>
          <LadderNote ladder={v.ladder} level={h.level} />
        </div>
      </Card>

      {/* ---- records + the run archive ----
        `items-start` rather than the default stretch: the two are different
        heights, so stretching left a card-sized hole under the shorter one. A
        ragged bottom edge reads better than dead space. */}
      <div className="mb-3.5 grid grid-cols-1 items-start gap-3.5 min-[900px]:grid-cols-2">
        <Card>
          <BlockHead title="Records" hint="read live from the career" />
          <div className="p-3.5">
            <div className="grid grid-cols-1 gap-x-[26px] min-[560px]:grid-cols-2">
              <Rec
                k="Best finish"
                v={r.bestFinish ? FINISH_LABEL[r.bestFinish] : '-'}
                dim={!r.bestFinish}
              />
              <Rec k="Best score" v={String(r.bestScore)} dim={r.bestScore === 0} />
              <Rec k="Cup streak, current" v={String(r.cupStreak)} dim={r.cupStreak === 0} />
              <Rec
                k="Cup streak, best (from honours)"
                v={String(r.bestCupStreak)}
                dim={r.bestCupStreak === 0}
              />
              <Rec
                k="Finals in a row, current"
                v={String(r.finalStreak)}
                dim={r.finalStreak === 0}
              />
              <Rec
                k="Semis in a row, current"
                v={String(r.semiStreak)}
                dim={r.semiStreak === 0}
              />
              <Rec k="Finals lost" v={r.everLostFinal ? 'yes' : 'no'} dim={!r.everLostFinal} />
              <Rec k="Runs at Ascension II or higher" v={String(r.runsAtHighAscension)} dim={r.runsAtHighAscension === 0} />
              <Rec
                k="Prestige spent, lifetime"
                v={r.prestigeSpent.toLocaleString()}
                dim={r.prestigeSpent === 0}
              />
              <Rec
                k="Perk tiers owned"
                v={`${r.perkTiersOwned} / ${r.perkTiersTotal}`}
                dim={r.perkTiersOwned === 0}
              />
            </div>

            <div className="mb-2 mt-[15px] flex items-baseline gap-2.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.15em] text-muted">
              Cups won with
              <span className="tracking-normal text-[11px] text-ink">
                {v.formations.filter((f) => f.won).length} of {v.formations.length}{' '}
                formations
              </span>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {v.formations.map((f) => (
                <li
                  key={f.name}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums ${
                    f.won
                      ? 'border-line bg-chalk text-ink'
                      : 'border-hair bg-faint text-dim'
                  }`}
                >
                  {f.won && (
                    <Check
                      size={10}
                      strokeWidth={3.4}
                      className="text-pitch-ink"
                      aria-hidden="true"
                    />
                  )}
                  {f.name}
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <div className="grid content-start gap-3.5">
          {/* The run archive. Unlike everything else on this screen it is RECORDED,
              because nothing derivable can answer "when" - so a career that predates
              the recording gets the explanation rather than a blank list. */}
          {v.history.length > 0 ? (
            <Card>
              <BlockHead
                title="Run history"
                count={`${v.historyHeld}${v.historyHeld >= v.historyLimit ? ` (last ${v.historyLimit})` : ''}`}
                hint="Newest first."
              />
              <div className="p-3.5">
                <ol className="grid grid-cols-1">
                  {v.history.slice(0, HISTORY_SHOWN).map((h, i) => (
                    <HistoryRow key={`${h.at ?? 'x'}-${i}`} entry={h} />
                  ))}
                </ol>
                {v.historyHeld > HISTORY_SHOWN && (
                  <p className="mt-2.5 text-[12px] text-muted">
                    Showing {HISTORY_SHOWN} of {v.historyHeld} runs held
                    {v.historyHeld >= v.historyLimit
                      ? `; the archive keeps the last ${v.historyLimit}, so the lifetime counters above reach further back than this list does.`
                      : '.'}
                  </p>
                )}
              </div>
            </Card>
          ) : (
            <div className="rounded-md border border-dashed border-line bg-faint p-[16px_15px]">
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-dim">
                Nothing recorded yet
              </span>
              <h3 className="mt-1 font-display text-[14px] font-extrabold text-dim">
                Run history
              </h3>
              <p className="mt-1.5 max-w-[74ch] text-[12.5px] text-dim">
                The one part of this screen that is recorded rather than worked out from
                the career, because nothing derivable can answer "when". It starts filling
                at your next finished run, and only ever covers runs from now on - the
                ones already played left no date behind.
              </p>
            </div>
          )}

          {v.complete && (
            <div className={`${CARD_SM} p-[16px_15px]`}>
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-accent">
                Complete
              </span>
              <h3 className="mt-1 flex items-center gap-2 font-display text-[15px] font-extrabold">
                <Cup size={18} /> Nothing left to win
              </h3>
              <p className="mt-1.5 text-[12.5px] text-muted">
                Every honour, every badge and every sticker. The cabinet is full.
              </p>
            </div>
          )}
        </div>      </div>

      {/* ---- badges ---- */}
      <Card className="mb-3.5">
        <BlockHead
          title="Badges"
          count={`${v.badgesEarned} / ${v.badges.length}`}
          hint="Lifetime completeness. Recomputed from what you hold, so they pay nothing."
        />
        <div className="p-3.5">
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(212px,100%),1fr))] gap-2.5">
            {v.badges.map((row) => (
              <BadgeTile key={row.badge.id} row={row} />
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-muted">
            Every one asks what a <b className="font-semibold text-ink">career holds</b>,
            which no challenge does - a challenge judges a single run. That is what keeps
            the two from being the same list twice.
          </p>
        </div>
      </Card>

      {/* ---- who actually played ----
          Every board is the top ten of a record that goes far wider; the caption says
          how much wider, because a leaderboard that silently truncates reads as "this is
          everyone". Ranked lists rather than cards: this is the same "130 entries cannot
          each be painted" lesson at a smaller scale.
          Three of them, so the row takes a third column where there is width for it and
          the last one spans the pair below that: a half-width board beside white space
          reads as one that failed to load. */}
      {v.playersTracked > 0 && (
        <div className="mb-3.5 grid grid-cols-1 items-start gap-3.5 min-[900px]:grid-cols-2 min-[1320px]:grid-cols-3">
          <Card>
            <BlockHead
              title="Most used"
              count={`top ${Math.min(LEADERBOARD_ROWS, v.topUsed.length)}`}
              hint={`of ${v.playersTracked} players tracked`}
            />
            <div className="p-3.5">
              <LeaderHead metric="apps" />
              <ol className="grid grid-cols-1">
                {v.topUsed.map((row, i) => (
                  <PlayerLeaderRow key={row.player.id} row={row} rank={i + 1} metric="apps" />
                ))}
              </ol>
              <p className="mt-2.5 text-[12px] text-muted">
                {v.playerTotals.apps.toLocaleString()} appearances across{' '}
                {v.playersTracked} players
                {v.playersTracked >= v.playersLimit
                  ? `, the most this career keeps records for (${v.playersLimit}); the least-used drop off first.`
                  : '. Every player you have fielded keeps a record, not just these ten.'}
              </p>
            </div>
          </Card>

          <Card>
            <BlockHead
              title="Top scorers"
              count={`top ${Math.min(LEADERBOARD_ROWS, v.topScorers.length)}`}
              hint="Shootout penalties do not count."
            />
            <div className="p-3.5">
              {v.topScorers.length > 0 ? (
                <>
                  <LeaderHead metric="goals" />
                  <ol className="grid grid-cols-1">
                    {v.topScorers.map((row, i) => (
                      <PlayerLeaderRow key={row.player.id} row={row} rank={i + 1} metric="goals" />
                    ))}
                  </ol>
                  <p className="mt-2.5 text-[12px] text-muted">
                    {v.playerTotals.goals.toLocaleString()} goals in normal and extra time.
                    A tie won on penalties adds none: those kicks are a shootout, not a
                    scoreline.
                  </p>
                </>
              ) : (
                <p className="text-[13px] text-muted">
                  No goals recorded yet. They are counted from your next finished run.
                </p>
              )}
            </div>
          </Card>

          {/* Most titles. Every player who played a match in a winning run, not just the
              eleven that finished it, which is the same reading of "was there" the two
              boards beside it use - three boards ranked on three different meanings of
              the same run would invite exactly one wrong comparison.
              The hint is the one thing this board cannot derive: line-ups are only kept
              from the run that started keeping them, so a career with older cups is
              missing them and says which rather than showing a hole. */}
          <Card className="min-[900px]:col-span-2 min-[1320px]:col-span-1">
            <BlockHead
              title="Most titles"
              count={`top ${Math.min(LEADERBOARD_ROWS, v.topTitles.length)}`}
              hint={
                v.cupsRecorded < v.headline.cups
                  ? `${v.cupsRecorded} of your ${v.headline.cups} cups have line-ups on record.`
                  : 'Everyone who played a match in a winning run.'
              }
            />
            <div className="p-3.5">
              {v.topTitles.length > 0 ? (
                <>
                  <LeaderHead metric="cups" />
                  <ol className="grid grid-cols-1">
                    {v.topTitles.map((row, i) => (
                      <PlayerLeaderRow key={row.player.id} row={row} rank={i + 1} metric="cups" />
                    ))}
                  </ol>
                  <p className="mt-2.5 text-[12px] text-muted">
                    A cup counts for every player who played a match in the run that won
                    it, so a substitute a boost brought in for the final is on it too.
                  </p>
                </>
              ) : (
                <p className="text-[13px] text-muted">
                  {v.headline.cups > 0
                    ? 'Your cups were won before line-ups were kept, so there is nobody to list yet. Counted from your next one.'
                    : 'No cup won yet. Every player who plays a match in a winning run is listed here.'}
                </p>
              )}
            </div>
          </Card>
        </div>
      )}

      {FEATURES.challenges && (
        <p className="mt-5 text-[12.5px] text-muted">
          Honours and badges are judged when a Cup Run ends.
        </p>
      )}
    </>
  );
}

/** The two-gate sentence under the ladder, only when the gates actually come apart. */
function LadderNote({ ladder, level }: { ladder: LadderRung[]; level: number }) {
  const gated = ladder.find((r) => r.unlocked && !r.selectable);
  const top = [...ladder].reverse().find((r) => r.selectable);
  if (!gated || !top) return null;
  return (
    <p className="mt-2.5 text-[12px] text-muted">
      Winning at <b className="font-semibold text-ink">{top.label}</b> unlocked{' '}
      <b className="font-semibold text-ink">{gated.label}</b>, but it needs level{' '}
      {gated.levelReq} and this career is {level}, so the highest tier you can pick is still{' '}
      {top.label}.
    </p>
  );
}
