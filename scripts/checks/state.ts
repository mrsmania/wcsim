// Characterization checks for settings, routes, storage keys and the migration index.
//
// One of the seventeen concern modules `scripts/checks.ts` runs (hygiene H104). It was
// one 3,900-line file whose blocks shared nothing but the assertion helper, and whose
// summary ran last only because it happened to sit at the bottom.

import { check } from './harness';
import { readFileSync, readdirSync } from 'node:fs';
import { BANK_CAP, FEATURES } from '../../src/config';
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
  watchedFrom,
} from '../../src/state/settingsStorage';
import { GUEST_KEYS } from '../../src/state/store/localStore';
import { VERSUS_WATCHED_KEY, WATCHED_LIMIT } from '../../src/state/pvp/watchedStorage';
import { CATALOGUE_PATH } from '../collectibles';

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
    const storedAll = toStored({ ...DEFAULT_SETTINGS, poolYears: WORLD_CUP_YEARS }, []);
    const storedNarrow = toStored({ ...DEFAULT_SETTINGS, poolYears: [1990, 2022] }, []);
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
      // Versus is its own destination, and `/versus/:code` is the same one (plan
      // section 8). A code is four to twelve characters of letters and digits; anything
      // else is not a room and must not render one.
      ['/versus', FEATURES.pvp ? 'versus' : 'unknown'],
      ['/versus/RM0001', FEATURES.pvp ? 'versus' : 'unknown'],
      ['/versus/rm0001', FEATURES.pvp ? 'versus' : 'unknown'],
      ['/versus/AB', 'unknown'],
      ['/versus/RM0001/extra', 'unknown'],
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
  // duplicates, and neither of the two keys that are not progress - the settings, which
  // are preferences, and the watched-duels list, whose local key is a guest's copy only.
  // A guest can hold neither a room nor a duel (P17), so importing that one would be
  // carrying an empty list into an account by definition, and an account's own copy lives
  // in its settings row rather than in any key here.
  {
    const progress = [GAME_KEY, ALBUM_KEY, ALBUM_STATS_KEY, CAREER_KEY, RUN_KEY, REVEAL_KEY];
    const all = [...progress, SETTINGS_KEY, VERSUS_WATCHED_KEY];
    check(
      'storage: the guest set is every progress key, once each, and neither of the two that are not',
      () => GUEST_KEYS.length === progress.length &&
        progress.every((k) => GUEST_KEYS.includes(k)) &&
        !GUEST_KEYS.includes(SETTINGS_KEY) &&
        !GUEST_KEYS.includes(VERSUS_WATCHED_KEY) &&
        new Set(all).size === all.length &&
        // One key uses colons and the rest underscores. It stays that way (renaming it
        // would orphan saved games), so this pins the oddity rather than the pattern.
        GAME_KEY === 'wcsim:game:v1' &&
        all.filter((k) => k.startsWith('wcsim_')).length === all.length - 1,
    );
  }

  // --- A watched duel stays watched, on the next device and the next sign-in --
  // REPORTED FROM THE GAME: every match already watched came back as unwatched after a
  // re-login, so the duel list announced results the player had sat through and the room
  // screen played them again. The list was per BROWSER, in its own localStorage key, on
  // the reasoning that having watched a reveal is not progress - which is true and beside
  // the point, since that list is what decides whether the app has anything waiting for
  // you. It follows the ACCOUNT now, in the settings row's jsonb (no migration: that row
  // is one blob this client writes whole).
  //
  // The trap the shape creates, and the reason this block exists: the preferences and the
  // watched list share one row, so a save of either that does not carry the other DELETES
  // it - changing the theme would have wiped every watched duel. `toStored` takes the list
  // as a required argument so forgetting it cannot compile, and the two writes are read
  // here so neither can be "fixed" into passing an empty list.
  {
    const codes = ['ABC123', 'DEF456'];
    const withList = toStored(DEFAULT_SETTINGS, codes);
    const withNone = toStored(DEFAULT_SETTINGS, []);
    const remote = readFileSync('src/state/store/remoteStore.ts', 'utf8');
    const watched = readFileSync('src/state/pvp/watched.ts', 'utf8');
    // Both `save_settings` writes, with whatever they hand `toStored`.
    // Greedy up to the closing brace of the argument object, so `peek().settings` keeps
    // its own brackets rather than the capture stopping at the first one.
    const writes = [...remote.matchAll(/p_data: toStored\((.+)\)\s*\}/g)].map((m) => m[1]);
    check(
      'versus: a watched duel survives a round trip through the account settings blob',
      () =>
        // Vacuity: the sample is not empty, and a blob written without a list reads as one.
        codes.length > 0 &&
        watchedFrom(withList).join() === codes.join() &&
        watchedFrom(withNone).length === 0 &&
        // Junk of every shape reads as nothing rather than throwing, like every other
        // stored slice - this blob is jsonb the client wrote and can be any age.
        watchedFrom(null).length === 0 &&
        watchedFrom({ watchedDuels: 'ABC123' }).length === 0 &&
        watchedFrom({ watchedDuels: [1, 'ABC123', null] }).join() === 'ABC123' &&
        // The cap holds on the way in as well as at the mark, so a hand-edited blob
        // cannot grow the row without limit.
        watchedFrom({ watchedDuels: Array(WATCHED_LIMIT + 10).fill('X') }).length ===
          WATCHED_LIMIT &&
        // The preferences are untouched by carrying it.
        normalizeSettings(withList).poolYears.length === WORLD_CUP_YEARS.length,
    );
    check(
      'versus: neither settings write drops the other half of the row',
      () =>
        // Vacuity: there really are two writes to find.
        writes.length === 2 &&
        // Each passes the settings and the list, and neither invents an empty one.
        writes.every((args) => args.split(',').length === 2 && !/\[\s*\]/.test(args)) &&
        writes.some((args) => args.includes('peek().watchedDuels')) &&
        writes.some((args) => args.includes('peek().settings')),
      () => `save_settings writes: ${writes.join(' | ') || 'none found'}`,
    );
    check(
      'versus: the watched list is read and written through the store, not a browser key',
      () =>
        // The whole of the fix in one line: this module holds no storage of its own.
        watched.includes("from '../store'") &&
        !watched.includes('storage/kv') &&
        watched.includes('store.saveWatchedDuels(') &&
        watched.includes('store.peek().watchedDuels') &&
        // Vacuity: the guest's key still exists and is still the thing that talks to
        // localStorage, so this is reading a real separation rather than an absence.
        readFileSync('src/state/pvp/watchedStorage.ts', 'utf8').includes('storage/kv'),
    );
  }

  // --- The versus room pointer does not outlive the account -------------------
  // A REPORTED BUG, and the shape of it is worth keeping: the pointer to the room you are
  // holding lives in `sessionStorage`, and signing out RELOADS the page - so it survived
  // into the guest session and the front page went on offering "Back to your room" for a
  // room only an account can read. A room is account-only (P17), so a pointer with no
  // account is stale by definition.
  //
  // Two guards, because they fail differently: App refuses to READ one without an account,
  // which covers every way it can go stale (a session expiring, another tab), and the
  // account panel CLEARS it on the way out, so the stale value is not left sitting there.
  // Source-level on purpose - there is nothing to run, the defect is a line not being there.
  {
    const app = readFileSync('src/App.tsx', 'utf8');
    const panel = readFileSync('src/components/AccountPanel.tsx', 'utf8');
    // The two sign-out paths (`out`, which signs out, and `remove`, which deletes the
    // account) must each clear it: they are separate handlers and the second is the one a
    // reader forgets.
    const cleared = (panel.match(/holdVersusRoom\(null\)/g) ?? []).length;
    check(
      'versus: the room pointer is gated on the account and cleared when it ends',
      () =>
        // Vacuity: this file really is the one that reads the pointer, and the panel
        // really does have two ways out of an account.
        app.includes('useHeldVersusRoom()') &&
        /const heldRoom = accountEmail \? \w+ : null;/.test(app) &&
        panel.includes("await signOut(scope)") &&
        panel.includes('await deleteAccount()') &&
        cleared === 2,
      () =>
        `gate ${/const heldRoom = accountEmail \? \w+ : null;/.test(app)}, cleared in ${cleared} of the 2 ways out`,
    );
  }

  // --- The Play tab is the single-player game, and a held room is not on it -----
  // A REPORTED BUG: the Play tab's destination and the cover's Continue both preferred a
  // held versus room, so anybody holding one could not reach the front page at all - every
  // tap on PLAY forwarded to Versus. That preference made sense while Versus was a door on
  // the cover with no address of its own, and stopped making sense the day it became a tab
  // (2026-08-31): the mode is reachable from every screen now, so borrowing the Play tab
  // costs a destination and buys nothing.
  //
  // Source-level for the same reason the pointer check above is: there is nothing to run,
  // the defect is a line being there. The strip assertion is the vacuity guard, and it is
  // the load-bearing half - "Play does not mention the room" is trivially true of a build
  // that dropped the pointer altogether, which would be a worse bug than the one this
  // replaces (a player mid-room with no way back to it from the album).
  {
    const app = readFileSync('src/App.tsx', 'utf8');
    const playTo = /\n\s*const playTo = ([^;]*);/.exec(app)?.[1] ?? '';
    const continueAction = /\n\s*const continueAction = ([\s\S]*?);\n/.exec(app)?.[1] ?? '';
    const mentionsRoom = (src: string) => /roomTo|heldRoom|VersusRoom/.test(src);
    // The chrome's one-line strip is where a held room lives now, and it links to it.
    const strip = /heldRoom && roomTo && !isVersus \? \(\s*<Link\s+to=\{roomTo\}/.test(app);
    check(
      'versus: the Play tab and the cover Continue are single-player, and the strip still holds the room',
      () =>
        // Vacuity: both expressions were found and both really do decide a destination.
        playTo.includes("'/cup-run'") &&
        continueAction.includes("'/cup-run'") &&
        !mentionsRoom(playTo) &&
        !mentionsRoom(continueAction) &&
        strip,
      () =>
        `playTo ${mentionsRoom(playTo) ? 'takes the room' : 'is solo'}, continue ${
          mentionsRoom(continueAction) ? 'takes the room' : 'is solo'
        }, strip ${strip}`,
    );
  }

  // --- The email address is the identifier, and both sides fold it the same way ---
  // Migration 0023 makes `profiles.email` unique, which is the ask - but a unique index is
  // only worth what the stored form is worth. `Mario@x.com` and `mario@x.com` are one
  // mailbox and would be two rows, so the rule has to be "store one form", and that rule is
  // stated in THREE places by three different technologies: the sign-in field folds what was
  // typed, GoTrue folds it again before it looks the account up, and the profile row is
  // written folded by two trigger functions. Only the first and third are ours, and this
  // asserts they agree - the failure it exists to catch is somebody restoring `email.trim()`
  // at a sign-in call site, which works perfectly for every address anybody types in lower
  // case and hands the server a second spelling of one identity the first time somebody's
  // phone capitalises the first letter.
  //
  // Source-level, like the room-pointer check above and for the same reason: the defect is
  // a line not being there, and importing `state/auth.ts` here would drag the whole auth
  // library into the harness for one string function.
  {
    const auth = readFileSync('src/state/auth.ts', 'utf8');
    const sql = readFileSync('supabase/migrations/0023_email_is_the_identifier.sql', 'utf8');
    // The two places an address is sent. Both must go through the fold, and `.trim()` alone
    // at either is the regression.
    const sends = (auth.match(/email: foldEmail\(email\),/g) ?? []).length;
    const raw = (auth.match(/email: email\.trim\(\),/g) ?? []).length;
    // The three writes: the backfill, and the two trigger functions.
    const folds = (sql.match(/lower\(btrim\(/g) ?? []).length;
    check(
      'accounts: the email is folded where it is typed and where it is stored, and is unique',
      () =>
        // Vacuity: this really is the file that signs in, and those really are the two calls.
        auth.includes('auth.signInWithOtp(') &&
        auth.includes('auth.verifyOtp(') &&
        sends === 2 &&
        raw === 0 &&
        // The client's fold is case and surrounding space, and nothing cleverer: the
        // local-part rules (dots, a `+tag`) belong to the mail provider, and folding them
        // would merge two accounts somebody keeps apart on purpose.
        /export function foldEmail[\s\S]{0,200}\.trim\(\)[\s\S]{0,80}toLocaleLowerCase/.test(auth) &&
        // And the server's, in the two functions plus the backfill.
        folds >= 3 &&
        sql.includes('create unique index if not exists profiles_email_uniq on profiles (email)'),
      () => `${sends} folded sends, ${raw} raw, ${folds} folded writes`,
    );
  }

  // --- Changing a versus name is the same instruction as claiming one ----------
  // A rename needed no SQL, and the reason is one comparison inside `set_display_name`
  // (0017): it refuses a key held by SOMEBODY ELSE, not a key that is held. So an account
  // re-claiming its own row updates it, which is exactly what a rename is. That is easy to
  // "tighten" into a refusal for an account that already has a name - it reads like a
  // guard - and the rename screen would then fail with "that name is taken" against the
  // player's own name, which is the least diagnosable sentence available.
  //
  // The client half is one panel for both, so the rule, the normalisation preview and the
  // three refusals cannot differ between picking a name and changing it.
  {
    const dir = 'supabase/migrations';
    const live = readFileSync(`${dir}/0017_pvp_referee.sql`, 'utf8');
    const body = live.slice(live.indexOf('create or replace function set_display_name'));
    const screen = readFileSync('src/components/versus/VersusScreen.tsx', 'utf8');
    const home = readFileSync('src/components/versus/VersusHome.tsx', 'utf8');
    check(
      'versus: a name can be changed - the claim allows a re-claim, and one panel does both',
      () =>
        // Vacuity: the body was found, and it really is the function that writes the name.
        body.includes('update profiles set display_name = p_name, name_key = p_key') &&
        // The comparison that makes a rename legal. Against the CALLER, not against null.
        /v_holder is not null and v_holder <> v_user/.test(body) &&
        // One call site, so there is one rule and one set of messages.
        (screen.match(/claimDisplayName\(/g) ?? []).length === 1 &&
        // The panel takes the current name, which is the only thing that differs.
        /function NamePanel\(/.test(screen) &&
        screen.includes('current: string | null;') &&
        screen.includes('<NamePanel current={null}') &&
        // And there is a way to reach it that is not the first-time gate.
        home.includes('onRename') &&
        screen.includes('setRenaming(true)'),
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

  // --- The bank cap: data now, like every other economy constant ----------------
  // How many collectible ids one finished run may bank used to be the one economy number
  // the two sides each stated on their own: `BANK_CAP` here, and a bare `> 12` inside the
  // body of `finish_run_v2`. Hygiene H135 held every literal in `supabase/migrations/` to
  // the client's figure as an interim; migration 0015 is the real fix, so the function reads
  // `economy_constants` and `gen-collectibles` emits the row, the way the trade costs and
  // the swap cap always did. Going over the cap raises and the raise rolls the whole bank
  // back, which for a signed-in player is the blocking unreachable screen, so what is left
  // to guard is the three ways that can quietly come undone.
  //
  // The historical literals are NOT held to `BANK_CAP` any more, deliberately: 0003 to 0014
  // are superseded history, and a future change to the cap would fail against six files that
  // are correct about what the server used to do.
  {
    const dir = 'supabase/migrations';
    const KEY = 'max_collectibles_per_run';

    // 1. The client's figure reaches the server at all. Regenerating the seed is what fixes
    //    a failure here, exactly as it is for the catalogue rows.
    const seed = readFileSync(CATALOGUE_PATH, 'utf8');
    const emitted = /\('max_collectibles_per_run',\s*(\d+)\)/.exec(seed);
    check(
      `economy: the generated seed sends the bank cap (${KEY} = ${BANK_CAP})`,
      () => emitted !== null && Number(emitted[1]) === BANK_CAP,
      () =>
        emitted === null
          ? `${CATALOGUE_PATH} does not emit ${KEY} at all - run \`npm run gen:collectibles\``
          : `the seed sends ${emitted[1]}, config says ${BANK_CAP}`,
    );

    // 2. Every `coalesce` fallback is the current figure, which is what makes the order of
    //    "apply the migration" and "push the seed" not matter.
    const fallbacks: { file: string; n: number }[] = [];
    // 3. ...and the cap test's operand, which must be the variable and not a number again.
    const tests: { file: string; operand: string }[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      const sql = readFileSync(`${dir}/${f}`, 'utf8');
      for (const m of sql.matchAll(
        /coalesce\(\s*economy_constant\('max_collectibles_per_run'\)\s*,\s*(\d+)\s*\)/g,
      )) {
        fallbacks.push({ file: f, n: Number(m[1]) });
      }
      for (const m of sql.matchAll(/array_length\(\s*submitted\s*,\s*1\s*\)\s*>\s*([a-z_0-9]+)/g)) {
        tests.push({ file: f, operand: m[1]! });
      }
    }

    const stale = fallbacks.filter((x) => x.n !== BANK_CAP);
    check(
      `economy: every server-side bank-cap fallback is config's BANK_CAP (${BANK_CAP})`,
      () => fallbacks.length > 0 && stale.length === 0,
      () =>
        fallbacks.length === 0
          ? `nothing in ${dir} coalesces economy_constant('${KEY}') - the server has stopped ` +
            'reading the constant, so this check is now vacuous'
          : stale.map((x) => `${x.file} falls back to ${x.n}`).join('; '),
    );

    // The live definition is the newest one, and this is the regression the interim check was
    // really guarding: a restatement that copies an older body brings the literal back.
    const live = tests.length > 0 ? tests[tests.length - 1]!.file : null;
    const inlined = tests.filter((t) => t.file === live && /^[0-9]+$/.test(t.operand));
    check(
      'economy: the newest migration caps a bank by reading the constant, not a literal',
      () => live !== null && inlined.length === 0,
      () =>
        live === null
          ? `nothing in ${dir} tests array_length(submitted, 1) - the cap has moved, so this ` +
            'check is now vacuous'
          : `${live} caps at the literal ${inlined.map((t) => t.operand).join(', ')}`,
    );
  }
}
