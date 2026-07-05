import { INITIAL_CAREER, type CareerState } from '../domain/career';

/** localStorage key for the manager career. Separate from the game + album keys,
 *  so a game reset never touches career progress. */
const KEY = 'wcsim_career_v1';

export function loadCareer(): CareerState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return INITIAL_CAREER;
    const parsed = JSON.parse(raw) as Partial<CareerState>;
    // Merge onto defaults so a partial/older save still loads cleanly.
    return {
      ...INITIAL_CAREER,
      ...parsed,
      unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked : [],
      stats: { ...INITIAL_CAREER.stats, ...(parsed.stats ?? {}) },
    };
  } catch {
    return INITIAL_CAREER;
  }
}

export function saveCareer(career: CareerState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(career));
  } catch {
    /* ignore quota / disabled storage */
  }
}
