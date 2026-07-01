import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  fixturesForMatchday,
  GROUP_MATCHDAYS,
  QUALIFY_COUNT,
  standings,
  teamById,
  type GroupState,
} from '../domain/tournament';
import Flag from './Flag';
import FixtureRow from './FixtureRow';
import { ordinal, RatingChip } from './matchUi';

/** Column layout shared by the header and body rows. */
const ST_GRID =
  'grid grid-cols-[28px_minmax(0,1fr)_26px_26px_32px_38px] sm:grid-cols-[34px_minmax(0,1fr)_30px_30px_30px_34px_38px] items-center gap-1 px-4 py-[11px]';
const ST_NUM = 'text-center font-mono text-[13px] text-muted';
const ST_HEAD =
  'text-center font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted';

/** Numeric header columns after the # / Team labels. `P` (played) hides on mobile. */
const NUM_HEADS: { label: string; mobileHidden?: boolean }[] = [
  { label: 'P', mobileHidden: true },
  { label: 'W' },
  { label: 'D' },
  { label: 'GD' },
  { label: 'Pts' },
];

interface Props {
  group: GroupState;
  groupFinished: boolean;
  advanced: boolean;
}

/** The group standings table: the ranked table (top `QUALIFY_COUNT` marked as
 *  qualifying), an optional finished-footer, and a collapsible "all results"
 *  overview of every fixture. */
export default function StandingsTable({ group, groupFinished, advanced }: Props) {
  const [showResults, setShowResults] = useState(false);
  const table = standings(group);
  const userPosition = table.findIndex((s) => s.team.isUser) + 1;

  return (
    <div className="mt-1.5 overflow-hidden rounded-md border border-line bg-panel shadow-hard">
      <div className={`${ST_GRID} border-b-2 border-ink bg-chalk`}>
        <span className={ST_HEAD}>#</span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
          Team
        </span>
        {NUM_HEADS.map((h) => (
          <span
            key={h.label}
            className={h.mobileHidden ? `hidden sm:block ${ST_HEAD}` : ST_HEAD}
          >
            {h.label}
          </span>
        ))}
      </div>
      {table.map((s, i) => {
        const adv = i < QUALIFY_COUNT;
        return (
          <div
            key={s.team.id}
            className={`${ST_GRID} border-b border-line last:border-b-0 ${
              s.team.isUser ? 'bg-pitch/[0.06]' : ''
            }`}
          >
            <span className="flex justify-center">
              {adv ? (
                <span className="grid h-[22px] w-[22px] place-items-center rounded-[4px] bg-pitch font-mono text-xs font-semibold text-white">
                  {i + 1}
                </span>
              ) : (
                <span className="font-mono text-[13px] font-semibold text-muted">{i + 1}</span>
              )}
            </span>
            <span className="flex min-w-0 items-center gap-[9px]">
              <Flag code={s.team.code} isUser={s.team.isUser} className="h-[15px] w-[22px]" />
              <span
                className={`truncate text-sm ${s.team.isUser ? 'font-bold' : 'font-semibold'}`}
              >
                {s.team.name}
              </span>
              {s.team.year && (
                <span className="shrink-0 font-mono text-[11px] font-medium text-muted">
                  {s.team.year}
                </span>
              )}
              {s.team.isUser && (
                <span className="shrink-0 rounded-[3px] bg-loss px-[5px] py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.06em] leading-none text-white">
                  You
                </span>
              )}
              <RatingChip value={s.team.strength.overall} />
            </span>
            <span className={`hidden sm:block ${ST_NUM}`}>{s.played}</span>
            <span className={ST_NUM}>{s.won}</span>
            <span className={ST_NUM}>{s.drawn}</span>
            <span className={ST_NUM}>{s.gd > 0 ? `+${s.gd}` : s.gd}</span>
            <span className="text-center font-mono text-sm font-bold text-ink">{s.points}</span>
          </div>
        );
      })}

      {groupFinished && (
        <div className="border-t border-line bg-chalk px-4 py-[10px] text-center font-mono text-[11px] tracking-[0.04em] text-muted">
          Finished {ordinal(userPosition)} of {table.length} ·{' '}
          {advanced ? 'through to the knockouts' : 'eliminated'}
        </div>
      )}

      {/* All group results (every fixture, including Your XI), collapsible */}
      <button
        onClick={() => setShowResults((v) => !v)}
        className="flex w-full items-center justify-center gap-1.5 border-t border-line bg-chalk px-4 py-[10px] font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted transition hover:text-pitch"
      >
        All results
        {showResults ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {showResults && (
        <div className="border-t border-line px-2 py-2">
          {Array.from({ length: GROUP_MATCHDAYS }, (_, idx) => idx + 1).map((md) => (
            <div key={md} className="mb-2 last:mb-0">
              <div className="mb-0.5 px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Matchday {md}
              </div>
              {fixturesForMatchday(group, md).map((f) => {
                const h = teamById(group, f.homeId);
                const a = teamById(group, f.awayId);
                return (
                  <FixtureRow
                    key={`${f.homeId}-${f.awayId}`}
                    home={h}
                    away={a}
                    homeRating={h.strength.overall}
                    awayRating={a.strength.overall}
                    score={
                      f.result
                        ? { home: f.result.homeGoals, away: f.result.awayGoals }
                        : undefined
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
