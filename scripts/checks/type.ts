// Characterization checks for the THREE FACES and, above all, for the mono seam.
//
// Added 2026-09-10, when `--font-mono` was pointed back at a real monospace (Recursive
// Mono). The token is one line and it decides how about 210 sites render, so the whole
// risk is that the two halves of it drift apart: `src/index.css` names the family and
// `index.html` is what actually fetches it, and neither file mentions the other.
//
// THE FAILURE THIS EXISTS TO CATCH IS SILENT, WHICH IS WHY IT IS WORTH A CHECK. Recursive
// carries its monospace as a variable AXIS on one family, so the request has to pin
// `MONO` at 1: `family=Recursive:MONO,wght@1,400..800`. Drop the `MONO,` while tidying the
// URL and Google serves the same family name, proportional - every figure in the game
// stops lining up, nothing errors, no request fails, and the app looks very nearly right.
// Drop the family from the link altogether and the token falls through to `ui-monospace`,
// which is a different monospace on every machine and correct on none of them.

import { readFileSync } from 'node:fs';
import { check } from './harness';

/** The first quoted family a `--font-*` token names, which is the one that has to be
 *  fetched; everything after it is the fallback stack. */
function tokenFamily(css: string, token: string): string | null {
  const line = new RegExp(`--font-${token}:\\s*([^;]+);`).exec(css);
  if (!line) return null;
  const first = /'([^']+)'|"([^"]+)"/.exec(line[1]!);
  return first ? (first[1] ?? first[2] ?? null) : null;
}

export function typeChecks(): void {
  const css = readFileSync('src/index.css', 'utf8');
  const html = readFileSync('index.html', 'utf8');
  const link = /href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/.exec(html)?.[1] ?? '';

  const tokens = (['sans', 'mono', 'display'] as const).map((t) => [t, tokenFamily(css, t)] as const);
  const named = tokens.filter(([, f]) => f);

  // Vacuity, and it is the half that keeps the rest honest: the scan really read three
  // tokens and a real Google Fonts request, so "every family is fetched" is a claim about
  // something rather than a claim about two empty lists.
  check(
    'type: the three font tokens each name a family, and index.html asks Google for a stylesheet',
    () => named.length === 3 && link.includes('family=') && link.includes('display=swap'),
    () => `${named.map(([t, f]) => `${t}=${f}`).join(', ')} | link ${link.slice(0, 60) || 'MISSING'}`,
  );

  const unfetched = named.filter(([, f]) => !link.includes(`family=${f!.split(' ').join('+')}:`));
  check(
    'type: every face a token names is fetched by the font link',
    () => named.length === 3 && unfetched.length === 0,
    () => (unfetched.length ? `not in the link: ${unfetched.map(([, f]) => f).join(', ')}` : `${named.length} faces fetched`),
  );

  // The seam itself. `--font-mono` is the marker for "this is a figure or a data label",
  // so it may be pointed at whatever face the game wants - but if that face is Recursive,
  // the MONO axis has to be pinned in the request, because the family name alone serves
  // the proportional cut. Pinning it there rather than with `font-variation-settings` is
  // deliberate: seven rules in `index.css` reach `var(--font-mono)` without ever carrying
  // the `.font-mono` class, and each of those would otherwise need its own declaration.
  const mono = tokenFamily(css, 'mono');
  check(
    'type: the mono token is Recursive and the link pins its MONO axis at 1',
    () => mono === 'Recursive' && /family=Recursive:[^&"]*\bMONO\b[^&"]*@1,/.test(link),
    () => `--font-mono is ${mono ?? 'unset'}; link ${/family=Recursive:[^&"]*/.exec(link)?.[0] ?? 'does not request Recursive'}`,
  );

  // The digits line up twice over and the two halves are separable: the face fixes the
  // letters, `font-variant-numeric` fixes the digits. The rule is the one that still
  // holds if the token ever moves back to a proportional face, so it is not redundant
  // with the face being monospaced today.
  check(
    'type: .font-mono still asks for tabular figures whatever face the token names',
    () => /\.font-mono\s*\{[^}]*font-variant-numeric:\s*tabular-nums/.test(css),
    () => 'the tabular-nums rule on .font-mono is gone',
  );
}
