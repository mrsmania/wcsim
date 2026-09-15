/**
 * Print a browser-console snippet that fills the sticker album, for testing the album
 * screen without playing dozens of runs.
 *
 * It exists as a script rather than a snippet pasted into a doc because the collectible
 * set is derived from `player.elo` against `STICKER_TIERS`: any rating change silently
 * moves players in and out of it, and a hand-copied list of ids goes stale without
 * anyone noticing (it did - it was 13 ids short before this was written).
 *
 *   npm run album:fill                  # collect every collectible (100% album)
 *   npm run album:fill -- --leave=5     # leave 5 uncollected (trade targets remain)
 *   npm run album:fill -- --gaps=3      # leave 3 uncollected in EACH tier
 *   npm run album:fill -- --dupes=12    # plus a duplicate pool of 12, for trading
 *   npm run album:fill -- --clear       # snippet that wipes the album instead
 *
 * `--leave` and `--gaps` answer different questions and both are wanted. `--leave` holds
 * back the RAREST cards, which is the shape of a real album near completion and what you
 * want for the trade targets. `--gaps` holds back some of EACH tier, which is what you
 * want to look at the SCREEN: a collected card and an uncollected one side by side in
 * every section. `--leave` alone cannot produce that - the tiers run 80 / 28 / 7, so the
 * smallest `--leave` that reaches a Legendary is 36, by which point the other two sections
 * are empty and there is nothing left to compare against.
 *
 * GUEST ONLY. A signed-in album lives on the server, so writing localStorage does
 * nothing there - sign out first (the snippet says so too).
 */
import { ALL_PLAYERS } from '../src/data/squads';
import { collectiblePlayers, tierOf } from '../src/domain/album';
import { STICKER_TIERS, STICKER_TRADE_COST, type StickerTier } from '../src/config';

const ALBUM_KEY = 'wcsim_album_v1';
const STATS_KEY = 'wcsim_album_stats_v1';

const arg = (name: string): string | null => {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (hit === undefined) return null;
  const eq = hit.indexOf('=');
  return eq === -1 ? '' : hit.slice(eq + 1);
};
const num = (name: string, fallback: number): number => {
  const raw = arg(name);
  if (raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`--${name} expects a number, got "${raw}"`);
  return Math.floor(n);
};

if (arg('clear') !== null) {
  console.log(`\nPaste this in the browser console (guest mode), then reload:\n`);
  console.log(`localStorage.removeItem('${ALBUM_KEY}');`);
  console.log(`localStorage.removeItem('${STATS_KEY}');`);
  console.log(`location.reload();\n`);
  process.exit(0);
}

const leave = num('leave', 0);
const gaps = num('gaps', 0);
const dupes = num('dupes', 0);

// Rarest first, so `--leave` holds back the hardest cards (the interesting ones to
// leave missing) rather than a random slice of commons.
const all = [...collectiblePlayers(ALL_PLAYERS)].sort(
  (a, b) => b.elo - a.elo || a.name.localeCompare(b.name),
);
if (leave > all.length) throw new Error(`--leave=${leave} exceeds the ${all.length} collectibles`);

// `--gaps` is applied to what `--leave` did not already hold back, so the two compose
// rather than fighting: the rarest `leave` go first, then `gaps` more out of each tier.
// Rarest-first WITHIN a tier too, so a gap is always the most interesting card that tier
// still has - and so the choice is deterministic, which a screenshot comparison needs.
const heldBack = new Set(all.slice(0, leave).map((p) => p.id));
if (gaps > 0) {
  for (const tier of Object.keys(STICKER_TIERS) as StickerTier[]) {
    const inTier = all.filter((p) => tierOf(p) === tier && !heldBack.has(p.id));
    if (gaps > inTier.length) {
      throw new Error(`--gaps=${gaps} exceeds the ${inTier.length} ${tier} cards still available`);
    }
    for (const p of inTier.slice(0, gaps)) heldBack.add(p.id);
  }
}
const collected = all.filter((p) => !heldBack.has(p.id));

// Spread the duplicate pool over the collected cards, one at a time round-robin, so it
// looks like a real pool rather than a stack of one player.
const duplicates: Record<string, number> = {};
for (let i = 0; i < dupes; i++) {
  const id = collected[i % collected.length].id;
  duplicates[id] = (duplicates[id] ?? 0) + 1;
}

const byTier = (tier: StickerTier, players: typeof all) =>
  players.filter((p) => tierOf(p) === tier).length;
const tiers = Object.keys(STICKER_TIERS) as StickerTier[];
const summary = (players: typeof all) => tiers.map((t) => `${byTier(t, players)} ${t}`).join(' / ');

const album = { version: 1, collected: collected.map((p) => p.id), duplicates };

console.log(`\n${all.length} collectibles in the dataset (${summary(all)}).`);
console.log(
  `Collecting ${collected.length} (${summary(collected)}), leaving ${heldBack.size} missing.`,
);
if (dupes > 0) {
  const costs = tiers.map((t) => `${t} ${STICKER_TRADE_COST[t]}`).join(', ');
  console.log(`Duplicate pool: ${dupes}. Trade costs: ${costs}.`);
}
console.log(`\nPaste this in the browser console (GUEST mode - sign out first), then reload:\n`);
console.log(`localStorage.setItem('${ALBUM_KEY}', ${JSON.stringify(JSON.stringify(album))});`);
console.log(`location.reload();\n`);
