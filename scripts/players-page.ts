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
  mainHeader: string;
  mainFilter: string;
  altHeader: string;
  /** The last column: "Collectible" here, "Legend" in the other game's data. */
  colHeader: string;
  /** Index 0 is "none", so it is the empty string. */
  tierNames: string[];
  tierAccents: string[];
  /** `grid-template-columns` for the header and every row. */
  grid: string;
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

    return {
      combos,
      nations,
      years,
      persons,
      rows: out,
      eloMin,
      eloMax,
      collectibles,
      counts: {
        players: this.rows.length,
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
  combos: number[][];
  nations: [string, string][];
  years: number[];
  persons: string[];
  rows: number[];
  eloMin: number;
  eloMax: number;
  collectibles: number;
}

/** Fill the template in and write the page. The twelve positions sit at the top of
 *  the blob rather than inside each set: both datasets speak them, which is what
 *  lets a position filter survive the toggle. */
export function writePage(out: string, sets: SetBlob[]): void {
  const codes = [...new Set(sets.flatMap((s) => s.nations.map(([code]) => code)))].sort();
  const html = readFileSync(TEMPLATE_PATH, 'utf8')
    .replace('__FLAG_CSS__', () => flagCss(codes))
    .replace('__DATA__', () => JSON.stringify({ pos: POS, sets }));
  writeFileSync(out, html);
  console.log(`${out}: ${(html.length / 1024).toFixed(0)} KB`);
}

/** Today, as the pages date themselves. */
export const today = (): string => new Date().toISOString().slice(0, 10);
