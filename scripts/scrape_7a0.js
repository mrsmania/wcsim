#!/usr/bin/env node
'use strict';

/*
 * scrape_7a0.js
 *
 * Scrape the 7a0.com.br World Cup archive (https://7a0.com.br/en/copas) into a
 * players CSV covering every edition from 1950 to 2026.
 *
 * The archive has three levels:
 *   1. index        /en/copas                -> list of editions (1950..2026)
 *   2. edition      /en/copas/{year}         -> list of teams
 *   3. team squad   /en/copas/{year}/{code}  -> players (number, name, position, rating)
 *
 * Dependency free. Needs Node 18+ (uses the built in fetch). Node 20+ recommended.
 *
 * Usage
 * -----
 *   node scrape_7a0.js                         # crawl everything -> ./out/players.csv
 *   node scrape_7a0.js --out ./data            # choose output directory
 *   node scrape_7a0.js --years 2018,2022,2026  # only these editions
 *   node scrape_7a0.js --concurrency 5         # parallel requests (default 5)
 *   node scrape_7a0.js --delay 200             # ms delay per request (default 0)
 *   node scrape_7a0.js --json                  # also write a nested JSON file
 *   node scrape_7a0.js --samples-dir ./samples # parse saved page files, no network
 *   node scrape_7a0.js --quiet
 *
 * Output (written to --out, default ./out)
 * ----------------------------------------
 *   players.csv  one row per player  (UTF-8 with BOM)
 *   teams.csv    one row per team    (UTF-8 with BOM)
 *   wc_7a0.json  nested structure    (only with --json)
 *
 * players.csv columns:
 *   year, team, team_code, shirt_number, player, position, position_group,
 *   rating, is_legend
 */

import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://7a0.com.br';
const INDEX_PATH = '/en/copas';
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Position vocabulary.
//
// Player entries render as a single run of text with no reliable separators,
// e.g. "6Alex SandroLeft-back78". We peel off the leading shirt number and the
// trailing rating, then split the remaining "name+position" run by matching a
// known position as a suffix. Longest match first so a short label
// ("Midfielder") never steals a match from a longer one
// ("Defensive midfielder").
//
// The site uses one modern taxonomy across all eras. Extra historical labels
// are included defensively. Unknown positions are reported, never dropped, so
// this list can be extended if a future page adds a new one.
// ---------------------------------------------------------------------------
const POSITIONS = [
    'Goalkeeper',
    'Sweeper',
    'Centre-back',
    'Right-back',
    'Left-back',
    'Full-back',
    'Right wing-back',
    'Left wing-back',
    'Wing-back',
    'Defender',
    'Defensive midfielder',
    'Central midfielder',
    'Centre midfielder',
    'Box-to-box midfielder',
    'Attacking midfielder',
    'Right midfielder',
    'Left midfielder',
    'Midfielder',
    'Right winger',
    'Left winger',
    'Winger',
    'Second striker',
    'Centre-forward',
    'Striker',
    'Forward',
    'Inside forward',
];
const POSITIONS_BY_LEN = Array.from(new Set(POSITIONS)).sort((a, b) => b.length - a.length);

const GROUP_HEADERS = {
    goalkeepers: 'Goalkeepers',
    goalkeeper: 'Goalkeepers',
    goalkeeping: 'Goalkeepers',
    defence: 'Defence',
    defense: 'Defence',
    defenders: 'Defence',
    midfield: 'Midfield',
    midfielders: 'Midfield',
    attack: 'Attack',
    attackers: 'Attack',
    forwards: 'Attack',
};

// Markers that indicate the squad listing has ended.
const END_MARKERS = [
    /the\s+legends/i,
    /in\s+other\s+world\s+cups/i,
    /the\s+other\s+teams/i,
    /^\W*the\s+\d{4}\s+world\s+cup/i,
];

const INLINE_TAGS = new Set([
    'a',
    'span',
    'b',
    'strong',
    'em',
    'i',
    'sup',
    'sub',
    'small',
    'u',
    'mark',
]);
const BLOCK_TAGS = new Set([
    'li',
    'ul',
    'ol',
    'p',
    'div',
    'section',
    'article',
    'header',
    'footer',
    'nav',
    'main',
    'br',
    'tr',
    'td',
    'th',
    'table',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'figure',
    'figcaption',
]);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(quiet, ...args) {
    if (!quiet) process.stderr.write(args.join(' ') + '\n');
}

// ---------------------------------------------------------------------------
// Networking
// ---------------------------------------------------------------------------
async function fetchText(url, { retries = 3, timeoutMs = 30000, delay = 0 } = {}) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            if (delay) await sleep(delay);
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), timeoutMs);
            let res;
            try {
                res = await fetch(url, {
                    headers: { 'User-Agent': USER_AGENT },
                    signal: ctrl.signal,
                });
            } finally {
                clearTimeout(timer);
            }
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await res.text();
        } catch (err) {
            lastErr = err;
            await sleep(attempt * 1000);
        }
    }
    throw new Error('failed to fetch ' + url + ': ' + lastErr);
}

// Simple bounded-concurrency map.
async function runPool(items, concurrency, worker) {
    const results = new Array(items.length);
    let next = 0;
    async function runner() {
        while (true) {
            const i = next++;
            if (i >= items.length) return;
            results[i] = await worker(items[i], i);
        }
    }
    const runners = [];
    for (let i = 0; i < Math.max(1, concurrency); i++) runners.push(runner());
    await Promise.all(runners);
    return results;
}

// ---------------------------------------------------------------------------
// HTML -> text
//
// Rebuilds a plain-text version where block elements become line breaks and
// inline elements are concatenated. This keeps each player entry on its own
// line with number/name/position/rating adjacent, the same shape the parser
// was validated against.
// ---------------------------------------------------------------------------
function htmlToText(html) {
    html = html.replace(/<(script|style|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    html = html.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, ' ');

    const text = html.replace(/<\s*(\/?)\s*([a-zA-Z0-9]+)[^>]*>/g, (m, slash, tag) => {
        const t = tag.toLowerCase();
        if (BLOCK_TAGS.has(t)) return '\n';
        if (INLINE_TAGS.has(t)) return '';
        return '\n';
    });

    const unescaped = unescapeEntities(text);
    const lines = unescaped
        .split('\n')
        .map((ln) => ln.replace(/[ \t\u00a0]+/g, ' ').trim())
        .filter((ln) => ln.length > 0);
    return lines.join('\n');
}

function unescapeEntities(s) {
    const named = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        nbsp: ' ',
        ndash: '\u2013',
        mdash: '\u2014',
        hellip: '\u2026',
        middot: '\u00b7',
        aacute: 'á',
        eacute: 'é',
        iacute: 'í',
        oacute: 'ó',
        uacute: 'ú',
        ntilde: 'ñ',
        ccedil: 'ç',
        uuml: 'ü',
        ouml: 'ö',
        auml: 'ä',
    };
    return s
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
        .replace(/&([a-zA-Z]+);/g, (m, name) =>
            Object.prototype.hasOwnProperty.call(named, name) ? named[name] : m,
        );
}

// ---------------------------------------------------------------------------
// Parsing a single player line
// ---------------------------------------------------------------------------
const NUM_RE = /^\s*[-*\u2022]?\s*(\d{1,3})\s*/;
const RATING_RE = /(\d{1,3})\s*$/;
const TRIM_DASHES = /^[\s\-\u2013\u2014]+|[\s\-\u2013\u2014]+$/g;

function parsePlayerLine(line, group) {
    const s = line.trim();
    const nm = NUM_RE.exec(s);
    if (!nm) return null;
    const number = parseInt(nm[1], 10);
    const rest = s.slice(nm[0].length);

    const rm = RATING_RE.exec(rest);
    if (!rm) return null;
    const rating = parseInt(rm[1], 10);
    let middle = rest.slice(0, rm.index);

    const star = middle.includes('\u2605') || middle.includes('*');
    middle = middle
        .replace(/\u2605/g, '')
        .replace(/\*/g, '')
        .trim();
    middle = middle.replace(TRIM_DASHES, '').trim();

    let name = null;
    let position = null;
    for (const pos of POSITIONS_BY_LEN) {
        if (middle.endsWith(pos)) {
            position = pos;
            name = middle.slice(0, middle.length - pos.length).trim();
            break;
        }
        if (middle.toLowerCase().endsWith(pos.toLowerCase())) {
            position = pos;
            name = middle.slice(0, middle.length - pos.length).trim();
            break;
        }
    }

    if (position === null) {
        return { _unparsed: true, number, rating, middle };
    }

    name = name.replace(TRIM_DASHES, '').trim();
    if (!name) return { _unparsed: true, number, rating, middle };

    return {
        shirt_number: number,
        name,
        position,
        position_group: group,
        rating,
        is_legend: star,
    };
}

// ---------------------------------------------------------------------------
// Parsing a full team page
// ---------------------------------------------------------------------------
const META_SQUAD_RE = /gathers\s+(\d+)\s+players/i;
const META_LEGENDS_RE = /(\d+)\s+of\s+them\s+marked\s+as\s+legends/i;
const META_LEGENDS_ALT_RE = /(\d+)\s+legends/i;
const META_AVG_RE = /average\s+rating\s+of\s+(\d+)/i;
const META_AVG_ALT_RE = /average\s+rating\s+(\d+)/i;
const TITLE_LINE_RE = /^(.+?)\s+at the\s+(\d{4})\s+World Cup$/i;
const LEGEND_NAME_RE = /^(.+?)\s*(?:[\u2014\u2013]|,\s*rating)/i;

function findSquadBounds(lines) {
    let start = null;
    for (let i = 0; i < lines.length; i++) {
        if (/the\s+squad/i.test(lines[i]) && lines[i].length < 40) {
            start = i + 1;
            break;
        }
    }
    if (start === null) start = 0;
    let end = lines.length;
    for (let i = start; i < lines.length; i++) {
        if (END_MARKERS.some((mk) => mk.test(lines[i]))) {
            end = i;
            break;
        }
    }
    return [start, end];
}

function parseLegends(lines) {
    const names = new Set();
    let start = null;
    for (let i = 0; i < lines.length; i++) {
        if (/the\s+legends/i.test(lines[i]) && lines[i].length < 40) {
            start = i + 1;
            break;
        }
    }
    if (start === null) return names;
    for (let i = start; i < lines.length; i++) {
        const ln = lines[i];
        if (/in\s+other\s+world\s+cups|the\s+other\s+teams/i.test(ln)) break;
        if (/^\W*the\s+\d{4}\s+world\s+cup/i.test(ln)) break;
        const stripped = ln
            .replace(/^[\s\-*\u2022]+/, '')
            .replace(/\*/g, '')
            .trim();
        const m = LEGEND_NAME_RE.exec(stripped);
        if (m) {
            const nm = m[1].trim();
            if (nm) names.add(nm);
        }
    }
    return names;
}

function firstInt(text, re) {
    const m = re.exec(text);
    return m ? parseInt(m[1], 10) : null;
}

function parseTeamPage(text, { year = null, code = null, url = null } = {}) {
    const lines = text.split('\n');

    let name = null;
    for (const ln of lines) {
        const t = ln.trim().replace(/^[#>*\s]+/, '');
        const m = TITLE_LINE_RE.exec(t);
        if (m) {
            name = m[1].trim();
            if (year === null) year = parseInt(m[2], 10);
            break;
        }
    }

    const squadSize = firstInt(text, META_SQUAD_RE);
    let legendsReported = firstInt(text, META_LEGENDS_RE);
    if (legendsReported === null) legendsReported = firstInt(text, META_LEGENDS_ALT_RE);
    let avg = firstInt(text, META_AVG_RE);
    if (avg === null) avg = firstInt(text, META_AVG_ALT_RE);

    const legendNames = parseLegends(lines);

    const [start, end] = findSquadBounds(lines);
    let group = null;
    const players = [];
    const unparsed = [];
    for (let i = start; i < end; i++) {
        const raw = lines[i];
        const low = raw
            .trim()
            .toLowerCase()
            .replace(/:$/, '')
            .replace(/^#+\s*/, '');
        if (Object.prototype.hasOwnProperty.call(GROUP_HEADERS, low)) {
            group = GROUP_HEADERS[low];
            continue;
        }
        const rec = parsePlayerLine(raw, group);
        if (rec === null) continue;
        if (rec._unparsed) {
            unparsed.push(raw.trim());
            continue;
        }
        if (legendNames.has(rec.name)) rec.is_legend = true;
        players.push(rec);
    }

    return {
        year,
        name,
        code,
        url,
        avg_rating_reported: avg,
        squad_size_reported: squadSize,
        legends_reported: legendsReported,
        legend_names: Array.from(legendNames).sort(),
        players,
        unparsed_lines: unparsed,
    };
}

function reportTeam(team, quiet) {
    const n = team.players.length;
    const exp = team.squad_size_reported;
    let flag = '';
    if (exp !== null && n !== exp) flag = `  [WARN parsed ${n} != reported ${exp}]`;
    if (team.unparsed_lines.length) {
        flag += `  [UNPARSED: ${team.unparsed_lines.join(' | ')}]`;
    }
    const label = (team.name || team.code || '?').padEnd(14);
    log(quiet, `      ${label} ${String(n).padStart(2)} players${flag}`);
}

// ---------------------------------------------------------------------------
// Crawl
// ---------------------------------------------------------------------------
const EDITION_HREF_RE = /href="(\/en\/copas\/(\d{4}))"/g;
const TEAM_HREF_RE = /href="(\/en\/copas\/\d{4}\/([a-z]{2,4}))"/g;

function uniqueMatches(re, html, groupIndex) {
    const seen = new Set();
    const out = [];
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(html)) !== null) {
        const v = m[groupIndex];
        if (!seen.has(v)) {
            seen.add(v);
            out.push(v);
        }
    }
    return out;
}

async function crawl({ outDir, delay, concurrency, years, json, quiet }) {
    log(quiet, 'Fetching index:', BASE + INDEX_PATH);
    const indexHtml = await fetchText(BASE + INDEX_PATH, { delay });
    let editions = uniqueMatches(EDITION_HREF_RE, indexHtml, 2)
        .map((y) => parseInt(y, 10))
        .sort((a, b) => a - b);
    if (years && years.length) editions = editions.filter((y) => years.includes(y));
    log(quiet, 'Editions found:', editions.join(', '));

    const allEditions = [];
    for (const year of editions) {
        const eurl = `${BASE}/en/copas/${year}`;
        log(quiet, '  Edition', year, eurl);
        const ehtml = await fetchText(eurl, { delay });
        const codes = uniqueMatches(TEAM_HREF_RE, ehtml, 2);
        log(quiet, '    teams:', codes.length, codes.join(' '));

        const teams = await runPool(codes, concurrency, async (code) => {
            const turl = `${BASE}/en/copas/${year}/${code}`;
            const html = await fetchText(turl, { delay });
            const team = parseTeamPage(htmlToText(html), { year, code, url: turl });
            reportTeam(team, quiet);
            return team;
        });

        allEditions.push({ year, url: eurl, teams });
    }

    writeOutputs(allEditions, outDir, json);
    return allEditions;
}

function parseSamples({ samplesDir, outDir, json, quiet }) {
    const files = fs
        .readdirSync(samplesDir)
        .filter((f) => /\.(md|txt|html?|)$/i.test(f) && /\.(md|txt|html?)$/i.test(f))
        .sort();
    const byYear = new Map();
    for (const fn of files) {
        let content = fs.readFileSync(path.join(samplesDir, fn), 'utf8');
        if (/\.html?$/i.test(fn)) content = htmlToText(content);
        const m = /^(\d{4})[_-]([a-z]{2,4})/i.exec(fn);
        const year = m ? parseInt(m[1], 10) : null;
        const code = m ? m[2].toLowerCase() : path.parse(fn).name;
        const team = parseTeamPage(content, { year, code, url: null });
        reportTeam(team, quiet);
        const key = team.year;
        if (!byYear.has(key)) byYear.set(key, []);
        byYear.get(key).push(team);
    }
    const allEditions = Array.from(byYear.keys())
        .sort((a, b) => a - b)
        .map((y) => ({ year: y, url: `${BASE}/en/copas/${y}`, teams: byYear.get(y) }));
    writeOutputs(allEditions, outDir, json);
    return allEditions;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
function writeOutputs(allEditions, outDir, json) {
    fs.mkdirSync(outDir, { recursive: true });

    const playerRows = [];
    const teamRows = [];
    for (const ed of allEditions) {
        for (const t of ed.teams) {
            const legendsParsed = t.players.filter((p) => p.is_legend).length;
            teamRows.push([
                t.year,
                t.name,
                t.code,
                t.squad_size_reported,
                t.players.length,
                t.legends_reported,
                legendsParsed,
                t.avg_rating_reported,
            ]);
            for (const p of t.players) {
                playerRows.push([
                    t.year,
                    t.name,
                    t.code,
                    p.shirt_number,
                    p.name,
                    p.position,
                    p.position_group,
                    p.rating,
                    p.is_legend,
                ]);
            }
        }
    }

    writeCsv(
        path.join(outDir, 'players.csv'),
        [
            'year',
            'team',
            'team_code',
            'shirt_number',
            'player',
            'position',
            'position_group',
            'rating',
            'is_legend',
        ],
        playerRows,
    );
    writeCsv(
        path.join(outDir, 'teams.csv'),
        [
            'year',
            'team',
            'team_code',
            'squad_size_reported',
            'players_parsed',
            'legends_reported',
            'legends_parsed',
            'avg_rating_reported',
        ],
        teamRows,
    );

    if (json) {
        const payload = {
            source: BASE + INDEX_PATH,
            scraped_at: new Date().toISOString(),
            edition_count: allEditions.length,
            player_count: playerRows.length,
            editions: allEditions.map((ed) => ({
                year: ed.year,
                url: ed.url,
                teams: ed.teams.map((t) => ({
                    name: t.name,
                    code: t.code,
                    url: t.url,
                    avg_rating: t.avg_rating_reported,
                    squad_size: t.squad_size_reported,
                    legends: t.legend_names,
                    players: t.players.map((p) => ({
                        shirt_number: p.shirt_number,
                        name: p.name,
                        position: p.position,
                        position_group: p.position_group,
                        rating: p.rating,
                        is_legend: p.is_legend,
                    })),
                })),
            })),
        };
        fs.writeFileSync(
            path.join(outDir, 'wc_7a0.json'),
            JSON.stringify(payload, null, 2),
            'utf8',
        );
    }

    process.stdout.write(
        `Wrote ${playerRows.length} players across ${teamRows.length} teams in ` +
            `${allEditions.length} editions to ${outDir}\n`,
    );
}

function csvField(value) {
    if (value === null || value === undefined) return '';
    let s = String(value);
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
}

function writeCsv(filePath, headers, rows) {
    const lines = [headers.map(csvField).join(',')];
    for (const row of rows) lines.push(row.map(csvField).join(','));
    // UTF-8 BOM so spreadsheet apps read accented names correctly.
    const content = '\uFEFF' + lines.join('\r\n') + '\r\n';
    fs.writeFileSync(filePath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// Optional: print the top N players per edition to the console.
// ---------------------------------------------------------------------------
function printTopPlayers(allEditions, n) {
    for (const ed of allEditions) {
        const all = [];
        for (const t of ed.teams) {
            for (const p of t.players) all.push({ ...p, team: t.name });
        }
        all.sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
        process.stdout.write(`\nTop ${n} - ${ed.year}\n`);
        all.slice(0, n).forEach((p, i) => {
            const star = p.is_legend ? ' *' : '';
            process.stdout.write(
                `${String(i + 1).padStart(2)}. ${p.rating}  ` +
                    `${p.name.padEnd(22)} ${(p.team || '').padEnd(14)} ${p.position}${star}\n`,
            );
        });
    }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
    const args = {
        out: './out',
        delay: 0,
        concurrency: 5,
        years: null,
        samplesDir: null,
        json: false,
        quiet: false,
        top: 0,
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--out') args.out = argv[++i];
        else if (a === '--delay') args.delay = parseInt(argv[++i], 10) || 0;
        else if (a === '--concurrency') args.concurrency = parseInt(argv[++i], 10) || 1;
        else if (a === '--years')
            args.years = argv[++i]
                .split(',')
                .map((y) => parseInt(y.trim(), 10))
                .filter(Boolean);
        else if (a === '--samples-dir') args.samplesDir = argv[++i];
        else if (a === '--json') args.json = true;
        else if (a === '--top') args.top = parseInt(argv[++i], 10) || 0;
        else if (a === '--quiet') args.quiet = true;
        else if (a === '--help' || a === '-h') {
            process.stdout.write('See the header comment in this file for usage.\n');
            process.exit(0);
        }
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    let editions;
    if (args.samplesDir) {
        editions = parseSamples({
            samplesDir: args.samplesDir,
            outDir: args.out,
            json: args.json,
            quiet: args.quiet,
        });
    } else {
        editions = await crawl({
            outDir: args.out,
            delay: args.delay,
            concurrency: args.concurrency,
            years: args.years,
            json: args.json,
            quiet: args.quiet,
        });
    }
    if (args.top > 0) printTopPlayers(editions, args.top);
}

main().catch((err) => {
    process.stderr.write('Error: ' + (err && err.stack ? err.stack : err) + '\n');
    process.exit(1);
});
