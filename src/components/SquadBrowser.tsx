import { useMemo, useState } from 'react';
import { SQUADS, SQUAD_BY_ID } from '../data/squads';
import { primaryPosition, type Player, type Squad } from '../data/types';
import { ArrowLeft, ArrowRight, Search, X } from 'lucide-react';
import Flag from './Flag';
import TeamRoster from './TeamRoster';

/** Distinct tournament years, newest first for the selector. */
const YEARS = [...new Set(SQUADS.map((s) => s.year))].sort((a, b) => b - a);

/** Lowercase + strip diacritics, so "Muller" matches "Müller". */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** A full 32-nation field; below this a year is hand-authored placeholder data. */
const FULL_FIELD = 32;
const MAX_RESULTS = 80;

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
    const [mode, setMode] = useState<Mode>('byCup');
    const [year, setYear] = useState<number>(YEARS[0]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedCode, setSelectedCode] = useState<string | null>(null);
    const [query, setQuery] = useState('');

    const q = query.trim();
    const searching = q.length >= 2;
    const selected = selectedId ? SQUAD_BY_ID[selectedId] : null;

    // Nations for the chosen year, strongest first (then alphabetical).
    const nations = useMemo(
        () =>
            SQUADS.filter((s) => s.year === year).sort(
                (a, b) => b.rating - a.rating || a.nation.localeCompare(b.nation),
            ),
        [year],
    );
    const yearIsPartial = nations.length < FULL_FIELD;

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
    const team = selectedCode ? (teams.find((t) => t.code === selectedCode) ?? null) : null;

    // Cross-tournament search: any player whose name (or whose team's nation /
    // code / year) matches, strongest first.
    const results = useMemo(() => {
        if (!searching) return [];
        const nq = norm(q);
        const hits: { player: Player; squad: Squad }[] = [];
        for (const squad of SQUADS) {
            const teamHit =
                norm(squad.nation).includes(nq) ||
                squad.code.toLowerCase().includes(nq) ||
                String(squad.year).includes(q);
            for (const player of squad.players) {
                if (teamHit || norm(player.name).includes(nq)) hits.push({ player, squad });
            }
        }
        return hits.sort((a, b) => b.player.elo - a.player.elo);
    }, [q, searching]);

    const openSquad = (id: string) => {
        setSelectedId(id);
        setQuery('');
    };
    const switchMode = (m: Mode) => {
        setMode(m);
        setSelectedId(null);
        setSelectedCode(null);
        setQuery('');
    };

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
                            <button
                                key={m}
                                onClick={() => switchMode(m)}
                                className={[
                                    'border-r border-line px-3 py-2 font-mono text-[12px] font-semibold uppercase tracking-[0.06em] transition last:border-r-0',
                                    mode === m
                                        ? 'bg-ink text-ground'
                                        : 'bg-white text-muted hover:text-pitch',
                                ].join(' ')}
                            >
                                {label}
                            </button>
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
                        className="w-full rounded-[5px] border border-line bg-white py-2 pl-8 pr-8 text-sm outline-none transition placeholder:text-muted/70 focus:border-pitch"
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
                            {results.length} {results.length === 1 ? 'player' : 'players'} across all
                            tournaments
                        </span>
                    ) : selected ? (
                        <button
                            onClick={() => setSelectedId(null)}
                            className="inline-flex items-center gap-1.5 rounded-[5px] border border-line bg-white px-3 py-2 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-ink transition hover:border-pitch hover:text-pitch"
                        >
                            <ArrowLeft size={14} strokeWidth={2.5} />
                            {selectedCode ? (team?.nation ?? 'Back') : 'All squads'}
                        </button>
                    ) : team ? (
                        <button
                            onClick={() => setSelectedCode(null)}
                            className="inline-flex items-center gap-1.5 rounded-[5px] border border-line bg-white px-3 py-2 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-ink transition hover:border-pitch hover:text-pitch"
                        >
                            <ArrowLeft size={14} strokeWidth={2.5} />
                            All teams
                        </button>
                    ) : (
                        <div className="flex flex-wrap gap-1.5">
                            {YEARS.map((y) => {
                                const active = y === year;
                                return (
                                    <button
                                        key={y}
                                        onClick={() => setYear(y)}
                                        className={[
                                            'rounded-[5px] border px-3 py-2 font-mono text-[12px] font-semibold tabular-nums transition',
                                            active
                                                ? 'border-pitch-dark bg-pitch-dark text-white'
                                                : 'border-line bg-white text-muted hover:border-pitch hover:text-pitch',
                                        ].join(' ')}
                                    >
                                        {y}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Content */}
            {searching ? (
                <SearchResults results={results} onOpen={openSquad} />
            ) : selected ? (
                <TeamRoster squad={selected} />
            ) : team ? (
                <TeamCups team={team} onOpen={openSquad} />
            ) : mode === 'byTeam' ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {teams.map((t) => (
                        <button
                            key={t.code}
                            onClick={() => setSelectedCode(t.code)}
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
                        </button>
                    ))}
                </div>
            ) : (
                <>
                    {yearIsPartial && (
                        <p className="mb-3 font-mono text-[11px] text-muted">
                            {year} is an approximate placeholder set ({nations.length} teams), not a
                            full researched field.
                        </p>
                    )}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {nations.map((sq) => (
                            <button
                                key={sq.id}
                                onClick={() => openSquad(sq.id)}
                                className="flex flex-col gap-2.5 rounded-md border border-line bg-panel p-3.5 text-left shadow-hard transition hover:border-pitch"
                            >
                                <Flag code={sq.code} className="h-5 w-8" />
                                <div className="min-w-0">
                                    <div className="truncate font-display text-[15px] font-extrabold leading-tight">
                                        {sq.nation}
                                    </div>
                                    <div className="font-mono text-[11px] text-muted">
                                        {sq.code} &middot; {sq.year}
                                    </div>
                                </div>
                                <div className="mt-auto font-mono text-[11px] text-muted">
                                    Rating <span className="font-bold text-ink">{sq.rating}</span>{' '}
                                    &middot; {sq.players.length}p
                                </div>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </>
    );
}

/** A team's World Cups (newest first); each row opens that squad's roster. */
function TeamCups({ team, onOpen }: { team: TeamGroup; onOpen: (squadId: string) => void }) {
    return (
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
            {team.squads.map((s) => (
                <button
                    key={s.id}
                    onClick={() => onOpen(s.id)}
                    className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left transition last:border-b-0 hover:bg-pitch/5"
                >
                    <span className="font-mono text-[15px] font-bold tabular-nums">{s.year}</span>
                    <span className="ml-auto flex items-center gap-3 font-mono text-[11px] text-muted">
                        <span>
                            Rating <span className="font-bold text-ink">{s.rating}</span>
                        </span>
                        <span>{s.players.length}p</span>
                        <ArrowRight size={14} strokeWidth={2.5} className="text-pitch" />
                    </span>
                </button>
            ))}
        </div>
    );
}

/** Flat, cross-tournament result list. Each row carries its team as context and
 *  opens that squad's roster when clicked. Capped so a broad query never renders
 *  thousands of rows. */
function SearchResults({
    results,
    onOpen,
}: {
    results: { player: Player; squad: Squad }[];
    onOpen: (squadId: string) => void;
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
            {shown.map(({ player, squad }) => (
                <button
                    key={player.id}
                    onClick={() => onOpen(squad.id)}
                    className="flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left transition last:border-b-0 hover:bg-pitch/5"
                >
                    <span className="w-6 shrink-0 text-center font-mono text-[12px] text-muted tabular-nums">
                        {player.number}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold">{player.name}</div>
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
                </button>
            ))}
            {results.length > MAX_RESULTS && (
                <div className="border-t border-line px-4 py-2.5 text-center font-mono text-[11px] text-muted">
                    Showing top {MAX_RESULTS} of {results.length}. Refine your search to narrow it
                    down.
                </div>
            )}
        </div>
    );
}
