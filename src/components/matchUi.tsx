import type { ReactNode, Ref } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import type { MatchSpeed } from '../domain/clock';
import type { PenKick, Strength } from '../domain/match';
import { ratingBand } from '../domain/pvpView';
import type { ResultKind } from './matchView';
import { FEATURES } from '../config';
import Flag from './Flag';

/** A small chip showing a team's rating, sitting next to the team. Hidden on
 *  mobile (there is no hover there and space is tight) and toggled globally by
 *  FEATURES.teamRatings. */
export function RatingChip({ value, className = '' }: { value: number; className?: string }) {
    if (!FEATURES.teamRatings) return null;
    return (
        <span
            className={`hidden shrink-0 items-center rounded-full bg-chalk px-1.5 py-px font-mono text-[9px] font-semibold leading-none text-muted sm:inline-flex ${className}`}
        >
            {value}
        </span>
    );
}

/** Presentational helpers shared by the group-stage and knockout screens. Kept
 *  framework-light: every piece is a pure function of its props. */

/**
 * THE BUTTONS. THREE DESIGNS, two scales, one function.
 *
 * Reworked twice. The first pass (2026-08-27) followed the observation that the app had
 * "about ten different looks of buttons" and folded them into `btn(tone, size)` - four
 * tones by three sizes. The second (2026-09-02) followed the same observation made again,
 * and it was still true: the helper had grown to twelve renderings, and eight more bespoke
 * buttons had been written OUTSIDE it since - the front page's amber and white hero CTAs,
 * the round pills in the settings sheet, the soft-shadowed re-roll buttons with their own
 * 12px radius, the album's accent-bordered Trade, the two masthead controls, and two
 * destructive triggers that were bare text in two different sizes.
 *
 * So the count is now a HARD CEILING rather than a tidier drawer, and it is three:
 *
 *   * `primary` - THE MAIN one. The action you came to the screen to take.
 *   * `secondary` - THE SECOND one. The action beside it, and everything quieter: Back,
 *     Refresh, Cancel, Auto-fill, Clear, the masthead's two.
 *   * `danger` - THE THIRD one. Destructive, and the only reason it survives the cut: the
 *     three it guards (delete the account, reset the album, discard the XI in progress)
 *     cannot be told apart from an ordinary button by their wording alone, and a fourth
 *     emphasis level is worth less than that.
 *
 * WHAT WENT: `quiet` (line-bordered, muted label), which was the app's third emphasis and
 * is now `secondary`. Every one of its eleven call sites was a toolbar or a row - which is
 * what the compact SCALE is for, so the size was already carrying the distinction and the
 * colour was saying it twice.
 *
 * A SCALE IS NOT A DESIGN, and neither is a SURFACE. Both are the same three designs
 * rendered where they have to go:
 *
 *   * `normal` / `compact` - a page or card action, and one inside a row or a toolbar.
 *     Same colours, same shape, same face; padding and type scale only. The old middle
 *     size is gone: its ten call sites were all card actions, so they are `normal`.
 *   * `light` / `dark` - the app's paper, and the ONE dark surface it has (the front
 *     page's turf hero). On the turf the primary's `pitch-dark` fill measures about 1.1
 *     against the scrimmed grass behind it, so the button would vanish; it inverts to a
 *     white fill with the dark ink label, which is the strongest thing available on a
 *     green ground and is exactly what that CTA already was. `danger` needs no dark
 *     rendering and deliberately has none of its own - an opaque red reads on any ground.
 *
 * WHY A FUNCTION AND NOT A PILE OF CONSTANTS: a pile of names is the problem restated.
 * Every class it returns is a literal in this file, so Tailwind still sees the whole set.
 *
 * THE TONES CARRY MEASURED CONTRAST, and `npm run checks` computes all of it from the real
 * tokens in both themes, resting and hovered, and fails below 4.5:
 *
 *   * `primary` fills with **pitch-dark**, not pitch. White on pitch measures **4.00** in
 *     light and **3.25** on graphite against the 4.5 a 13px bold label needs; white on
 *     pitch-dark is 8.08 and 10.34. The hover lifts to `pitch-hover`, the one step between
 *     the two greens that still carries white (5.62) - the bright `pitch` does not, so
 *     hovering would have dropped the button back below AA.
 *   * `secondary` is ink on panel: 16.66 and 14.36, and never in doubt.
 *   * `danger` fills with **loss-deep**. Plain `loss` carries white at 4.80 in light but
 *     only **3.14** on graphite, so the destructive confirm failed AA in the dark theme.
 *
 * Hovers reach for `pitch-ink` rather than `pitch` for the same reason: green as TEXT is
 * 4.00 on white. See the token's own note in `index.css`.
 */
export const BTN_TONES = ['primary', 'secondary', 'danger'] as const;
export type BtnTone = (typeof BTN_TONES)[number];

/** `normal` is a page or card action, `compact` one inside a row or a toolbar. Two,
 *  because those are the only two jobs the twelve strings this replaced were doing. */
export const BTN_SIZES = ['normal', 'compact'] as const;
export type BtnSize = (typeof BTN_SIZES)[number];

/** The app's paper, and the front page's turf hero. See the note above: a surface is not
 *  a design, it is the same design where it has to be legible. */
export const BTN_SURFACES = ['light', 'dark'] as const;
export type BtnSurface = (typeof BTN_SURFACES)[number];

const BTN_SHAPE =
    'inline-flex items-center justify-center gap-2 rounded-[5px] border font-display font-extrabold uppercase tracking-[0.04em] transition disabled:cursor-not-allowed disabled:opacity-50';

const BTN_SIZE: Record<BtnSize, string> = {
    normal: 'px-5 py-3 text-[13px]',
    compact: 'px-2.5 py-1.5 text-[11px]',
};

// The literal `text-[#13211a]` on the dark primary is the same deliberate choice
// `ModeSelect`'s hero has always made: a white fill is light in BOTH themes, so the label
// needs the dark ink in both, and `text-ink` is near-white in dark and would vanish.
const BTN_TONE: Record<BtnSurface, Record<BtnTone, string>> = {
    light: {
        primary:
            'border-pitch-dark bg-pitch-dark text-white hover:bg-pitch-hover active:scale-[0.99]',
        secondary: 'border-ink bg-panel text-ink hover:border-pitch hover:text-pitch-ink',
        danger: 'border-loss-deep bg-loss-deep text-white hover:opacity-90 active:scale-[0.99]',
    },
    dark: {
        primary: 'border-white bg-white text-[#13211a] hover:bg-white/90 active:scale-[0.99]',
        secondary:
            'border-white/40 bg-white/[0.08] text-white hover:border-white/70 hover:bg-white/[0.16]',
        danger: 'border-loss-deep bg-loss-deep text-white hover:opacity-90 active:scale-[0.99]',
    },
};

/** One button's classes. See the note above for what the three tones mean, what they
 *  measure, and why a scale and a surface are not a fourth and fifth design. */
export function btn(
    tone: BtnTone = 'primary',
    size: BtnSize = 'normal',
    surface: BtnSurface = 'light',
): string {
    return `${BTN_SHAPE} ${BTN_SIZE[size]} ${BTN_TONE[surface][tone]}`;
}

/** The three designs by name, at page size, kept so the ordinary call site does not have
 *  to say so twice. There is nothing else: a fourth name here would be a fourth look. */
export const PRIMARY_BTN = btn('primary');
export const SECONDARY_BTN = btn('secondary');
export const DANGER_BTN = btn('danger');

/** The turf-flat card: 6px corners, a 1px rule and the signature hard offset shadow.
 *  Class strings rather than a `<Card>` component, deliberately: the call sites need
 *  their own padding, and a third of them also need `overflow-hidden`, `self-start`,
 *  a grid area, a ref or a hover state, which a wrapper would have to re-expose one
 *  prop at a time. Padding stays at the call site for the same reason.
 *
 *  CARD_SM swaps in the 4px shadow, for cards stacked many-to-a-page (the cabinet's
 *  sections); CARD_FLAT is the same card with no shadow at all, which is what the two
 *  modal sheets and the panels nested inside another card use. */
export const CARD_FLAT = 'rounded-md border border-line bg-panel';
export const CARD = `${CARD_FLAT} shadow-hard`;
export const CARD_SM = `${CARD_FLAT} shadow-hard-sm`;

/** Shared caption class strings (the turf-flat mono labels). Each is the exact
 *  string that repeats across screens; reuse rather than re-typing the utilities. */
/** Muted mono caption used inside cards. */
export const MONO_CAP =
    'font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted';

/** The green mono eyebrow that sits above a page's display title. Wider tracking and a
 *  point larger than MONO_CAP, because it labels the whole screen rather than a card.
 *  StageHeader renders it; the handful of screens that lay out their own header (the
 *  front page, the squad browser, the album, the challenge ledger, the group draw) use
 *  this directly. */
export const PAGE_EYEBROW =
    'font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-pitch-ink';

/** A horizontal progress meter: a chalk track with a 1px rule and a filled bar.
 *  Six copies of this existed - album completion, honours completion, the career's
 *  XP bar, the challenge counter, the cabinet's four bars and the market's budget -
 *  differing only in the four things that are props here.
 *
 *  `pct` is computed by the caller rather than from a have/need pair, because the
 *  callers do not agree on rounding and this atom is not the place to change what any
 *  of them renders. It IS clamped to 0-100, which is what the budget bar hand-rolled
 *  (a market can be overspent) and which the others could never exceed anyway.
 *
 *  `rounded-full` for every height. The tree had two spellings of that one fact, the
 *  other being an arbitrary 20px radius, and they render identically at 5-9px tall:
 *  CSS scales a radius pair down to fit the shorter side, so both land on exactly
 *  height/2. (Written out rather than quoted as a class, because Tailwind scans
 *  comments as plain text and a quoted utility would keep the dead one in the bundle.) */
export function Meter({
    pct,
    height = 7,
    fill = 'bg-pitch',
    track = 'border-line',
    className = '',
}: {
    pct: number;
    /** Track height in px. */
    height?: number;
    /** The filled bar's background utilities (a flat colour or the pitch gradient). */
    fill?: string;
    /** The track's border utility - `border-hair` where the surrounding rules are hairlines. */
    track?: string;
    className?: string;
}) {
    return (
        <div
            className={`overflow-hidden rounded-full border bg-chalk ${track} ${className}`}
            style={{ height }}
        >
            <div
                className={`h-full ${fill}`}
                style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
            />
        </div>
    );
}

/** The three-cell ratings strip: Ovr (the deep-green hero cell), Att and Def.
 *
 *  The groups are the SIMULATOR's - Att is MID+FWD, Def is GK+DEF - which is why there
 *  are three cells and no Mid one (audit decision D7). Two screens draw it: the build
 *  page's readout, over the XI being built, and the versus result, over the two XIs that
 *  played the tie.
 *
 *  It takes the three FIGURES rather than an XI, because those two callers measure them
 *  differently on purpose and each has to agree with the match it describes - see
 *  `xiStrengthFrom` in domain/pvpView for the one that describes a room's.
 *
 *  With `ratings` false a cell prints a WORD instead of its figure (P5), so a
 *  hidden-ratings room keeps the same shape rather than reading as a broken one. */
export function RatingStrip({
    strength,
    ratings = true,
}: {
    strength: Strength;
    ratings?: boolean;
}) {
    // Undefined keeps the figure; a word replaces it. One helper so the three cells
    // cannot disagree about which room they are in.
    const band = (v: number) => (ratings ? undefined : ratingBand(v));
    return (
        <div className="grid grid-cols-3 overflow-hidden rounded-md border border-line shadow-hard">
            <StripCell label="Ovr" value={strength.overall} band={band(strength.overall)} ovr />
            <StripCell label="Att" value={strength.attack} band={band(strength.attack)} />
            <StripCell label="Def" value={strength.defense} band={band(strength.defense)} />
        </div>
    );
}

/** One cell of the strip above. The Ovr cell is the deep-green hero.
 *
 *  With `band` it prints a word rather than the figure, at a smaller size because
 *  "Elite" at 30px does not fit the cell the way "86" does. */
function StripCell({
    label,
    value,
    band,
    ovr = false,
}: {
    label: string;
    value: number;
    band?: string;
    ovr?: boolean;
}) {
    return (
        <div
            className={`border-r border-line px-3 py-3.5 last:border-r-0 ${ovr ? 'bg-pitch-dark' : 'bg-panel'}`}
        >
            <div
                className={`font-mono text-[10px] font-semibold uppercase tracking-[0.16em] ${ovr ? 'text-white/70' : 'text-muted'}`}
            >
                {label}
            </div>
            <div
                className={`mt-1.5 font-mono font-bold leading-none ${band ? 'text-xl' : 'text-3xl'} ${value ? (ovr ? 'text-white' : 'text-ink') : 'text-line'}`}
            >
                {band ?? (value || '–')}
            </div>
        </div>
    );
}

/** The pitch gradient fill, used by the two honours meters. */
export const METER_GRADIENT = 'bg-gradient-to-r from-pitch to-pitch-dark';

/** A chip's two states: filled GREEN when it is the chosen one, outlined otherwise. The
 *  exact pair was written out at three sites (the challenge ledger's filters, and both
 *  of the build page's pickers). A caller with a third state - the Ascension picker's
 *  locked tier - keeps that at the call site.
 *
 *  THE FILL WAS `ink` UNTIL 2026-09-02, and the change is about the app having ONE answer
 *  to "this is the one you chose". Half the app's groups filled the chosen cell near-black
 *  and half filled it green - the settings sheet and the challenge filters against the
 *  honours sub-tabs, the build page's style row and the squad browser's years - so the
 *  same question had two colours on the same screen at /records. Green is the one that
 *  won: it is the identity, and it is already what the active tab, the champion node and
 *  the trophy shelf use. Do not reintroduce the near-black for a "different kind" of
 *  group; that is how there came to be two. */
export const CHIP_ON = 'border-pitch-dark bg-pitch-dark text-white';
export const CHIP_OFF = 'border-line bg-panel text-ink hover:border-pitch hover:text-pitch-ink';

/** A card's footer disclosure: a full-width chalk strip carrying a mono label and a
 *  chevron, which opens a match's goal feed and a group's full results. Written out at
 *  both sites before; `className` carries the one real difference between them, a pixel
 *  of vertical padding, rather than quietly levelling it.
 *
 *  `type="button"` and `aria-expanded` come with it - the standings copy had neither. */
export function CardDisclosure({
    label,
    open,
    onToggle,
    className = 'py-[9px]',
}: {
    label: string;
    open: boolean;
    onToggle: () => void;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className={`flex w-full items-center justify-center gap-1.5 border-t border-line bg-chalk px-4 ${className} ${MONO_CAP} transition hover:text-pitch-ink`}
        >
            {label}
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
    );
}

/** What surviving the group is called. Two surfaces say it - the live standings footer
 *  and a run's group review - and each carried its own copy of both words, which is two
 *  places for one wording to drift. The surrounding sentence stays per site: the footer
 *  is a flat mono strip and the review a display line that colours the outcome. */
export const GROUP_OUTCOME = {
    advanced: 'through to the knockouts',
    out: 'eliminated',
} as const;

export const ordinal = (n: number) =>
    n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;

/** A scored/missed pip (green check / red cross) for one penalty. */
function PenPip({ scored }: { scored: boolean }) {
    return (
        <span
            className={`grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full ${
                scored ? 'bg-pitch' : 'bg-loss'
            }`}
        >
            {scored ? (
                <Check size={10} strokeWidth={3.5} className="text-white" />
            ) : (
                <X size={10} strokeWidth={3.5} className="text-white" />
            )}
        </span>
    );
}

/** Penalty shootout sheet (the turf-flat `.shoot`): every taker listed one by one,
 *  Your XI on the left versus the opponent on the right. Kicks alternate home/away
 *  per round, so pairing them by index gives a head-to-head row per round. */
export function ShootoutFeed({ kicks, shown }: { kicks: PenKick[]; shown: number }) {
    const revealed = kicks.slice(0, shown);
    const homeKicks = revealed.filter((k) => k.side === 'home');
    const awayKicks = revealed.filter((k) => k.side === 'away');
    const homeScore = homeKicks.filter((k) => k.scored).length;
    const awayScore = awayKicks.filter((k) => k.scored).length;
    const rounds = Math.max(homeKicks.length, awayKicks.length);

    return (
        <div className="mt-3 border-t border-line pt-3.5">
            <div className={`mb-3 text-center ${MONO_CAP}`}>
                Penalty shootout &middot;{' '}
                <b className="text-ink">
                    {homeScore}–{awayScore}
                </b>
            </div>
            <ul className="flex flex-col gap-2">
                {Array.from({ length: rounds }, (_, i) => {
                    const h = homeKicks[i];
                    const a = awayKicks[i];
                    return (
                        <li
                            key={i}
                            className="grid grid-cols-[1fr_22px_1fr] items-center gap-2.5 text-[13px]"
                        >
                            <span className="flex min-w-0 items-center justify-end gap-2 font-semibold">
                                {h ? (
                                    <>
                                        <span className="truncate text-ink">{h.taker}</span>
                                        <PenPip scored={h.scored} />
                                    </>
                                ) : null}
                            </span>
                            <span className="text-center font-mono text-[10px] text-muted">
                                {i + 1}
                            </span>
                            <span className="flex min-w-0 items-center justify-start gap-2 font-semibold">
                                {a ? (
                                    <>
                                        <PenPip scored={a.scored} />
                                        <span className="truncate text-ink">{a.taker}</span>
                                    </>
                                ) : null}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/** A segmented control (the turf-flat `.ctl`): inline option buttons, the active one
 *  filled ink. Stacks full-width on mobile.
 *
 *  IT USED TO CARRY A MONO CAPTION INSIDE ITSELF, on the left of the first option -
 *  "LEVEL" before Casual / Normal / Hard, "SPEED" before Slow / Normal / Fast - and it
 *  was the only control in the app shaped that way (removed 2026-09-02, reported as
 *  exactly that). In the settings sheet it restated the heading directly above it, and
 *  next to the match reveal three words reading Slow / Normal / Fast do not need telling
 *  what they are. `ariaLabel` is what names the group now, which is where a name belongs
 *  for anybody who cannot see the heading. */
export function SegControl<T extends string>({
    value,
    options,
    onSelect,
    ariaLabel,
}: {
    value: T;
    options: { value: T; label: string }[];
    onSelect: (v: T) => void;
    ariaLabel: string;
}) {
    return (
        <div
            role="group"
            aria-label={ariaLabel}
            className="flex items-center overflow-hidden rounded-[5px] border border-line bg-panel max-sm:w-full"
        >
            <div className="flex max-sm:flex-1">
                {options.map((o) => (
                    <button
                        key={o.value}
                        onClick={() => onSelect(o.value)}
                        aria-pressed={o.value === value}
                        className={`whitespace-nowrap border-l border-line px-[11px] py-[9px] text-xs font-semibold transition first:border-l-0 max-sm:flex-1 ${
                            o.value === value
                                ? 'bg-pitch-dark text-white'
                                : 'bg-panel text-muted hover:text-ink'
                        }`}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

/** The slow / normal / fast match-speed options, shared by every speed picker. */
const SPEED_OPTIONS: { value: MatchSpeed; label: string }[] = [
    { value: 'slow', label: 'Slow' },
    { value: 'normal', label: 'Normal' },
    { value: 'fast', label: 'Fast' },
];

/** The match-speed segmented control on its own (used where there is no play mode
 *  to pick, e.g. the Cup Run). */
export function SpeedControl({
    speed,
    onSetSpeed,
}: {
    speed: MatchSpeed;
    onSetSpeed: (s: MatchSpeed) => void;
}) {
    return (
        <SegControl
            ariaLabel="Match speed"
            value={speed}
            onSelect={onSetSpeed}
            options={SPEED_OPTIONS}
        />
    );
}

/** A small breadcrumb / back link: the top-of-page "back" link on the Cup Run and
 *  versus screens, and the way out of a round review. `dir` picks which side the arrow
 *  sits and animates on hover; pass either an `onClick` (renders a button) or a router
 *  `to` (renders a Link).
 *
 *  `className` IS THE ONLY MARGIN NOW, and it was not before: the base string carried a
 *  hardcoded `mb-3` as well, and Tailwind emits `mb-1.5` BEFORE `mb-3` in the stylesheet,
 *  so the default lost to it and the knob did nothing - every crumb in the app was spaced
 *  the same whatever it asked for. It is a real knob now, which is what lets a crumb the
 *  stage header carries sit tight under the page title (a top margin and no bottom one)
 *  while a standalone one keeps the `mb-3` it has always had. */
export type StageCrumbProps = {
    dir: 'back' | 'fwd';
    label: string;
    onClick?: () => void;
    to?: string;
    /** Inert, but still in its place - the treatment the tabs get while the navigation
     *  is busy (`nav/liveMatch.ts`), and here for the same reason: in a versus room a
     *  crumb out of the page would spend a pick clock somebody else is waiting on. It
     *  stays visible and dimmed rather than disappearing, because a room's windows open
     *  and close eleven times in a draft and a control that came and went with them
     *  would read as a fault. */
    disabled?: boolean;
    className?: string;
};

export function StageCrumb({
    dir,
    label,
    onClick,
    to,
    disabled,
    className = 'mb-3',
}: StageCrumbProps) {
    const cls = `group inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted transition hover:text-pitch-ink ${disabled ? 'pointer-events-none opacity-40' : ''} ${className}`;
    const inner = (
        <>
            {dir === 'back' && (
                <ArrowLeft
                    size={13}
                    strokeWidth={2.5}
                    className="transition group-hover:-translate-x-0.5"
                />
            )}
            {label}
            {dir === 'fwd' && (
                <ArrowRight
                    size={13}
                    strokeWidth={2.5}
                    className="transition group-hover:translate-x-0.5"
                />
            )}
        </>
    );
    if (to) {
        return (
            <Link
                to={to}
                className={cls}
                aria-disabled={disabled || undefined}
                tabIndex={disabled ? -1 : undefined}
            >
                {inner}
            </Link>
        );
    }
    return (
        <button type="button" onClick={onClick} disabled={disabled} className={cls}>
            {inner}
        </button>
    );
}

/** A stage header (eyebrow + display heading), optionally carrying a breadcrumb link
 *  and the playback controls on the right.
 *
 *  THE CRUMB SITS UNDER THE TITLE, not above the eyebrow (2026-09-02, asked for). Above
 *  it, the way out was the first thing on the page and the page did not say what it was
 *  until the second line; under it, the title leads and the way back reads as belonging
 *  to the screen you are on.
 *
 *  IT TAKES THE CRUMB'S PROPS RATHER THAN A RENDERED CRUMB, which is what makes that
 *  placement a fact about the header instead of an instruction every caller has to
 *  remember: the header is the only thing that knows the gap between a title and the
 *  line under it, so it is the only thing that passes a margin. Handing it a node meant
 *  four call sites each spelling one out, and four copies of a spacing are how two of
 *  them come to differ. */
export function StageHeader({
    eyebrow,
    title,
    controls,
    headingRef,
    crumb,
}: {
    eyebrow: string;
    title: string;
    controls?: ReactNode;
    headingRef?: Ref<HTMLDivElement>;
    crumb?: Omit<StageCrumbProps, 'className'>;
}) {
    return (
        <div
            ref={headingRef}
            className="mb-[18px] mt-[30px] flex flex-wrap items-end justify-between gap-4"
        >
            <div>
                <div className={PAGE_EYEBROW}>{eyebrow}</div>
                <h2 className="mt-0.5 font-display text-[30px] font-extrabold leading-none tracking-[-0.02em] max-sm:text-2xl">
                    {title}
                </h2>
                {crumb && <StageCrumb {...crumb} className="mt-2.5" />}
            </div>
            {controls}
        </div>
    );
}

/** Win / loss / draw or "live"/"up next" tag shown beside a matchday/round label. */
export function ResultTag({ kind, label }: { kind: ResultKind; label: string }) {
    if (kind === 'next') {
        return (
            <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.1em] text-amber-ink">
                {label}
            </span>
        );
    }
    const tone =
        kind === 'w'
            ? 'bg-pitch/[0.13] text-pitch-ink'
            : kind === 'l'
              ? 'bg-loss/[0.13] text-loss'
              : 'bg-chalk text-muted';
    return (
        <span
            className={`rounded-[3px] px-2 py-[3px] font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] ${tone}`}
        >
            {label}
        </span>
    );
}

/** The big fixture header for one game card (the turf-flat `.fx-top`): Your XI on
 *  the home/left side, a dark score pill in the middle, the opponent on the right.
 *  The user is always rendered as home, with the score from their perspective. */
export function FixtureHead({
    oppName,
    oppCode,
    oppYear,
    score,
    status,
    statusDim,
    userRating,
    oppRating,
    userName,
}: {
    oppName?: string;
    oppCode?: string;
    oppYear?: number;
    /** User-perspective score; omitted renders the pending "v" pill. */
    score?: { user: number; opp: number };
    status?: string;
    statusDim?: boolean;
    /** Team ratings, shown as a RatingChip on each side. */
    userRating?: number;
    oppRating?: number;
    /** A name for the left side, which is otherwise always the user's own XI. It exists for
     *  one screen: a versus room where a knocked-out player watches two OTHER people play
     *  (P24). Giving it also drops the red YOU badge, because neither side is theirs. */
    userName?: string;
}) {
    return (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-[18px] py-[14px] max-sm:gap-1.5 max-sm:px-3 max-sm:text-[13px] sm:text-[14.5px]">
            <div className="flex min-w-0 items-center justify-end gap-[9px] font-semibold text-ink max-sm:gap-1.5">
                <span className="truncate">{userName ?? 'Your XI'}</span>
                {userRating != null && <RatingChip value={userRating} />}
                {userName === undefined && <Flag isUser code="" className="h-[15px] w-[22px]" />}
            </div>
            <div className="flex flex-col items-center gap-[3px] max-sm:min-w-[58px] sm:min-w-[74px]">
                {score ? (
                    <span className="rounded-[4px] bg-ink px-3.5 py-[3px] font-mono text-xl font-bold tracking-[0.02em] text-ground">
                        {score.user}–{score.opp}
                    </span>
                ) : (
                    <span className="rounded-[4px] border border-line px-3.5 py-[3px] font-mono text-xl font-bold tracking-[0.02em] text-muted">
                        v
                    </span>
                )}
                {status && (
                    <span
                        className={`font-mono text-[8.5px] font-semibold uppercase tracking-[0.1em] ${
                            statusDim ? 'text-muted' : 'text-amber-ink'
                        }`}
                    >
                        {status}
                    </span>
                )}
            </div>
            <div className="flex min-w-0 items-center gap-[9px] font-semibold text-ink max-sm:gap-1.5">
                <Flag code={oppCode ?? ''} className="h-[15px] w-[22px]" />
                <span className="truncate">{oppName}</span>
                {oppYear && (
                    <span className="shrink-0 font-mono text-[11px] font-medium text-muted">
                        {oppYear}
                    </span>
                )}
                {oppRating != null && <RatingChip value={oppRating} />}
            </div>
        </div>
    );
}

/** The amber "live" line shown at the foot of a feed while a match plays. */
export function LiveLine({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-[7px] pt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-ink">
            <span className="h-[7px] w-[7px] rounded-full bg-amber" />
            {label}
        </div>
    );
}

/** A result banner (deep-green for champions/wins, flat white otherwise) with the tifo
 *  corner arcs. Compact by design: it is the in-run Cup Run banner.
 *
 *  It used to take `size` ('lg' | 'sm'), `onReset` and `action`. The 'lg' variant was the
 *  full end-of-run banner in the quick game, which was deleted on 2026-08-21, and every
 *  caller since has passed size="sm" with neither action - so five ternaries and two
 *  branches rendered a variant that could not be reached. `noUnusedLocals` cannot see dead
 *  props, which is why they outlived the screen that used them. */
export function Banner({
    champion,
    eyebrow,
    heading,
    body,
}: {
    champion: boolean;
    eyebrow: string;
    heading: string;
    body?: string;
}) {
    const arc = champion ? 'border-white/15' : 'border-line';
    return (
        <div
            className={`relative overflow-hidden rounded-md border p-5 text-center shadow-hard ${
                champion ? 'border-pitch-dark bg-pitch-dark text-white' : 'border-line bg-panel'
            }`}
        >
            <span
                className={`pointer-events-none absolute -bottom-10 -left-10 h-24 w-24 rounded-full border-2 ${arc}`}
            />
            <span
                className={`pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full border-2 ${arc}`}
            />
            <div
                className={`relative font-mono text-[10px] font-semibold uppercase tracking-[0.2em] ${
                    champion ? 'text-amber-ink' : 'text-loss'
                }`}
            >
                {eyebrow}
            </div>
            <h3 className="relative mt-1 font-display text-2xl font-black tracking-[-0.02em] max-sm:text-xl">
                {heading}
            </h3>
            {body && (
                <p
                    className={`relative mt-1 text-[12.5px] ${champion ? 'text-white/80' : 'text-muted'}`}
                >
                    {body}
                </p>
            )}
        </div>
    );
}
