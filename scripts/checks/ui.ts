// Characterization checks for the app's BUTTONS and the contrast they carry.
//
// Added 2026-08-27, when the app turned out to have about a dozen different button looks
// and the primary one did not meet AA. Both halves of that are checkable, and neither was
// checked, which is why both drifted: a near-copy of a class string looks like a class
// string, and a contrast failure looks like a colour.
//
// THE CONTRAST HALF IS THE VALUABLE ONE. It reads the real tokens out of `index.css`, both
// themes, and computes the real WCAG ratio for the resting state of every tone. It would
// have caught white-on-pitch (4.00 light, 3.25 dark) the day the button was written.

import { readFileSync } from 'node:fs';
import { check } from './harness';
import { BTN_SIZES, BTN_TONES, DANGER_BTN, PRIMARY_BTN, SECONDARY_BTN, btn } from '../../src/components/matchUi';

// --- WCAG -----------------------------------------------------------------

/** Relative luminance, per WCAG 2.1. */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

/** The contrast ratio between two hex colours. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * The threshold a BUTTON LABEL has to clear.
 *
 * 4.5, not 3. The relaxed 3:1 applies to text at 18.66px bold or larger, and the largest
 * label in this app is 13px - so every button here is "normal text" and takes the full
 * requirement. Writing the reason down because "it is bold, so 3 is fine" is the mistake
 * this number exists to prevent.
 */
const AA = 4.5;

/** The tokens of one theme, read out of `index.css` rather than restated here: a check that
 *  carries its own copy of the palette is a check that agrees with itself. */
const DARK_AT = ":root[data-theme='dark']";

function palette(css: string, theme: 'light' | 'dark'): Record<string, string> {
  // The light values are the `@theme` block, which runs up to the dark override; the dark
  // theme is the same tokens redefined under `:root[data-theme='dark']`, so it is the light
  // set with those applied on top. Read rather than restated: a check carrying its own copy
  // of the palette is a check that agrees with itself.
  const split = css.indexOf(DARK_AT);
  if (split === -1) throw new Error(`index.css no longer defines the dark theme at ${DARK_AT}`);
  const read = (text: string, into: Record<string, string>): Record<string, string> => {
    for (const m of text.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) into[m[1]!] = m[2]!;
    return into;
  };
  const out = read(css.slice(0, split), {});
  return theme === 'light' ? out : read(css.slice(split), out);
}

export function uiChecks(): void {
  const css = readFileSync('src/index.css', 'utf8');
  const light = palette(css, 'light');
  const dark = palette(css, 'dark');

  // --- The system is a system ----------------------------------------------
  {
    const all = BTN_TONES.flatMap((t) => BTN_SIZES.map((s) => btn(t, s)));
    const distinct = new Set(all);
    check(
      `ui: ${BTN_TONES.length} tones x ${BTN_SIZES.length} sizes give ${all.length} distinct buttons, all sharing one shape`,
      () =>
        // Vacuity: there really are several of each, or "they all share a shape" is trivial.
        BTN_TONES.length >= 4 &&
        BTN_SIZES.length >= 3 &&
        distinct.size === all.length &&
        // Every one is the same box vocabulary: rounded corners, a border, the display face.
        all.every((c) => /rounded-\[5px\]/.test(c) && /\bborder\b/.test(c) && /font-display/.test(c)) &&
        // And exactly one padding scale each, so no button carries two.
        all.every((c) => (c.match(/\bpx-/g) ?? []).length === 1),
      () => `${distinct.size} distinct of ${all.length}`,
    );
    check(
      'ui: the three named exports are the system rather than three more looks',
      () =>
        PRIMARY_BTN === btn('primary', 'lg') &&
        SECONDARY_BTN === btn('secondary', 'lg') &&
        DANGER_BTN === btn('danger', 'md'),
      () => PRIMARY_BTN,
    );
  }

  // --- Every tone meets AA, in both themes ---------------------------------
  // The one that matters. Each entry is the resting state as the tone actually paints it:
  // the foreground class and the surface it sits on.
  {
    const resting: [string, string, string][] = [
      // tone, text token, background token
      ['primary', 'white', 'pitch-dark'],
      ['secondary', 'ink', 'panel'],
      ['quiet', 'muted', 'panel'],
      ['danger', 'white', 'loss-deep'],
    ];
    const hovers: [string, string, string][] = [
      ['primary hover', 'white', 'pitch-hover'],
      ['secondary hover', 'pitch-ink', 'panel'],
      ['quiet hover', 'pitch-ink', 'panel'],
    ];
    const WHITE = '#ffffff';
    const value = (theme: Record<string, string>, token: string): string =>
      token === 'white' ? WHITE : theme[token]!;
    const failures: string[] = [];
    const worst: string[] = [];
    for (const [name, fg, bg] of [...resting, ...hovers]) {
      for (const [label, theme] of [['light', light], ['dark', dark]] as const) {
        const r = contrast(value(theme, fg), value(theme, bg));
        worst.push(`${name}/${label} ${r.toFixed(2)}`);
        if (r < AA) failures.push(`${name} ${label} ${r.toFixed(2)}`);
      }
    }
    check(
      `ui: every button tone clears AA ${AA}:1 in both themes, resting and hovered`,
      () =>
        // Vacuity: the palette really was read, and the primary's own pair is one of the
        // ones being measured rather than a token that resolved to undefined.
        !!light['pitch-dark'] &&
        !!dark['pitch-dark'] &&
        !!light['loss-deep'] &&
        contrast(WHITE, light['pitch']!) < AA &&
        failures.length === 0,
      () =>
        failures.length
          ? `below ${AA}: ${failures.join(', ')}`
          : `palette not read: ${worst.slice(0, 4).join(', ')}`,
    );
    // And the reason the primary fills with the DARK green is a measurement, so it is
    // asserted rather than left as a comment: the bright one does not pass.
    check(
      'ui: the primary fills with pitch-dark BECAUSE pitch does not pass - both halves measured',
      () =>
        contrast(WHITE, light['pitch']!) < AA &&
        contrast(WHITE, dark['pitch']!) < AA &&
        contrast(WHITE, light['pitch-dark']!) >= 7 &&
        contrast(WHITE, dark['pitch-dark']!) >= 7,
      () =>
        `pitch ${contrast(WHITE, light['pitch']!).toFixed(2)}/${contrast(WHITE, dark['pitch']!).toFixed(2)}, ` +
        `pitch-dark ${contrast(WHITE, light['pitch-dark']!).toFixed(2)}/${contrast(WHITE, dark['pitch-dark']!).toFixed(2)}`,
    );
  }

  // --- The two `-ink` tokens earn their names ------------------------------
  // `amber-ink` and `pitch-ink` exist because the SURFACE colours fail as text on paper.
  // That claim is a pair of numbers, so it is checked on every light surface the app has.
  {
    const surfaces = ['ground', 'panel', 'chalk'] as const;
    const bad: string[] = [];
    for (const ink of ['amber-ink', 'pitch-ink'] as const) {
      const surface = ink === 'amber-ink' ? 'amber' : 'pitch';
      for (const s of surfaces) {
        if (contrast(light[ink]!, light[s]!) < AA) bad.push(`${ink} on ${s} light`);
        if (contrast(dark[ink]!, dark[s]!) < AA) bad.push(`${ink} on ${s} dark`);
      }
      // Vacuity, and the whole reason the token exists: the surface value does NOT pass.
      if (contrast(light[surface]!, light['panel']!) >= AA) bad.push(`${surface} already passes light`);
    }
    check(
      'ui: amber-ink and pitch-ink clear AA on ground, panel and chalk, where the surface colours do not',
      () => bad.length === 0,
      () => bad.join(', '),
    );
  }

  // --- The one hand-written copy stays a copy ------------------------------
  // `UnreachableScreen` cannot import `matchUi`: it is rendered by `main.tsx` before the
  // app exists, and the import would drag lucide, react-router and Flag onto that path. So
  // it writes the two button strings out, and this is what keeps them in step - a screen
  // nobody sees until something has gone wrong is exactly the one that drifts.
  {
    const src = readFileSync('src/components/UnreachableScreen.tsx', 'utf8');
    const quoted = (s: string): string => `'${s}'`;
    check(
      'ui: the unreachable screen still writes out exactly btn(primary) and btn(quiet)',
      () =>
        // Vacuity: it really does import nothing, which is the reason for the copy.
        !/^import /m.test(src) &&
        src.includes(quoted(btn('primary'))) &&
        src.includes(quoted(btn('quiet'))),
      () =>
        !/^import /m.test(src)
          ? 'the strings no longer match btn(primary) / btn(quiet)'
          : 'UnreachableScreen now has imports, so it can use the token directly',
    );
  }
}
