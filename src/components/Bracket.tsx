import { useRef } from 'react';
import { Trophy } from 'lucide-react';
import { bracketChampion, type BracketState } from '../domain/bracket';
import { KO_ROUNDS } from '../domain/knockout';
import { USER_ID, type GroupTeam } from '../domain/tournament';
import { confettiBurst } from './Confetti';
import Flag from './Flag';
import { RatingChip } from './matchUi';

/** Games per round, longest to the final - the fixed shape the tree always draws
 *  (later rounds show as "?" until their feeder round is played). */
const ROUND_GAMES = [8, 4, 2, 1];

/** One side of a game as it should be displayed: a team, or null for a still
 *  undecided slot ("?"), plus whether its code should be struck (knocked out). */
interface SideView {
  team: GroupTeam | null;
  struck: boolean;
}
interface GameView {
  home: SideView;
  away: SideView;
  homeScore?: number;
  awayScore?: number;
}

/**
 * How a game appears: resolved (both teams + score, loser struck) once it has been
 * played; its two known participants without a score while it is the pending
 * current round; or "?" vs "?" for a round that has not been reached yet.
 */
function gameView(b: BracketState, round: number, g: number): GameView {
  const game = b.rounds[round]?.[g];
  if (!game) return { home: { team: null, struck: false }, away: { team: null, struck: false } };
  const r = game.result;
  if (r) {
    const homeWon = r.winnerId === game.homeId;
    return {
      home: { team: b.teams[game.homeId], struck: !homeWon },
      away: { team: b.teams[game.awayId], struck: homeWon },
      homeScore: r.homeGoals,
      awayScore: r.awayGoals,
    };
  }
  return {
    home: { team: b.teams[game.homeId], struck: false },
    away: { team: b.teams[game.awayId], struck: false },
  };
}

const code = (t: GroupTeam) => t.code.toUpperCase();
const yr = (t: GroupTeam) => (t.year ? `'${String(t.year).slice(2)}` : '');

/** One team line in a wide-layout match box: flag + code + year + rating chip on
 *  one row, score pushed to the right. */
function Seed({ side, score }: { side: SideView; score?: number }) {
  const team = side.team;
  const isUser = team?.id === USER_ID;
  const cls = [
    'bkt-seed',
    side.struck ? 'bkt-out' : score !== undefined ? 'bkt-win' : '',
    isUser ? 'bkt-you' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls}>
      {team ? (
        <>
          <Flag code={team.code} isUser={isUser} className="h-3 w-[18px]" />
          <span className="bkt-lab">
            <span className="bkt-nm">{code(team)}</span>
            {yr(team) && <span className="bkt-yr">{yr(team)}</span>}
          </span>
          <RatingChip value={team.strength.overall} />
        </>
      ) : (
        <span className="bkt-lab">
          <span className="bkt-nm bkt-tbd">?</span>
        </span>
      )}
      {score !== undefined && <span className="bkt-sc">{score}</span>}
    </div>
  );
}

/** One team column in the narrow (mobile) match box: flag over code+year over
 *  the goals it scored. Two of these sit side by side with a result dash between
 *  them (see MobileBody), so a played tie reads as three rows, not four. */
function MSide({ side, score }: { side: SideView; score?: number }) {
  const team = side.team;
  const isUser = team?.id === USER_ID;
  const cls = [
    'bkt-seed',
    'bkt-col',
    side.struck ? 'bkt-out' : score !== undefined ? 'bkt-win' : '',
    isUser ? 'bkt-you' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls}>
      {team ? (
        <>
          <Flag code={team.code} isUser={isUser} className="h-[11px] w-4" />
          <span className="bkt-lab">
            <span className="bkt-nm">{code(team)}</span>
            {yr(team) && <span className="bkt-yr">{yr(team)}</span>}
          </span>
          {score !== undefined && <span className="bkt-sc">{score}</span>}
        </>
      ) : (
        <span className="bkt-nm bkt-tbd">?</span>
      )}
    </div>
  );
}

/** Narrow layout: home | away side by side, with a dash between their goals to
 *  read as a result. */
function MobileBody({ view }: { view: GameView }) {
  const hasScore = view.homeScore !== undefined && view.awayScore !== undefined;
  return (
    <>
      <MSide side={view.home} score={view.homeScore} />
      <span className="bkt-dash" aria-hidden>
        {hasScore ? '–' : ''}
      </span>
      <MSide side={view.away} score={view.awayScore} />
    </>
  );
}

/** One game box. `onReview` turns it into a button that opens that round's review -
 *  set only for a tie the USER played, because only those have anything to review: a
 *  `RoundRecord` (the goal feed, how it was decided, the boost taken) is written per
 *  user tie, while the other 14 teams' games resolve from their ratings and store a
 *  scoreline and nothing else. The element keeps `.bkt-match` exactly either way, since
 *  the CSS connectors are positioned off that box. */
function Match({
  view,
  stacked,
  label,
  onReview,
}: {
  view: GameView;
  stacked: boolean;
  label?: string;
  onReview?: () => void;
}) {
  const body = stacked ? (
    <MobileBody view={view} />
  ) : (
    <>
      <Seed side={view.home} score={view.homeScore} />
      <Seed side={view.away} score={view.awayScore} />
    </>
  );
  const cls = stacked ? 'bkt-match bkt-vs' : 'bkt-match';
  if (!onReview) return <div className={cls}>{body}</div>;
  return (
    <button
      type="button"
      className={cls}
      onClick={onReview}
      aria-label={label ? `Review the ${label}` : 'Review this round'}
      title={label ? `Review the ${label}` : undefined}
    >
      {body}
    </button>
  );
}

function pairs<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) out.push(arr.slice(i, i + 2));
  return out;
}

/** The champion node ("the cup"): the winner of the final once it has been played
 *  (the user when they lift it, otherwise whichever team went on to win it), or
 *  "?" while the run is still going. */
function Cup({ b, stacked }: { b: BracketState; stacked: boolean }) {
  const won = bracketChampion(b);
  const champ = won?.team ?? null;
  const trophyRef = useRef<HTMLSpanElement>(null);

  /** A burst of confetti erupting from the trophy on hover. */
  const burst = () => {
    const el = trophyRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    confettiBurst(r.left + r.width / 2, r.top + r.height / 2);
  };

  return (
    <div className="bkt-cup" onMouseEnter={champ ? burst : undefined}>
      <div className="bkt-cup-lbl">{champ ? 'World Champion' : 'Champion'}</div>
      <span ref={trophyRef} className="bkt-cup-trophy" aria-hidden>
        <Trophy size={stacked ? 20 : 24} strokeWidth={2} />
      </span>
      {champ ? (
        <>
          <Flag
            code={champ.code}
            isUser={champ.id === USER_ID}
            className="mx-auto mb-1.5 block h-5 w-[30px]"
          />
          <div className="bkt-cup-nm">
            {champ.name}
            {!stacked && <RatingChip value={champ.strength.overall} className="ml-1.5 align-middle" />}
          </div>
        </>
      ) : (
        <div className="bkt-cup-nm mt-1.5">?</div>
      )}
    </div>
  );
}

/** The knockout bracket. Renders both the wide (left-to-right) and narrow
 *  (two-sided, converging on the cup) layouts; CSS shows one at a time. */
export default function Bracket({
  bracket,
  reviewableRounds,
  onOpenReview,
}: {
  bracket: BracketState;
  /** Rounds with a review to open. The caller decides, since the record lives on the
   *  run and the tree only knows the tie. */
  reviewableRounds?: number[];
  onOpenReview?: (round: number) => void;
}) {
  const b = bracket;
  const v = (round: number, g: number) => gameView(b, round, g);
  /** The review handler for one game, or undefined when there is nothing to open:
   *  no caller, the round has no record, or this is not a tie the user played. */
  const reviewOf = (round: number, g: number): (() => void) | undefined => {
    if (!onOpenReview || !reviewableRounds?.includes(round)) return undefined;
    const game = b.rounds[round]?.[g];
    // `hasUser` rather than the game index: once the user is knocked out the rest of
    // the tree is simulated, and game 0 of a later round is then somebody else's.
    return game?.hasUser && game.result ? () => onOpenReview(round) : undefined;
  };
  const heads = [...KO_ROUNDS, 'Champion'];
  const nowIdx = b.outcome === 'champion' ? heads.length - 1 : b.outcome === 'out' ? -1 : b.current;

  return (
    <div className="bkt-wrap">
      {/* ---- wide: left-to-right ---- */}
      <div className="bkt-scroll bkt-wide">
        <div className="bkt-heads">
          {heads.map((h, i) => (
            <div key={h} className={`bkt-h${i === nowIdx ? ' now' : ''}`}>
              {h}
            </div>
          ))}
        </div>
        <div className="bkt">
          {[0, 1, 2].map((round) => {
            const views = Array.from({ length: ROUND_GAMES[round] }, (_, g) => v(round, g));
            return (
              <div className="bkt-round" key={round}>
                {pairs(views).map((pv, pi) => (
                  <div className="bkt-pair" key={pi}>
                    {pv.map((view, gi) => (
                      <Match
                        key={gi}
                        view={view}
                        stacked={false}
                        label={KO_ROUNDS[round]}
                        onReview={reviewOf(round, pi * 2 + gi)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
          <div className="bkt-round bkt-final">
            <Match
              view={v(3, 0)}
              stacked={false}
              label={KO_ROUNDS[3]}
              onReview={reviewOf(3, 0)}
            />
          </div>
          <div className="bkt-round bkt-champ">
            <Cup b={b} stacked={false} />
          </div>
        </div>
      </div>

      {/* ---- narrow: two-sided, converging on the cup ---- */}
      <div className="bkt-narrow">
        <div className="bkt-mtree">
          {/* top half (the user's half), flowing down */}
          <div className="bkt-mband bkt-r16">
            <div className="bkt-vpair">
              <Match
                view={v(0, 0)}
                stacked
                label={KO_ROUNDS[0]}
                onReview={reviewOf(0, 0)}
              />
              <Match
                view={v(0, 1)}
                stacked
                label={KO_ROUNDS[0]}
                onReview={reviewOf(0, 1)}
              />
            </div>
            <div className="bkt-vpair">
              <Match
                view={v(0, 2)}
                stacked
                label={KO_ROUNDS[0]}
                onReview={reviewOf(0, 2)}
              />
              <Match
                view={v(0, 3)}
                stacked
                label={KO_ROUNDS[0]}
                onReview={reviewOf(0, 3)}
              />
            </div>
          </div>
          <div className="bkt-mband bkt-qf">
            <div className="bkt-vpair">
              <Match
                view={v(1, 0)}
                stacked
                label={KO_ROUNDS[1]}
                onReview={reviewOf(1, 0)}
              />
              <Match
                view={v(1, 1)}
                stacked
                label={KO_ROUNDS[1]}
                onReview={reviewOf(1, 1)}
              />
            </div>
          </div>
          <div className="bkt-mband bkt-sf">
            <Match
                view={v(2, 0)}
                stacked
                label={KO_ROUNDS[2]}
                onReview={reviewOf(2, 0)}
              />
          </div>

          <div className="bkt-mcenter">
            <div className="bkt-mfinal">
              <div className="bkt-mfinal-lbl">Final</div>
              <Match
                view={v(3, 0)}
                stacked
                label={KO_ROUNDS[3]}
                onReview={reviewOf(3, 0)}
              />
            </div>
            <Cup b={b} stacked />
          </div>

          {/* bottom half, flowing up */}
          <div className="bkt-mband bkt-sf bkt-up">
            <Match
                view={v(2, 1)}
                stacked
                label={KO_ROUNDS[2]}
                onReview={reviewOf(2, 1)}
              />
          </div>
          <div className="bkt-mband bkt-qf bkt-up">
            <div className="bkt-vpair">
              <Match
                view={v(1, 2)}
                stacked
                label={KO_ROUNDS[1]}
                onReview={reviewOf(1, 2)}
              />
              <Match
                view={v(1, 3)}
                stacked
                label={KO_ROUNDS[1]}
                onReview={reviewOf(1, 3)}
              />
            </div>
          </div>
          <div className="bkt-mband bkt-r16 bkt-up">
            <div className="bkt-vpair">
              <Match
                view={v(0, 4)}
                stacked
                label={KO_ROUNDS[0]}
                onReview={reviewOf(0, 4)}
              />
              <Match
                view={v(0, 5)}
                stacked
                label={KO_ROUNDS[0]}
                onReview={reviewOf(0, 5)}
              />
            </div>
            <div className="bkt-vpair">
              <Match
                view={v(0, 6)}
                stacked
                label={KO_ROUNDS[0]}
                onReview={reviewOf(0, 6)}
              />
              <Match
                view={v(0, 7)}
                stacked
                label={KO_ROUNDS[0]}
                onReview={reviewOf(0, 7)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
