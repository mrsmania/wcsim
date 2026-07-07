/** How hard it is to win a tie. Lower difficulty helps the user in a direct duel;
 *  higher hurts. `normal` is the shipped baseline (no handicap). */
export type Difficulty = 'casual' | 'normal' | 'hard';

/** Rating points added to the USER's attack and defense in their own matches only.
 *  Casual gives the user an edge, hard a deficit. Applied via `userGroupTeam`, so it
 *  reaches every user match (group, knockout, both game modes, and the odds sim) but
 *  never the opponents, the draw weighting, or the displayed team rating (which reads
 *  `overall`, left untouched) - it moves the goal expectation, hence the win
 *  probability, and nothing else. Tunable here. */
const USER_ATK_DEF_DELTA: Record<Difficulty, number> = {
    casual: 3,
    normal: 0,
    hard: -3,
};

export function userRatingDelta(d: Difficulty): number {
    return USER_ATK_DEF_DELTA[d];
}
