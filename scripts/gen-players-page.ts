/**
 * Generate the standalone player index, `docs/players.html`.
 *
 *   npm run gen:players
 *
 * A one-pager OUTSIDE the app: every player of every squad of every tournament in
 * one sortable, filterable table, opened straight off disk. It is not routed, not
 * bundled and not deployed - `docs/` is not under `public/`, so `npm run build`
 * never sees it.
 *
 * The file carries BOTH datasets and a toggle switches between them: WCS, the
 * game's own (`players-data-game.ts`), and 7a0, the other game's ratings
 * (`players-data-other.ts`). One page, one query, two answers - which is what
 * makes the two comparable, and why there is no second file to keep in step.
 *
 * The two are also joined player for player (`players-page-match.ts`), so every
 * row can print what the other game rates the same man at.
 *
 * The markup, CSS and behaviour live in `scripts/players-page.template.html`; the
 * encoding in `scripts/players-page.ts`. This file only composes the page.
 */
import { writePage } from './players-page';
import { gameSet } from './players-data-game';
import { otherSet } from './players-data-other';
import { matchSets, DIFF_NONE } from './players-page-match';

const wcs = gameSet();
const other = otherSet();

const { aDiff, bDiff, matched } = matchSets(wcs, other);
wcs.diffs = aDiff;
other.diffs = bDiff;

const known = aDiff.filter((d) => d !== DIFF_NONE);
const agree = known.filter((d) => d === 0).length;
const mean = known.reduce((s, d) => s + d, 0) / known.length;
console.log(
  `  matched:    ${matched} players in both, ${agree} rated identically, ` +
    `WCS ${mean >= 0 ? '+' : ''}${mean.toFixed(2)} on average`,
);

writePage('docs/players.html', [wcs, other]);
