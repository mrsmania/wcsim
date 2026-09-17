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
import { check, codeOnly } from './harness';
import { BTN_SIZES, BTN_SURFACES, BTN_TONES, DANGER_BTN, PRIMARY_BTN, SECONDARY_BTN, btn } from '../../src/components/matchUi';
import { STICKER_TIER_ORDER } from '../../src/config';
import { TIER_META, tierTopStrip } from '../../src/components/stickerTheme';
import { RARITY_INK } from '../../src/components/cupRun/types';
import { TIER_INK, TIER_NAME, TIER_ORDER as HONOUR_TIERS } from '../../src/components/challengeUi';

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

// --- Source reading -------------------------------------------------------
//

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

  // --- The rarity word on a boost card, which is the THIRD of that family ----
  // `gold-ink` was added with the boost offer's odds (roadmap 05 + 65). The offer prints
  // its rarity in the sticker tier accents, and those are surface colours: at 9px bold on
  // the panel the top tier's gold measured 2.57 and the amber 2.49, against the 4.5 a
  // label that size needs - the relaxed 3:1 is for 18.66px bold and larger. The tier RAMP
  // keeps the surface values, which is right, because a strip across a card is a surface.
  {
    const surfaces = ['ground', 'panel', 'chalk'] as const;
    const bad: string[] = [];
    for (const s of surfaces) {
      if (contrast(light['gold-ink']!, light[s]!) < AA) bad.push(`gold-ink on ${s} light`);
      if (contrast(dark['gold-ink']!, dark[s]!) < AA) bad.push(`gold-ink on ${s} dark`);
    }
    // Vacuity, and the reason the token exists at all: the tier's own gold does NOT pass
    // as text on paper. If it ever did, this token would be dead weight.
    const TIER_GOLD = '#c99a3a';
    if (contrast(TIER_GOLD, light['panel']!) >= AA) bad.push('the tier gold already passes light');
    // And on graphite it converges with the surface value, exactly as amber-ink does, so
    // the dark override is the tier gold itself.
    if (dark['gold-ink'] !== TIER_GOLD) bad.push('gold-ink should be the tier gold in dark');
    check(
      'ui: gold-ink clears AA where the sticker tier gold does not, and converges with it in dark',
      () => bad.length === 0,
      () =>
        bad.join(', ') +
        ` (tier gold on panel ${contrast(TIER_GOLD, light['panel']!).toFixed(2)} light, ` +
        `${contrast(TIER_GOLD, dark['panel']!).toFixed(2)} dark)`,
    );
  }

  // --- Gold on the green, which is a surface that does NOT flip -------------
  // `amber-on-green` exists because `amber-ink` was used here and `amber-ink` FLIPS: deep
  // amber on paper, bright amber on graphite. The champion banner and the bracket's cup
  // node are dark green under BOTH themes, so a foreground that inverts is right in one of
  // them and unreadable in the other. It measured 1.37 in the light theme, the worst figure
  // in the app, and 4.86 in the dark one, which is exactly why it survived every earlier
  // contrast pass: whoever looked was in the other theme.
  //
  // This is the third instance of that one fault (the hero's scrim, the hero's shadow, and
  // now this), so it is worth a check rather than another comment.
  {
    const bad: string[] = [];
    for (const [label, theme] of [['light', light], ['dark', dark]] as const) {
      const v = contrast(theme['amber-on-green']!, theme['pitch-dark']!);
      if (v < AA) bad.push(`amber-on-green on pitch-dark ${label} ${v.toFixed(2)}`);
    }
    // IT MUST NOT FLIP. A token redefined per theme cannot be correct on a surface that is
    // the same colour in both, and re-adding it to the dark block is the obvious "tidy-up"
    // that would put the bug straight back.
    if (light['amber-on-green'] !== dark['amber-on-green']) {
      bad.push(`amber-on-green differs by theme: ${light['amber-on-green']} vs ${dark['amber-on-green']}`);
    }
    // VACUITY, and it is the load-bearing half: both of the colours that were being used
    // here have to FAIL, or this check is passing on a claim that was never in doubt and a
    // revert to either one would go unnoticed.
    if (contrast(light['amber-ink']!, light['pitch-dark']!) >= AA) {
      bad.push('amber-ink already passed on the green, so this check proves nothing');
    }
    if (contrast(light['amber']!, light['pitch-dark']!) >= AA) {
      bad.push('the surface amber already passed on the green, so this check proves nothing');
    }
    check(
      'ui: gold on the champion green clears AA in both themes, and does not flip with the theme',
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
    // and the 13px / 700 label. Read out of the palette so the token is the source.
    const wants = [
      `background: '${light['pitch-dark']}'`,
      `border: '1px solid ${light['pitch-dark']}'`,
      'borderRadius: 5,',
      'fontSize: 13,',
      'fontWeight: 700,',
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
  //   A. A BESPOKE BUTTON: the app's button voice - the DISPLAY face in a rounded box
  //      with its own padding on both axes, at a tap size. Only a button is all of those
  //      at once. A card carries no `font-display` on the box itself, the mono badges are
  //      `font-mono` at `py-0.5`, a text link has no box, and every SELECTOR - the year
  //      pills, the filter toggles, the five segmented groups, the tabs - keeps its own
  //      look on purpose and builds its class list from an array or an interpolation.
  //
  //      THE VOICE CHANGED ONCE AND THE DETECTOR HAD TO FOLLOW. It used to key on
  //      `uppercase`, which was the loudest thing a button did until the Rubik + Inter
  //      pass took the capitals out of every label in the app. A detector keyed on a
  //      class nobody writes any anymore reports zero for ever, which is the exact vacuity
  //      this file opens by warning about - so the vertical padding carries the weight
  //      that `uppercase` used to, and the guards below pin both ends of it.
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
    /** A tap target rather than a badge: `py-0.5` and `py-px` are the mono chips, and
     *  the arbitrary form is read as pixels so `py-[3px]` cannot pass for a button. */
    const TAP_Y = /^py-(?:1|1\.5|2|2\.5|3|3\.5|4|5|6)$|^py-\[(?:[6-9]|[1-9][0-9])(?:\.\d+)?px\]$/;
    const bespokeButton = (c: string): boolean => {
      const t = parts(c);
      const j = t.join(' ');
      return (
        j.includes('font-display') &&
        j.includes('rounded') &&
        /\bpx-/.test(j) &&
        t.some((x) => TAP_Y.test(x))
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
        bespokeButton('rounded-lg border px-[22px] py-[14px] font-display font-bold') &&
        // A mono badge, a card, and a display heading with no box of its own: none is a
        // button, and each is a shape the app really writes.
        !bespokeButton('rounded-[3px] border px-1.5 py-0.5 font-mono text-[8px]') &&
        !bespokeButton('rounded-md border border-line bg-panel px-4 py-3 shadow-hard') &&
        !bespokeButton('font-display text-[15px] font-bold tracking-[-0.01em]') &&
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

  // --- The sticker tier ramp, as a band and as a word -------------------------
  //
  // The album card wears the same two marks a boost tile wears on `/career`: a 3px strip
  // across the top, and the tier named in an `-ink` token rather than in the raw accent.
  // Neither can be seen by anything behavioural - a card with no band and a card with a
  // band render equally well - and BOTH of them broke silently while being written.

  // `strip` is painted as a `background-image`, because the top rung is a foil and a
  // border takes one flat colour. A bare hex is a fine `background` SHORTHAND and is not a
  // valid image, so it computes to `none`: the two lower tiers shipped for one build with
  // no band at all, on 108 of 115 cards, and the page looked entirely normal. Every rung
  // therefore holds a gradient, the flat two being one colour twice.
  {
    const bare = STICKER_TIER_ORDER.filter((t) => !TIER_META[t].strip.startsWith('linear-gradient('));
    check(
      'ui: every sticker tier strip is a paintable background-image, flat rungs included',
      () =>
        // Vacuity twice over: the ramp really has three rungs, and the test really rejects
        // the bare hex it exists to catch - a predicate that accepted `#e4922b` would pass
        // this block happily and is the exact bug.
        STICKER_TIER_ORDER.length === 3 &&
        !'#e4922b'.startsWith('linear-gradient(') &&
        bare.length === 0,
      () => `bare (invalid as an image): ${bare.join(', ')}`,
    );
  }

  // The band lands exactly where the solid border used to: a 3px TRANSPARENT top border
  // still reserves the three pixels, and `background-origin: border-box` starts the image
  // at the top of the border box so the border does not paint over it. Drop either half
  // and the card either moves by 3px or shows a 1px sliver of the wrong colour.
  {
    const bad: string[] = [];
    for (const t of STICKER_TIER_ORDER) {
      const s = tierTopStrip(t);
      if (s.borderTopWidth !== '3px') bad.push(`${t}: reserves ${s.borderTopWidth}, not 3px`);
      if (s.borderTopColor !== 'transparent') bad.push(`${t}: top border is ${s.borderTopColor}`);
      if (s.backgroundOrigin !== 'border-box') bad.push(`${t}: origin ${s.backgroundOrigin}`);
      if (s.backgroundSize !== '100% 3px') bad.push(`${t}: size ${s.backgroundSize}`);
      if (s.backgroundImage !== TIER_META[t].strip) bad.push(`${t}: image is not the tier strip`);
    }
    check(
      'ui: the sticker card strip is 3px of transparent border filled from the border box',
      () => STICKER_TIER_ORDER.length === 3 && bad.length === 0,
      () => bad.join('; '),
    );
  }

  // THE THREE SHELVES NAME A RUNG IN THE SAME THREE INK TOKENS: the album's sticker
  // tiers, the boost library's rarities, and the honours ledger's award tiers. They are
  // three maps keyed on three different types, and CLAUDE.md's standing rule is that they
  // have to be one object or a player learns what gold means three times - so the
  // agreement is asserted rather than assumed. `-ink` and never the accent: the accent is
  // a surface value and misses AA as a small label, which is why the tokens exist.
  //
  // All three are read TOP RUNG FIRST, which is the one thing to get right when adding a
  // fourth: `STICKER_TIER_ORDER` runs Monumental down and `TIER_ORDER` in `challengeUi`
  // runs Minor up, so the honours list is reversed here rather than in the component.
  {
    const album = STICKER_TIER_ORDER.map((t) => TIER_META[t].ink);
    const career = [RARITY_INK.legendary, RARITY_INK.rare, RARITY_INK.common];
    const honours = [...HONOUR_TIERS].reverse().map((t) => TIER_INK[t]);
    const notInk = album.filter((c) => !c.endsWith('-ink'));
    check(
      'ui: the album, the boost library and the honours ledger name a rung in one ink token',
      () =>
        // Vacuity: three distinct classes, all of them `-ink`. Without the distinctness a
        // map that had collapsed to one colour would satisfy the comparison.
        album.length === 3 &&
        new Set(album).size === 3 &&
        notInk.length === 0 &&
        album.join(',') === career.join(',') &&
        album.join(',') === honours.join(','),
      () =>
        `album ${album.join('/')} vs career ${career.join('/')} vs honours ${honours.join('/')}` +
        (notInk.length ? ` (not ink: ${notInk.join(', ')})` : ''),
    );
  }

  // THE HONOURS TIERS ARE NOT NAMED AFTER THE COLOURS THEY ARE DRAWN IN. The keys are
  // `bronze` / `silver` / `gold` and cannot move (a tier is written into all 126 catalogue
  // entries), but the label a player reads is the only thing on screen - and `Bronze`
  // rendered in the ramp's green was true of neither the metal nor the difficulty. Nothing
  // behavioural can see a label, so this reads the map: no rung may be named after a
  // metal, and the three names must be distinct.
  {
    const METALS = ['bronze', 'silver', 'gold', 'platinum', 'copper'];
    const names = HONOUR_TIERS.map((t) => TIER_NAME[t]);
    const metallic = names.filter((n) => METALS.includes(n.toLowerCase()));
    check(
      'ui: an honours tier is named for what it is, not for the colour it is drawn in',
      () =>
        // Vacuity twice: the ramp really has three rungs with three distinct names, and
        // the scan really rejects a metal - a test that let `Bronze` through would pass
        // this block happily and is the exact thing it exists to catch.
        names.length === 3 &&
        new Set(names).size === 3 &&
        METALS.includes('bronze') &&
        metallic.length === 0,
      () => `names ${names.join('/')}${metallic.length ? ` (metallic: ${metallic.join(', ')})` : ''}`,
    );
  }

  // --- The scroll lock, and the 15px it must not cost -------------------------
  //
  // A modal locks the page with `overflow: hidden` on the document element, and that on
  // its own REMOVES the scrollbar: the layout viewport widens by the bar and the whole
  // page behind the backdrop jumps sideways. It was reported from the album's trade
  // modal and it was every modal in the app. Nothing behavioural in this harness can see
  // it (there is no layout here), and nothing in the BROWSER shouts either - every frame
  // is a correct rendering of a page that is genuinely 15px wider - so the two things
  // that keep it fixed are read out of the source.

  // ONE LOCK, SHARED. The bug existed twice because the effect was written out twice, in
  // the same words, in two components; the next modal copies whichever it finds first.
  {
    const HOOK = 'src/hooks/useScrollLock.ts';
    const files = readdirSync('src', { recursive: true, encoding: 'utf8' })
      .map((f) => `src/${String(f).split('\\').join('/')}`)
      .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));
    const bespoke: string[] = [];
    let callers = 0;
    for (const f of files) {
      const src = codeOnly(readFileSync(f, 'utf8'));
      if (f !== HOOK && /\.style\.overflow\s*=/.test(src)) bespoke.push(f);
      if (f !== HOOK && src.includes('useScrollLock(')) callers += 1;
    }
    check(
      'ui: every modal locks the page through the one shared hook',
      () =>
        // Vacuity: the sweep really read the tree and really found the callers, so a
        // clean result cannot mean the scan matched nothing at all.
        files.length > 40 &&
        callers >= 2 &&
        bespoke.length === 0,
      () => `bespoke locks: ${bespoke.join(', ')} (callers found: ${callers})`,
    );
  }

  // THE GUTTER IS MEASURED BEFORE IT IS HIDDEN, which is the whole of the fix and is one
  // line-swap away from being silently useless: after `overflow: hidden` the bar is gone
  // and `innerWidth - clientWidth` reads 0, so the padding is 0, so the page shifts
  // exactly as it did before and every other assertion here still passes.
  {
    const src = readFileSync('src/hooks/useScrollLock.ts', 'utf8');
    const measure = src.indexOf('window.innerWidth - el.clientWidth');
    const hide = src.indexOf("el.style.overflow = 'hidden'");
    // The measured gutter must actually be WRITTEN to the padding. A bare
    // `includes('paddingRight')` is not enough and was the first version of this
    // line: `const prevPadding = el.style.paddingRight` carries the same word, so
    // deleting the write left the check green while the page shifted again.
    const pays = /paddingRight\s*=\s*`[^`]*\$\{gutter\}/.test(src);
    // `scrollbar-gutter: stable` is the obvious one-line answer and does NOT work: it
    // reserves the gutter for `overflow: scroll` and `auto` only, never for `hidden`.
    // Measured in Chrome, which fully supports it, and the page still moved the full 15px.
    const gutterProp = src.includes('scrollbarGutter =') || src.includes("'scrollbar-gutter'");
    check(
      'ui: the scroll lock measures the scrollbar before hiding it, and pays it back',
      () =>
        measure >= 0 && hide >= 0 && measure < hide && pays && !gutterProp,
      () =>
        measure < 0 || hide < 0
          ? 'the lock no longer measures the gutter or no longer hides the overflow'
          : measure > hide
            ? 'measured AFTER hiding, which always reads 0'
            : gutterProp
              ? 'scrollbar-gutter does not apply to overflow:hidden'
              : 'the measurement is not paid back as padding',
    );
  }
}
