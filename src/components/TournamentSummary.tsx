import type { Formation } from '../domain/formations';
import type { Filled } from '../domain/draft';
import { standings, teamById, USER_ID, type GroupState, type GroupTeam } from '../domain/tournament';
import { BRACKET_ROUNDS, type BracketState } from '../domain/bracket';
import type { KoDecided } from '../domain/knockout';
import { CATEGORY_ORDER, categoryOf } from '../data/types';
import { SQUAD_BY_ID } from '../data/squads';
import Flag from './Flag';
import { EYEBROW, TABLE_HEAD, ordinal, RatingChip } from './matchUi';

/** Short recap labels, one per knockout round, keyed to the domain's round list so
 *  the two cannot drift. The recap shows abbreviations; the last round keeps its
 *  full name (which is already short). */
const KO_ABBR: Record<(typeof BRACKET_ROUNDS)[number], string> = {
  'Round of 16': 'R16',
  'Quarter-final': 'QF',
  'Semi-final': 'SF',
  Final: 'Final',
};

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
      <div className={`mb-[9px] ${EYEBROW}`}>
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
              <RatingChip value={r.opponent.strength.overall} />
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

/** The user's knockout path with results, read off the bracket. The user is
 *  always the home side of their own games (round index 0). */
function KnockoutRecap({ bracket }: { bracket: BracketState }) {
  const champions = bracket.outcome === 'champion';
  const rows: {
    opp: GroupTeam;
    userGoals: number;
    oppGoals: number;
    won: boolean;
    round: number;
    decided: KoDecided;
  }[] = [];
  for (let r = 0; r < bracket.rounds.length; r++) {
    const g = bracket.rounds[r][0];
    if (!g.hasUser || !g.result) break;
    const userIsHome = g.homeId === USER_ID;
    const res = g.result;
    rows.push({
      opp: bracket.teams[userIsHome ? g.awayId : g.homeId],
      userGoals: userIsHome ? res.homeGoals : res.awayGoals,
      oppGoals: userIsHome ? res.awayGoals : res.homeGoals,
      won: res.winnerId === USER_ID,
      round: r,
      decided: res.decided,
    });
  }
  if (rows.length === 0) return null;
  return (
    <Section label={`Knockouts · ${champions ? 'champions' : 'eliminated'}`}>
      <ul className="flex flex-col">
        {rows.map((r) => {
          const extra = r.decided === 'pens' ? ' · pens' : r.decided === 'aet' ? ' · a.e.t.' : '';
          return (
            <li
              key={r.round}
              className="grid grid-cols-[18px_minmax(0,1fr)_auto_auto] items-center gap-2.5 py-[5px] text-[13.5px]"
            >
              <ResultBadge won={r.won} />
              <span className="flex min-w-0 items-center gap-[9px] font-semibold text-ink">
                <Flag code={r.opp.code} className="h-[15px] w-[22px]" />
                <span className="truncate">{r.opp.name}</span>
                {r.opp.year && (
                  <span className="shrink-0 font-mono text-[11px] text-muted">{r.opp.year}</span>
                )}
                <RatingChip value={r.opp.strength.overall} />
              </span>
              <span className="shrink-0 font-mono text-[11px] text-muted">
                {KO_ABBR[BRACKET_ROUNDS[r.round]]}
                {extra}
              </span>
              <span className="shrink-0 font-mono text-[13px] font-bold text-ink">
                {r.userGoals}–{r.oppGoals}
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
                  {player ? player.name : '-'}
                </span>
                {squad && <Flag code={squad.code} className="h-[15px] w-[22px]" />}
                {squad?.year && (
                  <span className="shrink-0 font-mono text-[11px] text-muted">{squad.year}</span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[13px] font-bold text-ink">
                {player ? player.elo : '-'}
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
  /** Knockout path recap, read from the bracket. */
  bracket?: BracketState | null;
}

/** End-of-tournament recap: results (group + knockouts) and the drafted XI. */
export default function TournamentSummary({ formation, filled, group, bracket }: Props) {
  return (
    <div className="mt-[30px] overflow-hidden rounded-md border border-line bg-panel text-left shadow-hard">
      <div className={`border-b-2 border-ink px-[18px] py-[13px] ${TABLE_HEAD}`}>
        Tournament summary
      </div>
      {group && <GroupRecap group={group} />}
      {bracket && <KnockoutRecap bracket={bracket} />}
      <SquadList formation={formation} filled={filled} />
    </div>
  );
}
