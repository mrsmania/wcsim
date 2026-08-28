// Characterization checks for the generated seed, the shipped art and the boot cover.
//
// One of the seventeen concern modules `scripts/checks.ts` runs (hygiene H104). It was
// one 3,900-line file whose blocks shared nothing but the assertion helper, and whose
// summary ran last only because it happened to sit at the bottom.

import { check } from './harness';
import { readFileSync, readdirSync } from 'node:fs';
import { ALL_PLAYERS, SQUAD_BY_ID } from '../../src/data/squads';
import { collectiblePlayers, tierOf } from '../../src/domain/album';
import { SETTINGS_KEY } from '../../src/state/settingsStorage';
import { CATALOGUE_PATH, catalogueChecksum, catalogueRows, checksumInFile } from '../collectibles';

export function assetsChecks(): void {
  // --- Collectible catalogue: the generated SQL seed matches the dataset ------
  // The server validates sticker earns against supabase/seed/collectibles.sql, which is
  // generated from squads.ts + STICKER_TIERS. A rating tweak that forgets
  // `npm run gen:collectibles` would leave a newly-collectible player unbankable, so the
  // drift is a hard failure here rather than a surprise in production.
  // (docs/cloud-sync-design.md §3.)
  {
    const rows = catalogueRows(ALL_PLAYERS, SQUAD_BY_ID, tierOf);
    let sql: string | null = null;
    try {
      sql = readFileSync(CATALOGUE_PATH, 'utf8');
    } catch {
      sql = null;
    }
    const recorded = sql ? checksumInFile(sql) : null;
    const ok = recorded !== null && recorded === catalogueChecksum(rows);
    check(
      `collectibles: ${CATALOGUE_PATH} is in sync with the dataset ` +
        `(${rows.length} rows; run \`npm run gen:collectibles\` if this fails)`,
      () => ok,
    );
  }

  // --- Sticker art: nothing ships for a player who is not collectible ---------
  // `build-sticker-art.py` never consults the dataset, so a rating change that crosses a
  // STICKER_TIERS boundary neither builds a new card nor prunes the one that is now dead.
  //
  // The two directions are NOT equally serious, and treating them as though they were is
  // what made this check a nuisance (decided 2026-08-28, after it failed a rating pass
  // twice in one morning):
  //   - an ORPHAN webp (art for a player who is no longer collectible) is a hard FAILURE.
  //     It is dead weight shipping on every deploy, it is always cheap to delete, and it
  //     is also how a misnamed source file shows up - the built card is named after the
  //     source, so a typo in the id lands here rather than passing silently.
  //   - a MISSING webp (a collectible nobody has drawn yet) PASSES, and is reported.
  //     `StickerCard` swaps a file that will not load for `STICKER_PLACEHOLDER_SRC`, so an
  //     undrawn card is a silhouette at the right size rather than a hole in the grid:
  //     nothing the player sees is broken, and a red build for a purely cosmetic gap stops
  //     work on something else. What keeps the gap from going UNNOTICED - which is the real
  //     risk, and how Maradona sat undrawn in the Monumental tier for two days - is
  //     `npm run ratings:sync`: it names every newly undrawn card as it appears, records
  //     the set in art/awaiting-artwork.txt and lists them in docs/missing-sticker-art.html.
  {
    const STICKER_DIR = 'public/stickers';
    let shipped: Set<string> | null = null;
    try {
      shipped = new Set(
        readdirSync(STICKER_DIR)
          .filter((f) => f.endsWith('.webp'))
          .map((f) => f.replace(/\.webp$/, '')),
      );
    } catch {
      shipped = null;
    }
    const collectible = collectiblePlayers(ALL_PLAYERS);
    const ids = new Set(collectible.map((p) => p.id));
    const missing = shipped ? [...ids].filter((id) => !shipped!.has(id)) : [];
    const orphans = shipped ? [...shipped].filter((id) => !ids.has(id)) : [];
    // Unreadable is a failure, not an empty set: with no directory to read, "no orphans"
    // is true of every tree and the check would be worth nothing.
    const ok = shipped !== null && orphans.length === 0;
    if (shipped === null) console.log(`    ${STICKER_DIR} could not be read`);
    if (orphans.length) console.log('    art with no collectible: ' + orphans.join(', '));
    if (missing.length)
      console.log(
        `    ${missing.length} collectible${missing.length === 1 ? '' : 's'} undrawn, ` +
          'showing the silhouette (listed in art/awaiting-artwork.txt)',
      );
    check(
      `stickers: nothing shipped for a non-collectible ` +
        `(${collectible.length} collectible, ${shipped?.size ?? 0} shipped, ` +
        `${missing.length} undrawn)`,
      () => ok,
    );
  }

  // --- Kit colours: art/kits.json names real squads ----------------------------
  // What each squad wore, for whoever draws the cards, merged into the worklist page by
  // `npm run ratings:sync`. Nothing in the app reads it and a missing squad is a legal
  // answer (the page says "not recorded"), so the only thing worth failing on is a key
  // that names NO squad: a typo there is invisible, since the row it was meant for simply
  // goes on printing as unrecorded. The parse is checked too, because a file that cannot
  // be read silently costs every colour on the page.
  {
    const KITS_PATH = 'art/kits.json';
    type Part = { name?: unknown; hex?: unknown };
    type Kit = { shirt?: Part; shorts?: Part; socks?: Part; confidence?: unknown };
    let kits: Record<string, Kit> | null = null;
    let players: Record<string, unknown> | null = null;
    try {
      const raw = JSON.parse(readFileSync(KITS_PATH, 'utf8')) as {
        kits?: Record<string, Kit>;
        players?: Record<string, unknown>;
      };
      kits = raw.kits ?? null;
      players = raw.players ?? {};
    } catch {
      kits = null;
    }
    const ids = new Set(ALL_PLAYERS.map((p) => p.id));
    const entries = kits ? Object.entries(kits) : [];
    const unknownSquads = entries.filter(([squadId]) => !SQUAD_BY_ID[squadId]).map(([s]) => s);
    // A shirt with no readable colour is the one shape that reaches the page and prints an
    // empty box, so it is worth the same treatment as a bad key.
    const badShirts = entries
      .filter(([, kit]) => {
        const hex = kit.shirt?.hex;
        return typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex);
      })
      .map(([squadId]) => squadId);
    const CONFIDENCE = new Set(['verified', 'known', 'standard']);
    const badConfidence = entries
      .filter(([, kit]) => !CONFIDENCE.has(String(kit.confidence)))
      .map(([squadId]) => squadId);
    const unknownPlayers = Object.keys(players ?? {}).filter((id) => !ids.has(id));
    if (unknownSquads.length) console.log('    kits: no such squad: ' + unknownSquads.join(', '));
    if (badShirts.length) console.log('    kits: unreadable shirt colour: ' + badShirts.join(', '));
    if (badConfidence.length)
      console.log('    kits: confidence must be verified/known/standard: ' + badConfidence.join(', '));
    if (unknownPlayers.length)
      console.log('    kits: no such player: ' + unknownPlayers.join(', '));
    check(
      `kits: ${KITS_PATH} names real squads and readable colours (${entries.length} squads)`,
      () =>
        // Non-empty is the vacuity guard: an unreadable or emptied file would otherwise
        // pass every assertion below by having nothing to assert.
        entries.length > 0 &&
        unknownSquads.length === 0 &&
        badShirts.length === 0 &&
        badConfidence.length === 0 &&
        unknownPlayers.length === 0,
    );
  }

  // --- Boot cover: every hard-coded colour matches the token it copies ---------
  // index.html paints a cover before the bundle arrives, so it CANNOT read the @theme
  // custom properties - they ship with index.css. Its palette is therefore a hand-written
  // copy, and CLAUDE.md makes keeping the two in step an obligation while nothing enforced
  // it (hygiene H139). A drift shows as one frame of the old palette on every load, which
  // is exactly the kind of thing nobody notices and nobody can bisect.
  //
  // Both files are plain text on disk, so this reads them the way the collectibles check
  // reads the SQL seed. Each entry names the CSS rule to look in, the property, and the
  // token it is a copy of - written out rather than inferred, because the two spinner
  // arcs deliberately do NOT use the same token in the two themes (a deep pitch-dark on
  // a dark ring would be invisible, so dark uses plain `pitch`).
  {
    const css = readFileSync('src/index.css', 'utf8');
    const html = readFileSync('index.html', 'utf8');

    /** Token values from one block of `src/index.css`. */
    const tokensIn = (block: string): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const m of block.matchAll(/(--color-[a-z-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
        out[m[1]] = m[2].toLowerCase();
      }
      return out;
    };
    const blockAfter = (marker: string): string | null => {
      const at = css.indexOf(marker);
      if (at === -1) return null;
      const open = css.indexOf('{', at);
      const close = css.indexOf('}', open);
      return open === -1 || close === -1 ? null : css.slice(open + 1, close);
    };
    const lightBlock = blockAfter('@theme');
    const darkBlock = blockAfter(":root[data-theme='dark']");
    const light = lightBlock ? tokensIn(lightBlock) : {};
    // A dark theme only OVERRIDES: anything it does not restate keeps its light value.
    const dark = darkBlock ? { ...light, ...tokensIn(darkBlock) } : {};

    /** The value of `prop` inside the first index.html rule whose selector contains `sel`. */
    const bootValue = (sel: string, prop: string): string | null => {
      const at = html.indexOf(sel);
      if (at === -1) return null;
      const open = html.indexOf('{', at);
      const close = html.indexOf('}', open);
      if (open === -1 || close === -1) return null;
      // `[^;}]*?` so a shorthand works too: `border: 2px solid #d4ded5` is one of these.
      const m = html
        .slice(open + 1, close)
        .match(new RegExp(prop + '\\s*:[^;}]*?(#[0-9a-fA-F]{3,8})'));
      return m ? m[1].toLowerCase() : null;
    };

    // [selector, property, token, which theme's value it must equal]
    const COPIES: [string, string, string, 'light' | 'dark'][] = [
      ['html {', 'background', '--color-ground', 'light'],
      ["html[data-theme='dark'] {", 'background', '--color-ground', 'dark'],
      ['#boot .boottile {', 'background', '--color-pitch-dark', 'light'],
      ["html[data-theme='dark'] #boot .boottile {", 'background', '--color-pitch-dark', 'dark'],
      ['#boot .boottile svg {', 'stroke', '--color-amber', 'light'],
      ["html[data-theme='dark'] #boot .boottile svg {", 'stroke', '--color-amber', 'dark'],
      ['#boot .bootmark {', 'color', '--color-ink', 'light'],
      ["html[data-theme='dark'] #boot .bootmark {", 'color', '--color-ink', 'dark'],
      ['#boot .bootspin {', 'border', '--color-line', 'light'],
      ['#boot .bootspin {', 'border-top-color', '--color-pitch-dark', 'light'],
      ["html[data-theme='dark'] #boot .bootspin {", 'border-color', '--color-line', 'dark'],
      // Not pitch-dark here, on purpose: see the note above.
      ["html[data-theme='dark'] #boot .bootspin {", 'border-top-color', '--color-pitch', 'dark'],
    ];

    const wrong: string[] = [];
    for (const [sel, prop, token, theme] of COPIES) {
      const want = (theme === 'light' ? light : dark)[token];
      const got = bootValue(sel, prop);
      if (!want) wrong.push(`${token} not found in src/index.css (${theme})`);
      else if (got !== want) wrong.push(`${sel} ${prop}: ${got ?? 'missing'} should be ${want}`);
    }

    // The favicon is a data: URI, so its two colours are URL-escaped and it has no theme -
    // a browser tab icon cannot follow one. Both must still be the light values.
    const favicon = html.slice(0, html.indexOf('</svg>'));
    for (const [token, count] of [
      ['--color-pitch-dark', 1],
      ['--color-amber', 1],
    ] as [string, number][]) {
      const escaped = '%23' + light[token].slice(1);
      if (favicon.split(escaped).length - 1 < count) {
        wrong.push(`favicon: ${escaped} (${token}) not present`);
      }
    }

    check(
      `boot: index.html's ${COPIES.length} palette literals + the favicon match their index.css tokens` +
        (wrong.length ? ` [${wrong.join('; ')}]` : ''),
      () => wrong.length === 0,
    );

    // The browser chrome's colour is the same copy problem one layer out: two
    // `theme-color` metas, one per scheme, and they have to be the page's own background
    // or the phone's address bar sits at a different colour from the cover under it
    // (hygiene H102).
    const meta = (scheme: string): string | null => {
      const m = html.match(
        new RegExp(
          '<meta[^>]*name="theme-color"[^>]*prefers-color-scheme:\\s*' +
            scheme +
            '[^>]*content="(#[0-9a-fA-F]{3,8})"',
        ),
      );
      return m ? m[1].toLowerCase() : null;
    };
    check(
      'boot: both theme-color metas match --color-ground for their scheme',
      () => meta('light') === light['--color-ground'] && meta('dark') === dark['--color-ground'],
    );

    // The pre-paint theme script cannot IMPORT the settings key: it runs before any module
    // loads. So it holds a literal, and bumping the key without bumping this one gives
    // every dark-theme player a light flash on load with no compile error. This is the only
    // guard there is (hygiene H102).
    check(
      "boot: the pre-paint theme script reads the settings module's own key",
      () => html.includes(`localStorage.getItem('${SETTINGS_KEY}')`),
    );
  }

  // --- The house "no em-dashes" rule, enforced rather than written down -------
  // CLAUDE.md has said it since the project started and the audit found 19 of them in two
  // design docs anyway (hygiene H115c). The rule is only worth having if something checks
  // it, and a single character is the cheapest possible check. Scope is what H115 measured:
  // the source, the scripts, the SQL, the markdown docs and the three files at the root.
  // The HTML docs are deliberately out - they use the `&mdash;` entity as a heading
  // separator, which is a typographic choice in a rendered document rather than prose.
  {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(p, out);
        else out.push(p);
      }
      return out;
    };
    const files = [
      ...walk('src'),
      ...walk('scripts'),
      ...walk('supabase'),
      ...readdirSync('docs')
        .filter((f) => f.endsWith('.md'))
        .map((f) => `docs/${f}`),
      'README.md',
      'CLAUDE.md',
      'index.html',
    ];
    // Built from its code point, not typed: a literal here would make this file the first
    // thing the check finds.
    const EM_DASH = String.fromCharCode(0x2014);
    const guilty = files.filter((f) => readFileSync(f, 'utf8').includes(EM_DASH));
    check(
      `house style: no em-dashes in any of the ${files.length} source, script, SQL, doc and root files`,
      () => guilty.length === 0,
      () => guilty.join(', '),
    );
  }
}
