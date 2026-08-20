import { Check, Plus, Trophy, User } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FEATURES } from '../config';
import type { Player } from '../data/types';
import type { AlbumState } from '../domain/album';
import { cabinetView, type CabinetView, type LadderRung, type ShelfCup } from '../domain/cabinet';
import { FINISH_LABEL, type CareerState } from '../domain/career';
import { AWARD, AWARDS_ON, FAMILIES, FAMILY_NAME } from '../domain/challenges';
import type { BadgeRow } from '../domain/badges';
import { TierPips } from './challengeUi';
import Flag from './Flag';
import { StageCrumb, StageHeader } from './matchUi';
import { SQUAD_BY_ID } from '../data/squads';

/** A cup's plinth by the tier it was won at: ONE hue getting deeper, plus the numeral.
 *  Tier is deliberately not a colour of its own - the challenge ledger settled that
 *  when 130 painted entries stopped reading (TIER_COLOR is gone), and a six-hue shelf
 *  is exactly the rainbow that rule exists to prevent. The top step needs a token
 *  rather than `bg-ink`, because ink is near-white in the dark theme, which would make
 *  the highest tier the LIGHTEST plinth and read the ramp backwards. */
const PLINTH = ['bg-chalk', 'bg-pitch', 'bg-pitch-dark', 'bg-cup-deep'];
/** White-on-dark from the first green step up. */
const onDark = (tier: number) => tier >= 1;

/** The shelf's trophy, and the masthead-matching glyph everywhere else. */
function Cup({ size = 26 }: { size?: number }) {
  return <Trophy size={size} strokeWidth={1.9} className="text-amber" aria-hidden="true" />;
}

/** One cup. There is no date to show and no opponent: `cupsByAscension` counts cups per
 *  tier and nothing else, which is what makes the whole screen free of new storage. */
function ShelfTile({ cup }: { cup: ShelfCup }) {
  const dark = onDark(cup.tier);
  return (
    <li className="w-[74px] shrink-0 text-center">
      <div
        className={`grid place-items-center gap-1.5 rounded-t-md rounded-b-[3px] border border-line pb-2 pt-[11px] ${
          PLINTH[Math.min(cup.tier, PLINTH.length - 1)]
        } ${dark ? 'border-transparent' : ''}`}
      >
        <Cup />
        <span
          className={`font-mono text-[9px] font-bold uppercase tracking-[0.1em] ${
            dark ? 'text-white/80' : 'text-muted'
          }`}
        >
          {cup.label === 'Base' ? 'Base' : cup.label.replace('Ascension ', 'Asc ')}
        </span>
      </div>
      <div className="mt-1 font-mono text-[9.5px] text-dim">
        {cup.nth} of {cup.ofTier}
      </div>
    </li>
  );
}

/** One rung, with both gates resolved. The underline says which: green for won here,
 *  amber for unlocked and still to win, nothing for locked. */
function LadderCell({ rung }: { rung: LadderRung }) {
  const won = rung.cups > 0;
  return (
    <div
      className={`relative px-1.5 pb-[9px] pt-2.5 text-center ${
        rung.unlocked ? 'bg-panel' : 'bg-faint'
      }`}
    >
      <div
        className={`font-mono text-[9px] font-bold uppercase tracking-[0.1em] ${
          rung.unlocked ? 'text-muted' : 'text-dim'
        }`}
      >
        {rung.label === 'Base' ? 'Base' : rung.label.replace('Ascension ', 'Asc ')}
      </div>
      <div
        className={`mt-0.5 font-display text-[20px] font-black leading-tight ${
          won ? '' : 'text-dim'
        }`}
      >
        {rung.cups}
      </div>
      <div className="mt-px font-mono text-[8.5px] text-dim">
        {!rung.unlocked
          ? 'locked'
          : rung.selectable
            ? `x${rung.rewardMult}`
            : `level ${rung.levelReq}`}
      </div>
      {(won || rung.unlocked) && (
        <span
          className={`absolute inset-x-0 bottom-0 h-[3px] ${won ? 'bg-pitch' : 'bg-amber'}`}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

/** A label / value line in the records column. */
function Rec({ k, v, dim }: { k: string; v: string; dim?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-hair py-[7px]">
      <span className="text-[12.5px] text-muted">{k}</span>
      <span
        className={`ml-auto text-right font-mono text-[12.5px] tabular-nums ${
          dim ? 'font-semibold text-dim' : 'font-bold text-ink'
        }`}
      >
        {v}
      </span>
    </div>
  );
}

/** A completion bar. The album and the honours both read in this shape already. */
function Bar({ have, need, thin }: { have: number; need: number; thin?: boolean }) {
  const pct = need > 0 ? Math.round((have / need) * 100) : 0;
  return (
    <div
      className={`overflow-hidden rounded-[20px] border border-hair bg-chalk ${
        thin ? 'h-[5px]' : 'h-[7px]'
      }`}
    >
      <div className="h-full bg-pitch" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Earned is the only ink, as on the challenge ledger: a done badge is panel + the
 *  tifo shadow + a tick, everything else is flat and dim with its fraction. */
function BadgeTile({ row }: { row: BadgeRow }) {
  return (
    <li
      className={`flex items-start gap-2.5 rounded-md p-[10px_11px] ${
        row.done
          ? 'border border-line bg-panel shadow-hard-sm'
          : 'border border-hair bg-faint'
      }`}
    >
      <span
        className={`mt-px grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full ${
          row.done
            ? 'bg-pitch text-white'
            : 'border-[1.5px] border-dashed border-line text-dim'
        }`}
        aria-hidden="true"
      >
        {row.done ? <Check size={12} strokeWidth={3.2} /> : <Plus size={11} strokeWidth={2.4} />}
      </span>
      <span className="min-w-0">
        <span
          className={`block font-display text-[13.5px] font-extrabold leading-tight tracking-[-0.01em] ${
            row.done ? 'text-ink' : 'text-dim'
          }`}
        >
          {row.badge.name}
          <span className="sr-only">{row.done ? ' - earned' : ' - not yet earned'}</span>
        </span>
        <span
          className={`mt-0.5 block text-[11.5px] leading-[1.35] ${
            row.done ? 'text-muted' : 'text-dim'
          }`}
        >
          {row.badge.description}
        </span>
        <span className="mt-1 block font-mono text-[10px] font-semibold tabular-nums text-dim">
          {row.have} / {row.need}
        </span>
      </span>
    </li>
  );
}

/** A card shell: the flat turf-flat card the rest of the app uses. */
function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-md border border-line bg-panel shadow-hard-sm ${className}`}>
      {children}
    </section>
  );
}

function BlockHead({
  title,
  count,
  hint,
  link,
}: {
  title: string;
  count?: string;
  hint?: string;
  link?: { to: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-2.5 border-b border-hair px-3.5 pb-2.5 pt-3">
      <h3 className="font-display text-[14.5px] font-extrabold tracking-[-0.01em]">{title}</h3>
      {count && <span className="font-mono text-[11.5px] font-bold tabular-nums text-muted">{count}</span>}
      {hint && <span className="text-[12px] text-muted">{hint}</span>}
      {link && (
        <Link
          to={link.to}
          className="ml-auto font-display text-[10.5px] font-extrabold uppercase tracking-[0.05em] text-accent transition hover:underline"
        >
          {link.label} &rarr;
        </Link>
      )}
    </div>
  );
}

/**
 * The trophy cabinet (roadmap item 06, option B). Read-only, and every number is
 * derived from the career and the album on render - see `domain/cabinet.ts`.
 */
export default function CabinetScreen({
  career,
  album,
  allPlayers,
  onClose,
}: {
  career: CareerState;
  album: AlbumState;
  /** The pool's players, so album completion tracks the year filter like the album
   *  screen's does. */
  allPlayers: Player[];
  onClose: () => void;
}) {
  const v: CabinetView = useMemo(
    () => cabinetView(career, album, allPlayers),
    [career, album, allPlayers],
  );
  const h = v.headline;
  const r = v.records;
  const bestTier = h.bestCupAscension === null ? null : v.ladder[h.bestCupAscension];

  return (
    <>
      <StageHeader
        eyebrow="Career"
        title="Trophy Cabinet"
        crumb={<StageCrumb dir="back" label="Back" onClick={onClose} />}
      />

      <p className="mb-[18px] max-w-[72ch] text-[13px] text-muted">
        Everything this career has to show for itself. Cups and honours are permanent; the
        counters are read live from the career, so they change as you play.
      </p>

      {/* Headline strip. The Prestige balance is here as a fact about the career,
        not as a prompt to go and spend it - the hub is where it is spent. */}
      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line shadow-hard-sm min-[560px]:grid-cols-3 min-[860px]:grid-cols-6">
        <div className="bg-pitch-dark p-[11px_13px] text-white">
          <div className="font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-white/70">
            Cups
          </div>
          <div className="mt-0.5 font-display text-[21px] font-black leading-tight tabular-nums tracking-[-0.02em]">
            {h.cups}
          </div>
          <div className="mt-px font-mono text-[10px] text-white/70">
            {bestTier ? `best: ${bestTier.label}` : 'none yet'}
          </div>
        </div>
        {[
          ['Level', String(h.level), `${h.xpInto} / ${h.xpNeeded} XP`],
          ['Prestige', String(h.prestige), `${h.prestigeSpent.toLocaleString()} spent`],
          ['Runs', String(h.runs), `${h.runsAtHighAscension} at Asc II+`],
          [
            'Honours',
            String(v.honours.completed),
            `of ${v.honours.total}`,
          ],
          ['Album', String(v.album.collected), `of ${v.album.total}`],
        ].map(([k, val, sub]) => (
          <div key={k} className="bg-panel p-[11px_13px]">
            <div className="font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted">
              {k}
            </div>
            <div className="mt-0.5 font-display text-[21px] font-black leading-tight tabular-nums tracking-[-0.02em]">
              {val}
            </div>
            <div className="mt-px font-mono text-[10px] tabular-nums text-muted">{sub}</div>
          </div>
        ))}
      </div>

      {/* ---- the shelf ---- */}
      <Card className="mb-3.5">
        <BlockHead
          title="The shelf"
          count={`${v.shelf.length} ${v.shelf.length === 1 ? 'cup' : 'cups'}`}
          hint="One trophy per cup, ranked by the tier it was won at."
        />
        <div className="p-3.5">
          {v.shelf.length > 0 ? (
            <>
              <ul className="flex flex-wrap items-end gap-2.5">
                {v.shelf.map((cup) => (
                  <ShelfTile key={`${cup.tier}-${cup.nth}`} cup={cup} />
                ))}
              </ul>
              <div className="mt-[3px] h-[5px] rounded-[2px] bg-line" />
            </>
          ) : (
            <p className="text-[13px] text-muted">
              Empty for now. Win a Cup Run and the first trophy lands here, with the
              tier it was won at on the plinth.
            </p>
          )}
        </div>
      </Card>

      {/* ---- ladder + records ----
        `items-start` rather than the default stretch: the ladder is a fixed six
        cells and the records are ten rows, so stretching left a card-sized hole
        under the ladder. A ragged bottom edge reads better than dead space. */}
      <div className="mb-3.5 grid grid-cols-1 items-start gap-3.5 min-[900px]:grid-cols-2">
        <Card>
          <BlockHead title="Cups by Ascension tier" count={String(h.cups)} />
          <div className="p-3.5">
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[5px] border border-line bg-line min-[620px]:grid-cols-6">
              {v.ladder.map((rung) => (
                <LadderCell key={rung.tier} rung={rung} />
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5 font-mono text-[10px] text-muted">
              <span>
                <i className="mr-1.5 inline-block h-[3px] w-3.5 rounded-[2px] bg-pitch align-middle" />
                won here
              </span>
              <span>
                <i className="mr-1.5 inline-block h-[3px] w-3.5 rounded-[2px] bg-amber align-middle" />
                unlocked, not yet won
              </span>
              <span>
                <i className="mr-1.5 inline-block h-[3px] w-3.5 rounded-[2px] bg-line align-middle" />
                locked
              </span>
            </div>
            <LadderNote ladder={v.ladder} level={h.level} />
          </div>
        </Card>

        <Card>
          <BlockHead title="Records" hint="read live from the career" />
          <div className="p-3.5">
            <div className="grid grid-cols-1 gap-x-[26px] min-[560px]:grid-cols-2">
              <Rec
                k="Best finish"
                v={r.bestFinish ? FINISH_LABEL[r.bestFinish] : '-'}
                dim={!r.bestFinish}
              />
              <Rec k="Best score" v={String(r.bestScore)} dim={r.bestScore === 0} />
              <Rec k="Cup streak, current" v={String(r.cupStreak)} dim={r.cupStreak === 0} />
              <Rec
                k="Cup streak, best (from honours)"
                v={String(r.bestCupStreak)}
                dim={r.bestCupStreak === 0}
              />
              <Rec
                k="Finals in a row, current"
                v={String(r.finalStreak)}
                dim={r.finalStreak === 0}
              />
              <Rec
                k="Semis in a row, current"
                v={String(r.semiStreak)}
                dim={r.semiStreak === 0}
              />
              <Rec k="Finals lost" v={r.everLostFinal ? 'yes' : 'no'} dim={!r.everLostFinal} />
              <Rec k="Runs at Ascension II or higher" v={String(r.runsAtHighAscension)} dim={r.runsAtHighAscension === 0} />
              <Rec
                k="Prestige spent, lifetime"
                v={r.prestigeSpent.toLocaleString()}
                dim={r.prestigeSpent === 0}
              />
              <Rec
                k="Perk tiers owned"
                v={`${r.perkTiersOwned} / ${r.perkTiersTotal}`}
                dim={r.perkTiersOwned === 0}
              />
            </div>

            <div className="mb-2 mt-[15px] flex items-baseline gap-2.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.15em] text-muted">
              Cups won with
              <span className="tracking-normal text-[11px] text-ink">
                {v.formations.filter((f) => f.won).length} of {v.formations.length}{' '}
                formations
              </span>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {v.formations.map((f) => (
                <li
                  key={f.name}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums ${
                    f.won
                      ? 'border-line bg-chalk text-ink'
                      : 'border-hair bg-faint text-dim'
                  }`}
                >
                  {f.won && (
                    <Check
                      size={10}
                      strokeWidth={3.4}
                      className="text-pitch"
                      aria-hidden="true"
                    />
                  )}
                  {f.name}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      {/* ---- honours ---- */}
      <Card className="mb-3.5">
        <BlockHead
          title="Honours"
          count={`${v.honours.completed} / ${v.honours.total}`}
          link={{ to: '/challenges', label: 'All challenges' }}
        />
        <div className="p-3.5">
          <Bar have={v.honours.completed} need={v.honours.total} />
          <div className="mt-3 grid gap-2">
            {(['bronze', 'silver', 'gold'] as const).map((t) => (
              <div key={t} className="flex items-center gap-2.5">
                <span className="flex w-[88px] shrink-0 items-center gap-1.5 whitespace-nowrap font-display text-[12.5px] font-bold capitalize">
                  {t} <TierPips tier={t} />
                </span>
                <span className="flex-1">
                  <Bar
                    have={v.honours.byTier[t].completed}
                    need={v.honours.byTier[t].total}
                  />
                </span>
                <span className="w-[52px] shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums text-muted">
                  {v.honours.byTier[t].completed} / {v.honours.byTier[t].total}
                </span>
              </div>
            ))}
          </div>

          <div className="mb-1 mt-[18px] font-mono text-[9.5px] font-bold uppercase tracking-[0.15em] text-muted">
            By family
          </div>
          <div className="grid grid-cols-1 gap-x-[22px] min-[620px]:grid-cols-2">
            {FAMILIES.map((f) => {
              const cell = v.honours.byFamily[f];
              return (
                <div
                  key={f}
                  className="flex items-center gap-2.5 border-b border-hair py-[5px]"
                >
                  <span
                    className={`min-w-0 flex-1 truncate text-[12.5px] ${
                      cell.completed > 0 ? 'text-ink' : 'text-dim'
                    }`}
                  >
                    {FAMILY_NAME[f]}
                  </span>
                  <span className="w-[74px] shrink-0 max-[440px]:hidden">
                    <Bar have={cell.completed} need={cell.total} thin />
                  </span>
                  <span className="w-10 shrink-0 text-right font-mono text-[10.5px] tabular-nums text-muted">
                    {cell.completed}/{cell.total}
                  </span>
                </div>
              );
            })}
          </div>

          {AWARDS_ON && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hair pt-2.5 text-[12.5px] text-muted">
              <span>Paid out so far</span>
              <b className="font-mono font-bold text-amber-ink">
                {v.honours.prestige} Prestige
              </b>
              <span className="text-dim">
                &middot; bronze {AWARD.bronze}, silver {AWARD.silver}, gold{' '}
                {AWARD.gold}
              </span>
            </div>
          )}
          <p className="mt-2.5 text-[12px] text-muted">
            A summary, not a second catalogue. All {v.honours.total} stay on the
            challenges page, where the ledger already holds them.
          </p>
        </div>
      </Card>

      {/* ---- badges ---- */}
      <Card className="mb-3.5">
        <BlockHead
          title="Badges"
          count={`${v.badgesEarned} / ${v.badges.length}`}
          hint="Lifetime completeness. Recomputed from what you hold, so they pay nothing."
        />
        <div className="p-3.5">
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(212px,100%),1fr))] gap-2.5">
            {v.badges.map((row) => (
              <BadgeTile key={row.badge.id} row={row} />
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-muted">
            Every one asks what a <b className="font-semibold text-ink">career holds</b>,
            which no challenge does - a challenge judges a single run. That is what keeps
            the two from being the same list twice.
          </p>
        </div>
      </Card>

      {/* ---- album + the block that cannot exist yet ---- */}
      <div className="grid grid-cols-1 gap-3.5 min-[900px]:grid-cols-2">
        <Card>
          <BlockHead
            title="Album"
            count={`${v.album.collected} / ${v.album.total}`}
            link={{ to: '/album', label: 'Open album' }}
          />
          <div className="p-3.5">
            <div className="grid gap-2">
              {(['legendary', 'iconic', 'monumental'] as const).map((t) => (
                <div key={t} className="flex items-center gap-2.5">
                  <span className="w-[88px] shrink-0 font-display text-[12.5px] font-bold capitalize">
                    {t}
                  </span>
                  <span className="flex-1">
                    <Bar
                      have={v.album.byTier[t].collected}
                      need={v.album.byTier[t].total}
                    />
                  </span>
                  <span className="w-[52px] shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums text-muted">
                    {v.album.byTier[t].collected} / {v.album.byTier[t].total}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 font-mono text-[9.5px] font-bold uppercase tracking-[0.15em] text-muted">
              The {v.monumentals.length} Monumentals
            </div>
            <ul className="mt-3 flex flex-wrap gap-[7px]">
              {v.monumentals.map(({ player, owned }) => {
                const squad = SQUAD_BY_ID[player.squadId];
                return (
                  <li
                    key={player.id}
                    className={`w-[78px] shrink-0 rounded-[5px] border p-[6px_5px] text-center ${
                      owned
                        ? 'border-line bg-panel'
                        : 'border-hair bg-faint'
                    }`}
                  >
                    <div
                      className={`grid h-[46px] place-items-center rounded-[3px] ${
                        owned
                          ? 'bg-chalk text-pitch-dark'
                          : 'border border-dashed border-line text-dim'
                      }`}
                    >
                      {owned ? (
                        <User size={20} strokeWidth={1.8} aria-hidden="true" />
                      ) : (
                        <span className="font-mono text-[15px]">?</span>
                      )}
                    </div>
                    <b
                      className={`mt-1.5 block font-display text-[9.5px] font-extrabold leading-[1.15] ${
                        owned ? '' : 'text-dim'
                      }`}
                    >
                      {player.name}
                    </b>
                    <i className="mt-px flex items-center justify-center gap-1 font-mono text-[8.5px] not-italic tabular-nums text-dim">
                      {squad && <Flag code={squad.code} className="h-2 w-3" />}
                      {squad?.year} &middot; {player.elo}
                    </i>
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>

        <div className="grid content-start gap-3.5">
          {/* Shown as a state rather than left off: "your last 20 runs" is the
            first thing anyone asks this screen for, and saying why it is not
            here beats a silent gap. Roadmap item 06 option D / item 21. */}
          <div className="rounded-md border border-dashed border-line bg-faint p-[16px_15px]">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-dim">
              Not recorded
            </span>
            <h3 className="mt-1 font-display text-[14px] font-extrabold text-dim">
              Run history
            </h3>
            <p className="mt-1.5 max-w-[74ch] text-[12.5px] text-dim">
              A dated list of finished runs is the one thing on this screen no
              existing field can answer: nothing on this device keeps per-run rows,
              and the columns on the server that look like they should have been
              taking their defaults for several migrations.
            </p>
            <p className="mt-1.5 text-[12.5px] text-dim">
              Everything else here is derived from the career and the album, which is
              why the cabinet needed no new storage at all.
            </p>
          </div>

          {v.complete && (
            <div className="rounded-md border border-line bg-panel p-[16px_15px] shadow-hard-sm">
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-accent">
                Complete
              </span>
              <h3 className="mt-1 flex items-center gap-2 font-display text-[15px] font-extrabold">
                <Cup size={18} /> Nothing left to win
              </h3>
              <p className="mt-1.5 text-[12.5px] text-muted">
                Every honour, every badge and every sticker. The cabinet is full.
              </p>
            </div>
          )}
        </div>
      </div>

      {FEATURES.challenges && (
        <p className="mt-5 text-[12.5px] text-muted">
          Honours and badges are judged when a Cup Run ends.
        </p>
      )}
    </>
  );
}

/** The two-gate sentence under the ladder, only when the gates actually come apart. */
function LadderNote({ ladder, level }: { ladder: LadderRung[]; level: number }) {
  const gated = ladder.find((r) => r.unlocked && !r.selectable);
  const top = [...ladder].reverse().find((r) => r.selectable);
  if (!gated || !top) return null;
  return (
    <p className="mt-2.5 text-[12px] text-muted">
      Winning at <b className="font-semibold text-ink">{top.label}</b> unlocked{' '}
      <b className="font-semibold text-ink">{gated.label}</b>, but it needs level{' '}
      {gated.levelReq} and this career is {level}, so the highest tier you can pick is still{' '}
      {top.label}.
    </p>
  );
}
