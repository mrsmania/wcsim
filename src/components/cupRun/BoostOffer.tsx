import { useEffect, useRef, useState } from 'react';
import { Dices } from 'lucide-react';
import type { Boon } from '../../domain/boons';
import type { GroupTeam } from '../../domain/tournament';
import type { RunState } from '../../domain/run';
import { boostOdds, runOddsNow } from '../../domain/run';
import type { RunOdds } from '../../domain/odds';
import Flag from '../Flag';
import { CHIP_OFF, CHIP_ON, MONO_CAP, btn } from '../matchUi';
import { RARITY_COLOR, RARITY_INK } from './types';

/**
 * The boost stop: three or four cards, the figures for whichever one is chosen, and one
 * button to take it. Roadmap item 05 merged with 65, option 3a.
 *
 * TWO REQUIREMENTS MET BY ONE SHAPE, which is why they were merged. Item 65: the cards did
 * not look pressable, because a full-width panel with a heading and a line of grey text is
 * what CONTENT looks like in this app, and every signal that they were controls fired on
 * hover, which does not exist on a phone. Item 05: a pick was a guess. Choose-then-confirm
 * on its own is friction bought with nothing, and odds on every card put two rows of bar on
 * the screen that can least afford them - so the first tap became the request for the
 * figures and each pays the other's bill.
 *
 * THE FIGURES ARE COMPUTED FOR THE CHOSEN CARD ONLY, and that is what makes the readout
 * affordable. The whole offer costs a baseline plus one simulation per card, about 950ms
 * and enough to need a web worker; one card is a single burst of roughly 110ms, measured,
 * into a panel that has just opened and can say it is working. The baseline is computed
 * with the first card chosen, so an offer nobody interrogates costs nothing at all.
 *
 * A CARD IS A LABEL AROUND A RADIO, not a button. Choosing one of four is what a radio
 * group is, so the arrow keys move between the boosts and the group is one tab stop; the
 * old version was four separate buttons imitating that. The visible control is the primary
 * button below, which names what it will take so it can never be pressed blind.
 */
export default function BoostOffer({
  offer,
  nextOpponent,
  roundName,
  run,
  atkDefDelta = 0,
  baseOdds = null,
  onPick,
  rerollsLeft = 0,
  onReroll,
}: {
  offer: Boon[];
  nextOpponent: GroupTeam | null;
  roundName: string;
  /** The run the offer belongs to, which is what the figures are a fact about. The live
   *  run in a knockout stop; the run the group produced at the first stop. */
  run: RunState;
  /** The difficulty setting's own delta. The Ascension handicap is NOT included: the odds
   *  pass reads that off the run itself, so passing both would apply it twice. */
  atkDefDelta?: number;
  /** The run's odds as the screen already computed them, which is what makes the cup row
   *  here and the Title figure in the XI panel ONE number. They were two readings of the
   *  same run and disagreed on screen; passing the figure in is what stops that being
   *  possible rather than merely unlikely. Null falls back to computing it, which is what
   *  the checks harness and any future caller get. */
  baseOdds?: RunOdds | null;
  onPick: (b: Boon) => void;
  /** Physio Table perk: re-rolls of this offer still available in the run. */
  rerollsLeft?: number;
  onReroll?: () => void;
}) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  /** Figures per boon id. A key present with `null` is a card the simulation cannot
   *  price, which is a different thing from one not computed yet. */
  const [odds, setOdds] = useState<Record<string, RunOdds | null>>({});
  const [localBase, setLocalBase] = useState<RunOdds | null>(null);
  const base = baseOdds ?? localBase;
  const [working, setWorking] = useState(false);
  /** The offer this cache belongs to. A Physio Table re-roll deals new cards, and figures
   *  computed against the old ones would be answers to a question nobody asked. */
  const offerKey = offer.map((b) => b.id).join('|');
  const cacheKey = useRef(offerKey);
  if (cacheKey.current !== offerKey) {
    cacheKey.current = offerKey;
    setChosenId(null);
    setOdds({});
    setLocalBase(null);
    setWorking(false);
  }

  const chosen = offer.find((b) => b.id === chosenId) ?? null;
  const known = chosenId != null && chosenId in odds;

  // The simulation runs AFTER the paint that shows the selection, so the card fills and
  // the panel opens at once and the figures land in it a moment later. Running it in the
  // handler would hold the tap for the length of the work and look like a dead card.
  useEffect(() => {
    if (!chosen || chosen.id in odds) return;
    if (chosen.priced !== 'sim') {
      setOdds((prev) => ({ ...prev, [chosen.id]: null }));
      return;
    }
    setWorking(true);
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (cancelled) return;
      const b = base ?? runOddsNow(run, atkDefDelta);
      const o = boostOdds(run, chosen, atkDefDelta);
      if (cancelled) return;
      if (b && !baseOdds) setLocalBase(b);
      setOdds((prev) => ({ ...prev, [chosen.id]: o }));
      setWorking(false);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // `base` is deliberately not a dependency: when the screen does not supply it, this
    // same effect fills it, and watching it would re-run the work the moment it lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, odds, run, atkDefDelta]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className={MONO_CAP}>Pick a boost</span>
        {nextOpponent && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted">
            Next: <Flag code={nextOpponent.code} className="h-3 w-[18px]" />
            <b className="text-ink">{nextOpponent.name}</b>
            {nextOpponent.year != null && <span>{nextOpponent.year}</span>} in {roundName}
          </span>
        )}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {offer.map((b) => {
          const on = b.id === chosenId;
          return (
            <label
              key={b.id}
              /* CHIP_ON / CHIP_OFF rather than CARD_FLAT, which is not a style choice: a
                 stateful card cannot wear an atom that hard-codes one state's fill.
                 CARD_FLAT carries `bg-panel`, and `bg-panel` and `bg-pitch-dark` are
                 utilities of equal specificity, so which one won came down to their order
                 in the generated stylesheet - the chosen card rendered white. These are
                 the app's own pair for a chosen cell, and they hold the border and the
                 fill for both states together, which is exactly why they exist. */
              className={`flex cursor-pointer flex-col gap-1.5 rounded-md border p-3 text-left transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-pitch ${
                on ? CHIP_ON : CHIP_OFF
              }`}
              style={{ borderTop: `3px solid ${RARITY_COLOR[b.rarity]}` }}
            >
              <input
                type="radio"
                name="boost-offer"
                value={b.id}
                checked={on}
                onChange={() => setChosenId(b.id)}
                className="absolute h-px w-px opacity-0"
              />
              <span
                className={`font-mono text-[9px] font-bold uppercase tracking-[0.12em] ${
                  on ? 'text-white' : RARITY_INK[b.rarity]
                }`}
              >
                {b.rarity}
              </span>
              <span className="font-display text-[14px] font-extrabold leading-tight">
                {b.name}
              </span>
              <span className={`text-[11.5px] leading-snug ${on ? 'text-white/85' : 'text-muted'}`}>
                {b.description}
              </span>
            </label>
          );
        })}
      </div>

      {chosen && (
        <OddsPanel
          boon={chosen}
          base={base}
          odds={known ? odds[chosen.id] : undefined}
          working={working}
          roundName={roundName}
          nextOpponent={nextOpponent}
        />
      )}

      <button
        type="button"
        className={`${btn('primary')} mt-3 w-full`}
        disabled={!chosen}
        onClick={() => chosen && onPick(chosen)}
      >
        {chosen ? `Take ${chosen.name}` : 'Choose a boost'}
      </button>

      {/* The Physio Table re-roll sits below the choice it is an alternative to, so it does
          not compete with the cards for the eye. It was a 10px pill in the heading, which is
          where a perk bought with Prestige went unnoticed exactly when it mattered. */}
      {onReroll && rerollsLeft > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3">
          <button type="button" onClick={onReroll} className={btn('secondary')}>
            <Dices className="h-4 w-4" aria-hidden="true" />
            Re-roll these boosts
          </button>
          <span className="font-mono text-[11px] text-muted">
            Physio Table: {rerollsLeft === 1 ? '1 re-roll' : `${rerollsLeft} re-rolls`} left this
            run
          </span>
        </div>
      )}
    </div>
  );
}

/** Whole points, and a movement inside the noise is not dressed up as precision: at 6,000
 *  simulations the standard error is around 0.6pp, so each figure is rounded on its own and
 *  the reader takes the difference between two honest numbers rather than being handed a
 *  delta the simulation cannot stand behind. */
const pctOf = (x: number) => Math.round(x * 100);

/**
 * What the first tap buys. Two horizons, because the catalogue lives in both and their
 * disagreement is the feature: a card can be worth twenty-seven points on this tie and
 * nothing at all over a run, and until this existed the screen could not say so.
 *
 * The bar runs 0 to 100%, so a full track is a certainty. It was drawn cropped to the
 * biggest figure on the board first, which is a chart convention for an axis with no
 * meaningful end - a probability has one, and cropped that way a 58% chance filled almost
 * the whole track and read as near-certain.
 */
function OddsPanel({
  boon,
  base,
  odds,
  working,
  roundName,
  nextOpponent,
}: {
  boon: Boon;
  base: RunOdds | null;
  /** Undefined while it has not been computed; null for a card no figure can price. */
  odds: RunOdds | null | undefined;
  working: boolean;
  roundName: string;
  nextOpponent: GroupTeam | null;
}) {
  const label =
    boon.priced === 'payout'
      ? 'Pays after the run'
      : boon.priced === 'album'
        ? 'Album, on a cup win'
        : 'Not shown until taken';
  const tieLabel = nextOpponent
    ? `Beating ${nextOpponent.name} in the ${roundName}`
    : `Winning the ${roundName}`;

  /* ONE HEIGHT WHATEVER IT HOLDS. The two-row readout is the tallest thing the panel can
     show, and the three single-line states are a fraction of it, so the panel used to
     shrink and the button under it jumped as you tapped between cards: 116px against 41.
     The 116 is MEASURED off the two rows in the running app, at 375px and at desktop
     width, where it comes out the same because neither row wraps - so one figure covers
     both and a taller reading would simply grow past the floor. A line on its own is
     centred in that space rather than parked in the corner of a box sized for something
     else, which is what `items-center` plus `w-full text-center` are for. */
  return (
    <div className="mt-3 flex min-h-[116px] items-center rounded-md border border-line border-l-[3px] border-l-pitch bg-panel p-3">
      {boon.priced !== 'sim' ? (
        <p className={`w-full text-center ${MONO_CAP}`}>{label}</p>
      ) : working || !base || odds === undefined ? (
        <p className={`w-full text-center ${MONO_CAP}`}>Working out what it is worth</p>
      ) : odds === null ? (
        <p className={`w-full text-center ${MONO_CAP}`}>No figure for this one</p>
      ) : (
        <div className="flex w-full flex-col gap-2">
          <OddsRow label={tieLabel} from={base.tie} to={odds.tie} />
          <OddsRow label="Lifting the cup" from={base.cup} to={odds.cup} />
        </div>
      )}
    </div>
  );
}

/** One horizon: what it is now, what it would be, and a bar of the same. */
function OddsRow({ label, from, to }: { label: string; from: number; to: number }) {
  const a = Math.max(0, Math.min(1, from));
  const b = Math.max(0, Math.min(1, to));
  const gain = Math.max(0, b - a);
  const loss = Math.max(0, a - b);
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {/* The label is a sentence, so it is set like one: the same face, size and colour as
          a boost's own description, rather than the mono caption the rest of the row uses. */}
      <span className="w-full text-[11.5px] leading-snug text-muted">{label}</span>
      <span className="relative h-[9px] min-w-[70px] flex-1 overflow-hidden rounded-sm bg-chalk">
        <span
          className="absolute inset-y-0 left-0 bg-line"
          style={{ width: `${(a - loss) * 100}%` }}
        />
        <span
          className="absolute inset-y-0 bg-pitch"
          style={{ left: `${a * 100}%`, width: `${gain * 100}%` }}
        />
        {/* A card can make the cup LESS likely: Sold Out Stadium's debt lands in the next
            round, so the run pays for the tie it just won. Drawn in the loss colour rather
            than left off, since a figure that goes down and a bar that does not is a bar
            arguing with the number beside it. */}
        <span
          className="absolute inset-y-0 bg-loss"
          style={{ left: `${b * 100}%`, width: `${loss * 100}%` }}
        />
      </span>
      <span className="font-mono text-[14px] font-bold tabular-nums text-ink">
        {pctOf(from)}%<span className="px-0.5 font-medium text-dim">&rarr;</span>
        <span className={b < a ? 'text-loss' : 'text-pitch-ink'}>{pctOf(to)}%</span>
      </span>
    </div>
  );
}
