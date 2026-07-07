import type { ReactNode, Ref } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Play, X } from 'lucide-react';
import type { MatchSpeed } from '../domain/clock';
import type { KoDecided } from '../domain/knockout';
import type { PenKick } from '../domain/match';
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

/** Primary-button visual identity only (the turf-flat `.btn.primary`): colors,
 *  border, font, hover, active. Callers that need their own layout/sizing (width,
 *  display, padding, gap, text size, disabled) append it, like SECONDARY_BTN. */
export const PRIMARY_BTN_BASE =
  'rounded-[5px] border border-pitch-dark bg-pitch font-display font-extrabold uppercase tracking-[0.04em] text-white transition hover:bg-pitch-dark active:scale-[0.99]';

/** Shared rectangular primary action button: PRIMARY_BTN_BASE plus the default
 *  inline layout + sizing most call sites want. */
export const PRIMARY_BTN =
  `inline-flex items-center justify-center gap-2 px-5 py-3 text-[13px] ${PRIMARY_BTN_BASE}`;

/** Shared outline action button (the turf-flat `.btn.secondary`). Visual identity
 *  only, so callers append their own layout/sizing (width, padding, gap, disabled). */
export const SECONDARY_BTN =
  'rounded-[5px] border border-ink bg-white font-display font-extrabold uppercase tracking-[0.04em] text-ink transition hover:border-pitch hover:text-pitch';

/** The solid-red destructive confirm button (used to confirm a start-over / reset). */
export const DANGER_BTN =
  'rounded-[5px] border border-loss bg-loss px-3 py-2 font-display text-[12px] font-extrabold uppercase tracking-[0.04em] text-white transition hover:opacity-90';

/** Shared caption class strings (the turf-flat mono labels). Each is the exact
 *  string that repeats across screens; reuse rather than re-typing the utilities. */
/** Pitch-green section eyebrow (small mono caps). */
export const EYEBROW = 'font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-pitch';
/** Card/table header row (mono caps on the ink underline). */
export const TABLE_HEAD =
  'font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted';
/** Muted mono caption used inside cards. */
export const MONO_CAP = 'font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted';

export const ordinal = (n: number) =>
  n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;

/** Final minute of a knockout game by how it was decided (regulation vs extra time). */
export const maxMinute = (decided: KoDecided) => (decided === 'reg' ? 90 : 120);

/** Delay (ms) between an idle beat and auto-playing the next matchday/round. */
export const AUTO_PLAY_DELAY_MS = 700;

/** The "Next game" call to action (shared by the group and knockout screens), a
 *  centred primary button that plays the next matchday / round on click. */
export function NextGameButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="mt-[22px] flex justify-center">
      <button onClick={onClick} className={PRIMARY_BTN}>
        <Play size={13} fill="currentColor" strokeWidth={0} />
        Next game
        <ArrowRight size={15} strokeWidth={2.5} />
      </button>
    </div>
  );
}

/** A scored/missed pip (green check / red cross) for one penalty. */
export function PenPip({ scored }: { scored: boolean }) {
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

/** The two playback selectors (mode + speed), shown in the active stage header. */
export function PlaybackControls({
  auto,
  speed,
  onSetAuto,
  onSetSpeed,
}: {
  auto: boolean;
  speed: MatchSpeed;
  onSetAuto: (a: boolean) => void;
  onSetSpeed: (s: MatchSpeed) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 max-sm:w-full">
      <SegControl
        ariaLabel="Playback mode"
        label="Mode"
        value={auto ? 'auto' : 'manual'}
        onSelect={(v) => onSetAuto(v === 'auto')}
        options={[
          { value: 'manual', label: 'Game by game' },
          { value: 'auto', label: 'Automatic' },
        ]}
      />
      <SpeedControl speed={speed} onSetSpeed={onSetSpeed} />
    </div>
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
  const cls = `group inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted transition hover:text-pitch ${className}`;
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
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-pitch">
          {eyebrow}
        </div>
        <h2 className="mt-0.5 font-display text-[30px] font-extrabold leading-none tracking-[-0.02em] max-sm:text-2xl">
          {title}
        </h2>
      </div>
      {controls}
    </div>
  );
}

/** Win / loss / draw or "live"/"up next" tag shown beside a matchday/round label. */
export function ResultTag({ kind, label }: { kind: 'w' | 'l' | 'd' | 'next'; label: string }) {
  if (kind === 'next') {
    return (
      <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.1em] text-amber">
        {label}
      </span>
    );
  }
  const tone =
    kind === 'w'
      ? 'bg-pitch/[0.13] text-pitch'
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
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-[18px] py-[14px] max-sm:gap-1.5 max-sm:px-3 max-sm:text-[13px] sm:text-[14.5px]">
      <div className="flex min-w-0 items-center justify-end gap-[9px] font-semibold text-ink max-sm:gap-1.5">
        <span className="truncate">Your XI</span>
        {userRating != null && <RatingChip value={userRating} />}
        <Flag isUser code="" className="h-[15px] w-[22px]" />
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
              statusDim ? 'text-muted' : 'text-amber'
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
    <div className="flex items-center gap-[7px] pt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-amber">
      <span className="h-[7px] w-[7px] rounded-full bg-amber" />
      {label}
    </div>
  );
}

/** A result banner (deep-green for champions/wins, flat white otherwise) with the
 *  tifo corner arcs. `size` scales it: `lg` is the full end-of-run banner in the
 *  quick game (rounded-lg, big heading, top margin), `sm` is the compact in-run
 *  Cup Run banner (rounded-md + shadow). `onReset` renders the "Draft a new XI"
 *  action; `action` slots any other node below the body (both optional, so the
 *  Cup Run's action-less banners just omit them). */
export function Banner({
  champion,
  size = 'lg',
  eyebrow,
  heading,
  body,
  onReset,
  action,
}: {
  champion: boolean;
  size?: 'lg' | 'sm';
  eyebrow: string;
  heading: string;
  body?: string;
  onReset?: () => void;
  action?: ReactNode;
}) {
  const lg = size === 'lg';
  const arc = champion ? 'border-white/15' : 'border-line';
  return (
    <div
      className={`relative overflow-hidden border text-center ${
        lg ? 'mt-[30px] rounded-lg p-8' : 'rounded-md p-5 shadow-hard'
      } ${champion ? 'border-pitch-dark bg-pitch-dark text-white' : 'border-line bg-panel'}`}
    >
      <span
        className={`pointer-events-none absolute rounded-full border-2 ${arc} ${
          lg ? '-bottom-[60px] -left-[60px] h-40 w-40' : '-bottom-10 -left-10 h-24 w-24'
        }`}
      />
      <span
        className={`pointer-events-none absolute rounded-full border-2 ${arc} ${
          lg ? '-right-[60px] -top-[60px] h-40 w-40' : '-right-10 -top-10 h-24 w-24'
        }`}
      />
      <div
        className={`relative font-mono font-semibold uppercase ${
          lg ? 'text-[11px] tracking-[0.24em]' : 'text-[10px] tracking-[0.2em]'
        } ${champion ? 'text-amber' : 'text-loss'}`}
      >
        {eyebrow}
      </div>
      <h3
        className={`relative font-display font-black tracking-[-0.02em] ${
          lg ? 'mt-2 text-[40px] leading-none max-sm:text-3xl' : 'mt-1 text-2xl max-sm:text-xl'
        }`}
      >
        {heading}
      </h3>
      {body && (
        <p
          className={`relative ${
            lg ? 'mx-auto mb-[18px] mt-3 max-w-[420px] text-sm' : 'mt-1 text-[12.5px]'
          } ${champion ? 'text-white/80' : 'text-muted'}`}
        >
          {body}
        </p>
      )}
      {onReset && (
        <button onClick={onReset} className={`relative ${PRIMARY_BTN}`}>
          Draft a new XI <ArrowRight size={16} strokeWidth={2.5} />
        </button>
      )}
      {action}
    </div>
  );
}
