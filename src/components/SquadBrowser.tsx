import { useMemo, useState } from 'react';
import { SQUADS, SQUAD_BY_ID } from '../data/squads';
import { primaryPosition, type Player, type Squad } from '../data/types';
import { ArrowLeft, Search, X } from 'lucide-react';
import Flag from './Flag';
import TeamRoster from './TeamRoster';

/** Distinct tournament years, newest first for the selector. */
const YEARS = [...new Set(SQUADS.map((s) => s.year))].sort((a, b) => b - a);

/** Lowercase + strip diacritics, so "Muller" matches "Müller". */
const norm = (s: string) =>
    s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');

/** A full 32-nation field; below this a year is hand-authored placeholder data. */
const FULL_FIELD = 32;
const MAX_RESULTS = 80;

/**
 * Read-only browser over the whole dataset. Three views off one piece of local
 * state: a nation grid for the selected World Cup, a single squad's roster, and a
 * cross-tournament search. Every player is shown with full name, jersey number,
 * main position and rating.
 */
export default function SquadBrowser() {
    const [year, setYear] = useState<number>(YEARS[0]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
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

    return (
        <>
            {/* Section header (matches the game screens' eyebrow + title) */}
            <div className="mb-5 mt-7 flex items-center gap-4">
                <div>
                    <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-pitch">
                        Archive
                    </div>
                    <h2 className="mt-0.5 font-display text-3xl font-extrabold leading-none tracking-[-0.02em]">
                        {searching
                            ? 'Search'
                            : selected
                              ? `${selected.nation} ${selected.year}`
                              : 'Browse the squads'}
                    </h2>
                </div>
                <div className="relative h-0 flex-1 border-t-2 border-line">
                    <span className="absolute -top-[5px] left-0 h-2 w-2 rounded-full border-2 border-line bg-panel" />
                </div>
            </div>

            {/* Toolbar: context control (year tabs / back / result count) + search */}
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
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
                            All squads
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

            {/* Content */}
            {searching ? (
                <SearchResults results={results} onOpen={openSquad} />
            ) : selected ? (
                <TeamRoster squad={selected} />
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
