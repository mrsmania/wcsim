// Telling everybody in a room that something happened.
//
// Wave 3 of docs/pvp-plan.md, decision P33: BROADCAST, not change capture. The client
// subscribes to a channel named after the room and the referee posts to it; nobody
// subscribes to table changes.
//
// WHY, because it looks like the harder option and is not. `postgres_changes` needs logical
// decoding, a publication and a REPLICATION SLOT, and a slot that nothing drains pins the
// write-ahead log for ever: stop or kill the Realtime container and the disk fills, Postgres
// refuses writes, and every signed-in player gets the blocking "cannot reach the server"
// screen for the SINGLE-PLAYER game, because of a versus feature nobody was using. Broadcast
// also removes an authorization surface: no per-row policy is evaluated over a change
// stream, so a column that should not have left the server cannot leak through one.
//
// The price is that the referee must remember to publish after every write, which is why
// `handle` returns the code to publish rather than publishing: forgetting is then a missing
// return value in one file, not a missing call anywhere.
//
// A FAILED BROADCAST IS NOT A FAILED COMMAND. The write already committed; the payload is a
// nicety that saves the client a poll. So this never throws into a request path, and a
// Realtime container that is down degrades a room to polling rather than stopping it.

export interface Broadcaster {
  publish(code: string, event: string, payload: unknown): Promise<void>;
}

/** No Realtime configured. A legitimate deployment (see `env.ts`), and the clients simply
 *  poll. */
export const silentBroadcaster: Broadcaster = {
  async publish(): Promise<void> {},
};

/**
 * Realtime's HTTP broadcast endpoint, which needs no socket of its own.
 *
 * A websocket client in the referee would be a second thing to keep alive, reconnect and
 * reason about across a restart - and the referee's whole design is that it holds nothing
 * across a restart.
 */
export function httpBroadcaster(baseUrl: string, serviceKey: string, log: (m: string) => void): Broadcaster {
  const url = `${baseUrl.replace(/\/+$/, '')}/realtime/v1/api/broadcast`;
  return {
    async publish(code, event, payload) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            apikey: serviceKey,
            authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            messages: [{ topic: `pvp:${code}`, event, payload }],
          }),
        });
        if (!res.ok) log(`broadcast ${code}/${event}: ${res.status}`);
      } catch (err) {
        log(`broadcast ${code}/${event}: ${(err as Error).message}`);
      }
    },
  };
}
