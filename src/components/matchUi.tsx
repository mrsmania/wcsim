import type { ReactNode, Ref } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import type { MatchSpeed } from '../domain/clock';
import type { PenKick } from '../domain/match';
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
 * THE BUTTONS. Four tones, three sizes, one function.
 *
 * Reworked 2026-08-27, after the observation that the app had "about ten different looks of
 * buttons". It did: `PRIMARY_BTN` and `SECONDARY_BTN` here, plus a bespoke string in each of
 * `CompletePanel`, `SetupPanel`, `ModeSelect`, `SquadBrowser`, `UnreachableScreen`,
 * `SettingsModal`, `AlbumScreen` and `BudgetMarket`, and four different paddings appended to
 * the outline base. Every one of them was a near-copy differing by a pixel of padding or a
 * point of type, which is the shape of a token nobody could find.
 *
 * NOTHING NEW WAS INVENTED. The turf-flat identity is unchanged: `rounded-[5px]`, a 1px
 * border, the display face in extrabold uppercase, green for the action you came to take and
 * an ink outline for the one beside it. What is new is that there are now four TONES and
 * three SIZES and no fourth axis, so the answer to "which button is this" is a pair rather
 * than a fresh class string.
 *
 * WHY A FUNCTION AND NOT TWELVE CONSTANTS: twelve names is the problem restated. Every class
 * it returns is a literal in this file, so Tailwind still sees the whole set.
 *
 * THE TONES CARRY MEASURED CONTRAST, which is the other half of the rework - the primary
 * button did not meet AA and had not since it was written:
 *
 *   * `primary` fills with **pitch-dark**, not pitch. White on pitch measures **4.00** in
 *     light and **3.25** on graphite against the 4.5 a 13px bold label needs; white on
 *     pitch-dark is 8.08 and 10.34. The hover lifts to `pitch-hover`, which is the one step
 *     between the two greens that still carries white (5.62) - the bright `pitch` does not,
 *     so hovering would have dropped the button back below AA. This is the single biggest
 *     thing the audit found.
 *   * `secondary` is ink on panel: 16.66 and 14.36, and never in doubt.
 *   * `quiet` is muted on panel, 5.70 and 7.06. It exists because the app already had this
 *     third emphasis - Back, Refresh, Auto-fill, the masthead's two - expressed six
 *     different ways.
 *   * `danger` fills with **loss-deep**. Plain `loss` carries white at 4.80 in light but
 *     only **3.14** on graphite, so the destructive confirm failed AA in the dark theme.
 *
 * Hovers reach for `pitch-ink` rather than `pitch` for the same reason: green as TEXT is
 * 4.00 on white. See the token's own note in `index.css`.
 */
export const BTN_TONES = ['primary', 'secondary', 'quiet', 'danger'] as const;
export type BtnTone = (typeof BTN_TONES)[number];

/** `lg` is a page action, `md` one inside a card, `sm` one in a row or a toolbar. Three,
 *  because the twelve strings this replaced used exactly three scales between them. */
export const BTN_SIZES = ['lg', 'md', 'sm'] as const;
export type BtnSize = (typeof BTN_SIZES)[number];

const BTN_SHAPE =
  'inline-flex items-center justify-center gap-2 rounded-[5px] border font-display font-extrabold uppercase tracking-[0.04em] transition disabled:cursor-not-allowed disabled:opacity-50';

const BTN_SIZE: Record<BtnSize, string> = {
  lg: 'px-5 py-3 text-[13px]',
  md: 'px-4 py-2.5 text-[12px]',
  sm: 'px-2.5 py-1.5 text-[11px]',
};

const BTN_TONE: Record<BtnTone, string> = {
  primary: 'border-pitch-dark bg-pitch-dark text-white hover:bg-pitch-hover active:scale-[0.99]',
  secondary: 'border-ink bg-panel text-ink hover:border-pitch hover:text-pitch-ink',
  quiet: 'border-line bg-panel text-muted hover:border-pitch hover:text-pitch-ink',
  danger: 'border-loss-deep bg-loss-deep text-white hover:opacity-90 active:scale-[0.99]',
};

/** One button's classes. See the note above for what the tones mean and what they measure. */
export function btn(tone: BtnTone = 'primary', size: BtnSize = 'lg'): string {
  return `${BTN_SHAPE} ${BTN_SIZE[size]} ${BTN_TONE[tone]}`;
}

/** The two names most of the app already uses, kept so a call site that wants the ordinary
 *  page action does not have to say so twice. */
export const PRIMARY_BTN = btn('primary');
export const SECONDARY_BTN = btn('secondary');
/** The destructive confirm, at in-card size because that is where a confirm always is. */
export const DANGER_BTN = btn('danger', 'md');

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
export const MONO_CAP = 'font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted';

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
      <div className={`h-full ${fill}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

/** The pitch gradient fill, used by the two honours meters. */
export const METER_GRADIENT = 'bg-gradient-to-r from-pitch to-pitch-dark';

/** A chip's two states: filled ink when it is the chosen one, outlined otherwise. The
 *  exact pair was written out at three sites (the challenge ledger's filters, and both
 *  of the build page's pickers). A caller with a third state - the Ascension picker's
 *  locked tier - keeps that at the call site. */
export const CHIP_ON = 'border-ink bg-ink text-ground';
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
            <li key={i} className="grid grid-cols-[1fr_22px_1fr] items-center gap-2.5 text-[13px]">
              <span className="flex min-w-0 items-center justify-end gap-2 font-semibold">
                {h ? (
                  <>
                    <span className="truncate text-ink">{h.taker}</span>
                    <PenPip scored={h.scored} />
                  </>
                ) : null}
              </span>
              <span className="text-center font-mono text-[10px] text-muted">{i + 1}</span>
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

/** A labelled segmented control (the turf-flat `.ctl`): a mono caption followed by
 *  inline option buttons, the active one filled ink. Stacks full-width on mobile. */
export function SegControl<T extends string>({
  label,
  value,
  options,
  onSelect,
  ariaLabel,
}: {
  label: string;
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
      <span className="shrink-0 pl-[11px] pr-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <div className="flex max-sm:flex-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onSelect(o.value)}
            aria-pressed={o.value === value}
            className={`whitespace-nowrap border-l border-line px-[11px] py-[9px] text-xs font-semibold transition max-sm:flex-1 ${
              o.value === value ? 'bg-ink text-ground' : 'bg-panel text-muted hover:text-ink'
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
      label="Speed"
      value={speed}
      onSelect={onSetSpeed}
      options={SPEED_OPTIONS}
    />
  );
}

/** A small breadcrumb / back link, used above a stage header to jump between the
 *  group and knockout screens, and as the top-of-page "back" link on the album /
 *  Cup Run screens. `dir` picks which side the arrow sits and animates on hover;
 *  pass either an `onClick` (renders a button) or a router `to` (renders a Link).
 *  `className` sets the margin (defaults to `mb-1.5` for the stage-header case). */
export function StageCrumb({
  dir,
  label,
  onClick,
  to,
  className = 'mb-1.5',
}: {
  dir: 'back' | 'fwd';
  label: string;
  onClick?: () => void;
  to?: string;
  className?: string;
}) {
  const cls = `group inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted transition hover:text-pitch-ink ${className}`;
  const inner = (
    <>
      {dir === 'back' && (
        <ArrowLeft size={13} strokeWidth={2.5} className="transition group-hover:-translate-x-0.5" />
      )}
      {label}
      {dir === 'fwd' && (
        <ArrowRight size={13} strokeWidth={2.5} className="transition group-hover:translate-x-0.5" />
      )}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/** A stage header (eyebrow + display heading), optionally carrying a breadcrumb
 *  link above the eyebrow and the playback controls on the right. */
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
  crumb?: ReactNode;
}) {
  return (
    <div ref={headingRef} className="mb-[18px] mt-[30px] flex flex-wrap items-end justify-between gap-4">
      <div>
        {crumb}
        <div className={PAGE_EYEBROW}>{eyebrow}</div>
        <h2 className="mt-0.5 font-display text-[30px] font-extrabold leading-none tracking-[-0.02em] max-sm:text-2xl">
          {title}
        </h2>
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
          <span className="shrink-0 font-mono text-[11px] font-medium text-muted">{oppYear}</span>
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
        <p className={`relative mt-1 text-[12.5px] ${champion ? 'text-white/80' : 'text-muted'}`}>
          {body}
        </p>
      )}
    </div>
  );
}
