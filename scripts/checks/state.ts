// Characterization checks for settings, routes, storage keys and the migration index.
//
// One of the seventeen concern modules `scripts/checks.ts` runs (hygiene H104). It was
// one 3,900-line file whose blocks shared nothing but the assertion helper, and whose
// summary ran last only because it happened to sit at the bottom.

import { check } from './harness';
import { readFileSync, readdirSync } from 'node:fs';
import { FEATURES } from '../../src/config';
import { ALL_PLAYERS, WORLD_CUP_YEARS } from '../../src/data/squads';
import { type Filled } from '../../src/domain/draft';
import { getFormation } from '../../src/domain/formations';
import { KO_ROUNDS } from '../../src/domain/knockout';
import { type RunState } from '../../src/domain/run';
import { ALBUM_KEY, ALBUM_STATS_KEY } from '../../src/state/albumStorage';
import { CAREER_KEY } from '../../src/state/careerStorage';
import { GAME_KEY } from '../../src/state/persist';
import { buildResume, cupRunResume } from '../../src/state/resume';
import { type Screen, isPlayTab, isRecords, screenOf } from '../../src/state/routes';
import { REVEAL_KEY, RUN_KEY } from '../../src/state/runStorage';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  normalizeSettings,
  toStored,
} from '../../src/state/settingsStorage';
import { GUEST_KEYS } from '../../src/state/store/localStore';

export function stateChecks(): void {
  // --- Settings: "every tournament" has to survive a tournament being ADDED ----
  // This is the bug that made 1986 invisible for two days, and it was silent on every
  // surface at once. `useSettings` persists on mount, so every player has a saved
  // `poolYears`; the old shape recorded "all tournaments" as a LIST of the years that
  // existed at that moment, so adding 1986 turned every existing save into "all except
  // 1986" - no longer the album's target, and not in the rolls, the market or the
  // opponents either. Nothing said so, because a nine-year list is a perfectly valid
  // narrowing. `toStored` therefore writes null for "all", and a v1 save (which could not
  // tell the two apart) gets its pool back.
  {
    const storedAll = toStored({ ...DEFAULT_SETTINGS, poolYears: WORLD_CUP_YEARS });
    const storedNarrow = toStored({ ...DEFAULT_SETTINGS, poolYears: [1990, 2022] });
    // A v1 save: no `v`, and a list that covered every year at the time of writing.
    const v1 = { theme: 'light', difficulty: 'normal', poolYears: WORLD_CUP_YEARS.slice(1), showFullDraw: false };
    const roundTrip = (s: unknown) => normalizeSettings(s).poolYears;
    const ok =
      // "All" must not be written as a list, or the next tournament reads as deselected.
      storedAll.poolYears === null &&
      roundTrip(storedAll).length === WORLD_CUP_YEARS.length &&
      // A deliberate narrowing still survives a round trip untouched.
      storedNarrow.poolYears?.join() === '1990,2022' &&
      roundTrip(storedNarrow).join() === '1990,2022' &&
      // A v1 save reopens rather than silently hiding whatever was added since.
      roundTrip(v1).length === WORLD_CUP_YEARS.length &&
      // Junk, an empty pool and years that left the dataset all fall back to everything.
      roundTrip(null).length === WORLD_CUP_YEARS.length &&
      roundTrip({ v: 2, poolYears: [] }).length === WORLD_CUP_YEARS.length &&
      roundTrip({ v: 2, poolYears: [1930] }).length === WORLD_CUP_YEARS.length;
    check(
      'settings: an all-tournaments pool survives a new tournament, a narrowing survives a round trip',
      () => ok,
    );
  }

  // --- Routes: the URL-to-screen table, and that everything else redirects -----
  // The point of `screenOf` being a pure function is that this table can be written down
  // (hygiene H82). Two entries here are the ones a later tidy-up would break: a deleted
  // alias must reach `unknown` (so it redirects rather than rendering something), and
  // `/records/cabinet` must fall back to the ledger rather than redirecting when the
  // cabinet flag is off.
  {
    const table: [string, Screen][] = [
      ['/', 'front'],
      ['/play', 'build'],
      ['/cup-run', 'cup-run'],
      ['/career', 'career'],
      ['/records', 'records'],
      ['/records/cabinet', FEATURES.trophyCabinet ? 'cabinet' : 'records'],
      ['/album', FEATURES.stickerAlbum ? 'album' : 'unknown'],
      ['/squads', FEATURES.squadBrowser ? 'squads' : 'unknown'],
      ['/squads/by-world-cup/1990', FEATURES.squadBrowser ? 'squads' : 'unknown'],
      ['/squads/team/bra-2002', FEATURES.squadBrowser ? 'squads' : 'unknown'],
      // Deleted routes and the four legacy aliases: all catch-all.
      ['/group', 'unknown'],
      ['/knockout', 'unknown'],
      ['/challenges', 'unknown'],
      ['/cabinet', 'unknown'],
      ['/quick-run', 'unknown'],
      ['/career-mode', 'unknown'],
      ['/build', 'unknown'],
      ['/squadsx', 'unknown'],
      ['/play/', 'unknown'],
      ['', 'unknown'],
    ];
    const wrong = table.filter(([p, want]) => screenOf(p) !== want);
    check(
      `routes: all ${table.length} paths resolve to the screen they should`,
      () => wrong.length === 0,
    );
    // The two groupings the tab bar is built from. Records is ONE destination in two
    // segments, which is what keeps the bar at five; Play covers cover, build and run.
    check(
      'routes: Records is one destination, Play covers the cover, the build and the run',
      () => isRecords('records') &&
        isRecords('cabinet') &&
        !isRecords('career') &&
        isPlayTab('front') &&
        isPlayTab('build') &&
        isPlayTab('cup-run') &&
        !isPlayTab('album') &&
        !isPlayTab('unknown'),
    );
  }

  // --- The front page's two Continue offers -----------------------------------
  // A run that ENDED is a finished story, not something to carry on with, and a board
  // with nothing picked is just the build page. Both were inline ternaries in the
  // composition root before H83.
  {
    const run = (over: Partial<RunState>) => ({ phase: 'group', koRound: 0, ...over }) as RunState;
    const f = getFormation('4-3-3', 'bal')!;
    const one: Filled = { [f.slots[0]!.id]: ALL_PLAYERS[0]! };
    const full: Filled = Object.fromEntries(f.slots.map((s, i) => [s.id, ALL_PLAYERS[i]!]));
    check(
      'resume: only a live run is offered, and an ended one never is',
      () => cupRunResume(null) === null &&
        cupRunResume(run({ phase: 'ended' })) === null &&
        cupRunResume(run({}))?.summary === 'Group stage' &&
        cupRunResume(run({ phase: 'match', koRound: 0 }))?.summary === KO_ROUNDS[0] &&
        cupRunResume(run({ phase: 'match', koRound: 99 }))?.summary === 'Knockouts',
    );
    check(
      'resume: a half-built XI is offered, an empty board and a live run are not',
      () => buildResume(null, {}, false) === null &&
        buildResume(f, {}, false) === null &&
        buildResume(f, one, true) === null &&
        buildResume(f, one, false)?.label === 'Finish your XI' &&
        buildResume(f, one, false)?.sub === '4-3-3 · 1 of 11 picked' &&
        buildResume(f, full, false)?.label === 'Your XI is ready' &&
        buildResume(f, full, false)?.sub === '4-3-3',
    );
  }

  // --- Storage keys: the guest-import set is built from the owning modules -----
  // Every key used to be re-typed as a literal inside `GUEST_KEYS`, so bumping a version
  // in any storage module silently stopped that slice being imported into an account or
  // cleared afterwards, with no type error (hygiene H88). Now it is assembled from the
  // exports, and this asserts the set is what it should be: all six progress keys, no
  // duplicates, and never the settings key - preferences are not progress.
  {
    const progress = [GAME_KEY, ALBUM_KEY, ALBUM_STATS_KEY, CAREER_KEY, RUN_KEY, REVEAL_KEY];
    const all = [...progress, SETTINGS_KEY];
    check(
      'storage: the guest set is every progress key, once each, and never the settings key',
      () => GUEST_KEYS.length === progress.length &&
        progress.every((k) => GUEST_KEYS.includes(k)) &&
        !GUEST_KEYS.includes(SETTINGS_KEY) &&
        new Set(all).size === all.length &&
        // One key uses colons and the rest underscores. It stays that way (renaming it
        // would orphan saved games), so this pins the oddity rather than the pattern.
        GAME_KEY === 'wcsim:game:v1' &&
        all.filter((k) => k.startsWith('wcsim_')).length === all.length - 1,
    );
  }

  // --- Migrations: the index says where each function actually lives -----------
  // Migrations are append-only and applied by hand, so a function that has changed four
  // times exists four times on disk and only the last one is live. `finish_run`'s body is
  // written out in full in four of them (hygiene H103), which is why there is an index -
  // and an index that drifts is worse than none, so this asserts it.
  //
  // Two claims: the file `README.md` names as current is the LAST migration that defines
  // that function, and every earlier copy carries a forward pointer telling you not to
  // copy it.
  {
    const dir = 'supabase/migrations';
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    /** function name -> the migration files that define it, in order. */
    const defs = new Map<string, string[]>();
    /** file -> the function names it defines whose body carries a SUPERSEDED pointer. */
    const flagged = new Map<string, Set<string>>();
    for (const f of files) {
      const sql = readFileSync(`${dir}/${f}`, 'utf8');
      const lines = sql.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const m = /^create or replace function ([a-z_]+)\s*\(/.exec(lines[i]!);
        if (!m) continue;
        const name = m[1]!;
        defs.set(name, [...(defs.get(name) ?? []), f]);
        // The pointer sits in the comment block immediately above the `create`.
        let j = i - 1;
        while (j >= 0 && lines[j]!.startsWith('--')) {
          if (lines[j]!.includes('SUPERSEDED BY')) {
            if (!flagged.has(f)) flagged.set(f, new Set());
            flagged.get(f)!.add(name);
            break;
          }
          j -= 1;
        }
      }
    }

    /** function name -> the migration that DROPPED it, if any. A dropped function's live
     *  answer is that drop, not its last definition. */
    const dropped = new Map<string, string>();
    for (const f of files) {
      for (const m of readFileSync(`${dir}/${f}`, 'utf8').matchAll(
        /^drop function (?:if exists )?([a-z_]+)\s*\(/gm,
      )) {
        const name = m[1]!;
        // A drop that is immediately followed by a re-create in the same file is a signature
        // change, not a removal (0006 does this to `finish_run`).
        if ((defs.get(name) ?? []).includes(f)) continue;
        dropped.set(name, f);
      }
    }

    const readme = readFileSync(`${dir}/README.md`, 'utf8');
    const wrong: string[] = [];
    for (const [name, where] of defs) {
      const gone = dropped.get(name);
      const live = (gone ?? where[where.length - 1]!).slice(0, 4);
      // The row for this function, e.g. `| \`save_career(jsonb, integer)\` | **0011** | ... |`.
      const row = readme
        .split('\n')
        .find((l) => l.startsWith('|') && new RegExp('\\| *`' + name + '\\(').test(l));
      if (!row) {
        wrong.push(`${name} is defined in ${where.join(', ')} and is not in the index`);
        continue;
      }
      // The current-definition cell is the second column.
      const cell = row.split('|')[2] ?? '';
      if (!cell.includes(live)) wrong.push(`${name}: index says "${cell.trim()}", last defined in ${live}`);
      // Every copy that is not the live one must say so - all of them, for a dropped
      // function.
      for (const f of gone ? where : where.slice(0, -1)) {
        if (!flagged.get(f)?.has(name)) {
          wrong.push(`${f} restates ${name} with no SUPERSEDED pointer`);
        }
      }
    }
    check(
      `migrations: the index names the live definition of all ${defs.size} functions, and every superseded copy says so`,
      () => wrong.length === 0,
      () => wrong.join('; '),
    );
  }

}
