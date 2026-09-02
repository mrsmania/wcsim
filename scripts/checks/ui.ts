// Characterization checks for the app's BUTTONS and the contrast they carry.
//
// Added 2026-08-27, when the app turned out to have about a dozen different button looks
// and the primary one did not meet AA. Both halves of that are checkable, and neither was
// checked, which is why both drifted: a near-copy of a class string looks like a class
// string, and a contrast failure looks like a colour.
//
// REWRITTEN 2026-09-02, when the count had drifted again - twelve renderings inside the
// helper and eight more bespoke buttons written outside it - and the answer became a
// CEILING: three designs, and the checks below assert the number rather than describing it.
// The one that does the work is the last block: it reads every clickable in `src/` and
// fails on a button-shaped class string that is not the token. Before it, "there are three
// buttons" was a claim about `matchUi.tsx` and said nothing about the other 40 files.
//
// THE CONTRAST HALF IS THE VALUABLE ONE. It reads the real tokens out of `index.css`, both
// themes, and computes the real WCAG ratio for the resting state of every tone. It would
// have caught white-on-pitch (4.00 light, 3.25 dark) the day the button was written.

import { readdirSync, readFileSync } from 'node:fs';
import { check } from './harness';
import { BTN_SIZES, BTN_SURFACES, BTN_TONES, DANGER_BTN, PRIMARY_BTN, SECONDARY_BTN, btn } from '../../src/components/matchUi';

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

/** One colour laid over another at `alpha`, so a translucent fill can be measured rather
 *  than guessed. The hero's button sits on a white wash over a scrim over the turf, and
 *  three stacked alphas is not something to do in your head. */
export function over(fg: string, bg: string, alpha: number): string {
  const ch = (hex: string): number[] =>
    [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16));
  const [f, b] = [ch(fg), ch(bg)];
  const mix = f.map((v, i) => Math.round(alpha * v + (1 - alpha) * b[i]!));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
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

  // --- THREE DESIGNS, and the number is the assertion ----------------------
  // Not "the tones share a shape", which was the old claim and which a fifth tone would
  // have satisfied. The ceiling is the point, so the count is what is checked.
  {
    const light6 = BTN_TONES.flatMap((t) => BTN_SIZES.map((s) => btn(t, s)));
    const distinct = new Set(light6);
    check(
      `ui: exactly ${BTN_TONES.length} button designs x ${BTN_SIZES.length} scales, all one shape`,
      () =>
        BTN_TONES.length === 3 &&
        BTN_SIZES.length === 2 &&
        // Named, so a rename cannot quietly restore a fourth emphasis under a new word.
        BTN_TONES.join(',') === 'primary,secondary,danger' &&
        BTN_SIZES.join(',') === 'normal,compact' &&
        distinct.size === light6.length &&
        // Every one is the same box vocabulary: rounded corners, a border, the display face.
        light6.every(
          (c) => /rounded-\[5px\]/.test(c) && /\bborder\b/.test(c) && /font-display/.test(c),
        ) &&
        // And exactly one padding scale each, so no button carries two.
        light6.every((c) => (c.match(/\bpx-/g) ?? []).length === 1),
      () => `${BTN_TONES.length} tones, ${BTN_SIZES.length} sizes, ${distinct.size} distinct`,
    );
    check(
      'ui: the three named exports are the system rather than three more looks',
      () =>
        PRIMARY_BTN === btn('primary', 'normal') &&
        SECONDARY_BTN === btn('secondary', 'normal') &&
        DANGER_BTN === btn('danger', 'normal'),
      () => PRIMARY_BTN,
    );
    // A SURFACE IS NOT A DESIGN, and that is a claim with a shape: the dark rendering has
    // to differ from the light one where the ground forces it and be the SAME string where
    // it does not. Danger is the "does not" - an opaque red reads on any ground - so
    // asserting it is identical is what stops the dark set drifting into three more looks.
    check(
      'ui: the dark surface re-renders only what the turf forces, and danger is untouched',
      () =>
        BTN_SURFACES.join(',') === 'light,dark' &&
        btn('primary', 'normal', 'dark') !== btn('primary', 'normal') &&
        btn('secondary', 'normal', 'dark') !== btn('secondary', 'normal') &&
        btn('danger', 'normal', 'dark') === btn('danger', 'normal') &&
        // Same shape and the same padding on both surfaces: only the tone block moves.
        BTN_TONES.every((t) =>
          BTN_SIZES.every((z) => {
            const head = (c: string) => c.slice(0, c.indexOf('text-['));
            return head(btn(t, z)) === head(btn(t, z, 'dark'));
          }),
        ),
      () => btn('primary', 'normal', 'dark'),
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
      ['danger', 'white', 'loss-deep'],
    ];
    const hovers: [string, string, string][] = [
      ['primary hover', 'white', 'pitch-hover'],
      ['secondary hover', 'pitch-ink', 'panel'],
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

  // --- The hero's turf, which is the only reason a dark surface exists -----
  // The front page's CTAs sit on the grass, under the scrim that deepens it for the words.
  // Three alphas stack there, so the ground is COMPOSITED rather than assumed, and both
  // halves of the claim are measured: the dark rendering passes, and the light one would
  // have been invisible (a fill has to clear 3:1 against its own ground to be seen at all,
  // and pitch-dark on the scrimmed turf reads 1.27).
  //
  // THE SCRIM'S VALUE IS A LITERAL BECAUSE `ink` INVERTS. It was `from-ink/55`, and in the
  // dark theme that painted a near-white wash over the turf: the ground came out #8ebba4
  // and the white headline measured 2.14. Checked in both themes here, so the token cannot
  // come back.
  {
    const WHITE = '#ffffff';
    const SCRIM = '#13211a'; // ModeSelect's literal, and index.css's light `ink`
    const heroSrc = readFileSync('src/components/ModeSelect.tsx', 'utf8');
    const bad: string[] = [];
    const seen: string[] = [];
    for (const [label, theme] of [['light', light], ['dark', dark]] as const) {
      // Grass is deliberately NOT theme-swapped (a green board in both themes), so the
      // ground under the scrim is the same either way - which is the property being tested.
      const ground = over(SCRIM, theme['grass'] ?? light['grass']!, 0.55);
      const pairs: [string, string, string][] = [
        // The white headline and body copy the scrim exists for.
        ['hero text', WHITE, ground],
        // primary on dark: a white fill with the dark ink label.
        ['primary dark', SCRIM, WHITE],
        // secondary on dark: a white wash over the scrimmed turf, white label, and hovered.
        ['secondary dark', WHITE, over(WHITE, ground, 0.08)],
        ['secondary dark hover', WHITE, over(WHITE, ground, 0.16)],
        // danger keeps its light rendering, which has to survive this ground too.
        ['danger dark', WHITE, theme['loss-deep'] ?? light['loss-deep']!],
      ];
      for (const [name, fg, bg] of pairs) {
        const r = contrast(fg, bg);
        seen.push(`${name}/${label} ${r.toFixed(2)}`);
        if (r < AA) bad.push(`${name} ${label} ${r.toFixed(2)}`);
      }
    }
    check(
      `ui: the hero's turf clears AA ${AA}:1 in BOTH themes, and its scrim is a literal`,
      () =>
        // Vacuity: the grass token was really read, and the scrim really is a literal in
        // the component - the whole failure this catches is somebody restoring `from-ink`.
        !!light['grass'] &&
        heroSrc.includes('from-[#13211a]/55') &&
        !heroSrc.includes('from-ink/') &&
        bad.length === 0,
      () =>
        bad.length
          ? `below ${AA}: ${bad.join(', ')}`
          : heroSrc.includes('from-ink/')
            ? 'the hero scrim is back on the theme-swapped `ink`, so it washes the turf pale in dark'
            : `grass not read: ${seen.slice(0, 3).join(', ')}`,
    );
    check(
      'ui: the primary needs a dark rendering BECAUSE its own fill vanishes on the turf',
      () => {
        const ground = over(SCRIM, light['grass']!, 0.55);
        // A UI component needs 3:1 against what is behind it. This is 1.27.
        return contrast(light['pitch-dark']!, ground) < 3 && contrast(WHITE, ground) >= AA;
      },
      () =>
        `pitch-dark vs scrimmed turf ${contrast(light['pitch-dark']!, over(SCRIM, light['grass']!, 0.55)).toFixed(2)}`,
    );
  }

  // --- The two hand-written copies stay copies -----------------------------
  // Two files cannot import the token and both say why in their own header:
  // `UnreachableScreen` is rendered by `main.tsx` before the app exists, so importing
  // `matchUi` would drag lucide, react-router and Flag onto that path; `ErrorBoundary` has
  // no imports beyond React so that it renders even when what it wraps took the app down.
  // So each writes the main button out - one as classes, one as inline style VALUES - and
  // this is what keeps them in step. A screen nobody sees until something has gone wrong is
  // exactly the one that drifts, and both of these had.
  {
    const src = readFileSync('src/components/UnreachableScreen.tsx', 'utf8');
    const quoted = (s: string): string => `'${s}'`;
    check(
      'ui: the unreachable screen still writes out exactly btn(primary) and btn(secondary)',
      () =>
        // Vacuity: it really does import nothing, which is the reason for the copy.
        !/^import /m.test(src) &&
        src.includes(quoted(btn('primary'))) &&
        src.includes(quoted(btn('secondary'))),
      () =>
        !/^import /m.test(src)
          ? 'the strings no longer match btn(primary) / btn(secondary)'
          : 'UnreachableScreen now has imports, so it can use the token directly',
    );
    const eb = readFileSync('src/components/ErrorBoundary.tsx', 'utf8');
    // The VALUES, not the classes: pitch-dark for the fill and the border, a 5px radius,
    // and the 13px / 800 / 0.04em label. Read out of the palette so the token is the source.
    const wants = [
      `background: '${light['pitch-dark']}'`,
      `border: '1px solid ${light['pitch-dark']}'`,
      'borderRadius: 5,',
      'fontSize: 13,',
      'fontWeight: 800,',
      "letterSpacing: '0.04em',",
    ];
    const missing = wants.filter((w) => !eb.includes(w));
    check(
      'ui: the error boundary reload button is the main design, in inline style values',
      () =>
        // Vacuity: it really imports nothing but React, which is the reason for the copy.
        (eb.match(/^import /gm) ?? []).length === 1 && missing.length === 0,
      () => (missing.length ? `missing ${missing.join(' | ')}` : 'ErrorBoundary grew an import'),
    );
  }

  // --- AND NOTHING ELSE IN THE APP IS BUTTON-SHAPED -----------------------
  // THE CHECK THAT ACTUALLY HOLDS THE CEILING. Everything above is about `matchUi.tsx` and
  // says nothing about the other forty files - which is exactly how the count went from
  // four looks to twenty, twice over. Nobody adds a fourth tone; they write a button from
  // scratch three screens away, and a near-copy of a class string looks like a class string.
  //
  // So this reads every class-list STRING LITERAL in `src/` - wherever it sits, a `const`
  // or a `className`, which is what makes it hard to dodge - and fails on two things:
  //
  //   A. A BESPOKE BUTTON: the app's button voice (`font-display` + `uppercase`) in a box
  //      (`rounded`) with its own padding (`px-`). Only a button is all four at once. The
  //      mono badges are not (`font-mono`, and `py-0.5` rather than a tap target), a card
  //      has no uppercase label, a text link has no box, and every SELECTOR - the year
  //      pills, the filter toggles, the five segmented groups, the tabs - keeps its own
  //      look on purpose and builds its class list from an array or an interpolation.
  //
  //   B. AN `!` OVERRIDE on a class list. Both drifted looks that were still nominally
  //      inside the token got there this way (`!rounded-full` wrapped around the button,
  //      `hover:!border-loss` appended to it): an override that fights the design is a new
  //      design wearing the token's name. Both spellings are caught, the prefix and
  //      Tailwind v4's suffix.
  //
  // MUTATION-TESTED AGAINST `HEAD` BEFORE THIS COMMIT, which is the only way to know a
  // sweep like this is not passing on nothing: at 8c7eb12 it reports exactly four - the
  // album's tier-coloured Trade button, the front page's `CTA`, the market's red hover and
  // the settings sheet's pill. It reads 1,310 class lists across 157 files here.
  //
  // COMMENTS ARE STRIPPED FIRST, and that is not tidiness. This codebase quotes code in
  // backticks in its prose, so the paragraph above - which names `!rounded-full` - IS a
  // backtick span, and the first version of this check failed on its own explanation.
  //
  // It cannot catch a button composed out of a shared constant plus extra utilities, and
  // does not pretend to. It catches the thing that actually happens.
  {
    /** Source with its comments blanked, so prose that quotes a utility is not read as
     *  code. Tracks quotes on the way through, or a `//` inside a string would eat the
     *  rest of the line; block comments are replaced by their own newlines so a reported
     *  line number still points at the right place. */
    const codeOnly = (s: string): string => {
      let out = '';
      let i = 0;
      let quote: string | null = null;
      while (i < s.length) {
        const c = s[i]!;
        if (quote) {
          out += c;
          if (c === '\\') {
            out += s[i + 1] ?? '';
            i += 2;
            continue;
          }
          if (c === quote) quote = null;
          i++;
          continue;
        }
        if (c === "'" || c === '"' || c === '`') {
          quote = c;
          out += c;
          i++;
          continue;
        }
        if (c === '/' && s[i + 1] === '/') {
          while (i < s.length && s[i] !== '\n') i++;
          continue;
        }
        if (c === '/' && s[i + 1] === '*') {
          const j = s.indexOf('*/', i + 2);
          const end = j === -1 ? s.length : j + 2;
          out += '\n'.repeat((s.slice(i, end).match(/\n/g) ?? []).length);
          i = end;
          continue;
        }
        out += c;
        i++;
      }
      return out;
    };

    const CLASSY = /'([^'\n<>]{12,})'|"([^"\n<>]{12,})"|`([^`\n<>]{12,})`/g;
    const UTILITY = /^[a-z0-9:!/[\]#().,%-]+$/;
    // `${...}` holes are dropped: what is left is the literal half of a template, which is
    // where an appended override lives.
    const parts = (c: string): string[] => c.replace(/\$\{[^{}]*\}/g, ' ').split(/\s+/).filter(Boolean);
    /** A class list rather than prose: all but one token made of what a utility is made of.
     *  Two tokens to be a BUTTON, one to carry an override - `!rounded-full` was the whole
     *  of its own string. */
    const classList = (c: string, min: number): boolean => {
      const t = parts(c);
      return t.length >= min && t.filter((x) => UTILITY.test(x)).length >= t.length - 1;
    };
    const bespokeButton = (c: string): boolean => {
      const j = parts(c).join(' ');
      return (
        j.includes('font-display') && /\buppercase\b/.test(j) && /\bpx-/.test(j) && j.includes('rounded')
      );
    };
    const overridden = (c: string): boolean =>
      parts(c).some((t) => t.includes('!') && /^!?[a-z0-9-]+(:!?[a-z0-9-]+)*!?$/.test(t));

    // `matchUi` IS the token, and `UnreachableScreen` is the one documented copy of it
    // (checked above, string for string). Nothing else may be exempt.
    const exempt = new Set(['src/components/matchUi.tsx', 'src/components/UnreachableScreen.tsx']);
    const files = readdirSync('src', { recursive: true, encoding: 'utf8' })
      .map((f) => `src/${String(f).split('\\').join('/')}`)
      .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));
    const bespoke: string[] = [];
    const overrides: string[] = [];
    let lists = 0;
    for (const f of files) {
      if (exempt.has(f)) continue;
      const src = codeOnly(readFileSync(f, 'utf8'));
      for (const m of src.matchAll(CLASSY)) {
        const c = m[1] ?? m[2] ?? m[3] ?? '';
        const at = `${f.replace('src/components/', '')}:${src.slice(0, m.index).split('\n').length}`;
        if (classList(c, 2)) {
          lists++;
          if (bespokeButton(c)) bespoke.push(`${at} ${c.slice(0, 44)}`);
        }
        if (classList(c, 1) && overridden(c)) overrides.push(`${at} ${c.slice(0, 44)}`);
      }
    }
    check(
      'ui: no file writes its own button, and nothing overrides the token with `!`',
      () =>
        // Vacuity, and it is most of the check: the sweep really read the tree, and both
        // detectors really fire. A clean result from a pattern that matches nothing at all
        // is the failure mode a sweep like this dies of.
        files.length > 40 &&
        lists > 400 &&
        bespokeButton('rounded-lg border px-[22px] py-[14px] font-display uppercase') &&
        !bespokeButton('rounded-[3px] border px-1.5 py-0.5 font-mono uppercase text-[8px]') &&
        overridden('!rounded-full ${x}') &&
        overridden('${x} hover:!border-loss hover:!text-loss') &&
        overridden('rounded-full! border px-2') &&
        !overridden('rounded-full border px-2 hover:border-pitch') &&
        bespoke.length === 0 &&
        overrides.length === 0,
      () =>
        bespoke.length || overrides.length
          ? [
              bespoke.length ? `${bespoke.length} bespoke: ${bespoke.slice(0, 3).join(' / ')}` : '',
              overrides.length ? `${overrides.length} overridden: ${overrides.slice(0, 3).join(' / ')}` : '',
            ]
              .filter(Boolean)
              .join('; ')
          : `read ${lists} class lists across ${files.length} files`,
    );
  }
}
