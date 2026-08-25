import { useCallback, useState } from 'react';
import {
    applyRunResult,
    buyPerkTier,
    rememberAscension,
    startRunCareer,
    unlockBoon,
    type CareerState,
    type ChallengeInput,
    type RunReward,
} from '../domain/career';
import type { RunState } from '../domain/run';
import { store } from '../state/store';

// The career, and the four things that change it. It was state inside `CupRunScreen`,
// which is why the composition root had two `store.peek()` memos with eslint-disables
// re-reading the career on every navigation just to price the transfer market, offer the
// right Ascension tiers and colour the challenge ledger (hygiene H81).
//
// Owned by App now, seeded from the boot snapshot like the sticker album, and passed
// down. Every write goes state-first then through the store, so the screen that spent the
// Prestige and the page that reads the budget can never disagree.

export interface Career {
    career: CareerState;
    /** Buy the next tier of a perk. */
    buyPerk: (perkId: string) => void;
    /** Unlock a boost into the offer pool. */
    unlockBoost: (boonId: string) => void;
    /** Remember the Ascension tier a run is starting at, and SPEND any start-boost grant
     *  an earlier run banked. Returns how many boosts this run is owed.
     *
     *  The "dealt exactly once" invariant is `startRunCareer`'s, where the checks harness
     *  can see it; it returns the career unchanged by identity when there is nothing to
     *  write, which is what the save below skips on. */
    startRun: (tier: number) => number;
    /** Remember the tier the next run will start at, WITHOUT spending a start-boost
     *  grant. This is what the Ascension picker calls: it is picked and re-picked freely
     *  before kickoff, and only the kickoff itself may deal a grant. */
    rememberAscension: (tier: number) => void;
    /** Bank a finished run: XP, Prestige, the counters and the challenges it completed.
     *  Judged against the career AFTER the run's own reward lands, so "win 10 cups"
     *  counts the cup just won. */
    bankRun: (run: RunState, challenges?: ChallengeInput, at?: number) => RunReward;
}

export function useCareer(seed: CareerState): Career {
    const [career, setCareer] = useState<CareerState>(seed);

    const write = useCallback((next: CareerState) => {
        setCareer(next);
        void store.saveCareer(next);
    }, []);

    const buyPerk = useCallback(
        (perkId: string) => write(buyPerkTier(career, perkId)),
        [career, write],
    );

    const unlockBoost = useCallback(
        (boonId: string) => write(unlockBoon(career, boonId)),
        [career, write],
    );

    const startRun = useCallback(
        (tier: number) => {
            const { career: next, owed } = startRunCareer(career, tier);
            if (next !== career) write(next);
            return owed;
        },
        [career, write],
    );

    const remember = useCallback(
        (tier: number) => {
            const next = rememberAscension(career, tier);
            if (next !== career) write(next);
        },
        [career, write],
    );

    const bankRun = useCallback(
        (run: RunState, challenges?: ChallengeInput, at?: number) => {
            const reward = applyRunResult(career, run, challenges, at);
            write(reward.career);
            return reward;
        },
        [career, write],
    );

    return { career, buyPerk, unlockBoost, startRun, rememberAscension: remember, bankRun };
}
