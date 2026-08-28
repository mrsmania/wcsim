/**
 * Shared machinery behind the standalone player index, `docs/players.html`.
 *
 * The page carries BOTH datasets - the game's own (`players-data-game.ts`) and the
 * other game's ratings (`players-data-other.ts`) - and a toggle switches between
 * them, so the same table, the same filters and the same query can be pointed at
 * either. Everything the two differ by travels in a set's `page` block rather than
 * in a second copy of the template: the wording, whether a player can hold more
 * than one position, what the last column means.
 *
 * Node-only (reads and writes files); nothing in `src/` imports this.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const TEMPLATE_PATH = 'scripts/players-page.template.html';
const FLAG_SRC = 'src/components/Flag.tsx';
const FLAG_DIR = 'node_modules/country-flag-icons/3x2';

/** Pitch order, GK to ST. Both datasets speak these twelve, which is what makes the
 *  position column comparable across the two pages. */
export const POS = ['GK', 'LB', 'CB', 'RB', 'DM', 'LM', 'CM', 'RM', 'AM', 'LW', 'RW', 'ST'] as const;
export type Pos = (typeof POS)[number];
const POS_INDEX = new Map<string, number>(POS.map((p, i) => [p, i]));

/** Which line each role belongs to: 0 keeper, 1 defence, 2 midfield, 3 attack. */
const LINE = [0, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3];

/** The line counts the game's twenty-four formations call for, deduplicated -
 *  every one of them fields a keeper. `domain/formations.ts` is the source; this
 *  is the shape of those rows, not a second opinion about football. */
const SHAPES: readonly [number, number, number][] = [
  [5, 3, 2], [4, 5, 1], [4, 4, 2], [4, 3, 3], [3, 4, 3], [3, 5, 2], [4, 2, 4],
];

/** What the template needs to know about the dataset it is drawing. */
export interface PageConfig {
  /** The toggle's label for this dataset. */
  tab: string;
  /** Browser tab. */
  docTitle: string;
  /** Masthead sub-line. */
  tag: string;
  /** Section eyebrow + display title. */
  eyebrow: string;
  title: string;
  /** `[background, glyph]` for the masthead tile, so the two datasets - and two
   *  windows of this file showing one each - differ at a glance. */
  tile?: [string, string];
  /** Does a player hold more than one position? Drives the "Also" column and the two
   *  extra position filters - a dataset with one role per player shows neither. */
  alt: boolean;
  /** The "vs" column's header: what the OTHER dataset is called. */
  diffHeader: string;
  /** The last column: "Collectible" here, "Legend" in the other game's data. */
  colHeader: string;
  /** Index 0 is "none", so it is the empty string. */
  tierNames: string[];
  tierAccents: string[];
}

interface RawRow {
  personKey: string;
  name: string;
  code: string;
  nation: string;
  year: number;
  number: number;
  positions: string[];
  rating: number;
  /** 0 = plain, 1..n = a tier of `PageConfig.tierNames`. */
  tier: number;
}

/**
 * Collects rows and encodes them the way the page reads them: flat integers, with
 * every repeated string (a name, a nation, a set of positions) a table index.
 */
export class Dataset {
  private rows: RawRow[] = [];

  add(row: RawRow): void {
    this.rows.push(row);
  }

  /** The data blob, minus the `page` block and the footer. */
  encode() {
    const persons: string[] = [];
    const personIndex = new Map<string, number>();
    const combos: number[][] = [];
    const comboIndex = new Map<string, number>();

    // Nations read alphabetically in the dropdown; years ascending.
    const nationName = new Map<string, string>();
    for (const r of this.rows) nationName.set(r.code, r.nation);
    const nations: [string, string][] = [...nationName].sort((a, b) => a[1].localeCompare(b[1]));
    const nationIndex = new Map(nations.map(([code], i) => [code, i]));
    const years = [...new Set(this.rows.map((r) => r.year))].sort((a, b) => a - b);
    const yearIndex = new Map(years.map((y, i) => [y, i]));

    const out: number[] = [];
    let collectibles = 0;
    let eloMin = Infinity;
    let eloMax = -Infinity;

    for (const r of this.rows) {
      // One display name per person is what makes "the same human, four World Cups"
      // work at all. Fail loudly rather than picking one of two spellings.
      const seen = personIndex.get(r.personKey);
      if (seen === undefined) {
        personIndex.set(r.personKey, persons.length);
        persons.push(r.name);
      } else if (persons[seen] !== r.name) {
        throw new Error(`person ${r.personKey} carries two names: "${persons[seen]}" and "${r.name}"`);
      }

      const key = r.positions.join(',');
      let combo = comboIndex.get(key);
      if (combo === undefined) {
        combo = combos.length;
        comboIndex.set(key, combo);
        combos.push(
          r.positions.map((pos) => {
            const i = POS_INDEX.get(pos);
            if (i === undefined) throw new Error(`unknown position ${pos}`);
            return i;
          }),
        );
      }

      if (r.tier > 0) collectibles++;
      eloMin = Math.min(eloMin, r.rating);
      eloMax = Math.max(eloMax, r.rating);
      out.push(
        personIndex.get(r.personKey)!,
        nationIndex.get(r.code)!,
        yearIndex.get(r.year)!,
        r.number,
        combo,
        r.rating,
        r.tier,
      );
    }

    /* One row per squad for the Teams view: the best eleven that can be fielded
       together and the average over the whole squad, both in TENTHS so the page
       carries integers and formats them itself. */
    const bySquad = new Map<string, { line: number[]; elo: number[] }>();
    for (let i = 0, r = 0; r < out.length; i++, r += 7) {
      const key = `${out[r + 1]}|${out[r + 2]}`;
      const squad = bySquad.get(key) ?? bySquad.set(key, { line: [], elo: [] }).get(key)!;
      let mask = 0;
      for (const pos of combos[out[r + 4]]) mask |= 1 << LINE[pos];
      squad.line.push(mask);
      squad.elo.push(out[r + 5]);
    }
    const teams: number[] = [];
    for (const [key, squad] of bySquad) {
      const [nation, year] = key.split('|').map(Number);
      const xi = bestXiTotal(squad.line, squad.elo);
      const avg = squad.elo.reduce((a, b) => a + b, 0) / squad.elo.length;
      teams.push(nation, year, xi < 0 ? -1 : Math.round((xi / 11) * 10), Math.round(avg * 10), squad.elo.length);
    }

    return {
      combos,
      nations,
      years,
      persons,
      rows: out,
      teams,
      eloMin,
      eloMax,
      collectibles,
      counts: {
        players: this.rows.length,
        teamRows: teams.length / 5,
        people: persons.length,
        squads: new Set(this.rows.map((r) => `${r.code}-${r.year}`)).size,
        nations: nations.length,
        years: years.length,
        collectibles,
      },
    };
  }
}

/**
 * The best eleven a squad can put on the pitch TOGETHER, as a total rating.
 *
 * Not the top eleven by rating: a team needs a keeper and a shape. A player may
 * fill any slot in a line one of his positions belongs to (a LB/CB is a defender
 * either way, an AM/ST can take a midfield or an attacking slot), and the best
 * legal assignment is taken over every line shape the game's formations call for.
 * Solved exactly - a maximum-weight assignment, not a greedy pick - because a
 * squad's best defender may be the only man who can play the one slot nobody else
 * covers.
 *
 * Deliberately looser than the app's own draft rule, which needs the EXACT role:
 * at that strictness 9 of the game's 368 squads and 68 of 7a0's 302 cannot field
 * any of the twenty-four formations at all, mostly for want of a natural winger,
 * and a column of dashes says nothing about a team. It is also the fairer
 * comparison, since 7a0 gives a player one position and this dataset gives up to
 * three.
 */
function bestXiTotal(lineMasks: number[], ratings: number[]): number {
  let best = -1;
  for (const [d, m, f] of SHAPES) {
    const slots = [0, ...Array<number>(d).fill(1), ...Array<number>(m).fill(2), ...Array<number>(f).fill(3)];
    const total = assign(slots, lineMasks, ratings);
    if (total > best) best = total;
  }
  return best;
}

/** Maximum-weight assignment of players to slots (Hungarian, O(slots^2 * players)).
 *  Returns -1 when the slots cannot all be filled. */
function assign(slots: number[], lineMasks: number[], ratings: number[]): number {
  const n = slots.length;
  const m = ratings.length;
  if (m < n) return -1;
  const INF = 1e9;
  const cost = (i: number, j: number) => ((lineMasks[j] >> slots[i]) & 1 ? -ratings[j] : INF);
  const u = new Float64Array(n + 1);
  const v = new Float64Array(m + 1);
  const p = new Int32Array(m + 1);
  const way = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(m + 1).fill(Infinity);
    const used = new Uint8Array(m + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = -1;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost(i0 - 1, j - 1) - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  let total = 0;
  for (let j = 1; j <= m; j++) {
    if (!p[j]) continue;
    const c = cost(p[j] - 1, j - 1);
    if (c >= INF) return -1;
    total += -c;
  }
  return total;
}

/**
 * The app's FIFA-code -> flag mapping, parsed out of `Flag.tsx` so a page cannot fly
 * a flag the game does not, and inlined as data URIs so the file is self-contained.
 * A code the app has no flag for renders as a flat box, exactly as the app renders
 * nothing - the generator says which, rather than shipping silent blanks.
 */
export function flagCss(codes: string[]): string {
  const src = readFileSync(FLAG_SRC, 'utf8');
  const iso = new Map<string, string>();
  for (const m of src.matchAll(/import (\w+) from 'country-flag-icons\/react\/3x2\/([A-Z-]+)'/g)) {
    iso.set(m[1], m[2]);
  }
  const body = src.match(/const BY_FIFA[^{]*\{([\s\S]*?)\n\};/);
  if (!body) throw new Error(`could not find BY_FIFA in ${FLAG_SRC}`);
  const byFifa = new Map<string, string>();
  for (const m of body[1].matchAll(/\b([A-Z]{3}):\s*([A-Za-z]+)/g)) {
    const file = iso.get(m[2]);
    if (file) byFifa.set(m[1], file);
  }

  const rules: string[] = [];
  const missing: string[] = [];
  for (const code of codes) {
    const file = byFifa.get(code);
    if (!file) {
      missing.push(code);
      continue;
    }
    const svg = readFileSync(`${FLAG_DIR}/${file}.svg`, 'utf8')
      .replace(/<\?xml[^>]*\?>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .replace(/"/g, "'")
      .trim();
    const uri = svg.replace(/[<>#%{}|\\^~[\]`]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
    rules.push(`.f${code}{background-image:url("data:image/svg+xml,${uri}")}`);
  }
  if (missing.length) console.warn(`no flag for: ${missing.join(', ')}`);
  return rules.join('\n');
}

/** One dataset as the page reads it. */
export interface SetBlob {
  page: PageConfig;
  footer: string;
  /** One squad per five integers: nation, year, best XI and squad average (both
   *  in tenths), squad size. */
  teams: number[];
  /** Per row, the rating minus the other dataset's rating for the same man, or
   *  `DIFF_NONE`. Filled in by `matchSets` once both datasets exist. */
  diffs?: number[];
  combos: number[][];
  nations: [string, string][];
  years: number[];
  persons: string[];
  rows: number[];
  eloMin: number;
  eloMax: number;
  collectibles: number;
}

/** The table's column widths. ONE grid for every dataset: the two are meant to be
 *  read against each other, and a column that moved when the toggle was thrown
 *  would defeat that. A dataset with one position per player prints a dash in the
 *  "Also" column rather than dropping it. */
const GRID =
  '44px minmax(160px, 1.7fr) minmax(130px, 1.1fr) 54px 54px minmax(88px, 0.9fr) 66px 96px 92px';

/** The Teams view's four columns. A narrower table, so the numbers stay beside the
 *  country rather than drifting to the far edge of a 1,400px page. */
const GRID_TEAMS = 'minmax(180px, 1fr) 64px 104px 132px';

/** Fill the template in and write the page. The twelve positions and the grid sit
 *  at the top of the blob rather than inside each set: both datasets speak the
 *  same positions and draw the same table, which is what lets a filter, a sort and
 *  a column survive the toggle. */
export function writePage(out: string, sets: SetBlob[]): void {
  const codes = [...new Set(sets.flatMap((s) => s.nations.map(([code]) => code)))].sort();
  const html = readFileSync(TEMPLATE_PATH, 'utf8')
    .replace('__FLAG_CSS__', () => flagCss(codes))
    .replace('__DATA__', () => JSON.stringify({ pos: POS, grid: GRID, gridTeams: GRID_TEAMS, sets }));
  writeFileSync(out, html);
  console.log(`${out}: ${(html.length / 1024).toFixed(0)} KB`);
}

/** Today, as the pages date themselves. */
export const today = (): string => new Date().toISOString().slice(0, 10);
