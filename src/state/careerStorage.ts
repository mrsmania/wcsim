import { INITIAL_CAREER, levelForXp, type CareerState } from '../domain/career';
import { readJson, writeJson } from './storage/kv';

/** localStorage key for the manager career. Separate from the game + album keys,
 *  so a game reset never touches career progress. */
export const CAREER_KEY = 'wcsim_career_v1';

/** A stored career from any version: v2 uses `perkLevels`; v1 stored boolean-owned
 *  perk ids in `unlocked`. */
type StoredCareer = Partial<CareerState> & {
  unlocked?: unknown;
  /** `Record<string, unknown>` rather than `unknown`, so reading it needs no cast: the
   *  runtime guard below is what actually validates the values, and it checks each one
   *  (hygiene H155). A stored map with the wrong value types still parses to an object. */
  perkLevels?: Record<string, unknown>;
  completedChallenges?: unknown[];
};

/** Perk ownership, migrated to the v2 `perkLevels` map: prefer a stored map, else
 *  map v1's owned perk ids to tier 1 each. Defensive against malformed values. */
function migratePerkLevels(parsed: StoredCareer): Record<string, number> {
  const out: Record<string, number> = {};
  if (parsed.perkLevels && typeof parsed.perkLevels === 'object') {
    for (const [k, v] of Object.entries(parsed.perkLevels)) {
      if (typeof v === 'number' && v > 0) out[k] = v;
    }
    return out;
  }
  if (Array.isArray(parsed.unlocked)) {
    for (const id of parsed.unlocked) if (typeof id === 'string') out[id] = 1;
  }
  return out;
}

export function loadCareer(): CareerState {
  return readJson(
    CAREER_KEY,
    (raw) => {
      const parsed = raw as StoredCareer;
      // Rebuild explicitly from known fields (migrating v1 -> v2), so a partial/older
      // save loads cleanly and no stale legacy keys (e.g. `unlocked`) are carried on.
      const xp = typeof parsed.xp === 'number' ? parsed.xp : 0;
      return {
        version: 2,
        xp,
        level: levelForXp(xp),
        prestige: typeof parsed.prestige === 'number' ? parsed.prestige : 0,
        perkLevels: migratePerkLevels(parsed),
        unlockedBoons: Array.isArray(parsed.unlockedBoons) ? parsed.unlockedBoons : [],
        ascension: typeof parsed.ascension === 'number' ? parsed.ascension : 0,
        lastAscension: typeof parsed.lastAscension === 'number' ? parsed.lastAscension : undefined,
        completedChallenges: Array.isArray(parsed.completedChallenges)
          ? parsed.completedChallenges.filter((id): id is string => typeof id === 'string')
          : [],
        stats: { ...INITIAL_CAREER.stats, ...(parsed.stats ?? {}) },
      };
    },
    INITIAL_CAREER,
  );
}

export function saveCareer(career: CareerState): void {
  writeJson(CAREER_KEY, career);
}
