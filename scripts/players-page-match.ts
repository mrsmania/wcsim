/**
 * Match the two datasets player for player, so each row can show what the OTHER
 * game rates the same man at (the "vs" column in `docs/players.html`).
 *
 * The join is (nation, tournament, name), never a name on its own: the same squad
 * at the same World Cup is a small, closed pool - 22 to 26 men - which is what
 * makes a fuzzy name comparison safe enough to use at all. Neither source carries
 * an id the other knows.
 *
 * Three passes, each MUTUALLY UNIQUE: a pair is taken only when this row's sole
 * candidate has no other claimant in the same squad, and a man taken by one pass
 * is out of the pool for the next. That is what stops 7a0's "Paulo Cesar Caju"
 * and "Cesar Maluco" from both landing on WCS's single "Cesar" - one candidate
 * each, two claimants, so neither is guessed.
 *
 *   1. the folded names are equal ("Gerd Muller")
 *   2. one name's tokens are a subset of the other's ("Piazza" in "Wilson Piazza")
 *   3. an edit distance of 2 over the whole name, or 1 over the surname, which is
 *      the transliteration pass: Rivelino/Rivellino, Mihaylov/Mikhailov,
 *      Yakovenko's Pavlo/Pavel, Haaland/Haland
 *
 * Measured on the current data: of the 5,040 7a0 rows whose squad WCS also has,
 * 4,856 match exactly, 104 on tokens and 43 fuzzily - 99.3% - leaving 10 refused
 * as ambiguous and 27 with nobody to match.
 */
import type { SetBlob } from './players-page';

/** No counterpart in the other dataset. Fits in the Int8Array the page decodes
 *  into, and no real difference can reach it (the scale is 60 to 99). */
export const DIFF_NONE = 127;

const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Edit distance, given up on past 2 - the only question asked of it. */
function near(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length] <= max;
}

interface Row {
  /** Index of the row within its dataset. */
  i: number;
  name: string;
  tokens: string[];
  squad: string;
  rating: number;
}

function rowsOf(set: SetBlob): Row[] {
  const out: Row[] = [];
  for (let i = 0, r = 0; r < set.rows.length; i++, r += 7) {
    const name = fold(set.persons[set.rows[r]]);
    out.push({
      i,
      name,
      tokens: name.split(' '),
      squad: `${set.nations[set.rows[r + 1]][0]}|${set.years[set.rows[r + 2]]}`,
      rating: set.rows[r + 5],
    });
  }
  return out;
}

const subset = (a: string[], b: string[]): boolean => {
  const s = new Set(b);
  return a.every((t) => s.has(t));
};

const STAGES: ((a: Row, b: Row) => boolean)[] = [
  (a, b) => a.name === b.name,
  (a, b) => subset(a.tokens, b.tokens) || subset(b.tokens, a.tokens),
  (a, b) =>
    near(a.name, b.name, 2) || near(a.tokens[a.tokens.length - 1], b.tokens[b.tokens.length - 1], 1),
];

/**
 * The rating difference for every row of both datasets: `a.rating - b.rating` on
 * an A row, the negation on the B row it was matched to, `DIFF_NONE` where there
 * is no counterpart.
 */
export function matchSets(a: SetBlob, b: SetBlob): { aDiff: number[]; bDiff: number[]; matched: number } {
  const aRows = rowsOf(a);
  const bRows = rowsOf(b);
  const aDiff = new Array<number>(aRows.length).fill(DIFF_NONE);
  const bDiff = new Array<number>(bRows.length).fill(DIFF_NONE);

  const bySquad = new Map<string, { left: Row[]; right: Row[] }>();
  for (const r of aRows) {
    const s = bySquad.get(r.squad) ?? bySquad.set(r.squad, { left: [], right: [] }).get(r.squad)!;
    s.left.push(r);
  }
  for (const r of bRows) {
    const s = bySquad.get(r.squad);
    if (s) s.right.push(r);   // a squad only one dataset has cannot match anything
  }

  let matched = 0;
  for (const { left, right } of bySquad.values()) {
    if (!right.length) continue;
    let pool = left;
    let seeking = right;
    for (const same of STAGES) {
      if (!seeking.length || !pool.length) break;
      // Candidates both ways, then keep only the pairs that are each other's only
      // option: one claimant, one candidate.
      const claims = new Map<Row, Row[]>();
      const cands = new Map<Row, Row[]>();
      for (const r of seeking) {
        const c = pool.filter((l) => same(l, r));
        cands.set(r, c);
        for (const l of c) (claims.get(l) ?? claims.set(l, []).get(l)!).push(r);
      }
      const took = new Set<Row>();
      for (const r of seeking) {
        const c = cands.get(r)!;
        if (c.length !== 1) continue;
        const l = c[0];
        if (claims.get(l)!.length !== 1) continue;
        aDiff[l.i] = l.rating - r.rating;
        bDiff[r.i] = r.rating - l.rating;
        took.add(l);
        took.add(r);
        matched++;
      }
      if (!took.size) continue;
      pool = pool.filter((l) => !took.has(l));
      seeking = seeking.filter((r) => !took.has(r));
    }
  }
  return { aDiff, bDiff, matched };
}
