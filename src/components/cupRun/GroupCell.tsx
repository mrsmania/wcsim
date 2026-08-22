import { Users } from 'lucide-react';
import type { RoundRecord } from '../../domain/run';
import { ordinal } from '../matchUi';

/**
 * The group's step on the run's path: where you finished, and whether you got out.
 *
 * It exists because the group had no cell ANYWHERE on the bracket, so the one round
 * review that could not be opened was the first one (roadmap item 28's last open call).
 * A leading cell on the path row is the fix, with one deliberate difference from the
 * knockout cells: it sits above the path rather than inside its five columns, and is
 * therefore visible whether the tree is collapsed or expanded. Wiring only the collapsed
 * cells is exactly the bug the knockout ties had to come back for - the review vanished
 * the moment you opened the tree to study it.
 *
 * It is also mounted standalone on a group EXIT, where there is no bracket to lead: the
 * run ends in the group, so without this the summary is unreachable again the moment you
 * navigate away from the results screen and back.
 *
 * No flag and no scoreline: three opponents do not fit a row, and the finishing position
 * is what the group decided. The scorelines are in the review this opens.
 */
export default function GroupCell({
  record,
  onOpenReview,
  className = '',
}: {
  record: RoundRecord;
  /** Open the group's review. Always available in practice (the record IS the group's
   *  outcome), but optional so a caller can lock it while a match is revealing. */
  onOpenReview?: () => void;
  className?: string;
}) {
  const cls = [
    'flex w-full items-center gap-2.5 rounded-[5px] border px-2.5 py-2',
    record.won ? 'border-pitch/45 bg-pitch/[0.07]' : 'border-loss/45 bg-loss/[0.06]',
    // Same inset ring as a knockout path cell, for the same reason: it composes with the
    // cell's own result tint instead of fighting a second `bg-*`.
    onOpenReview
      ? 'cursor-pointer text-left transition hover:ring-1 hover:ring-inset hover:ring-pitch/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-pitch'
      : '',
    className,
  ].join(' ');

  const body = (
    <>
      <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">
        Group
      </span>
      <Users size={13} strokeWidth={2.4} className="shrink-0 text-muted" />
      <span className="min-w-0 truncate text-[12.5px] font-semibold">
        Finished {ordinal(record.groupPos ?? 0)} of {record.groupSize}
      </span>
      <span
        className={`ml-auto shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.1em] ${
          record.won ? 'text-pitch' : 'text-loss'
        }`}
      >
        {record.won ? 'through' : 'out'}
      </span>
    </>
  );

  if (!onOpenReview) return <div className={cls}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onOpenReview}
      className={cls}
      aria-label="Review the group stage"
      title="Review the group stage"
    >
      {body}
    </button>
  );
}
