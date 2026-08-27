import { categoryOf, CATEGORY_ORDER } from '../data/types';
import { lastName } from '../data/format';
import type { Formation } from '../domain/formations';
import type { Filled } from '../domain/draft';
import { tierOf } from '../domain/album';
import { priceFor, xiSpend } from '../domain/pricing';
import { SQUAD_BY_ID } from '../data/squads';
import { FEATURES } from '../config';
import Flag from './Flag';
import CollectibleStar from './CollectibleStar';
import { TIER_META } from './stickerTheme';
import { CARD } from './matchUi';

/** The placed XI as a line-up sheet: position, last name, flag + year, rating,
 *  ordered back to front (GK, DEF, MID, FWD). Sits in the right column beside the
 *  pitch (and below it when stacked), so the pitch badges can stay minimal. In the
 *  budget build (`budget` set) it also shows each player's cost and the total spent
 *  in the header, so the spend stays visible once the XI is complete (the left-column
 *  market panel is replaced by the complete panel then). */
export default function XiTable({
    formation,
    filled,
    budget,
    ratings = true,
    ownedStickerIds,
}: {
    formation: Formation;
    filled: Filled;
    budget?: number;
    /** Whether the rating column is there at all. False in a hidden-ratings versus room
     *  (P5): the sheet keeps position, name, flag and year, which is what a player picks
     *  on when the numbers are off. */
    ratings?: boolean;
    /** Player ids already in the album, so the row marker matches the player lists
     *  the XI was picked from (a star meaning two things on one screen would be worse
     *  than no marker). Optional: absent means "unknown", which reads as not owned. */
    ownedStickerIds?: Set<string>;
}) {
    const ordered = [...formation.slots].sort(
        (a, b) =>
            CATEGORY_ORDER.indexOf(categoryOf(a.position)) -
            CATEGORY_ORDER.indexOf(categoryOf(b.position)),
    );
    const placedSlots = ordered.filter((s) => filled[s.id]);
    const placed = placedSlots.length;
    const isBudget = budget != null;
    // One definition of "the spend", shared with the market's budget bar and the run's
    // build record, so the three cannot disagree about what this XI cost.
    const spent = isBudget
        ? xiSpend(
              placedSlots.map((s) => filled[s.id]).filter((p) => !!p),
              ownedStickerIds,
          )
        : 0;
    // The column set, and it is four strings rather than a template because Tailwind
    // emits utilities from the classes it can SEE - a computed one would not exist.
    const cols = ratings
        ? isBudget
            ? 'grid-cols-[30px_1fr_auto_auto_auto]'
            : 'grid-cols-[30px_1fr_auto_auto]'
        : isBudget
          ? 'grid-cols-[30px_1fr_auto_auto]'
          : 'grid-cols-[30px_1fr_auto]';

    return (
        <div className={`overflow-hidden ${CARD}`}>
            <div className="flex items-center justify-between border-b-2 border-ink px-4 py-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted">
                <span>
                    Line-up{' '}
                    <span className="tracking-[0.1em] text-pitch-ink">
                        &middot; {placed}/{formation.slots.length}
                    </span>
                </span>
                {isBudget ? (
                    <span className="tabular-nums tracking-[0.06em]">
                        <b className={spent > budget ? 'text-loss' : 'text-ink'}>${spent}</b>
                        <span className="text-muted"> / ${budget}</span>
                    </span>
                ) : (
                    ratings && <span>Rating</span>
                )}
            </div>
            {ordered.map((slot) => {
                const player = filled[slot.id];
                const sq = player ? SQUAD_BY_ID[player.squadId] : null;
                const isGk = slot.position === 'GK';
                // Collectible marker + tier accent, matching the drawn-squad list.
                const tier = player && FEATURES.stickerAlbum ? tierOf(player) : null;
                return (
                    <div
                        key={slot.id}
                        className={`grid ${cols} items-center gap-2.5 border-b border-line px-4 py-2.5 last:border-b-0 ${isGk ? 'bg-chalk' : ''}`}
                        style={tier ? { boxShadow: `inset 3px 0 0 ${TIER_META[tier].accent}` } : undefined}
                    >
                        <span className="font-mono text-[11px] font-semibold tracking-[0.04em] text-pitch-ink">
                            {slot.label}
                        </span>
                        <span
                            className={`flex min-w-0 items-center gap-1.5 text-[13.5px] ${player ? 'font-semibold' : 'text-muted'}`}
                        >
                            <span className="truncate">{player ? lastName(player.name) : '–'}</span>
                            {player && tier && (
                                <CollectibleStar tier={tier} owned={!!ownedStickerIds?.has(player.id)} />
                            )}
                        </span>
                        <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
                            {sq ? (
                                <>
                                    <Flag code={sq.code} className="h-3.5 w-5" />
                                    <span className="tabular-nums">{sq.year}</span>
                                </>
                            ) : (
                                '–'
                            )}
                        </span>
                        {ratings && (
                            <span className="min-w-[24px] text-right font-mono text-sm font-bold">
                                {player ? player.elo : '–'}
                            </span>
                        )}
                        {isBudget && (
                            <span className="min-w-[26px] text-right font-mono text-[11.5px] text-muted tabular-nums">
                                {player ? `$${priceFor(player, ownedStickerIds)}` : '–'}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
