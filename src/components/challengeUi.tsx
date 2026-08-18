import { Check, Lock } from 'lucide-react';
import {
  AWARD,
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

/** Award tiers, bronze -> silver -> gold. */
export const TIER_COLOR: Record<ChallengeTier, string> = {
  bronze: '#a9722f',
  silver: '#6f7a83',
  gold: '#b98c2e',
};
export const TIER_NAME: Record<ChallengeTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
};

/** The family dot, the one marker every challenge surface shares. */
export function FamilyDot({ family }: { family: ChallengeFamily }) {
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
export default function ChallengeRow({
  challenge,
  award,
}: {
  challenge: Challenge;
  /** Prestige to show on the right (the tier award). */
  award: number;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <FamilyDot family={challenge.family} />
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[14px] font-extrabold leading-tight tracking-[-0.01em]">
          {challenge.name}
        </span>
        <span className="block text-[12px] leading-snug text-muted">{challenge.description}</span>
      </span>
      <span className="shrink-0 font-mono text-[12.5px] font-bold text-accent">+{award}</span>
    </div>
  );
}

/** One catalogue entry, in its three states: completed (green tick), still open, or
 *  waiting on tracking that does not exist yet (dashed, with the reason on hover). */
export function ChallengeCard({
  challenge,
  done,
}: {
  challenge: Challenge;
  done: boolean;
}) {
  const blocked = !!challenge.blocked && !done;
  return (
    <article
      className={`relative flex flex-col gap-1 rounded-md border p-2.5 pl-3 ${
        blocked ? 'border-dashed border-line opacity-70' : 'border-line bg-panel shadow-hard'
      }`}
      style={{ borderLeft: `3px solid ${FAMILY_COLOR[challenge.family]}` }}
    >
      <div className="flex items-center gap-2">
        <span
          className="rounded-[3px] px-1.5 py-[1px] font-mono text-[8.5px] font-bold uppercase tracking-[0.12em] text-white"
          style={{ background: TIER_COLOR[challenge.tier] }}
        >
          {TIER_NAME[challenge.tier]}
        </span>
        <span className="ml-auto font-mono text-[12px] font-bold text-accent">
          +{AWARD[challenge.tier]}
        </span>
      </div>
      <h4 className="font-display text-[15px] font-extrabold leading-tight tracking-[-0.01em]">
        {challenge.name}
      </h4>
      <p className="text-[12.5px] leading-snug text-muted">{challenge.description}</p>
      {done ? (
        <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-accent">
          Completed
        </p>
      ) : blocked ? (
        <p
          className="flex items-center gap-1 font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-loss"
          title={challenge.blocked}
        >
          <Lock size={10} aria-hidden="true" /> Not tracked yet
        </p>
      ) : (
        <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted opacity-60">
          Not yet
        </p>
      )}
      {done && (
        <span
          className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-pitch text-white ring-2 ring-ground"
          aria-hidden="true"
        >
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </article>
  );
}
