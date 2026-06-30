import type { Formation } from '../domain/formations';
import type { Filled } from '../domain/draft';
import { standings, teamById, type GroupState } from '../domain/tournament';
import type { KnockoutState } from '../domain/knockout';
import { CATEGORY_ORDER, categoryOf } from '../data/types';
import { SQUAD_BY_ID } from '../data/squads';
import Flag from './Flag';

const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
const KO_ABBR = ['R16', 'QF', 'SF', 'Final'];

/** Small square W / L / D chip shown at the head of a result row. */
function ResultBadge({ won }: { won?: boolean }) {
  return (
    <span
      className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[3px] font-mono text-[10px] font-bold text-white ${
        won === undefined ? 'bg-muted' : won ? 'bg-pitch' : 'bg-loss'
      }`}
    >
      {won === undefined ? 'D' : won ? 'W' : 'L'}
    </span>
  );
}

/** One major block within the summary card. */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line px-[18px] py-[14px] last:border-b-0">
      <div className="mb-[9px] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-pitch">
        {label}
      </div>
      {children}
    </div>
  );
}

/** The user's three group results, with their final position in the table. */
function GroupRecap({ group }: { group: GroupState }) {
  const table = standings(group);
  const position = table.findIndex((s) => s.team.isUser) + 1;
  const rows = group.fixtures
    .filter(
      (f) => f.result && (teamById(group, f.homeId).isUser || teamById(group, f.awayId).isUser),
    )
    .map((f) => {
      const userIsHome = teamById(group, f.homeId).isUser;
      const opponent = teamById(group, userIsHome ? f.awayId : f.homeId);
      const gf = userIsHome ? f.result!.homeGoals : f.result!.awayGoals;
      const ga = userIsHome ? f.result!.awayGoals : f.result!.homeGoals;
      const won = gf === ga ? undefined : gf > ga;
      return { opponent, gf, ga, won };
    });

  return (
    <Section label={`Group stage · finished ${ordinal(position)} of ${table.length}`}>
      <ul className="flex flex-col">
        {rows.map((r, i) => (
          <li
            key={i}
            className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2.5 py-[5px] text-[13.5px]"
          >
            <ResultBadge won={r.won} />
            <span className="flex min-w-0 items-center gap-[9px] font-semibold text-ink">
              <Flag code={r.opponent.code} className="h-[15px] w-[22px]" />
              <span className="truncate">{r.opponent.name}</span>
              {r.opponent.year && (
                <span className="shrink-0 font-mono text-[11px] text-muted">{r.opponent.year}</span>
              )}
            </span>
            <span className="shrink-0 font-mono text-[13px] font-bold text-ink">
              {r.gf}–{r.ga}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** The user's knockout path with results. */
function KnockoutRecap({ knockout }: { knockout: KnockoutState }) {
  const rounds = knockout.rounds.filter((r) => r.result);
  if (rounds.length === 0) return null;
  const champions = knockout.outcome === 'champion';
  return (
    <Section label={`Knockouts · ${champions ? 'champions' : 'eliminated'}`}>
      <ul className="flex flex-col">
        {rounds.map((r, i) => {
          const extra = r.decided === 'pens' && r.pens ? ' · pens' : r.decided === 'aet' ? ' · a.e.t.' : '';
          return (
            <li
              key={i}
              className="grid grid-cols-[18px_minmax(0,1fr)_auto_auto] items-center gap-2.5 py-[5px] text-[13.5px]"
            >
              <ResultBadge won={r.userWon} />
              <span className="flex min-w-0 items-center gap-[9px] font-semibold text-ink">
                <Flag code={r.opponent.code} className="h-[15px] w-[22px]" />
                <span className="truncate">{r.opponent.name}</span>
                {r.opponent.year && (
                  <span className="shrink-0 font-mono text-[11px] text-muted">
                    {r.opponent.year}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-muted">
                {KO_ABBR[i]}
                {extra}
              </span>
              <span className="shrink-0 font-mono text-[13px] font-bold text-ink">
                {r.result!.homeGoals}–{r.result!.awayGoals}
              </span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** The drafted XI: position, name, nationality, year and rating. */
function SquadList({ formation, filled }: { formation: Formation; filled: Filled }) {
  const ordered = [...formation.slots].sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(categoryOf(a.position)) -
      CATEGORY_ORDER.indexOf(categoryOf(b.position)),
  );
  return (
    <Section label="Your XI">
      <ul className="flex flex-col">
        {ordered.map((slot) => {
          const player = filled[slot.id];
          const squad = player ? SQUAD_BY_ID[player.squadId] : undefined;
          return (
            <li
              key={slot.id}
              className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 py-[5px] text-[13.5px]"
            >
              <span className="font-mono text-[11px] font-semibold uppercase text-muted">
                {slot.label}
              </span>
              <span className="flex min-w-0 items-center gap-[9px]">
                <span className={`truncate ${player ? 'font-semibold text-ink' : 'text-muted'}`}>
                  {player ? player.name : '—'}
                </span>
                {squad && <Flag code={squad.code} className="h-[15px] w-[22px]" />}
                {squad?.year && (
                  <span className="shrink-0 font-mono text-[11px] text-muted">{squad.year}</span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[13px] font-bold text-ink">
                {player ? player.elo : '—'}
              </span>
            </li>
          );
        })}
      </ul>
    </Section>
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
    <div className="mt-[30px] overflow-hidden rounded-md border border-line bg-panel text-left shadow-hard">
      <div className="border-b-2 border-ink px-[18px] py-[13px] font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted">
        Tournament summary
      </div>
      {group && <GroupRecap group={group} />}
      {knockout && <KnockoutRecap knockout={knockout} />}
      <SquadList formation={formation} filled={filled} />
    </div>
  );
}
