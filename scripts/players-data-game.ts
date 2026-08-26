/**
 * The game's own dataset (`src/data/squads.ts`) as the first dataset of
 * `docs/players.html` - every player of every squad of every tournament.
 *
 * Baked in at generation time, so the page has no imports and no network
 * dependency beyond the Google Fonts link. Re-run `npm run gen:players` after ANY
 * change to `squads.ts` or to `STICKER_TIERS` (the collectible column reads
 * `tierOf`), the same way `npm run gen:collectibles` has to be re-run.
 */
import { SQUADS } from '../src/data/squads';
import { tierOf } from '../src/domain/album';
import { STICKER_TIER_ORDER } from '../src/config';
import { TIER_META } from '../src/components/stickerTheme';
import { Dataset, today, type PageConfig, type SetBlob } from './players-page';

/** Weakest tier first, so a bigger number is a rarer card and the Collectible
 *  column sorts the way a reader expects. */
const TIERS = [...STICKER_TIER_ORDER].reverse();
const TIER_INDEX = new Map(TIERS.map((t, i) => [t, i + 1] as const));

const page: PageConfig = {
  tab: 'This game',
  docTitle: 'Player index - World Cup Simulator',
  tag: 'Player index',
  eyebrow: 'Squads database',
  title: 'Every player',
  alt: true,
  mainHeader: 'Main',
  mainFilter: 'Main position',
  altHeader: 'Also',
  colHeader: 'Collectible',
  tierNames: ['', ...TIERS.map((t) => TIER_META[t].name)],
  tierAccents: ['', ...TIERS.map((t) => TIER_META[t].accent)],
  grid: '44px minmax(170px, 1.7fr) minmax(140px, 1.1fr) 58px 58px minmax(96px, 0.9fr) 72px 92px',
};

/** The game's dataset, ready for the page. */
export function gameSet(): SetBlob {
  const data = new Dataset();
  const squads = [...SQUADS].sort((a, b) => a.year - b.year || a.code.localeCompare(b.code));
  for (const s of squads) {
    for (const p of s.players) {
      const tier = tierOf(p);
      data.add({
        personKey: p.personId,
        name: p.name,
        code: s.code,
        nation: s.nation,
        year: s.year,
        number: p.number,
        positions: p.positions,
        rating: p.elo,
        tier: tier ? TIER_INDEX.get(tier)! : 0,
      });
    }
  }

  const { counts: c, ...encoded } = data.encode();
  console.log(
    `  this game:  ${c.players} players / ${c.people} people / ${c.squads} squads / ` +
      `${c.nations} nations / ${c.years} tournaments / ${c.collectibles} collectibles`,
  );
  return {
    ...encoded,
    page,
    footer:
      `Generated from src/data/squads.ts on ${today()} - ${c.players.toLocaleString('en-GB')} players, ` +
      `${c.people.toLocaleString('en-GB')} distinct people, ${c.squads} squads, ${c.nations} nations, ` +
      `${c.years} tournaments, ${c.collectibles} collectibles. Regenerate with \`npm run gen:players\`.`,
  };
}
