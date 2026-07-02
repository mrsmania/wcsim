import {
    categoryOf,
    CATEGORY_ORDER,
    primaryPosition,
    type PositionCategory,
    type Squad,
} from '../data/types';
import { tierOf } from '../domain/album';
import { FEATURES } from '../config';
import Flag from './Flag';
import CollectibleStar from './CollectibleStar';
import { TIER_META } from './StickerCard';

const CATEGORY_LABEL: Record<PositionCategory, string> = {
    GK: 'Goalkeepers',
    DEF: 'Defenders',
    MID: 'Midfielders',
    FWD: 'Forwards',
};

/** Column grid shared by the header and every player row so columns line up:
 *  jersey # / full name / main position / rating. */
const ROW = 'grid grid-cols-[28px_1fr_auto_40px] items-center gap-2.5 px-4';

/**
 * A single squad as a reference roster: a header (flag, nation, year, team
 * rating, squad average, size) and the full player list grouped GK -> DEF ->
 * MID -> FWD. Each row shows the four required fields, always visible: jersey
 * number, full name, main position (positions[0]), and rating. Pure over `squad`.
 */
export default function TeamRoster({ squad }: { squad: Squad }) {
    const avg = squad.players.length
        ? Math.round(squad.players.reduce((s, p) => s + p.elo, 0) / squad.players.length)
        : 0;

    return (
        <div className="overflow-hidden rounded-md border border-line bg-panel shadow-hard">
            {/* Squad header */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b-2 border-ink px-4 py-3.5">
                <Flag code={squad.code} className="h-6 w-9" />
                <span className="font-display text-lg font-extrabold uppercase leading-none tracking-[-0.01em]">
                    {squad.nation}
                </span>
                <span className="font-mono text-[13px] font-semibold text-muted">{squad.year}</span>
                <span className="ml-auto font-mono text-[11px] font-semibold tracking-[0.02em] text-muted">
                    Team <span className="text-ink">{squad.rating}</span> &middot; Avg{' '}
                    <span className="text-ink">{avg}</span> &middot; {squad.players.length} players
                </span>
            </div>

            {/* Column header */}
            <div
                className={`${ROW} border-b border-line py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted`}
            >
                <span className="text-center">#</span>
                <span>Name</span>
                <span className="text-right">Pos</span>
                <span className="text-right">Rating</span>
            </div>

            {/* Grouped roster */}
            {CATEGORY_ORDER.map((cat) => {
                const group = squad.players
                    .filter((p) => categoryOf(primaryPosition(p)) === cat)
                    .sort((a, b) => b.elo - a.elo || a.number - b.number);
                if (group.length === 0) return null;
                return (
                    <div key={cat}>
                        <div className="border-b border-line bg-ground/60 px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-pitch">
                            {CATEGORY_LABEL[cat]}
                            <span className="ml-1.5 text-muted">&middot; {group.length}</span>
                        </div>
                        {group.map((p) => {
                            const tier = FEATURES.stickerAlbum ? tierOf(p) : null;
                            return (
                            <div
                                key={p.id}
                                className={`${ROW} border-b border-line py-2 last:border-b-0`}
                                style={tier ? { boxShadow: `inset 3px 0 0 ${TIER_META[tier].accent}` } : undefined}
                            >
                                <span className="text-center font-mono text-[12px] text-muted tabular-nums">
                                    {p.number}
                                </span>
                                <span className="flex min-w-0 items-center gap-1.5">
                                    <span className="truncate text-[13.5px] font-semibold">{p.name}</span>
                                    {tier && <CollectibleStar tier={tier} />}
                                </span>
                                <span className="text-right font-mono text-[11px] font-semibold text-muted">
                                    {primaryPosition(p)}
                                </span>
                                <span className="text-right font-mono text-sm font-bold tabular-nums">
                                    {p.elo}
                                </span>
                            </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}
