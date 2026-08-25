/**
 * Generate the standalone player index, `docs/players.html`.
 *
 * A one-pager OUTSIDE the app: every player of every squad of every tournament in
 * one sortable, filterable table, opened straight off disk. It is not routed, not
 * bundled and not deployed - `docs/` is not under `public/`, so `npm run build`
 * never sees it.
 *
 *   npm run gen:players     # rewrite docs/players.html
 *
 * The dataset is baked in at generation time, so the page has no imports and no
 * network dependency beyond the Google Fonts link. Re-run it after ANY change to
 * `squads.ts` or to `STICKER_TIERS` (the collectible column reads `tierOf`), the
 * same way `npm run gen:collectibles` has to be re-run.
 *
 * The markup, CSS and behaviour live in `scripts/players-page.template.html`; this
 * file only supplies the data and the flag CSS. Two placeholders are substituted:
 * `__DATA__` (one JSON blob) and `__FLAG_CSS__` (the nation flags, inlined from
 * `country-flag-icons` as data URIs so the file is self-contained).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { SQUADS } from '../src/data/squads';
import { tierOf } from '../src/domain/album';
import { STICKER_TIER_ORDER } from '../src/config';
import type { Position } from '../src/data/types';

const TEMPLATE_PATH = 'scripts/players-page.template.html';
const OUT_PATH = 'docs/players.html';
const FLAG_SRC = 'src/components/Flag.tsx';
const FLAG_DIR = 'node_modules/country-flag-icons/3x2';

/** Pitch order, GK to ST. The table's position columns sort in it. */
const POS: readonly Position[] = ['GK', 'LB', 'CB', 'RB', 'DM', 'LM', 'CM', 'RM', 'AM', 'LW', 'RW', 'ST'];
const POS_INDEX = new Map(POS.map((p, i) => [p, i]));

/** Tier -> the small integer the page stores per row. 0 is "not collectible". */
const TIER_INDEX = new Map(
  // Weakest first, so a bigger number is a rarer card and the Collectible column
  // sorts the way a reader expects.
  [...STICKER_TIER_ORDER].reverse().map((t, i) => [t, i + 1] as const),
);

// ---------------------------------------------------------------------------
// Flags: the app's FIFA-code -> SVG mapping, read out of Flag.tsx so this page
// cannot drift from the game's own flags. Parsed rather than duplicated.
// ---------------------------------------------------------------------------
function flagCss(codes: string[]): string {
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
  if (missing.length) {
    // Flag.tsx renders nothing for an unmapped code, so the page does the same: a
    // flat box. Worth saying out loud rather than shipping silent blanks.
    console.warn(`no flag for: ${missing.join(', ')}`);
  }
  return rules.join('\n');
}

// ---------------------------------------------------------------------------
// The dataset, encoded as flat integer rows the page decodes into typed arrays.
// Everything repeated (a name, a nation, a set of positions) is a table index.
// ---------------------------------------------------------------------------
const persons: string[] = [];
const personIndex = new Map<string, number>();
const nations: [string, string][] = [];
const nationIndex = new Map<string, number>();
const combos: number[][] = [];
const comboIndex = new Map<string, number>();

const squads = [...SQUADS].sort((a, b) => a.year - b.year || a.code.localeCompare(b.code));

for (const s of squads) {
  if (!nationIndex.has(s.code)) {
    nationIndex.set(s.code, nations.length);
    nations.push([s.code, s.nation]);
  }
}
// Nations read alphabetically in the dropdown, so index them that way.
nations.sort((a, b) => a[1].localeCompare(b[1]));
nations.forEach(([code], i) => nationIndex.set(code, i));

const years = [...new Set(squads.map((s) => s.year))].sort((a, b) => a - b);
const yearIndex = new Map(years.map((y, i) => [y, i]));

const rows: number[] = [];
let collectibles = 0;
let eloMin = Infinity;
let eloMax = -Infinity;

for (const s of squads) {
  for (const p of s.players) {
    // One display name per personId is what makes "the same human" work at all
    // (and what `validateSquads` guards). Fail loudly rather than picking one.
    const seen = personIndex.get(p.personId);
    if (seen === undefined) {
      personIndex.set(p.personId, persons.length);
      persons.push(p.name);
    } else if (persons[seen] !== p.name) {
      throw new Error(`personId ${p.personId} carries two names: "${persons[seen]}" and "${p.name}"`);
    }

    const key = p.positions.join(',');
    let combo = comboIndex.get(key);
    if (combo === undefined) {
      combo = combos.length;
      comboIndex.set(key, combo);
      combos.push(
        p.positions.map((pos) => {
          const i = POS_INDEX.get(pos);
          if (i === undefined) throw new Error(`unknown position ${pos}`);
          return i;
        }),
      );
    }

    const tier = tierOf(p);
    if (tier) collectibles++;
    eloMin = Math.min(eloMin, p.elo);
    eloMax = Math.max(eloMax, p.elo);

    rows.push(
      personIndex.get(p.personId)!,
      nationIndex.get(s.code)!,
      yearIndex.get(s.year)!,
      p.number,
      combo,
      p.elo,
      tier ? TIER_INDEX.get(tier)! : 0,
    );
  }
}

const playerCount = rows.length / 7;
const multi = [...personIndex.values()].length;
const date = new Date().toISOString().slice(0, 10);

const data = {
  pos: POS,
  combos,
  nations,
  years,
  persons,
  tiers: ['', ...[...STICKER_TIER_ORDER].reverse()],
  rows,
  eloMin,
  eloMax,
  collectibles,
  footer:
    `Generated from src/data/squads.ts on ${date} - ${playerCount.toLocaleString('en-GB')} players, ` +
    `${multi.toLocaleString('en-GB')} distinct people, ${squads.length} squads, ${years.length} tournaments, ` +
    `${collectibles} collectibles. Regenerate with \`npm run gen:players\`.`,
};

const html = readFileSync(TEMPLATE_PATH, 'utf8')
  .replace('__FLAG_CSS__', () => flagCss(nations.map(([code]) => code)))
  .replace('__DATA__', () => JSON.stringify(data));

writeFileSync(OUT_PATH, html);

console.log(
  `${OUT_PATH}: ${playerCount} players / ${multi} people / ${squads.length} squads / ` +
    `${years.length} tournaments / ${collectibles} collectibles / ${(html.length / 1024).toFixed(0)} KB`,
);
