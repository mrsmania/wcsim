/**
 * One command for a rating change: sync everything the collectible album derives from it.
 *
 *     npm run ratings:sync
 *     npm run ratings:sync -- --accept-all       # accept the new cards as undrawn
 *     npm run ratings:sync -- --accept=bra-1970-8
 *     npm run ratings:sync -- --force-art        # re-encode every card
 *     npm run ratings:sync -- --skip-checks      # stop before `npm run checks`
 *
 * A rating crossing a STICKER_TIERS boundary changes who is collectible, and five things
 * downstream of that have to move together. Four of them are mechanical and this command
 * does them; the fifth is a judgement and it deliberately does not.
 *
 *   1. Art for a player who has LEFT the bands is retired: the shipped card goes, and the
 *      original is parked in art/stickers-archive/ rather than deleted. An orphaned card
 *      is a hard failure in `npm run checks` and ships on every deploy until it goes.
 *   2. New artwork is built (`scripts/build-sticker-art.py`), which is a no-op when there
 *      is none to build.
 *   3. art/awaiting-artwork.txt is pruned: a card whose art has arrived, or whose player
 *      is no longer collectible, comes off. Both are settled facts with nothing to decide,
 *      and leaving one behind is what failed the build on 2026-08-28.
 *   4. The server's collectible catalogue and the player index are regenerated, and the
 *      artwork worklist spreadsheet with them.
 *   5. A player who is NEWLY collectible and has no artwork is REPORTED, not accepted.
 *      That check exists because the album shipped blank cards twice in two days without
 *      anyone noticing, one of them Maradona in the top tier - so a silhouette has to be
 *      accepted out loud, with --accept-all or --accept=<id>. Generating the allowance
 *      from the ratings would make the check pass for ever and mean nothing.
 *
 * It does NOT push anything: `npm run push:collectibles` needs the LAN or the VPN, and
 * pushing to main deploys the site, so both stay the author's call. The command says when
 * the catalogue has moved and therefore when the push is owed.
 *
 * Requires python + Pillow for step 2 (and openpyxl for the spreadsheet); it reports a
 * missing one and carries on rather than failing.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ALL_PLAYERS, SQUAD_BY_ID } from '../src/data/squads';
import { collectiblePlayers, tierOf } from '../src/domain/album';
import type { StickerTier } from '../src/config';

const SRC_DIR = 'art/stickers-src';
const OUT_DIR = 'public/stickers';
const ARCHIVE_DIR = 'art/stickers-archive';
const LIST_PATH = 'art/awaiting-artwork.txt';
const SEED_PATH = 'supabase/seed/collectibles.sql';
const INDEX_PATH = 'docs/players.html';
const WORKLIST_PATH = 'docs/missing-sticker-art.xlsx';
const ART_SCRIPT = 'scripts/build-sticker-art.py';
const WORKLIST_SCRIPT = 'scripts/build-art-worklist.py';

const args = process.argv.slice(2);
const has = (name: string) => args.some((a) => a === `--${name}`);
const valueOf = (name: string) =>
  args
    .filter((a) => a.startsWith(`--${name}=`))
    .flatMap((a) => a.slice(name.length + 3).split(','))
    .map((s) => s.trim())
    .filter(Boolean);

const ACCEPT_ALL = has('accept-all');
const ACCEPT = new Set(valueOf('accept'));
const FORCE_ART = has('force-art');
const SKIP_CHECKS = has('skip-checks');

const notes: string[] = [];
const say = (stage: string, text: string) => console.log(`  ${stage.padEnd(12)} ${text}`);
const idOf = (file: string) => file.replace(/\.[^.]+$/, '');
const read = (path: string) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};
const listFiles = (dir: string, ext: RegExp) => {
  try {
    return readdirSync(dir).filter((f) => ext.test(f));
  } catch {
    return [];
  }
};
const run = (cmd: string, cmdArgs: string[]) => {
  const r = spawnSync(cmd, cmdArgs, {
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};
/** The last non-empty line, which is where these scripts put their summary. */
const lastLine = (out: string) => {
  const lines = out.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.length ? lines[lines.length - 1].trim() : '(no output)';
};

console.log('\nratings:sync\n');

// --- Who is collectible, at what tier ---------------------------------------------------
// The one source of truth for every step below: the dataset read through `tierOf`, exactly
// as the album, the generated catalogue and the checks read it.
type Card = {
  id: string;
  name: string;
  number: number;
  nation: string;
  year: number;
  rating: number;
  tier: StickerTier;
};
const cards = new Map<string, Card>();
for (const p of collectiblePlayers(ALL_PLAYERS)) {
  const tier = tierOf(p);
  const squad = SQUAD_BY_ID[p.squadId];
  if (!tier || !squad) continue;
  cards.set(p.id, {
    id: p.id,
    name: p.name,
    number: p.number,
    nation: squad.nation,
    year: squad.year,
    rating: p.elo,
    tier,
  });
}
const TIER_ORDER: StickerTier[] = ['monumental', 'iconic', 'legendary'];
const tierRank = (t: StickerTier) => TIER_ORDER.indexOf(t);

// --- 1. Retire art for anyone who has left the bands -----------------------------------
// The card goes (an orphan fails the checks and ships on every deploy); the original is
// ARCHIVED rather than deleted, because a rating can come back up and redrawing it cannot.
{
  const retired: string[] = [];
  for (const file of listFiles(OUT_DIR, /\.webp$/)) {
    if (cards.has(idOf(file))) continue;
    rmSync(join(OUT_DIR, file));
    retired.push(idOf(file));
  }
  const archived: string[] = [];
  for (const file of listFiles(SRC_DIR, /\.(png|jpe?g)$/i)) {
    if (cards.has(idOf(file))) continue;
    mkdirSync(ARCHIVE_DIR, { recursive: true });
    const target = join(ARCHIVE_DIR, file);
    if (existsSync(target)) {
      notes.push(`${SRC_DIR}/${file} left in place: ${target} already exists`);
      continue;
    }
    renameSync(join(SRC_DIR, file), target);
    archived.push(idOf(file));
  }
  if (retired.length || archived.length) {
    const parts = [
      retired.length ? `${retired.length} card${retired.length === 1 ? '' : 's'} removed` : '',
      archived.length ? `${archived.length} original${archived.length === 1 ? '' : 's'} archived` : '',
    ].filter(Boolean);
    say('retired', `${parts.join(', ')}: ${[...new Set([...retired, ...archived])].join(', ')}`);
  } else {
    say('retired', 'nothing to retire');
  }
}

// --- 2. Build any new artwork ----------------------------------------------------------
{
  const python = ['python', 'python3'].find((exe) => run(exe, ['--version']).code === 0);
  if (!python) {
    notes.push('artwork not built: no python on PATH (needs python + Pillow)');
    say('artwork', 'SKIPPED, no python on PATH');
  } else {
    const built = run(python, [ART_SCRIPT, ...(FORCE_ART ? ['--force'] : [])]);
    if (built.code !== 0) {
      notes.push(`artwork not built: ${lastLine(built.out)}`);
      say('artwork', `FAILED: ${lastLine(built.out)}`);
    } else {
      const summary = built.out.split(/\r?\n/).find((l) => l.includes('written'));
      say('artwork', (summary ?? lastLine(built.out)).trim());
    }
  }
}

// --- 3 and 5. The waiting list: prune what is settled, report what is not ---------------
const shipped = new Set(listFiles(OUT_DIR, /\.webp$/).map(idOf));
const missing = [...cards.keys()].filter((id) => !shipped.has(id));
const listed = new Set(
  (read(LIST_PATH) ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean),
);

const drawn = [...listed].filter((id) => shipped.has(id));
const gone = [...listed].filter((id) => !shipped.has(id) && !cards.has(id));
const keep = new Set([...listed].filter((id) => missing.includes(id)));

const acceptable = missing.filter((id) => !keep.has(id));
const accepted = acceptable.filter((id) => ACCEPT_ALL || ACCEPT.has(id));
for (const id of accepted) keep.add(id);
for (const id of ACCEPT) {
  if (!cards.has(id)) notes.push(`--accept=${id} ignored: not a collectible player`);
  else if (shipped.has(id)) notes.push(`--accept=${id} ignored: that card already has art`);
}
const pending = missing.filter((id) => !keep.has(id));

{
  const settled = [
    ...drawn.map((id) => `${id} (art arrived)`),
    ...gone.map((id) => `${id} (no longer collectible)`),
  ];
  const parts = [
    settled.length ? `pruned ${settled.length}: ${settled.join(', ')}` : '',
    accepted.length ? `accepted ${accepted.length}: ${accepted.join(', ')}` : '',
  ].filter(Boolean);
  say(
    'waiting list',
    `${keep.size} card${keep.size === 1 ? '' : 's'} to draw${parts.length ? ` - ${parts.join('; ')}` : ''}`,
  );
}

// Rewritten whole rather than patched, so the file cannot drift into a pile of appended
// lines: the ids are the author's, the grouping and the notes are this command's.
{
  const rows = [...keep]
    .map((id) => cards.get(id)!)
    .sort(
      (a, b) => a.year - b.year || tierRank(a.tier) - tierRank(b.tier) || b.rating - a.rating,
    );
  const today = new Date().toISOString().slice(0, 10);
  const out = [
    '# Sticker cards that are collectible and NOT DRAWN yet. One player id per line;',
    '# everything after a # is a comment.',
    '#',
    '# `npm run checks` fails on a collectible with no artwork unless it is listed here, and',
    '# fails on a line here that has since been settled - so the list shrinks as art arrives',
    '# and cannot quietly become permanent debt.',
    '#',
    '# Maintained by `npm run ratings:sync`, which prunes the settled lines and rewrites',
    '# these notes. It adds a card only when asked (--accept-all or --accept=<id>), because',
    '# shipping a card as a silhouette is a decision rather than a consequence.',
    '#',
    '# To draw one: save the full-size PNG as art/stickers-src/<id>.png (the id is the line',
    '# below) and run `npm run ratings:sync` again.',
    '#',
    `# ${rows.length} card${rows.length === 1 ? '' : 's'} of ${cards.size} collectibles, as of ${today}.`,
    '',
  ];
  let year = 0;
  for (const c of rows) {
    if (c.year !== year) {
      if (year) out.push('');
      out.push(`# ${c.year}`);
      year = c.year;
    }
    out.push(`${c.id.padEnd(14)} # ${c.name}, ${c.nation}, ${c.tier} ${c.rating}`);
  }
  out.push('');
  writeFileSync(LIST_PATH, out.join('\n'), 'utf8');
}

// --- 4. The generated files ------------------------------------------------------------
const before = { seed: read(SEED_PATH), index: read(INDEX_PATH) };
for (const [stage, script, path] of [
  ['catalogue', 'gen:collectibles', SEED_PATH],
  ['index', 'gen:players', INDEX_PATH],
] as const) {
  const r = run('npm', ['run', '--silent', script]);
  if (r.code !== 0) {
    notes.push(`npm run ${script} failed: ${lastLine(r.out)}`);
    say(stage, `FAILED: ${lastLine(r.out)}`);
    continue;
  }
  const moved = read(path) !== (path === SEED_PATH ? before.seed : before.index);
  const rowsLine = (read(path) ?? '').split(/\r?\n/).find((l) => l.startsWith('-- rows:'));
  const summary = path === SEED_PATH ? (rowsLine?.slice(3) ?? 'rewritten') : lastLine(r.out);
  say(stage, `${summary}${moved ? '  CHANGED' : '  unchanged'}`);
}

// The worklist spreadsheet is every card still to draw, listed or not, so it never reads as
// a shorter list than the album shows gaps for.
{
  const rows = missing
    .map((id) => cards.get(id)!)
    .sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || b.rating - a.rating || a.year - b.year);
  const commit = run('git', ['rev-parse', '--short', 'HEAD']).out.trim().split(/\r?\n/)[0] ?? '';
  // A spreadsheet is a zip of XML with timestamps in it, so writing an identical one still
  // produces a different file and a dirty tree on every run. The fingerprint of what the
  // sheet SAYS travels inside it, and the builder skips a write that would not change it.
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ cards: rows, accepted: [...keep].sort(), n: cards.size }))
    .digest('hex')
    .slice(0, 16);
  const handoff = join(tmpdir(), `wcsim-art-worklist-${process.pid}.json`);
  writeFileSync(
    handoff,
    JSON.stringify({
      generated: new Date().toISOString().slice(0, 10),
      commit,
      fingerprint,
      collectibles: cards.size,
      accepted: [...keep],
      cards: rows,
    }),
    'utf8',
  );
  const python = ['python', 'python3'].find((exe) => run(exe, ['--version']).code === 0);
  const r = python ? run(python, [WORKLIST_SCRIPT, handoff, WORKLIST_PATH]) : null;
  rmSync(handoff, { force: true });
  if (!r) say('worklist', 'SKIPPED, no python on PATH');
  else if (r.code !== 0) {
    notes.push(`${WORKLIST_PATH} not refreshed: ${lastLine(r.out)}`);
    say('worklist', `FAILED: ${lastLine(r.out)}`);
  } else say('worklist', lastLine(r.out));
}

// --- The one decision this command will not make for you -------------------------------
if (pending.length) {
  console.log(
    `\n  DECISION NEEDED - ${pending.length} collectible card${pending.length === 1 ? ' has' : 's have'} no artwork:`,
  );
  for (const id of pending) {
    const c = cards.get(id)!;
    console.log(
      `    ${id.padEnd(14)} ${c.name.padEnd(22)} ${String(c.rating).padStart(2)}  ${c.tier.padEnd(10)} ${c.nation} ${c.year}`,
    );
  }
  console.log(`  Draw them (save the PNG as ${SRC_DIR}/<id>.png and run this again), or ship`);
  console.log('  them as silhouettes for now with:  npm run ratings:sync -- --accept-all');
}

// --- The checks, which is what CI runs before it deploys -------------------------------
let checksFailed = false;
if (SKIP_CHECKS) {
  console.log('\n  checks skipped (--skip-checks); CI runs them before it deploys.');
} else {
  const r = run('npm', ['run', '--silent', 'checks']);
  checksFailed = r.code !== 0;
  const lines = r.out.split(/\r?\n/);
  const from = lines.findIndex((l) => l.includes('passed:'));
  console.log('');
  for (const line of from >= 0 ? lines.slice(from) : lines.slice(-12)) {
    if (line.trim()) console.log(`  ${line.trim()}`);
  }
}

// --- What is owed after this ------------------------------------------------------------
const seedMoved = read(SEED_PATH) !== before.seed;
console.log('');
if (notes.length) {
  for (const n of notes) console.log(`  note: ${n}`);
  console.log('');
}
if (seedMoved) {
  console.log('  The server\'s collectible catalogue changed. Run `npm run push:collectibles`');
  console.log('  (needs the LAN or the VPN) BEFORE pushing to main, or a player who banks one');
  console.log('  of the new cards has the whole run refused.');
} else {
  console.log('  The collectible catalogue did not change, so nothing is owed to the server.');
}
if (!checksFailed && !pending.length) console.log('  Everything else is in step: clear to commit and push.');
console.log('');

process.exit(checksFailed || pending.length ? 1 : 0);
