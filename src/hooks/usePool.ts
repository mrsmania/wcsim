import { useMemo } from 'react';
import { squadsInPool } from '../data/squads';
import type { Player, Squad } from '../data/types';

// The active squad pool: which World Cups the game draws from. It is the one setting with
// reach - the user's rolls, the transfer market, the opponents, the odds simulation and
// the album's completion target all read it - so it is derived once and handed out.
//
// Part of hygiene H86. The other half of that item, having screens read the pool from the
// store through a subscription instead of receiving it as a prop, was NOT taken: see the
// audit's negative-results section for the reasoning.

export interface Pool {
    /** The squads in the pool. Never empty: an empty selection falls back to all years. */
    squads: readonly Squad[];
    /** Every player in those squads. */
    players: Player[];
    /** Those players by id, for resolving a held or persisted id back to a player - and
     *  for answering "is this id still in the pool at all", which is what the transfer
     *  market needs when the pool changes with a card in hand. */
    byId: Map<string, Player>;
}

export function usePool(poolYears: readonly number[]): Pool {
    const squads = useMemo(() => squadsInPool(poolYears), [poolYears]);
    const players = useMemo(() => squads.flatMap((s) => s.players), [squads]);
    const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
    return { squads, players, byId };
}
