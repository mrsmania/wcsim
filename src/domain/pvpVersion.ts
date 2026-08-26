// ---------------------------------------------------------------------------
// The version handshake between the client and the referee.
//
// Wave 3 of docs/pvp-plan.md, decision P35. Pure, and shared by both sides on purpose:
// this file IS the comparison, so a hash computed in the browser and a hash computed in
// the referee container can only differ if the inputs differ.
//
// WHY THERE ARE TWO NUMBERS AND NOT ONE. The client deploys on a push to `main` and the
// referee is rebuilt by hand, so they are never in lockstep - the same standing problem
// migrations have, and the same standing answer (deploy the server first, always). But
// there are two independent ways they can drift and they need different sentences:
//
//   * THE PROTOCOL. What the routes are and what a request body means. Bumped by hand
//     when a change is not backwards compatible.
//   * THE DATASET. The referee bundles `src/data/squads.ts` to validate picks and to deal
//     roll squads, so a client offering a player the referee has never heard of gets every
//     pick refused as `unknown-player` and cannot tell why. This is not hypothetical: the
//     dataset moved three times during one audit and gained five tournaments on
//     consecutive days.
//
// A mismatch on either shows "Versus is updating" rather than letting anybody into a room
// that will break halfway through a draft.
//
// WHAT THE HASH COVERS, AND WHY EXACTLY THAT. Only the fields the RULES read: a player's
// id, his personId (drafted once), his squad, his positions (which slot he may stand in)
// and his rating (which decides his price and the match). Not his shirt number and not his
// display name, because those cannot make the two sides disagree about whether an XI is
// legal - and a hash that changes when nothing that matters changed is a hash that gets
// ignored, or worse, that takes Versus down for a spelling fix.
// ---------------------------------------------------------------------------

import type { Squad } from '../data/types';
import { SQUADS } from '../data/squads';

/** The wire protocol. Bump this by hand for any change to the referee's routes or to what
 *  a request or a broadcast body means that an older client would misread. */
export const PVP_PROTOCOL = 1;

/**
 * A hash of everything a room's rules read out of the dataset.
 *
 * FNV-1a over a canonical rendering, which is enough for this job and needs no crypto: the
 * question is "are these two builds carrying the same data", asked between two things on
 * the same side, and nobody gains anything by forging a collision - a client that lied
 * about its dataset hash would simply have every pick refused by the referee that actually
 * holds the data.
 *
 * Squads are sorted by id and players by id, so the hash is a fact about the CONTENT and
 * not about the order rows happen to sit in the file. Reordering the dataset must not take
 * Versus down.
 */
export function hashOfSquads(squads: readonly Squad[]): string {
  let h = 0x811c9dc5;
  const feed = (s: string): void => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      // The FNV prime, as shifts, because a plain multiply overflows a double.
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
  };
  for (const squad of [...squads].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    feed(squad.id);
    for (const p of [...squad.players].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      feed(p.id);
      feed(p.personId);
      feed(p.squadId);
      feed(p.positions.join(','));
      feed(String(p.elo));
    }
  }
  return h.toString(16).padStart(8, '0');
}

/** Memoised, because the client asks on every mount of the Versus screen and the referee
 *  answers `GET /referee/version` on every one of those. The dataset is a module constant,
 *  so there is nothing to invalidate. */
let cached: string | null = null;

export function datasetHash(): string {
  return (cached ??= hashOfSquads(SQUADS));
}

/** What `GET /referee/version` answers, and what the client compares against. */
export interface PvpVersion {
  protocol: number;
  dataset: string;
}

export function localVersion(): PvpVersion {
  return { protocol: PVP_PROTOCOL, dataset: datasetHash() };
}

/** Why the handshake failed, or null when the two agree. Named rather than a boolean
 *  because the two need different operator instructions: a protocol mismatch means the
 *  referee was not rebuilt, a dataset mismatch means it was rebuilt from the wrong commit. */
export type VersionMismatch = 'protocol' | 'dataset';

export function versionMismatch(theirs: PvpVersion): VersionMismatch | null {
  const mine = localVersion();
  if (theirs.protocol !== mine.protocol) return 'protocol';
  if (theirs.dataset !== mine.dataset) return 'dataset';
  return null;
}
