import type { Formation } from '../domain/formations';
import type { Filled } from '../domain/draft';
import { standings, teamById, type GroupState } from '../domain/tournament';
import BoxScore from './BoxScore';
import Flag from './Flag';

const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

/** The user's three group results, with their final position in the table. */
function GroupRecap({ group }: { group: GroupState }) {
  const table = standings(group);
  const position = table.findIndex((s) => s.team.isUser) + 1;
  const rows = group.fixtures
    .filter((f) => f.result && (teamById(group, f.homeId).isUser || teamById(group, f.awayId).isUser))
    .map((f) => {
      const userIsHome = teamById(group, f.homeId).isUser;
      const opponent = teamById(group, userIsHome ? f.awayId : f.homeId);
      const gf = userIsHome ? f.result!.homeGoals : f.result!.awayGoals;
      const ga = userIsHome ? f.result!.awayGoals : f.result!.homeGoals;
      const outcome = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
      return { opponent, gf, ga, outcome };
    });

  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-stone-500">
        Group stage · finished {ordinal(position)} of {table.length}
      </div>
      <ul className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span
              className={`w-5 shrink-0 rounded text-center text-[10px] font-black ${
                r.outcome === 'W'
                  ? 'bg-emerald-100 text-emerald-700'
                  : r.outcome === 'L'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-stone-200 text-stone-600'
              }`}
            >
              {r.outcome}
            </span>
            <Flag code={r.opponent.code} className="h-4 w-6 shrink-0" />
            <span className="flex-1 truncate font-semibold">{r.opponent.name}</span>
            {r.opponent.year && <span className="shrink-0 text-[11px] text-stone-400">{r.opponent.year}</span>}
            <span className="shrink-0 font-mono font-bold">
              {r.gf}–{r.ga}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Props {
  formation: Formation;
  filled: Filled;
  /** When provided, includes the group-stage recap (used on the knockout screen,
   *  where the group table is no longer visible). */
  group?: GroupState | null;
}

/** End-of-tournament recap: the drafted XI, plus an optional group-stage recap. */
export default function TournamentSummary({ formation, filled, group }: Props) {
  return (
    <div className="mt-4 flex flex-col gap-5 rounded-xl border border-stone-300 bg-white p-4 text-left">
      <div className="text-[11px] font-semibold tracking-[0.2em] text-stone-500">TOURNAMENT SUMMARY</div>
      {group && <GroupRecap group={group} />}
      <BoxScore formation={formation} filled={filled} title="Your XI" />
    </div>
  );
}
