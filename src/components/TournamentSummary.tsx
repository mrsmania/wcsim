import type { Formation } from '../domain/formations';
import type { Filled } from '../domain/draft';
import { standings, teamById, type GroupState } from '../domain/tournament';
import type { KnockoutState } from '../domain/knockout';
import { CATEGORY_ORDER, categoryOf } from '../data/types';
import { SQUAD_BY_ID } from '../data/squads';
import Flag from './Flag';

const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
const KO_ABBR = ['R16', 'QF', 'SF', 'Final'];

function ResultBadge({ won }: { won?: boolean }) {
  return (
    <span
      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-center text-[10px] font-black ${
        won === undefined
          ? 'bg-line text-muted'
          : won
            ? 'bg-win/15 text-win'
            : 'bg-loss/15 text-loss'
      }`}
    >
      {won === undefined ? 'D' : won ? 'W' : 'L'}
    </span>
  );
}

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
      const won = gf === ga ? undefined : gf > ga;
      return { opponent, gf, ga, won };
    });

  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-muted">
        Group stage · finished {ordinal(position)} of {table.length}
      </div>
      <ul className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <ResultBadge won={r.won} />
            <Flag code={r.opponent.code} className="h-4 w-6 shrink-0" />
            <span className="flex-1 truncate font-semibold text-ink">{r.opponent.name}</span>
            {r.opponent.year && <span className="shrink-0 text-[11px] text-muted">{r.opponent.year}</span>}
            <span className="shrink-0 font-mono font-bold text-ink">
              {r.gf}–{r.ga}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The user's knockout path with results. */
function KnockoutRecap({ knockout }: { knockout: KnockoutState }) {
  const rounds = knockout.rounds.filter((r) => r.result);
  if (rounds.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-muted">Knockouts</div>
      <ul className="flex flex-col gap-1">
        {rounds.map((r, i) => {
          const extra =
            r.decided === 'pens' && r.pens
              ? ` (p ${r.pens.user}–${r.pens.opp})`
              : r.decided === 'aet'
                ? ' a.e.t.'
                : '';
          return (
            <li key={i} className="flex items-center gap-2 text-sm">
              <ResultBadge won={r.userWon} />
              <span className="w-9 shrink-0 text-[10px] font-bold uppercase text-muted">{KO_ABBR[i]}</span>
              <Flag code={r.opponent.code} className="h-4 w-6 shrink-0" />
              <span className="flex-1 truncate font-semibold text-ink">{r.opponent.name}</span>
              {r.opponent.year && <span className="shrink-0 text-[11px] text-muted">{r.opponent.year}</span>}
              <span className="shrink-0 font-mono font-bold text-ink">
                {r.result!.homeGoals}–{r.result!.awayGoals}
                <span className="font-normal text-muted">{extra}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The drafted XI: position, nationality, name, year and elo. */
function SquadList({ formation, filled }: { formation: Formation; filled: Filled }) {
  const ordered = [...formation.slots].sort(
    (a, b) => CATEGORY_ORDER.indexOf(categoryOf(a.position)) - CATEGORY_ORDER.indexOf(categoryOf(b.position)),
  );
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-muted">Your XI</div>
      <ul className="flex flex-col">
        {ordered.map((slot) => {
          const player = filled[slot.id];
          const squad = player ? SQUAD_BY_ID[player.squadId] : undefined;
          return (
            <li key={slot.id} className="flex items-center gap-2 border-b border-line py-1.5 text-sm last:border-b-0">
              <span className="w-8 shrink-0 text-[11px] font-bold uppercase text-muted">{slot.label}</span>
              <span className={`flex-1 truncate ${player ? 'font-semibold text-ink' : 'text-muted'}`}>
                {player ? player.name : '—'}
              </span>
              <Flag code={squad?.code ?? ''} className="h-4 w-6 shrink-0" />
              {squad?.year && <span className="shrink-0 text-[11px] text-muted">{squad.year}</span>}
              <span className="w-7 shrink-0 text-right font-mono font-black text-ink">{player ? player.elo : '—'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface Props {
  formation: Formation;
  filled: Filled;
  /** Group-stage recap (shown on the knockout screen, where the table isn't visible). */
  group?: GroupState | null;
  /** Knockout path recap. */
  knockout?: KnockoutState | null;
}

/** End-of-tournament recap: results (group + knockouts) and the drafted XI. */
export default function TournamentSummary({ formation, filled, group, knockout }: Props) {
  return (
    <div className="mt-4 flex flex-col gap-5 rounded-md border border-line bg-panel p-5 text-left shadow-hard">
      <div className="text-[11px] font-bold tracking-[0.2em] text-muted">TOURNAMENT SUMMARY</div>
      {group && <GroupRecap group={group} />}
      {knockout && <KnockoutRecap knockout={knockout} />}
      <SquadList formation={formation} filled={filled} />
    </div>
  );
}
