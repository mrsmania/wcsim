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

  // --- Sticker art: shipped webp files match the collectible set ---------------
  // Nothing guarded this, and it broke twice in two days while it was going unguarded: the
  // 1986 drop created three collectibles with no artwork, and re-rating 1986 took it to six.
  // Both times the album silently shipped text-fallback cards, one of them Maradona in the
  // Monumental tier. `build-sticker-art.py` never consults the dataset, so a rating change
  // that crosses a STICKER_TIERS boundary neither builds the new card nor prunes the old one.
  //
  // Two directions, and one deliberate allowance:
  //   - an ORPHAN webp (art for a player who is no longer collectible) is a hard failure;
  //     it is dead weight shipping on every deploy and it is always cheap to delete.
  //   - a MISSING webp (a collectible with no art) is a hard failure UNLESS the id is in
  //     KNOWN_MISSING_ART below. Those six have no source image anywhere, so the check
  //     cannot be made green by working harder - it is waiting on artwork.
  // The allowance is itself checked: a KNOWN_MISSING_ART id that has since gained art, or
  // that is no longer collectible, FAILS. So the list cannot quietly become permanent debt -
  // it shrinks as art arrives and it tells you to shrink it.
  const KNOWN_MISSING_ART = new Set([
    'arg-1986-10', // Maradona (Monumental)
    'fra-1986-10', // Platini
    'esp-1986-9', // Butragueno
    'eng-1986-10', // Lineker
    'den-1986-10', // Elkjaer
    'urs-1986-19', // Belanov
    // 1982, added with that tournament. A card with no file is no longer a hole in the
    // grid - `STICKER_PLACEHOLDER_SRC` draws a silhouette at the right size - but it is
    // still a gap, which is why they are listed rather than waved through.
    'ita-1982-20', // Rossi (the tournament's 91)
    'bra-1982-10', // Zico
    'ger-1982-11', // Rummenigge
    'fra-1982-12', // Giresse
    'pol-1982-20', // Boniek
    'fra-1982-10', // Platini, once his 1982 rating crossed 90
    // 1978, added with that tournament. Only two players in that field reach 90.
    'arg-1978-10', // Kempes (the tournament's 91)
    'ned-1978-12', // Rensenbrink
    // 1974, added with that tournament. Cruyff is the first new ICONIC in a while.
    'ned-1974-14', // Cruyff (Iconic, 95)
    'ger-1974-5', // Beckenbauer
    'ger-1974-13', // Gerd Muller
    'ned-1974-13', // Neeskens
    'pol-1974-12', // Deyna
    // 1970. Pele is the dataset's seventh MONUMENTAL card.
    'bra-1970-10', // Pele (Monumental, 97)
    'ger-1970-13', // Gerd Muller (Iconic, 93)
    'bra-1970-7', // Jairzinho
    'ger-1970-4', // Beckenbauer
    'eng-1970-6', // Bobby Moore
  ]);
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
    const unexpected = missing.filter((id) => !KNOWN_MISSING_ART.has(id));
    // The allowance must stay honest in both directions.
    const staleAllowed = [...KNOWN_MISSING_ART].filter(
      (id) => !ids.has(id) || (shipped ? shipped.has(id) : false),
    );
    const ok = shipped !== null && unexpected.length === 0 && orphans.length === 0 && staleAllowed.length === 0;
    if (unexpected.length) console.log('    collectibles with no art: ' + unexpected.join(', '));
    if (orphans.length) console.log('    art with no collectible: ' + orphans.join(', '));
    if (staleAllowed.length)
      console.log('    KNOWN_MISSING_ART is stale, drop these: ' + staleAllowed.join(', '));
    check(
      `stickers: shipped art matches the collectible set ` +
        `(${collectible.length} collectible, ${shipped?.size ?? 0} shipped, ` +
        `${KNOWN_MISSING_ART.size} awaiting artwork)`,
      () => ok,
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

}
