import { Check, Plus, Trophy } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Player } from '../data/types';
import type { AlbumState } from '../domain/album';
import {
    cabinetView,
    LEADERBOARD_ROWS,
    type CabinetView,
    type PlayerRow,
    type ShelfCup,
} from '../domain/cabinet';
import { FINISH_LABEL, type CareerState } from '../domain/career';
import type { BadgeRow } from '../domain/badges';
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
                {row.done ? (
                    <Check size={12} strokeWidth={3.2} />
                ) : (
                    <Plus size={11} strokeWidth={2.4} />
                )}
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
            <span
                className={`${LEADER_COL.rank} text-right font-mono text-[10.5px] tabular-nums text-dim`}
            >
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
                <span
                    className={`${LEADER_COL.goals} font-mono text-[11px] font-bold tabular-nums text-ink`}
                >
                    {goals}
                </span>
            )}
            {metric === 'cups' && (
                <span
                    className={`${LEADER_COL.cups} font-mono text-[11px] font-bold tabular-nums text-ink`}
                >
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
    return <section className={`${CARD_SM} ${className}`}>{children}</section>;
}

function BlockHead({
    title,
    count,
    link,
}: {
    title: string;
    count?: string;
    link?: { to: string; label: string };
}) {
    return (
        <div className="flex flex-wrap items-baseline gap-2.5 border-b border-hair px-3.5 pb-2.5 pt-3">
            <h3 className="font-display text-[14.5px] font-extrabold tracking-[-0.01em]">
                {title}
            </h3>
            {count && (
                <span className="font-mono text-[11.5px] font-bold tabular-nums text-muted">
                    {count}
                </span>
            )}
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
    const r = v.records;
    // No header of its own: `/records/cabinet` is the only route here and it puts one
    // StageHeader above its sub-tabs. See the note in ChallengesScreen - the `/cabinet`
    // alias that would have wanted its own was unreachable, and is now deleted.
    return (
        <>
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
                            count={`(top ${Math.min(LEADERBOARD_ROWS, v.topUsed.length)})`}
                        />
                        <div className="p-3.5">
                            <LeaderHead metric="apps" />
                            <ol className="grid grid-cols-1">
                                {v.topUsed.map((row, i) => (
                                    <PlayerLeaderRow
                                        key={row.player.id}
                                        row={row}
                                        rank={i + 1}
                                        metric="apps"
                                    />
                                ))}
                            </ol>
                        </div>
                    </Card>

                    <Card>
                        <BlockHead
                            title="Top scorers"
                            count={`(top ${Math.min(LEADERBOARD_ROWS, v.topScorers.length)})`}
                        />
                        <div className="p-3.5">
                            {v.topScorers.length > 0 ? (
                                <>
                                    <LeaderHead metric="goals" />
                                    <ol className="grid grid-cols-1">
                                        {v.topScorers.map((row, i) => (
                                            <PlayerLeaderRow
                                                key={row.player.id}
                                                row={row}
                                                rank={i + 1}
                                                metric="goals"
                                            />
                                        ))}
                                    </ol>
                                </>
                            ) : (
                                <p className="text-[13px] text-muted">
                                    No goals recorded yet. They are counted from your next finished
                                    run.
                                </p>
                            )}
                        </div>
                    </Card>

                    {/* Most titles. Every player who played a match in a winning run, not just
                the eleven that finished it, which is the same reading of "was there" the
                two boards beside it use - three boards ranked on three different meanings
                of the same run would invite exactly one wrong comparison. */}
                    <Card className="min-[900px]:col-span-2 min-[1320px]:col-span-1">
                        <BlockHead
                            title="Most titles"
                            count={`(top ${Math.min(LEADERBOARD_ROWS, v.topTitles.length)})`}
                        />
                        <div className="p-3.5">
                            {v.topTitles.length > 0 ? (
                                <>
                                    <LeaderHead metric="cups" />
                                    <ol className="grid grid-cols-1">
                                        {v.topTitles.map((row, i) => (
                                            <PlayerLeaderRow
                                                key={row.player.id}
                                                row={row}
                                                rank={i + 1}
                                                metric="cups"
                                            />
                                        ))}
                                    </ol>
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
            {/* ---- the shelf, which owns the tier ladder ----
        The trophies and the per-tier counts answered one question twice, so the
        ladder is a block in here rather than a card of its own. Its three-swatch
        colour key went with the merge: every rung already prints "locked" or its
        multiplier in words, so the key named a colour the cell had already named. */}
            <Card className="mb-3.5">
                <BlockHead
                    title="The shelf"
                    count={`(${v.shelf.length} ${v.shelf.length === 1 ? 'cup' : 'cups'})`}
                />
                <div className="p-3.5">
                    {v.shelf.length > 0 ? (
                        <>
                            <ul className="flex flex-wrap items-end gap-2.5">
                                {v.shelf.map((cup) => (
                                    <ShelfTile key={`${cup.tier}-${cup.nth}`} cup={cup} />
                                ))}
                            </ul>
                        </>
                    ) : (
                        <p className="text-[13px] text-muted">
                            Empty for now. Win a Cup Run and the first trophy lands here, with the
                            tier it was won at.
                        </p>
                    )}
                </div>
            </Card>
            {/* ---- records ----
        Full width, now that the run archive that used to sit beside it has gone: a
        half-width card next to white space reads as one that failed to load, which
        is the same reason the titles board spans the pair above it. */}
            <Card className="mb-3.5">
                <BlockHead title="Records" />
                <div className="p-3.5">
                    <div className="grid grid-cols-1 gap-x-[26px] min-[560px]:grid-cols-2">
                        <Rec
                            k="Best finish"
                            v={r.bestFinish ? FINISH_LABEL[r.bestFinish] : '-'}
                            dim={!r.bestFinish}
                        />
                        <Rec
                            k="Cup streak, current"
                            v={String(r.cupStreak)}
                            dim={r.cupStreak === 0}
                        />
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
                        <Rec
                            k="Finals lost"
                            v={String(r.finalsLost)}
                            dim={r.finalsLost === 0}
                        />
                        <Rec
                            k="Runs at Ascension II or higher"
                            v={String(r.runsAtHighAscension)}
                            dim={r.runsAtHighAscension === 0}
                        />
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
                {v.complete && (
                    <div className={`${CARD_SM} mb-3.5 p-[16px_15px]`}>
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
            {/* ---- badges ---- */}
            <Card className="mb-3.5">
                <BlockHead title="Badges" />
                <div className="p-3.5">
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(212px,100%),1fr))] gap-2.5">
                        {v.badges.map((row) => (
                            <BadgeTile key={row.badge.id} row={row} />
                        ))}
                    </ul>
                </div>
            </Card>
        </>
    );
}
