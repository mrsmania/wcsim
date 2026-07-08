import { useMemo, useState } from 'react';
import { Link, Navigate, useMatch, useNavigate } from 'react-router-dom';
import { SQUADS, SQUAD_BY_ID } from '../data/squads';
import { primaryPosition, type Player, type Squad } from '../data/types';
import { normalizeSearch } from '../data/format';
import { ArrowLeft, Search, X } from 'lucide-react';
import { tierOf } from '../domain/album';
import { squadOverall } from '../domain/tournament';
import { FEATURES } from '../config';
import Flag from './Flag';
import CollectibleStar from './CollectibleStar';
import { TIER_META } from './StickerCard';
import TeamRoster from './TeamRoster';

/** Distinct tournament years, newest first for the selector. */
const YEARS = [...new Set(SQUADS.map((s) => s.year))].sort((a, b) => b - a);

const MAX_RESULTS = 80;

/** Route to a single squad's roster. Used as a real href so the row links can be
 *  middle-clicked / opened in a new tab (react-router applies the deploy basename). */
const squadHref = (id: string) => `/squads/team/${id}`;

/** A nation and every World Cup it appears in within this dataset. */
interface TeamGroup {
    code: string;
    nation: string;
    /** The nation's squads, newest tournament first. */
    squads: Squad[];
}

type Mode = 'byCup' | 'byTeam';

/**
 * Read-only browser over the whole dataset. A "Display" toggle switches between
 * two entry points - by World Cup (a year's nation grid) and by team (every
 * nation with its participation count, drilling into the World Cups it played) -
 * both landing on a squad roster. A cross-tournament search overrides either.
 * Every player is shown with full name, jersey number, main position and rating.
 */
export default function SquadBrowser() {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');

    // Route -> which view. `useMatch` paths are basename-relative.
    const mRoster = useMatch('/squads/team/:squadId');
    const mTeamCups = useMatch('/squads/by-team/:code');
    const mTeamGrid = useMatch('/squads/by-team');
    const mCupYear = useMatch('/squads/by-world-cup/:year');
    const mCup = useMatch('/squads/by-world-cup');

    const q = query.trim();
    const searching = q.length >= 2;

    const selected = mRoster ? (SQUAD_BY_ID[mRoster.params.squadId ?? ''] ?? null) : null;
    const year = mCupYear ? Number(mCupYear.params.year) : YEARS[0];
    const mode: Mode = mTeamGrid || mTeamCups ? 'byTeam' : 'byCup';

    // Nations for the chosen year, strongest first (then alphabetical). Ranked by the
    // same computed rating the game uses (best-XI overall), not the stored field.
    const nations = useMemo(
        () =>
            SQUADS.filter((s) => s.year === year).sort(
                (a, b) => squadOverall(b) - squadOverall(a) || a.nation.localeCompare(b.nation),
            ),
        [year],
    );

    // Every nation with the World Cups it appears in, most participations first.
    // "Participations" are occurrences in this dataset, not real-world history.
    const teams = useMemo<TeamGroup[]>(() => {
        const byCode = new Map<string, TeamGroup>();
        for (const s of SQUADS) {
            const e = byCode.get(s.code) ?? { code: s.code, nation: s.nation, squads: [] };
            e.squads.push(s);
            byCode.set(s.code, e);
        }
        const arr = [...byCode.values()];
        for (const t of arr) t.squads.sort((a, b) => b.year - a.year);
        arr.sort((a, b) => b.squads.length - a.squads.length || a.nation.localeCompare(b.nation));
        return arr;
    }, []);
    const teamCode = (mTeamCups?.params.code ?? '').toLowerCase();
    const team = mTeamCups ? (teams.find((t) => t.code.toLowerCase() === teamCode) ?? null) : null;

    // Cross-tournament search: any player whose name (or whose team's nation /
    // code / year) matches, strongest first.
    const results = useMemo(() => {
        if (!searching) return [];
        const nq = normalizeSearch(q);
        const hits: { player: Player; squad: Squad }[] = [];
        for (const squad of SQUADS) {
            const teamHit =
                normalizeSearch(squad.nation).includes(nq) ||
                squad.code.toLowerCase().includes(nq) ||
                String(squad.year).includes(q);
            for (const player of squad.players) {
                if (teamHit || normalizeSearch(player.name).includes(nq)) hits.push({ player, squad });
            }
        }
        return hits.sort((a, b) => b.player.elo - a.player.elo);
    }, [q, searching]);

    // Leaving a roster: step back in history when we came from within the app,
    // otherwise (a deep link) fall back to that squad's World Cup grid.
    const backFromRoster = () => {
        if (typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0) navigate(-1);
        else navigate(`/squads/by-world-cup/${selected?.year ?? YEARS[0]}`);
    };

    // Bare /squads or an unrecognised sub-path -> default to the by-world-cup grid.
    if (!mRoster && !mTeamCups && !mTeamGrid && !mCupYear && !mCup) {
        return <Navigate to="/squads/by-world-cup" replace />;
    }

    const title = searching
        ? 'Search'
        : selected
          ? `${selected.nation} ${selected.year}`
          : team
            ? team.nation
            : mode === 'byTeam'
              ? 'Browse by team'
              : 'Browse the squads';

    // The context row (year tabs / back link / result count) only appears when it
    // has something to show - not on the plain by-team grid.
    const hasContext = searching || !!selected || !!team || mode === 'byCup';

    return (
        <>
            {/* Section header (matches the game screens' eyebrow + title) */}
            <div className="mb-5 mt-7 flex items-center gap-4">
                <div>
                    <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-pitch">
                        Squads database
                    </div>
                    <h2 className="mt-0.5 font-display text-3xl font-extrabold leading-none tracking-[-0.02em]">
                        {title}
                    </h2>
                </div>
                <div className="relative h-0 flex-1 border-t-2 border-line">
                    <span className="absolute -top-[5px] left-0 h-2 w-2 rounded-full border-2 border-line bg-panel" />
                </div>
            </div>

            {/* Display toggle + search */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        Display:
                    </span>
                    <div className="flex overflow-hidden rounded-[5px] border border-line">
                        {(
                            [
                                ['byCup', 'By World Cup'],
                                ['byTeam', 'By Team'],
                            ] as const
                        ).map(([m, label]) => (
                            <Link
                                key={m}
                                to={m === 'byTeam' ? '/squads/by-team' : '/squads/by-world-cup'}
                                onClick={() => setQuery('')}
                                className={[
                                    'border-r border-line px-3 py-2 font-mono text-[12px] font-semibold uppercase tracking-[0.06em] transition last:border-r-0',
                                    mode === m
                                        ? 'bg-ink text-ground'
                                        : 'bg-panel text-muted hover:text-pitch',
                                ].join(' ')}
                            >
                                {label}
                            </Link>
                        ))}
                    </div>
                </div>

                <div className="relative sm:w-64 sm:shrink-0">
                    <Search
                        size={15}
                        strokeWidth={2.5}
                        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
                    />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search players or teams…"
                        className="w-full rounded-[5px] border border-line bg-panel py-2 pl-8 pr-8 text-sm outline-none transition placeholder:text-muted/70 focus:border-pitch"
                    />
                    {query && (
                        <button
                            onClick={() => setQuery('')}
                            aria-label="Clear search"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted transition hover:text-ink"
                        >
                            <X size={15} strokeWidth={2.5} />
                        </button>
                    )}
                </div>
            </div>

            {/* Context row: year tabs / back link / result count */}
            {hasContext && (
                <div className="mb-5 min-w-0">
                    {searching ? (
                        <span className="font-mono text-[12px] text-muted">
                            {results.length} {results.length === 1 ? 'player' : 'players'} across
                            all tournaments
                        </span>
                    ) : selected ? (
                        <button
                            onClick={backFromRoster}
                            className="inline-flex items-center gap-1.5 rounded-[5px] border border-line bg-panel px-3 py-2 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-ink transition hover:border-pitch hover:text-pitch"
                        >
                            <ArrowLeft size={14} strokeWidth={2.5} />
                            Back
                        </button>
                    ) : team ? (
                        <Link
                            to="/squads/by-team"
                            className="inline-flex items-center gap-1.5 rounded-[5px] border border-line bg-panel px-3 py-2 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-ink transition hover:border-pitch hover:text-pitch"
                        >
                            <ArrowLeft size={14} strokeWidth={2.5} />
                            All teams
                        </Link>
                    ) : (
                        <div className="flex flex-wrap gap-1.5">
                            {YEARS.map((y) => {
                                const active = y === year;
                                return (
                                    <Link
                                        key={y}
                                        to={`/squads/by-world-cup/${y}`}
                                        className={[
                                            'rounded-[5px] border px-3 py-2 font-mono text-[12px] font-semibold tabular-nums transition',
                                            active
                                                ? 'border-pitch-dark bg-pitch-dark text-white'
                                                : 'border-line bg-panel text-muted hover:border-pitch hover:text-pitch',
                                        ].join(' ')}
                                    >
                                        {y}
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Content */}
            {searching ? (
                <SearchResults results={results} onClear={() => setQuery('')} />
            ) : selected ? (
                <TeamRoster squad={selected} />
            ) : team ? (
                <TeamCups team={team} />
            ) : mode === 'byTeam' ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {teams.map((t) => (
                        <Link
                            key={t.code}
                            to={`/squads/by-team/${t.code.toLowerCase()}`}
                            className="flex flex-col gap-2.5 rounded-md border border-line bg-panel p-3.5 text-left shadow-hard transition hover:border-pitch"
                        >
                            <Flag code={t.code} className="h-5 w-8" />
                            <div className="min-w-0">
                                <div className="truncate font-display text-[15px] font-extrabold leading-tight">
                                    {t.nation}
                                </div>
                                <div className="font-mono text-[11px] text-muted">{t.code}</div>
                            </div>
                            <div className="mt-auto font-mono text-[11px] text-muted">
                                <span className="font-bold text-ink">{t.squads.length}</span> World
                                Cup{t.squads.length === 1 ? '' : 's'}
                            </div>
                        </Link>
                    ))}
                </div>
            ) : (
                <CupTable squads={nations} />
            )}
        </>
    );
}

/** The stat table's column grid, shared by its header and rows so they line up.
 *  The By World Cup and By Team tables both use it (first column is the team or the
 *  year; the trailing three are rating / players / collectibles). The collectibles
 *  column is dropped when the sticker album is off. */
const STAT_GRID = FEATURES.stickerAlbum
    ? 'grid grid-cols-[minmax(0,1fr)_58px_64px_104px] items-center gap-2 px-4'
    : 'grid grid-cols-[minmax(0,1fr)_58px_64px] items-center gap-2 px-4';

/** The trailing header labels (rating / players / collectibles), right-aligned. */
function StatHeaders() {
    return (
        <>
            <span className="text-right">Rating</span>
            <span className="text-right">Players</span>
            {FEATURES.stickerAlbum && (
                <span className="whitespace-nowrap text-right">Collectibles</span>
            )}
        </>
    );
}

/** The trailing stat cells for one squad (rating / players / collectibles), matching
 *  StatHeaders. Rating is the computed best-XI overall (what the match engine uses),
 *  so it matches the in-game rating chips. Collectibles shows an amber star + count,
 *  or a muted dash. */
function StatCells({ squad }: { squad: Squad }) {
    const coll = FEATURES.stickerAlbum ? squad.players.filter((p) => tierOf(p)).length : 0;
    return (
        <>
            <span className="text-right font-mono text-sm font-bold tabular-nums">
                {squadOverall(squad)}
            </span>
            <span className="text-right font-mono text-[13px] tabular-nums text-muted">
                {squad.players.length}
            </span>
            {FEATURES.stickerAlbum && (
                <span className="flex items-center justify-end gap-1 font-mono text-[13px] tabular-nums">
                    {coll > 0 ? (
                        <>
                            <span className="text-amber">&#9733;</span>
                            <span className="font-bold text-ink">{coll}</span>
                        </>
                    ) : (
                        <span className="text-muted/50">-</span>
                    )}
                </span>
            )}
        </>
    );
}

/** A World Cup's field as a table: flag + nation, team rating, squad size, and the
 *  number of collectibles in that squad. Rows open the squad's roster. */
function CupTable({ squads }: { squads: Squad[] }) {
    return (
        <div className="overflow-hidden rounded-md border border-line bg-panel shadow-hard">
            <div
                className={`${STAT_GRID} border-b-2 border-ink py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted`}
            >
                <span>Team</span>
                <StatHeaders />
            </div>
            {squads.map((sq) => (
                <Link
                    key={sq.id}
                    to={squadHref(sq.id)}
                    className={`${STAT_GRID} w-full border-b border-line py-2.5 text-left transition last:border-b-0 hover:bg-pitch/5`}
                >
                    <span className="flex min-w-0 items-center gap-2.5">
                        <Flag code={sq.code} className="h-4 w-6 shrink-0" />
                        <span className="truncate font-display text-[14.5px] font-extrabold leading-tight">
                            {sq.nation}
                        </span>
                        <span className="shrink-0 font-mono text-[10.5px] text-muted">{sq.code}</span>
                    </span>
                    <StatCells squad={sq} />
                </Link>
            ))}
        </div>
    );
}

/** One player's all-time standing for a team: their single best rating (the
 *  ranking key) plus every World Cup they appeared in with the rating they held
 *  then, newest first. */
interface Legend {
    personId: string;
    name: string;
    best: number;
    apps: { year: number; elo: number }[];
}

/** The team's top `n` players of all time, ranked by their single best rating
 *  (not an average). Same human across tournaments (`personId`) is one entry. */
function topLegends(team: TeamGroup, n = 10): Legend[] {
    const byPerson = new Map<string, Legend>();
    for (const sq of team.squads) {
        for (const p of sq.players) {
            const e =
                byPerson.get(p.personId) ??
                ({ personId: p.personId, name: p.name, best: 0, apps: [] } as Legend);
            e.apps.push({ year: sq.year, elo: p.elo });
            e.best = Math.max(e.best, p.elo);
            byPerson.set(p.personId, e);
        }
    }
    const arr = [...byPerson.values()];
    for (const l of arr) l.apps.sort((a, b) => b.year - a.year);
    arr.sort(
        (a, b) => b.best - a.best || b.apps.length - a.apps.length || a.name.localeCompare(b.name),
    );
    return arr.slice(0, n);
}

/** A team's detail page: the World Cups it played (newest first, each opening that
 *  squad's roster), and its all-time legends. */
function TeamCups({ team }: { team: TeamGroup }) {
    const legends = topLegends(team);
    return (
        <div className="flex flex-col gap-4">
            {/* World Cups played (same stat columns as the By World Cup table) */}
            <div className="overflow-hidden rounded-md border border-line bg-panel shadow-hard">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b-2 border-ink px-4 py-3.5">
                    <Flag code={team.code} className="h-6 w-9" />
                    <span className="font-display text-lg font-extrabold uppercase leading-none tracking-[-0.01em]">
                        {team.nation}
                    </span>
                    <span className="ml-auto font-mono text-[11px] font-semibold text-muted">
                        {team.squads.length} World Cup{team.squads.length === 1 ? '' : 's'}
                    </span>
                </div>
                <div
                    className={`${STAT_GRID} border-b border-line py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted`}
                >
                    <span>World Cup</span>
                    <StatHeaders />
                </div>
                {team.squads.map((s) => (
                    <Link
                        key={s.id}
                        to={squadHref(s.id)}
                        className={`${STAT_GRID} w-full border-b border-line py-2.5 text-left transition last:border-b-0 hover:bg-pitch/5`}
                    >
                        <span className="font-mono text-[15px] font-bold tabular-nums">{s.year}</span>
                        <StatCells squad={s} />
                    </Link>
                ))}
            </div>

            {/* All-time legends (ranked by single best rating) */}
            <div className="overflow-hidden rounded-md border border-line bg-panel shadow-hard">
                <div className="flex items-center justify-between border-b-2 border-ink px-4 py-3.5">
                    <span className="font-display text-base font-extrabold uppercase tracking-[-0.01em]">
                        Best players
                    </span>
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                        Best
                    </span>
                </div>
                {legends.map((l, i) => (
                    <div
                        key={l.personId}
                        className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
                    >
                        <span className="w-5 shrink-0 text-center font-mono text-[12px] font-bold tabular-nums text-pitch">
                            {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[13.5px] font-semibold">{l.name}</div>
                            <div className="font-mono text-[11px] text-muted">
                                {l.apps.map((a, j) => (
                                    <span key={a.year}>
                                        {j > 0 && ' · '}
                                        {a.year} <span className="font-bold text-ink">{a.elo}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                        <span className="shrink-0 text-right font-mono text-sm font-bold tabular-nums">
                            {l.best}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Flat, cross-tournament result list. Each row carries its team as context and
 *  opens that squad's roster when clicked. Capped so a broad query never renders
 *  thousands of rows. */
function SearchResults({
    results,
    onClear,
}: {
    results: { player: Player; squad: Squad }[];
    /** Clear the query so the opened roster is shown (not the search) on plain click. */
    onClear: () => void;
}) {
    if (results.length === 0) {
        return (
            <div className="rounded-md border border-dashed border-line px-4 py-10 text-center font-mono text-[12px] text-muted">
                No players or teams match that search.
            </div>
        );
    }
    const shown = results.slice(0, MAX_RESULTS);
    return (
        <div className="overflow-hidden rounded-md border border-line bg-panel shadow-hard">
            {shown.map(({ player, squad }) => {
                const tier = FEATURES.stickerAlbum ? tierOf(player) : null;
                return (
                    <Link
                        key={player.id}
                        to={squadHref(squad.id)}
                        onClick={onClear}
                        className="flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left transition last:border-b-0 hover:bg-pitch/5"
                        style={
                            tier
                                ? { boxShadow: `inset 3px 0 0 ${TIER_META[tier].accent}` }
                                : undefined
                        }
                    >
                        <span className="w-6 shrink-0 text-center font-mono text-[12px] text-muted tabular-nums">
                            {player.number}
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate text-[13.5px] font-semibold">
                                    {player.name}
                                </span>
                                {tier && <CollectibleStar tier={tier} />}
                            </div>
                            <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
                                <span className="font-semibold">{primaryPosition(player)}</span>
                                <span>&middot;</span>
                                <Flag code={squad.code} className="h-3 w-[18px]" />
                                <span>
                                    {squad.code} {squad.year}
                                </span>
                            </div>
                        </div>
                        <span className="shrink-0 text-right font-mono text-sm font-bold tabular-nums">
                            {player.elo}
                        </span>
                    </Link>
                );
            })}
            {results.length > MAX_RESULTS && (
                <div className="border-t border-line px-4 py-2.5 text-center font-mono text-[11px] text-muted">
                    Showing top {MAX_RESULTS} of {results.length}. Refine your search to narrow it
                    down.
                </div>
            )}
        </div>
    );
}
