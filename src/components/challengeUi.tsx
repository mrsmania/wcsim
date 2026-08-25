import { Check } from 'lucide-react';
import {
  AWARD,
  AWARDS_ON,
  FAMILY_NAME,
  type Challenge,
  type ChallengeFamily,
  type ChallengeTier,
} from '../domain/challenges';

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

/** Award tiers, bronze -> silver -> gold. Deliberately NOT a colour any more: the
 *  catalogue is 130 entries and it could not afford three more hues on top of the
 *  twelve family accents. While awards are off the tier reads as difficulty, which is
 *  a scale rather than a category, so `TierPips` draws it as three filled slots. */
const TIER_NAME: Record<ChallengeTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
};
const TIER_STEP: Record<ChallengeTier, number> = { bronze: 1, silver: 2, gold: 3 };

/** Difficulty as three monochrome slots, filled 1 / 2 / 3. Both opacities are of the
 *  ink, so the pips sit in whatever theme is on without a token of their own. */
export function TierPips({ tier }: { tier: ChallengeTier }) {
  const n = TIER_STEP[tier];
  return (
    <span className="inline-flex shrink-0 gap-[2px] text-ink" title={`${TIER_NAME[tier]} (${n} of 3)`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-[5px] w-[5px] rounded-[1px] bg-current ${
            i <= n ? 'opacity-50' : 'opacity-[0.13]'
          }`}
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
        <span className="block font-display text-[14px] font-extrabold leading-tight tracking-[-0.01em]">
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

/** One catalogue line. No card, no border, no shadow: 130 honours want a list, not a
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
          done ? 'text-pitch' : 'text-dim'
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
      {/* Green only once it is yours. The award is on all 130 rows, so painting it
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
