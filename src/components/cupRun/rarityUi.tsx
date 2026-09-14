import type { CSSProperties } from 'react';
import type { Rarity } from '../../domain/boons';
import { RARITY_COLOR, RARITY_INK, RARITY_STEP, RARITY_STRIP } from './types';

/** How a boost card wears its rarity, in ONE place.
 *
 *  There are two cards - the library tile on `/career` and the card a run offers between
 *  rounds - and CLAUDE.md's standing rule about them is that they have to be the same
 *  object, or a player learns what gold means twice. They were held together by both
 *  files happening to reach for the same two maps, which is an agreement rather than a
 *  guarantee: the shop drew a 2px dot in three colours of its own until 2026-09-02. This
 *  module is the guarantee.
 */

/** The 3px bar across the top of a card.
 *
 *  A `background-image` and not a `borderTop`, because the top rung is the album's gold
 *  FOIL and a border takes a flat colour. Painted on the border box at the very top edge,
 *  so it renders exactly where the border did and the card's own radius still clips it -
 *  and, unlike a border, it costs no layout, so a card cannot change height by wearing a
 *  different rarity. */
export function rarityStrip(rarity: Rarity): CSSProperties {
    return {
        backgroundImage: RARITY_STRIP[rarity],
        backgroundSize: '100% 3px',
        backgroundRepeat: 'no-repeat',
    };
}

/** The rarity as a COUNT: one filled slot, two, or three.
 *
 *  This is the half that actually separates rare from legendary, and it is the device the
 *  honours ledger already uses for challenge tiers (`TierPips`) having reached the same
 *  conclusion there - a rank is a scale, so draw it as a scale. The unfilled slots are
 *  drawn rather than omitted, so the three cards agree on where the mark ends and the
 *  reader can see that three is the top without having met a legendary yet.
 *
 *  `on` is the offer card's chosen state, which fills with deep green: the pips go white
 *  there for the same reason the word does. */
export function RarityPips({ rarity, on }: { rarity: Rarity; on?: boolean }) {
    const n = RARITY_STEP[rarity];
    return (
        <span
            className="inline-flex shrink-0 items-center gap-[2px]"
            title={`${rarity} (${n} of 3)`}
            aria-hidden="true"
        >
            {[1, 2, 3].map((i) => (
                <span
                    key={i}
                    className="h-[5px] w-[5px] rounded-[1px]"
                    style={{
                        background: on ? '#ffffff' : RARITY_COLOR[rarity],
                        opacity: i <= n ? 1 : 0.16,
                    }}
                />
            ))}
        </span>
    );
}

/** The word and the pips together, which is how a card names its rarity.
 *
 *  The word is the plain-English label and the pips are the part that survives being
 *  small, being on a phone, being in the dark theme, or being read by somebody who cannot
 *  tell the amber from the gold - which on paper is nearly everybody, the two inks being
 *  five degrees apart. See `RARITY_INK` for why that is not fixable at this size. */
export function RarityMark({ rarity, on }: { rarity: Rarity; on?: boolean }) {
    return (
        <span className="inline-flex items-center gap-[5px]">
            <span className={`font-mono text-[9px] font-bold ${on ? 'text-white' : RARITY_INK[rarity]}`}>
                {rarity}
            </span>
            <RarityPips rarity={rarity} on={on} />
        </span>
    );
}
