import Flag from '../Flag';
import { USER_ID, type GroupState } from '../../domain/tournament';

/**
 * The other fixture of a group matchday: the two teams the user did not play, with the
 * score they drew. Deliberately small - it is here so the table's movements make sense
 * ("why did Brazil go top?"), not as a match to watch.
 *
 * The data was always there: `prepareGroupStage` returns the whole group, all six
 * fixtures, and the run used to show only the user's three.
 */
export default function OtherFixture({
    group,
    matchday,
}: {
    group: GroupState;
    matchday: number;
}) {
    const fx = group.fixtures.find(
        (f) => f.matchday === matchday && f.homeId !== USER_ID && f.awayId !== USER_ID,
    );
    if (!fx?.result) return null;
    const home = group.teams.find((t) => t.id === fx.homeId);
    const away = group.teams.find((t) => t.id === fx.awayId);
    if (!home || !away) return null;

    return (
        <div className="mt-1.5 flex items-center justify-center gap-2.5 px-2 font-mono text-[11px] text-muted">
            <span className="flex min-w-0 items-center justify-end gap-1.5">
                <span className="truncate">
                    {home.name} <span className="text-dim">{home.year}</span>
                </span>
                <Flag code={home.code} className="h-3 w-[18px]" />
            </span>
            <span className="shrink-0 font-semibold text-ink">
                {fx.result.homeGoals}&ndash;{fx.result.awayGoals}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
                <Flag code={away.code} className="h-3 w-[18px]" />
                <span className="truncate">
                    {away.name} <span className="text-dim">{away.year}</span>
                </span>
            </span>
        </div>
    );
}
