/**
 * Print the version THIS checkout would hand a referee, as `GET /referee/version` answers it.
 *
 *   npx esbuild --bundle --format=esm --platform=node scripts/referee-version.ts | node --input-type=module
 *
 * Why it exists: the referee bundles the game's own dataset rather than reimplementing the
 * rules, so an image built from the wrong commit answers with a different `dataset` hash and
 * the client refuses every room with "Versus is updating". That failure is silent from the
 * server's side - the referee is healthy and serving, it is simply not the same game - so
 * the deploy has to compare the two by hand. `scripts/deploy-referee.sh --verify` does.
 */
import { localVersion } from '../src/domain/pvpVersion';

process.stdout.write(JSON.stringify(localVersion()) + '\n');
