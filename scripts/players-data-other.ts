/**
 * The other game's ratings (`docs/player-ratings-other-game.csv`) as the second
 * dataset of `docs/players.html`, behind the page's toggle.
 *
 * The point is comparison: the same table, the same filters and the same query,
 * pointed at either dataset, so a difference on screen is a difference in the DATA.
 * That is also why the twelve positions are mapped onto the game's own vocabulary
 * rather than left as the source's prose: "Defensive midfielder" and DM are the
 * same role, and a reader flipping between the two should not have to translate -
 * nor should a position filter stop meaning anything when the toggle is thrown.
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
import { Dataset, today, type PageConfig, type SetBlob } from './players-page';

const CSV_PATH = 'docs/player-ratings-other-game.csv';

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
  tab: '7a0',
  docTitle: '7a0 ratings - player index',
  tag: '7a0 ratings',
  // The eyebrow, the masthead tile and the pressed toggle are what say which
  // dataset is on screen; everything else is deliberately identical, since the
  // point is to read one against the other.
  eyebrow: '7a0 ratings',
  title: 'Every player',
  // Amber rather than the pitch green, so the two are told apart at a glance.
  tile: ['#9a6512', '#f4f2ec'],
  alt: false,
  diffHeader: 'vs WCS',
  colHeader: 'Legend',
  tierNames: ['', 'Legend'],
  tierAccents: ['', '#c99a3a'],
};

/**
 * Who is who, as far as the source allows. Every row of one name for one nation is
 * sorted by year and cut wherever the gap exceeds `MAX_CAREER`; each run is a person.
 * What it still cannot separate: two men of the same name in the same era (England's
 * several Wrights), or in the same squad - Serbia named two Mitrovic and two
 * Milinkovic-Savic in 2022, Ireland two Kelly in 2002, Brazil two Danilo in 2026.
 */
function identify(csv: Record<string, string>[]): (row: Record<string, string>) => string {
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

/** The other game's dataset, ready for the page. */
export function otherSet(): SetBlob {
  const csv = parseCsv(readFileSync(CSV_PATH, 'utf8'));
  const personKeyOf = identify(csv);
  const data = new Dataset();

  for (const r of csv) {
    const position = POSITION[r.position];
    if (!position) throw new Error(`unknown position "${r.position}" (${r.player_name}, ${r.year})`);
    data.add({
      // See `identify()`: name + nation + career run. The name is taken AS WRITTEN,
      // never folded - Yugoslavia 1954 played the brothers Z. Cajkovski and Z with a
      // caron, whom folding the accents away would merge into one man.
      personKey: personKeyOf(r),
      name: r.player_name,
      code: r.team_code.toUpperCase(),
      nation: r.team_name,
      year: Number(r.year),
      // 1950 and 1954 were played without shirt numbers; the page prints a dash.
      number: Number(r.shirt_number) || 0,
      positions: [position],
      rating: Number(r.rating),
      tier: r.legend === 'true' ? 1 : 0,
    });
  }

  const { counts: c, ...encoded } = data.encode();
  const source = new URL(csv[0].source_url).host;
  console.log(
    `  other game: ${c.players} players / ${c.people} names / ${c.squads} squads / ` +
      `${c.nations} nations / ${c.years} tournaments / ${c.collectibles} legends`,
  );
  return {
    ...encoded,
    page,
    footer:
      `Generated from ${CSV_PATH} (${source}) on ${today()} - ${c.players.toLocaleString('en-GB')} players, ` +
      `${c.squads} squads, ${c.nations} nations, ${c.years} tournaments (${encoded.years[0]} to ` +
      `${encoded.years[encoded.years.length - 1]}), ${c.collectibles} legends. ` +
      `The source carries no player id, so an "appearance" is matched by name within a nation, split ` +
      `where two are over ${MAX_CAREER} years apart: two men of the same name in the same era still ` +
      `read as one. Regenerate with \`npm run gen:players\`.`,
  };
}
