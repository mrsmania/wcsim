import { Check } from 'lucide-react';
import {
  AWARD,
  AWARDS_ON,
  FAMILY_NAME,
  type Challenge,
  type ChallengeFamily,
  type ChallengeTier,
} from '../domain/challenges';
import { TIER_META } from './stickerTheme';

/** Family accents. Fixed rather than theme-swapped, like the sticker tier ramp: they
 *  are identity, not chrome, and they are only ever a small dot or a 3px card edge. */
export const FAMILY_COLOR: Record<ChallengeFamily, string> = {
  silverware: '#b8862b',
  ascension: '#6d5bd0',
  identity: '#2e7d57',
  rating: '#2465b0',
  defence: '#4a6572',
  attack: '#c24a34',
  drama: '#9b3a6b',
  boosts: '#1e8a8a',
  album: '#a8762b',
  market: '#5e8c2b',
  shape: '#2f6e8f',
  career: '#8a5a2b',
};

/** Award tiers, easiest to hardest. THE KEYS ARE METAL AND THE LABELS ARE NOT, which is
 *  deliberate rather than an oversight: an id is permanent here (a completion is stored by
 *  challenge id and the tier keys are written into all 126 catalogue entries), so renaming
 *  `bronze` would be a dataset edit for a word on a screen. The label is the only thing a
 *  player ever sees, and "Bronze" printed in green said nothing true about either the
 *  difficulty or the colour.
 *
 *  Minor / Major / Landmark is the scale the catalogue actually holds: Finish first in
 *  your group, Win ten cups, Win at every Ascension tier. Change the words here and the
 *  legend, the row tooltips and the Prestige line all follow - they read this map. */
export const TIER_NAME: Record<ChallengeTier, string> = {
  bronze: 'Minor',
  silver: 'Major',
  gold: 'Landmark',
};

/** Easiest first, which is the order the legend and the Prestige line both walk. */
export const TIER_ORDER = ['bronze', 'silver', 'gold'] as const;

const TIER_STEP: Record<ChallengeTier, number> = { bronze: 1, silver: 2, gold: 3 };

/** THE HONOURS LEDGER IS THE THIRD SHELF ON THE STICKER RAMP, and these are the album's
 *  own values rather than three new ones. The album marks a card green -> amber -> gold
 *  foil and the boost library marks a card the same way (`cupRun/types.ts`); a third
 *  three-rung ladder in a fourth palette would have a player learning what gold means
 *  three times. So a Landmark honour is the Monumental gold, a Major is the Iconic amber
 *  and a Minor is the Legendary green.
 *
 *  It was monochrome for a while, on the reading that a tier is a scale rather than a
 *  category and that 126 entries cannot each be painted. The scale half of that is right
 *  and stays - `TierPips` still COUNTS the tier, which is what survives being 5px, being
 *  on a phone and being read by somebody who cannot tell the amber from the gold. What
 *  changed is that the count is now drawn in the ramp's own colour, so the mark agrees
 *  with the two shelves next door instead of being a fourth answer.
 *
 *  Two maps for the same rung, exactly as the boost library has: `TIER_COLOR` is a
 *  SURFACE (the pip) and `TIER_INK` is the same rung as TEXT. The accent misses AA
 *  outright as a small label - on paper the gold measures 2.57 and the amber 2.49 against
 *  the 4.5 a bold word that size needs - which is the whole reason the `-ink` tokens
 *  exist, and why they are spent as classes: an `-ink` token flips between the themes and
 *  a hex in a map cannot. */
export const TIER_COLOR: Record<ChallengeTier, string> = {
  bronze: TIER_META.legendary.accent,
  silver: TIER_META.iconic.accent,
  gold: TIER_META.monumental.accent,
};

export const TIER_INK: Record<ChallengeTier, string> = {
  bronze: TIER_META.legendary.ink,
  silver: TIER_META.iconic.ink,
  gold: TIER_META.monumental.ink,
};

/** The tier as a COUNT in the ramp's colour: one filled slot, two, or three. The unfilled
 *  slots are drawn rather than omitted, so every row agrees on where the mark ends and a
 *  reader can see that three is the top without having met a Landmark yet. Same device
 *  and same 5px as the boost library's `RarityPips`, which took it from here. */
export function TierPips({ tier }: { tier: ChallengeTier }) {
  const n = TIER_STEP[tier];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-[2px]"
      title={`${TIER_NAME[tier]} (${n} of 3)`}
    >
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="h-[5px] w-[5px] rounded-[1px]"
          style={{ background: TIER_COLOR[tier], opacity: i <= n ? 1 : 0.16 }}
        />
      ))}
    </span>
  );
}

/** The family dot, the one marker every challenge surface shares. */
function FamilyDot({ family }: { family: ChallengeFamily }) {
  return (
    <span
      className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: FAMILY_COLOR[family] }}
      title={FAMILY_NAME[family]}
      aria-hidden="true"
    />
  );
}

/** A compact one-line challenge: dot, name, what it asks, what it paid. Used by the
 *  run-end list and the career-hub card, so a completion reads the same in both. */
export default function ChallengeRow({ challenge }: { challenge: Challenge }) {
  return (
    <div className="flex items-start gap-2.5">
      <FamilyDot family={challenge.family} />
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[14px] font-bold leading-tight tracking-[-0.01em]">
          {challenge.name}
        </span>
        <span className="block text-[12px] leading-snug text-muted">{challenge.description}</span>
      </span>
      {AWARDS_ON && (
        <span className="shrink-0 font-mono text-[12.5px] font-bold text-accent">
          +{AWARD[challenge.tier]}
        </span>
      )}
    </div>
  );
}

/** One catalogue line. No card, no border, no shadow: 126 honours want a list, not a
 *  grid of tiles, so an entry is type on paper between two hairlines. Its whole state
 *  is ink versus dim on the name, plus the mark on the left - a green tick is the only
 *  colour an entry ever carries, and it only appears once you have earned it. An entry
 *  still waiting on tracking fades a step further and says why on hover; no red,
 *  because "not tracked yet" is not a failure. */
export function ChallengeLedgerRow({
  challenge,
  done,
}: {
  challenge: Challenge;
  done: boolean;
}) {
  // No blocked state: see the note in ChallengesScreen (hygiene D6).
  return (
    <div className="flex items-start gap-[11px] border-b border-hair px-0.5 py-2">
      <span
        className={`mt-0.5 grid h-[15px] w-[15px] shrink-0 place-items-center ${
          done ? 'text-pitch-ink' : 'text-dim'
        }`}
        aria-hidden="true"
      >
        {done ? (
          <Check size={11} strokeWidth={3.2} />
        ) : (
          <span className="h-[9px] w-[9px] rounded-full border-[1.5px] border-current opacity-45" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block font-display text-[13.5px] leading-tight tracking-[-0.005em] ${
            done ? 'font-extrabold text-ink' : 'font-bold text-dim'
          }`}
        >
          {challenge.name}
          {/* The mark is the visual state; this is the same fact for a screen reader,
              which cannot see that the name is a shade darker. */}
          <span className="sr-only">
            {done ? ' - completed' : ' - not yet won'}
          </span>
        </span>
        <span className={`block text-[12px] leading-[1.35] ${done ? 'text-muted' : 'text-dim'}`}>
          {challenge.description}
        </span>
      </span>
      {/* Green only once it is yours. The award is on every row, so painting it
          accent regardless would put the page straight back to a field of colour, which
          is the one thing this layout exists to avoid: earned is the only ink. */}
      {AWARDS_ON && (
        <span
          className={`mt-px shrink-0 font-mono text-[11.5px] font-bold ${
            done ? 'text-accent' : 'text-dim'
          }`}
        >
          +{AWARD[challenge.tier]}
        </span>
      )}
      <span className="mt-[5px]">
        <TierPips tier={challenge.tier} />
      </span>
    </div>
  );
}
