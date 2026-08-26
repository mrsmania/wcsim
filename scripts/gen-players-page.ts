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
 * The file carries BOTH datasets and a toggle switches between them: the game's own
 * (`players-data-game.ts`) and the other game's ratings (`players-data-other.ts`).
 * One page, one query, two answers - which is what makes the two comparable, and
 * why there is no second file to keep in step. Two windows of this file, one flipped
 * to each dataset, is the side-by-side reading.
 *
 * The markup, CSS and behaviour live in `scripts/players-page.template.html`; the
 * encoding in `scripts/players-page.ts`. This file only says which datasets go in.
 */
import { writePage } from './players-page';
import { gameSet } from './players-data-game';
import { otherSet } from './players-data-other';

writePage('docs/players.html', [gameSet(), otherSet()]);
