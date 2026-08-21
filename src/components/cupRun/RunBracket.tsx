import { ChevronDown, Trophy } from 'lucide-react';
import Bracket from '../Bracket';
import Flag from '../Flag';
import {
    bracketChampion,
    opponentOf,
    userGameInRound,
    type BracketState,
} from '../../domain/bracket';
import { KO_ROUNDS } from '../../domain/knockout';
import { USER_ID } from '../../domain/tournament';

/**
 * The Cup Run's knockout bracket, collapsed to the user's own path with the full
 * 16-team tree behind a chevron.
 *
 * The full tree is the right thing to look at between rounds and too tall to sit above
 * every screen of a run - so it opens on demand and closes by default. Collapsed, it is
 * the one row that matters: your tie in each round, with the score if it has been played.
 * That also subsumes what the run ladder used to say (which round is this, how did the
 * earlier ones go), which is why the ladder went rather than sitting beside it. A played
 * cell is also the way back into that round's REVIEW - its goal feed and the boost taken
 * - which the ladder's steps used to open and nothing else did.
 *
 * Short round labels below `sm`, and the path becomes a column rather than five columns:
 * five cells do not fit a phone, and a horizontally scrolling strip hides the round you
 * are actually in half the time.
 *
 * Open/closed is a persisted PREFERENCE (`Settings.showFullDraw`), not component state:
 * a run spans many navigations, and re-collapsing the draw on every return made the
 * control something you had to re-open rather than something you had set.
 */

const SHORT: Record<string, string> = {
    'Round of 16': 'R16',
    'Quarter-final': 'QF',
    'Semi-final': 'SF',
    Final: 'Final',
};

const CELL = 'rounded-[5px] border px-2.5 py-2 min-w-0';
const LABEL = 'font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em]';

/** One round of the user's path: the tie, its score, or a placeholder if not reached.
 *  A played round is a button that opens its round review (the one thing lost when the
 *  run ladder went); anything else is inert, so the affordance only appears where there
 *  is something to read. */
function PathCell({
    bracket,
    round,
    onOpenReview,
    className = '',
}: {
    bracket: BracketState;
    round: number;
    /** Open this round's review. Omitted when there is no record to show. */
    onOpenReview?: () => void;
    className?: string;
}) {
    const label = KO_ROUNDS[round];
    const game = userGameInRound(bracket, round);
    const opp = game ? opponentOf(bracket, game) : undefined;
    const res = game?.result;
    // The user is always the home side of their own game (buildBracket seeds them at 0),
    // so the result's home fields are theirs.
    const won = res ? res.winnerId === USER_ID : undefined;

    if (!game || !opp) {
        return (
            <div className={`${CELL} border-dashed border-line bg-transparent ${className}`}>
                <div className={`${LABEL} text-line`}>
                    <span className="sm:hidden">{SHORT[label] ?? label}</span>
                    <span className="max-sm:hidden">{label}</span>
                </div>
                <div className="mt-1 font-mono text-[11px] text-line">not reached</div>
            </div>
        );
    }

    const cls = [
        CELL,
        res
            ? won
                ? 'border-pitch/45 bg-pitch/[0.07]'
                : 'border-loss/45 bg-loss/[0.06]'
            : 'border-amber bg-amber/[0.08]',
        // A ring rather than a background or a lift: it composes with the cell's own
        // result tint and border (two `bg-*` utilities would fight), and inset means a
        // hovered cell cannot overlap its neighbour in a tight five-column row.
        onOpenReview
            ? 'w-full cursor-pointer text-left transition hover:ring-1 hover:ring-inset hover:ring-pitch/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-pitch'
            : '',
        className,
    ].join(' ');
    const body = (
        <>
            <div className={`${LABEL} ${res ? 'text-muted' : 'text-amber-ink'}`}>
                <span className="sm:hidden">{SHORT[label] ?? label}</span>
                <span className="max-sm:hidden">{label}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
                <Flag code={opp.code} className="h-3 w-[18px]" />
                <span className="min-w-0 truncate text-[12.5px] font-semibold">
                    {opp.code}{' '}
                    <span className="font-mono text-[10.5px] font-normal text-muted">
                        {opp.year}
                    </span>
                </span>
                <span className="ml-auto shrink-0 font-mono text-[12.5px] font-bold">
                    {res ? (
                        <>
                            {res.homeGoals}&ndash;{res.awayGoals}
                            {res.decided !== 'reg' && (
                                <span className="ml-1 font-normal text-[9px] uppercase text-muted">
                                    {res.decided === 'pens' ? 'pens' : 'aet'}
                                </span>
                            )}
                        </>
                    ) : (
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-ink">
                            to play
                        </span>
                    )}
                </span>
            </div>
        </>
    );

    if (!onOpenReview) return <div className={cls}>{body}</div>;
    return (
        <button
            type="button"
            onClick={onOpenReview}
            className={cls}
            aria-label={`Review the ${label}`}
            title={`Review the ${label}`}
        >
            {body}
        </button>
    );
}

/** The cup itself: won, lost to whoever lifted it, or still open. */
function CupCell({ bracket, className = '' }: { bracket: BracketState; className?: string }) {
    const champ = bracketChampion(bracket);
    const won = bracket.outcome === 'champion';
    return (
        <div
            className={`${CELL} ${
                won ? 'border-pitch-dark bg-pitch-dark text-white' : 'border-line bg-chalk'
            } ${className}`}
        >
            <div className={`${LABEL} ${won ? 'text-amber' : 'text-muted'}`}>Cup</div>
            <div className="mt-1 flex items-center gap-2">
                <Trophy
                    size={13}
                    strokeWidth={2.4}
                    className={won ? 'text-amber' : champ ? 'text-muted' : 'text-line'}
                />
                <span className="min-w-0 truncate text-[12.5px] font-semibold">
                    {won ? 'Champions' : champ ? champ.team.name : 'open'}
                </span>
            </div>
        </div>
    );
}

export default function RunBracket({
    bracket,
    open,
    onSetOpen,
    reviewableRounds,
    onOpenReview,
}: {
    bracket: BracketState;
    /** Whether the full 16-team draw is showing (persisted, see the note above). */
    open: boolean;
    onSetOpen: (open: boolean) => void;
    /** KO rounds that have a history record to review. The caller decides, since the
     *  record lives on the run and the tree only knows the tie. */
    reviewableRounds?: number[];
    onOpenReview?: (round: number) => void;
}) {
    // Rounds the user has not been drawn into yet, and whether the cup has been decided:
    // both only matter to the phone layout, which shows what has happened rather than a
    // column of placeholders.
    const toCome = KO_ROUNDS.filter((_, r) => !userGameInRound(bracket, r)).map(
        (label) => SHORT[label] ?? label,
    );
    const decided = bracket.outcome !== 'alive';

    return (
        <div className="rounded-md border border-line bg-panel shadow-hard">
            <button
                type="button"
                onClick={() => onSetOpen(!open)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-pitch/[0.04]"
            >
                <span className="font-display text-[13px] font-extrabold uppercase tracking-[0.06em]">
                    The bracket
                </span>
                <span className="ml-auto font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-pitch">
                    <span className="max-sm:hidden">
                        {open ? 'Hide the full bracket' : 'Show the full bracket'}
                    </span>
                    <span className="sm:hidden">{open ? 'Hide' : 'Full bracket'}</span>
                </span>
                <ChevronDown
                    size={17}
                    strokeWidth={2.5}
                    className={`shrink-0 text-pitch transition-transform ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Collapsed: your tie in each round. Five columns from `sm` up, a column of
                rows below it. Hidden when the full tree is open, which contains it. */}
            {!open && (
                <div className="grid grid-cols-1 gap-1.5 px-4 pb-4 sm:grid-cols-5 sm:gap-2">
                    {KO_ROUNDS.map((_, r) => (
                        <PathCell
                            key={r}
                            bracket={bracket}
                            round={r}
                            onOpenReview={
                                onOpenReview && reviewableRounds?.includes(r)
                                    ? () => onOpenReview(r)
                                    : undefined
                            }
                            // Five columns cost nothing side by side; five ROWS of
                            // "not reached" is most of a phone screen, which is the
                            // height this whole control exists to give back.
                            className={userGameInRound(bracket, r) ? '' : 'max-sm:hidden'}
                        />
                    ))}
                    {toCome.length > 0 && (
                        <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-dim sm:hidden">
                            {toCome.join(', ')} to come
                        </div>
                    )}
                    <CupCell bracket={bracket} className={decided ? '' : 'max-sm:hidden'} />
                </div>
            )}

            {open && (
                <div className="border-t border-line px-3 pb-4 pt-4">
                    <Bracket bracket={bracket} />
                </div>
            )}
        </div>
    );
}
