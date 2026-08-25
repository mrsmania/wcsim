import { hydrateCareer, INITIAL_CAREER, type CareerState } from '../domain/career';
import { readJson, writeJson } from './storage/kv';

/** localStorage key for the manager career. Separate from the game + album keys,
 *  so a game reset never touches career progress. */
export const CAREER_KEY = 'wcsim_career_v1';

/** A stored career from any version: v2 uses `perkLevels`; v1 stored boolean-owned
 *  perk ids in `unlocked`. */
type StoredCareer = Partial<CareerState> & {
  unlocked?: unknown;
  /** `Record<string, unknown>` rather than `unknown`, so reading it needs no cast: the
   *  runtime guard in `hydrateCareer` is what actually validates the values, and it
   *  checks each one (hygiene H155). A stored map with the wrong value types still
   *  parses to an object. */
  perkLevels?: Record<string, unknown>;
  completedChallenges?: unknown[];
};

/** Perk ownership, migrated to the v2 `perkLevels` map: prefer a stored map, else
 *  map v1's owned perk ids to tier 1 each.
 *
 *  This is all that is left here of loading a career, and deliberately so: the field
 *  list lives in `hydrateCareer` (hygiene H89), and the v1 migration is the one thing
 *  the guest side has that the account side does not. `hydrateCareer` re-validates the
 *  values of whatever this returns, so a malformed stored map cannot get through by
 *  taking the first branch. */
function migratePerkLevels(parsed: StoredCareer): Record<string, unknown> {
  if (parsed.perkLevels && typeof parsed.perkLevels === 'object') return parsed.perkLevels;
  const out: Record<string, number> = {};
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
      return hydrateCareer({ ...parsed, perkLevels: migratePerkLevels(parsed) });
    },
    INITIAL_CAREER,
  );
}

export function saveCareer(career: CareerState): void {
  writeJson(CAREER_KEY, career);
}
