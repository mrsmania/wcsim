// Characterization checks for the title-odds simulation.
//
// One of the seventeen concern modules `scripts/checks.ts` runs (hygiene H104). It was
// one 3,900-line file whose blocks shared nothing but the assertion helper, and whose
// summary ran last only because it happened to sit at the bottom.

import { readFileSync } from 'node:fs';
import { check, xiFor, boonStops, withSeed } from './harness';
import { simulateTitleOdds } from '../../src/domain/odds';
import { boostOdds, runOddsNow, ODDS_SAMPLES, ODDS_SIMS } from '../../src/domain/run';
import { BOONS, type Boon, type Priced } from '../../src/domain/boons';

const boon = (id: string): Boon => {
  const b = BOONS.find((x) => x.id === id);
  if (!b) throw new Error(`no boon ${id}`);
  return b;
};

export function oddsChecks(): void {
  // --- Title odds: a valid probability distribution ---------------------------
  {
    const o = simulateTitleOdds(xiFor(), 300);
    const distSum = Object.values(o.distribution).reduce((a, b) => a + b, 0);
    const ok =
      Math.abs(distSum - 1) < 1e-9 &&
      o.champion >= 0 &&
      o.advanced <= 1 &&
      o.champion <= o.finalist + 1e-9 &&
      o.finalist <= o.advanced + 1e-9;
    check('odds: distribution sums to 1 and champion <= finalist <= advanced', () => ok);
  }

  // --- Every card says whether it can be priced -------------------------------
  // The field is required by the type, so this is not about it being absent: it is about
  // the four cards that pay OUTSIDE the simulation still being marked, because the failure
  // is silent. A payout card marked 'sim' prints a figure a whisker off the baseline,
  // which reads as "worth nothing" about a card that is worth a level.
  {
    const byKind = (k: Priced) => BOONS.filter((b) => b.priced === k).map((b) => b.id).sort();
    const payout = byKind('payout');
    const album = byKind('album');
    const hidden = byKind('hidden');
    const sim = byKind('sim');
    const expected = {
      payout: ['all-or-nothing', 'sponsorship', 'youth-development'],
      album: ['double-print'],
      // The Coin Toss is derived from the XI and the opponent so a reload cannot re-roll
      // it, which means a figure would say heads or tails before the card is taken. The
      // Armband is the other kind: its worth depends on a player the user has not named.
      hidden: ['armband', 'coin-toss'],
    };
    check(
      'odds: the cards a figure cannot price are marked, and the rest are simulated',
      () =>
        JSON.stringify(payout) === JSON.stringify(expected.payout) &&
        JSON.stringify(album) === JSON.stringify(expected.album) &&
        JSON.stringify(hidden) === JSON.stringify(expected.hidden) &&
        // vacuity: the simulated set is the bulk of the catalogue and covers every one
        // not named above, so a new card cannot land in no group at all
        sim.length === BOONS.length - 6 &&
        sim.length > 20,
      () =>
        `payout ${payout.join(',')} | album ${album.join(',')} | hidden ${hidden.join(',')} | sim ${sim.length}`,
    );
    check(
      'odds: a card the simulation cannot price gets no figure',
      () => {
        const stops = withSeed(4711, () => boonStops(0, undefined, 1));
        if (!stops.length) return false;
        const run = stops[0];
        const unpriced = ['sponsorship', 'double-print', 'coin-toss', 'armband'];
        const priced = boostOdds(run, boon('defensive-drills'), 0, 400);
        // vacuity: the same call on a simulated card DOES return figures, so this is not
        // passing because the pass is broken at this stop
        return unpriced.every((id) => boostOdds(run, boon(id), 0, 400) === null) && !!priced;
      },
    );
  }

  // --- The position-aware pass: what the build-page reading cannot see ---------
  // The whole finding of roadmap item 05. Away Days weakens the NEXT opponent, which a
  // whole-tournament sim from a fresh random group cannot see at all: it measured +0.4 on
  // the cup where the tie it exists for is worth ten times that.
  {
    const stops = withSeed(20260909, () => boonStops(0, undefined, 1));
    const run = stops[0];
    const base = run ? runOddsNow(run, 0, 3000) : null;
    const away = run ? boostOdds(run, boon('away-days'), 0, 3000) : null;
    check(
      'odds: a next-opponent card is worth something on the tie it is aimed at',
      () => {
        if (!base || !away) return false;
        // It is aimed at exactly this tie, so the movement has to land there.
        return away.tie - base.tie > 0.02;
      },
      () =>
        base && away
          ? `tie ${(base.tie * 100).toFixed(1)}% -> ${(away.tie * 100).toFixed(1)}%`
          : 'no bracket at the stop',
    );

    // The consistency property, and the sharpest assertion here: winning the cup REQUIRES
    // winning the next tie, so a card that lasts one round moves the cup by almost exactly
    // the factor it moves the tie, and a PERMANENT card moves it by more because it is
    // still helping in the final. Replace the per-round `teamAt` with a constant round and
    // this goes red: a one-round card then reads as a permanent one.
    const cond = base ? base.cup / base.tie : 0;
    const oneRound = run ? boostOdds(run, boon('second-wind'), 0, 3000) : null;
    const permanent = run ? boostOdds(run, boon('defensive-drills'), 0, 3000) : null;
    check(
      'odds: a one-round card moves the cup by the factor it moves the tie, a permanent one by more',
      () => {
        if (!base || !oneRound || !permanent) return false;
        const oneGap = oneRound.cup - oneRound.tie * cond;
        const permGap = permanent.cup - permanent.tie * cond;
        // A round lasts a round: nothing beyond surviving it. Tolerance is the sim's own
        // noise at this count, doubled because two figures carry it.
        // A permanent card is still on the pitch later, so its cup figure has to beat
        // what surviving the tie alone would buy, by more than that noise.
        return Math.abs(oneGap) < 0.03 && permGap > 0.03;
      },
      () => {
        if (!base || !oneRound || !permanent) return 'no figures';
        const g = (o: { tie: number; cup: number }) =>
          `${((o.cup - o.tie * cond) * 100).toFixed(1)}pp`;
        return `one-round gap ${g(oneRound)}, permanent gap ${g(permanent)}`;
      },
    );

    // Sold Out Stadium is the case the two horizons exist for: +6 now and -6 the round
    // after, so it is the best card on the board for this tie and pays for it immediately.
    const sold = run ? boostOdds(run, boon('sold-out-stadium'), 0, 3000) : null;
    check(
      'odds: a card that pays its debt next round wins the tie and not the cup',
      () => {
        if (!base || !sold) return false;
        // vacuity: it really is the strongest thing on the board for the tie, so this is
        // not passing because the card does nothing at all.
        return sold.tie - base.tie > 0.05 && sold.cup <= base.cup + 0.02;
      },
      () =>
        base && sold
          ? `tie ${(base.tie * 100).toFixed(1)} -> ${(sold.tie * 100).toFixed(1)}, ` +
            `cup ${(base.cup * 100).toFixed(1)} -> ${(sold.cup * 100).toFixed(1)}`
          : 'no figures',
    );
  }

  // --- A resumed run's offer is DATA, and its cards have lost their functions ---
  // Found by driving the real app: a run is persisted to localStorage, and a `Boon` carries
  // `plan` and `apply`, which a JSON round trip does not. So a player who reloads while an
  // offer is on screen holds cards whose rarity, name and description are intact and whose
  // behaviour is gone, and the first thing to reach for one threw `eff.plan is not a
  // function`. Every consumer before it was safe by accident: the pick path passes an id and
  // `chooseBoon` resolves it. `boostOdds` resolves it too now, and this is the assertion
  // that keeps it doing so - no fixture built in memory can fail, because live boons work.
  {
    const stops = withSeed(31337, () => boonStops(0, undefined, 1));
    const run = stops[0];
    check(
      "odds: a card off a run that has been through storage is still priced",
      () => {
        if (!run?.offer?.length) return false;
        const revived = JSON.parse(JSON.stringify(run)) as typeof run;
        const card = revived.offer?.find((b) => b.priced === 'sim');
        if (!card) return false;
        // vacuity, and the whole point: the revived card really has lost its behaviour, so
        // this is not passing because the round trip happens to be lossless.
        const dead = card.effects.every(
          (e) => typeof (e as { plan?: unknown }).plan !== 'function' &&
                 typeof (e as { apply?: unknown }).apply !== 'function',
        );
        const o = boostOdds(revived, card, 0, 400);
        return dead && !!o && o.tie > 0;
      },
      () => 'no stop, or the revived card still carried its functions',
    );
  }

  // --- The Title cell and the cup row are ONE number ---------------------------
  // Reported with 82% in the XI panel beside 69% on the boost panel, on one screen, about
  // one run. Both were honest: the panel had the position-aware reading and the cell had
  // `simulateTitleOdds`, which replays a FRESH random tournament from a group - so it
  // described a group stage already won and a draw that is not this run's. The 82
  // reproduces exactly on an XI of that strength, so it was not a bug in either pass, it
  // was two answers to two questions under one label.
  //
  // The fix is not "use the same function", it is "compute it once and pass it", because
  // two calls to a Monte-Carlo pass disagree by their own noise even when both are right.
  // Nothing behavioural can see any of this: a build that computes it twice renders a
  // perfectly good screen and simply prints two numbers.
  {
    const screen = readFileSync('src/components/CupRunScreen.tsx', 'utf8');
    const offer = readFileSync('src/components/cupRun/BoostOffer.tsx', 'utf8');
    const phase = readFileSync('src/components/cupRun/RunPhasePanel.tsx', 'utf8');
    const group = readFileSync('src/components/cupRun/GroupRevealPanel.tsx', 'utf8');

    check(
      'odds: the screen computes the run odds once and hands them to both boost stops',
      () =>
        /runOddsNow\(oddsRun, diffDelta\)/.test(screen) &&
        // the Title cell reads that figure, with the blind pass only as the no-bracket case
        /runOdds\?\.cup \?\? blindOdds/.test(screen) &&
        // and it is passed down rather than recomputed in either panel
        (screen.match(/baseOdds=\{runOdds\}/g) ?? []).length === 2 &&
        /baseOdds=\{baseOdds\}/.test(phase) &&
        /baseOdds=\{baseOdds\}/.test(group) &&
        /baseOdds \?\? localBase/.test(offer),
    );

    // The odds belong to the run the SCREEN is about, which during a group reveal is
    // `reveal.next` - the state carrying the bracket and the offer being decided from,
    // not the pre-commit run still on `run`. Reading `run` there gives the first stop no
    // bracket at all, so the Title cell would silently fall back to the blind pass on
    // exactly the screen the report came from.
    check(
      'odds: during a group reveal the figure describes the run the offer belongs to',
      () => /reveal\?\.kind === 'group' \? reveal\.next : run/.test(screen),
    );

    // The blind pass is the build page's and the group's, and nothing else's: it is the
    // only thing that can be said before a bracket exists, and the moment one does exist
    // it would be a second answer to a question already answered on the same screen.
    check(
      'odds: the position-blind pass runs only when there is no bracket to read',
      () =>
        /!runOdds && activeXi/.test(screen) &&
        (screen.match(/simulateTitleOdds\(/g) ?? []).length === 1,
    );

    // One height whatever the panel holds, so the button under it does not move as cards
    // are tapped, and a single line is centred in that space rather than parked in the
    // corner of a box sized for two rows of bar. 116px is measured off the two rows in
    // the running app, at 375px and at desktop width.
    check(
      'odds: the panel keeps one height and centres a single line in it',
      () =>
        /min-h-\[116px\]/.test(offer) &&
        /items-center/.test(offer) &&
        (offer.match(/w-full text-center \$\{MONO_CAP\}/g) ?? []).length === 3 &&
        // vacuity: the two-row readout fills the width rather than being centred with them
        /flex w-full flex-col gap-2/.test(offer),
    );
  }

  // --- The wiring, which nothing behavioural can see --------------------------
  // Three things about how the readout is put on screen, each of which would look
  // perfectly fine in a fixture and be wrong in the app.
  {
    const offer = readFileSync('src/components/cupRun/BoostOffer.tsx', 'utf8');
    const phase = readFileSync('src/components/cupRun/RunPhasePanel.tsx', 'utf8');
    const group = readFileSync('src/components/cupRun/GroupRevealPanel.tsx', 'utf8');

    // ONE CARD AT A TIME is what makes the readout affordable: the whole offer is a
    // baseline plus a simulation per card, which is most of a second and the reason item
    // 05 was costed as needing a web worker. A version that computed the lot up front
    // renders exactly the same screen.
    check(
      'odds: the offer simulates the chosen card, not the whole offer',
      () =>
        /useEffect\(/.test(offer) &&
        /boostOdds\(run, chosen/.test(offer) &&
        // keyed on the chosen card, so it runs on a choice rather than on a render
        /\}, \[chosen,/.test(offer) &&
        // and never over the offer
        !/offer\.map\([^)]*boostOdds/.test(offer) &&
        !/offer\.forEach/.test(offer),
    );

    // AFTER THE PAINT. Running it in the change handler holds the tap for the length of
    // the work, so the card does not fill and the panel does not open until it is done,
    // which reads as a dead card rather than as a figure being worked out.
    check(
      'odds: the simulation runs after the paint that shows the choice',
      () => /setTimeout\(/.test(offer) && /setWorking\(true\)/.test(offer),
    );

    // Both stops hand over the run the offer belongs to, and they are NOT the same run:
    // the first boost is picked on the group-results screen, where the offer belongs to
    // the run the group produced rather than to the one the screen is still showing.
    check(
      'odds: both boost stops hand the offer its own run and the difficulty delta',
      () =>
        /run=\{run\}/.test(phase) &&
        /atkDefDelta=\{atkDefDelta\}/.test(phase) &&
        /run=\{reveal\.next\}/.test(group) &&
        /atkDefDelta=\{atkDefDelta\}/.test(group),
    );

    // The rarity WORD takes the ink classes and the STRIP keeps the tier accent. Getting
    // this backwards is invisible except as a contrast failure, which is what it was.
    check(
      'odds: the rarity word uses the ink classes and the strip keeps the tier accent',
      () =>
        /RARITY_INK\[b\.rarity\]/.test(offer) &&
        /borderTop: `3px solid \$\{RARITY_COLOR\[b\.rarity\]\}`/.test(offer) &&
        // vacuity: the accent is not used as text anywhere in the file
        !/color: RARITY_COLOR/.test(offer),
    );
  }

  // --- A random card is priced as a card, not as one draw of it ----------------
  // Wildcard Legend deals a legend and which one moves the answer by more than the
  // simulation's own noise, so the figure averages several independent commits. Asserting
  // the constant as well as the behaviour: at 1 the averaging is gone and nothing else
  // here would notice.
  {
    check(
      'odds: a random card is sampled more than once',
      () => ODDS_SAMPLES > 1,
      () => `ODDS_SAMPLES ${ODDS_SAMPLES}`,
    );
    // AND A READING IS REPRODUCIBLE ENOUGH TO PRINT A WHOLE PERCENT, which is the claim
    // that matters, on a card whose effect is fixed. This check used to compare two
    // readings of WILDCARD against an 8pp tolerance and it failed on its second day,
    // because the claim was false: measured over eight readings, Wildcard's cup figure
    // spreads 5 to 7pp at 3,000 sims. Raising ODDS_SAMPLES does not fix that and was
    // measured not to (5 samples 7.2pp, 10 samples 5.3, 20 samples 5.9, all within the
    // estimate's own noise), because the spread is NOT the card being sampled - a
    // DETERMINISTIC card spreads 2.7pp at 3,000 sims and 1.3pp at 6,000, so it is the
    // bracket simulation's own variance and the only lever on it is the sim count. So the
    // constant stays where it is and the assertion is the true one, seeded so it cannot
    // flake at all.
    const stops = withSeed(99, () => boonStops(0, undefined, 1));
    const run = stops[0];
    check(
      'odds: two readings of a fixed card agree closely enough to print a whole percent',
      () =>
        withSeed(20260910, () => {
          if (!run) return false;
          const a = boostOdds(run, boon('defensive-drills'), 0, ODDS_SIMS);
          const b = boostOdds(run, boon('defensive-drills'), 0, ODDS_SIMS);
          if (!a || !b) return false;
          // 1.3pp is the measured spread over six readings at this count; 3pp is that with
          // room, and tight enough that losing the averaging or the sim count shows up.
          return Math.abs(a.tie - b.tie) < 0.03 && Math.abs(a.cup - b.cup) < 0.03;
        }),
    );
  }
}
