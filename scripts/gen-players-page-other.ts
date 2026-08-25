/**
 * Generate `docs/players-other-game.html` - the SAME page as `docs/players.html`,
 * over the other game's ratings (`docs/player-ratings-other-game.csv`).
 *
 *   npm run gen:players     # rewrites both pages
 *
 * The point is comparison: open the two files side by side and the columns, the
 * filters, the sorting and the hover card all behave identically, so a difference
 * on screen is a difference in the DATA. That is also why the twelve positions are
 * mapped onto the game's own vocabulary rather than left as the source's prose:
 * "Defensive midfielder" and DM are the same role, and a reader comparing two
 * windows should not have to translate.
 *
 * Three things the other dataset does NOT have, and what the page does about each:
 *
 * - **One position per player.** So there is no "Also" column and no additional /
 *   any-position filter (`page.alt` is false). The single role is the main one.
 * - **No player identity.** Our own dataset links the same human across tournaments
 *   with a `personId`; this source has only a name, and many of its older rows are a
 *   bare surname. So `identify()` below groups appearances by NAME WITHIN A NATION,
 *   splitting a run wherever two of them are more than `MAX_CAREER` years apart. That
 *   is not exact and the footer says so - but it is much closer than the name alone,
 *   which merged 147 pairs of different men, Gerd Muller's 1970 with Thomas Muller's
 *   2014 among them, and read them out as one seven-cup career.
 * - **No sticker tiers.** The source marks a player as a "legend" instead, which is
 *   the same shape of fact (a flag on a row), so it takes the last column.
 */
import { readFileSync } from 'node:fs';
import { Dataset, today, writePage, type PageConfig } from './players-page';

const CSV_PATH = 'docs/player-ratings-other-game.csv';
const OUT_PATH = 'docs/players-other-game.html';

/** The longest a real World Cup career runs, in years: two appearances further apart
 *  than this are two different men of the same name. The record span in the dataset
 *  is 20 (Buffon 1998 to 2018), so 24 leaves room and still splits by a wide margin -
 *  the merges it catches are 40 and 76 years apart. */
const MAX_CAREER = 24;

/** The source's twelve position names, onto the game's twelve codes. A one-for-one
 *  mapping, which is what makes the two pages' position columns comparable. Anything
 *  unknown throws: a new wording should be looked at, not silently bucketed. */
const POSITION: Record<string, string> = {
  Goalkeeper: 'GK',
  'Left-back': 'LB',
  'Centre-back': 'CB',
  'Right-back': 'RB',
  'Defensive midfielder': 'DM',
  'Left midfielder': 'LM',
  Midfielder: 'CM',
  'Right midfielder': 'RM',
  'Attacking midfielder': 'AM',
  'Left winger': 'LW',
  'Right winger': 'RW',
  'Centre-forward': 'ST',
};

/** Minimal RFC-4180 reader: quoted fields, doubled quotes, CRLF. The file has none
 *  of that today, which is exactly why it is worth handling - the next version of it
 *  might. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const page: PageConfig = {
  docTitle: "Other game's ratings - player index",
  tag: "Other game's ratings",
  eyebrow: 'Comparison dataset',
  // The one thing deliberately NOT identical to the other page: with two windows
  // open, the display title is what says which is which.
  title: "The other game's players",
  // Amber rather than the pitch green, so the two open windows are told apart at a
  // glance - the pages are otherwise deliberately identical.
  tile: ['#9a6512', '#f4f2ec'],
  alt: false,
  mainHeader: 'Pos',
  mainFilter: 'Position',
  altHeader: '',
  colHeader: 'Legend',
  tierNames: ['', 'Legend'],
  tierAccents: ['', '#c99a3a'],
  // The game's own grid minus the "Also" track, so the shared columns keep the same
  // proportions and the two pages read as one table split in two.
  grid: '44px minmax(170px, 1.7fr) minmax(140px, 1.1fr) 58px 58px 72px 92px',
};

const csv = parseCsv(readFileSync(CSV_PATH, 'utf8'));

/**
 * Who is who, as far as the source allows. Every row of one name for one nation is
 * sorted by year and cut wherever the gap exceeds `MAX_CAREER`; each run is a person.
 * What it still cannot separate: two men of the same name in the same era (England's
 * several Wrights), or in the same squad - Serbia named two Mitrovic and two
 * Milinkovic-Savic in 2022, Ireland two Kelly in 2002, Brazil two Danilo in 2026.
 */
function identify(): (row: Record<string, string>) => string {
  const years = new Map<string, number[]>();
  for (const r of csv) {
    const k = `${r.player_name}#${r.team_code}`;
    (years.get(k) ?? years.set(k, []).get(k)!).push(Number(r.year));
  }
  const cuts = new Map<string, number[]>();   // the first year of each run after the first
  for (const [k, ys] of years) {
    const sorted = [...new Set(ys)].sort((a, b) => a - b);
    const starts: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] > MAX_CAREER) starts.push(sorted[i]);
    }
    if (starts.length) cuts.set(k, starts);
  }
  return (r) => {
    const k = `${r.player_name}#${r.team_code}`;
    const starts = cuts.get(k);
    if (!starts) return k;
    let run = 0;
    for (const s of starts) if (Number(r.year) >= s) run++;
    return `${k}#${run}`;
  };
}

const personKeyOf = identify();
const data = new Dataset();

for (const r of csv) {
  const position = POSITION[r.position];
  if (!position) throw new Error(`unknown position "${r.position}" (${r.player_name}, ${r.year})`);
  const year = Number(r.year);
  data.add({
    // See `identify()`: name + nation + career run. The name is taken AS WRITTEN,
    // never folded - Yugoslavia 1954 played the brothers Z. Cajkovski and Z with a
    // caron, whom folding the accents away would merge into one man.
    personKey: personKeyOf(r),
    name: r.player_name,
    code: r.team_code.toUpperCase(),
    nation: r.team_name,
    year,
    // 1950 and 1954 were played without shirt numbers; the page prints a dash.
    number: Number(r.shirt_number) || 0,
    positions: [position],
    rating: Number(r.rating),
    tier: r.legend === 'true' ? 1 : 0,
  });
}

const encoded = data.encode();
const c = encoded.counts;
const source = new URL(csv[0].source_url).host;
writePage(OUT_PATH, {
  ...encoded,
  page,
  footer:
    `Generated from ${CSV_PATH} (${source}) on ${today()} - ${c.players.toLocaleString('en-GB')} players, ` +
    `${c.squads} squads, ${c.nations} nations, ${c.years} tournaments (${encoded.years[0]} to ` +
    `${encoded.years[encoded.years.length - 1]}), ${c.collectibles} legends. ` +
    `The source carries no player id, so an "appearance" is matched by name within a nation, split ` +
    `where two are over ${MAX_CAREER} years apart: two men of the same name in the same era still read ` +
    `as one. Regenerate with \`npm run gen:players\`.`,
});
console.log(
  `  ${c.players} players / ${c.people} names / ${c.squads} squads / ${c.nations} nations / ` +
    `${c.years} tournaments / ${c.collectibles} legends`,
);
