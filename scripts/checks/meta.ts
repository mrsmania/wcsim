// Characterization checks for the harness itself.
//
// One concern module, and the one that exists because of how this file set is built: the
// assertions now live in seventeen modules that an index calls (hygiene H104), so adding
// a module and forgetting to wire it into that index means it contributes ZERO assertions
// and says nothing about it. The pass count would go down by however many it holds, which
// nobody is watching. This notices.

import { readdirSync, readFileSync } from 'node:fs';
import { check } from './harness';

export function metaChecks(): void {
  const dir = 'scripts/checks';
  const modules = readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => f.replace(/\.ts$/, ''))
    // `harness` is imported for its helpers, not run as a concern.
    .filter((f) => f !== 'harness');
  const index = readFileSync('scripts/checks.ts', 'utf8');
  const missing = modules.filter((m) => !index.includes(`from './checks/${m}'`));
  const unlisted = modules.filter((m) => !new RegExp(`\\['${m}',`).test(index));
  check(
    `harness: all ${modules.length} concern modules are imported and listed by the index`,
    () => missing.length === 0 && unlisted.length === 0,
    () =>
      [
        missing.length ? `never imported: ${missing.join(', ')}` : '',
        unlisted.length ? `imported but not in CONCERNS: ${unlisted.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('; '),
  );
}
