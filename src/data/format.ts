import type { Position } from './types';

// Display formatters for player/position text. Kept out of `types.ts` so that
// module stays pure type + domain-helper declarations.

/** Display helper: "RB/RM". */
export function formatPositions(positions: Position[]): string {
  return positions.join('/');
}

/** Search normalizer: lowercase + strip combining diacritics (NFD splits 'ü'
 *  into 'u' + accent, U+0300..U+036F), so "Muller" matches "Müller". */
export function normalizeSearch(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Surname particles kept with the last name (e.g. "Van der Sar", "de Boer"). */
const NAME_PARTICLES = new Set([
  'de', 'del', 'der', 'den', 'van', 'von', 'di', 'da', 'dos', 'das',
  'do', 'la', 'le', 'el', 'ter', 'ten', 'bin', 'al',
]);

/** Display surname: the last word, plus any leading particles. Index 0 (a lone
 *  first name) is never consumed: single-word names return whole, and the
 *  particle walk stops at `i > 0`. Dots are stripped only when testing a token
 *  against the particle set, not from the returned surname. */
export function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return full;
  let i = parts.length - 1;
  while (i > 0 && NAME_PARTICLES.has(parts[i - 1].toLowerCase().replace(/\./g, ''))) i--;
  return parts.slice(i).join(' ');
}
