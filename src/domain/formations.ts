import type { Position } from '../data/types';

export type Style = 'def' | 'bal' | 'off';
export const STYLES: Style[] = ['def', 'bal', 'off'];
export const STYLE_LABEL: Record<Style, string> = {
    def: 'Defensive',
    bal: 'Balanced',
    off: 'Offensive',
};

/** Formation names come from the CSV, so this is just a string. */
export type FormationName = string;

export interface Slot {
    id: string;
    /** Role used to match players (one of the 10 player positions). */
    position: Position;
    /** Display label shown on the pitch, e.g. 'DM' or 'AM'. */
    label: string;
    /** 0 (left) - 100 (right). */
    x: number;
    /** 0 (opponent goal / top) - 100 (own goal / bottom). */
    y: number;
}

export interface Formation {
    name: FormationName;
    style: Style;
    slots: Slot[];
}

export interface FormationsData {
    /** Unique formation names, in CSV order. */
    names: FormationName[];
    /** `${name}|${style}` -> Formation. */
    byKey: Record<string, Formation>;
    /** Styles available per formation name. */
    stylesByName: Record<string, Style[]>;
}

// CSV position columns. dm/cm/am are distinct central-midfield roles, each
// rendering in its own band (dm deeper, am more advanced).
type CsvPos = 'gk' | 'lb' | 'cb' | 'rb' | 'dm' | 'lm' | 'cm' | 'rm' | 'am' | 'lw' | 'rw' | 'st';
const CSV_POS: CsvPos[] = ['gk', 'lb', 'cb', 'rb', 'dm', 'lm', 'cm', 'rm', 'am', 'lw', 'rw', 'st'];

interface Member {
    pos: CsvPos;
    matchPos: Position;
    label: string;
}

function mem(pos: CsvPos, matchPos: Position, label?: string): Member {
    return { pos, matchPos, label: label ?? matchPos };
}

interface Band {
    baseY: number;
    /** GK stays put; outfield bands shift with the style. */
    fixed?: boolean;
    /** Members in left -> centre -> right order. */
    members: Member[];
}

// Bands ordered front (forwards) to back (keeper). baseY is the balanced
// placement; def/off shift outfield bands deeper / more advanced up the pitch.
// The bands are spread on an even ~14-unit pitch so adjacent rows never overlap
// (a badge is taller than a 12-unit gap), with the striker pushed higher and the
// keeper deeper.
const BANDS: Band[] = [
    { baseY: 22, members: [mem('lw', 'LW'), mem('st', 'ST'), mem('rw', 'RW')] },
    { baseY: 36, members: [mem('am', 'AM')] },
    { baseY: 49, members: [mem('lm', 'LM'), mem('cm', 'CM'), mem('rm', 'RM')] },
    { baseY: 62, members: [mem('dm', 'DM')] },
    { baseY: 76, members: [mem('lb', 'LB'), mem('cb', 'CB'), mem('rb', 'RB')] },
    { baseY: 94, fixed: true, members: [mem('gk', 'GK')] },
];

/** Vertical shift per style: defensive sits deeper (higher y), offensive higher up. */
const SHIFT: Record<Style, number> = { def: 2, bal: 0, off: -2 };

// --- Horizontal layout (0 = left touchline, 100 = right). EDIT THESE to move
// players sideways. A line with flanking wide roles (lb/lm/lw and rb/rm/rw) is
// spread evenly between the touchline anchors, so a back 5 or a five-man midfield
// gets equal gaps; a purely central line fans out around the middle CENTER_GAP
// apart. ---
const LEFT_WIDE = 10; // x for the leftmost wide role
const RIGHT_WIDE = 90; // x for the rightmost wide role
const CENTER_GAP = 25; // spacing between adjacent players in a purely central line

// Per-role depth nudge relative to the band line: negative = more advanced
// (toward the opponent goal), positive = deeper. Staggers each line so it is
// not dead straight (full-backs ahead of centre-backs, wingers behind the
// striker, wide mids edging forward, etc.). EDIT to taste.
const Y_NUDGE: Partial<Record<CsvPos, number>> = {
    lb: -3,
    rb: -3,
    lm: -2,
    rm: -2,
    lw: 3,
    rw: 3,
};
// Gentle bow on central lines of three or more (the middle sits a touch deeper).
const CENTER_ARC = 2;

/** Which touchline a position belongs to (drives its x). */
const SIDE: Record<CsvPos, 'L' | 'C' | 'R'> = {
    gk: 'C',
    lb: 'L',
    cb: 'C',
    rb: 'R',
    dm: 'C',
    lm: 'L',
    cm: 'C',
    rm: 'R',
    am: 'C',
    lw: 'L',
    rw: 'R',
    st: 'C',
};

const round1 = (n: number) => Math.round(n * 10) / 10;

function buildFormation(name: string, style: Style, counts: Record<CsvPos, number>): Formation {
    const slots: Slot[] = [];
    for (const band of BANDS) {
        // Expand each member by its count.
        const entries: Member[] = [];
        for (const m of band.members) {
            for (let k = 0; k < (counts[m.pos] ?? 0); k++) entries.push(m);
        }
        if (entries.length === 0) continue;

        const bandY = band.fixed ? band.baseY : band.baseY + SHIFT[style];
        const lefts = entries.filter((m) => SIDE[m.pos] === 'L');
        const centers = entries.filter((m) => SIDE[m.pos] === 'C');
        const rights = entries.filter((m) => SIDE[m.pos] === 'R');

        // Bow only kicks in for central lines of 3+ (0 at the ends, max in the middle).
        const arc = (k: number, n: number) =>
            n >= 3 ? CENTER_ARC * (1 - (2 * Math.abs(k - (n - 1) / 2)) / (n - 1)) : 0;

        // Left -> centre -> right order, tagged with the vertical bow on central runs.
        const ordered: { m: Member; dy: number }[] = [
            ...lefts.map((m) => ({ m, dy: 0 })),
            ...centers.map((m, k) => ({ m, dy: arc(k, centers.length) })),
            ...rights.map((m) => ({ m, dy: 0 })),
        ];
        const rowLen = ordered.length;
        const hasWide = lefts.length > 0 || rights.length > 0;
        // With flanking wide players, spread the whole row evenly between the touchline
        // anchors so the outer gaps match the inner ones (a back 5, a five-man
        // midfield); a purely central line clusters around the middle.
        const placed = ordered.map((e, i) => ({
            m: e.m,
            x:
                hasWide && rowLen > 1
                    ? LEFT_WIDE + ((RIGHT_WIDE - LEFT_WIDE) * i) / (rowLen - 1)
                    : 50 + (i - (rowLen - 1) / 2) * CENTER_GAP,
            dy: e.dy,
        }));

        const labelCount: Record<string, number> = {};
        for (const { m, x, dy } of placed) {
            labelCount[m.label] = (labelCount[m.label] ?? 0) + 1;
            slots.push({
                id: `${m.label}${labelCount[m.label]}`,
                position: m.matchPos,
                label: m.label,
                x: round1(x),
                y: round1(bandY + (Y_NUDGE[m.pos] ?? 0) + dy),
            });
        }
    }
    return { name, style, slots };
}

// Map the role codes used in RAW_FORMATIONS to internal roles.
const CODE_TO_POS: Record<string, CsvPos> = {
    GK: 'gk',
    LB: 'lb',
    CB: 'cb',
    RB: 'rb',
    DM: 'dm',
    LM: 'lm',
    CM: 'cm',
    RM: 'rm',
    AM: 'am',
    LW: 'lw',
    RW: 'rw',
    ST: 'st',
};

type RawStyle = 'defensive' | 'balanced' | 'offensive';
const STYLE_FROM_RAW: Record<RawStyle, Style> = {
    defensive: 'def',
    balanced: 'bal',
    offensive: 'off',
};

// Hardcoded formations (mirrors public/formations/formations_summary.csv). Each
// row lists the 11 on-pitch roles; order is irrelevant since the layout is
// derived from role counts. Add a row to add a formation/style.
const RAW_FORMATIONS: [string, RawStyle, string[]][] = [
    ['5-3-2', 'defensive', ['GK', 'LB', 'CB', 'CB', 'CB', 'RB', 'DM', 'CM', 'DM', 'ST', 'ST']],
    ['5-3-2', 'balanced', ['GK', 'LB', 'CB', 'CB', 'CB', 'RB', 'CM', 'DM', 'CM', 'ST', 'ST']],
    ['5-3-2', 'offensive', ['GK', 'LB', 'CB', 'CB', 'CB', 'RB', 'CM', 'AM', 'CM', 'ST', 'ST']],
    ['4-5-1', 'defensive', ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'DM', 'CM', 'RM', 'ST']],
    ['4-5-1', 'balanced', ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'CM', 'RM', 'ST']],
    ['4-5-1', 'offensive', ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'DM', 'CM', 'AM', 'AM', 'ST']],
    ['4-4-2', 'defensive', ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'DM', 'DM', 'RM', 'ST', 'ST']],
    ['4-4-2', 'balanced', ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST']],
    ['4-4-2', 'offensive', ['GK', 'LB', 'CB', 'CB', 'RB', 'DM', 'CM', 'CM', 'AM', 'ST', 'ST']],
    ['4-2-3-1', 'defensive', ['GK', 'LB', 'CB', 'CB', 'RB', 'DM', 'DM', 'LM', 'CM', 'RM', 'ST']],
    ['4-2-3-1', 'balanced', ['GK', 'LB', 'CB', 'CB', 'RB', 'DM', 'DM', 'AM', 'LW', 'RW', 'ST']],
    ['4-2-3-1', 'offensive', ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'AM', 'AM', 'AM', 'ST']],
    ['4-3-3', 'defensive', ['GK', 'LB', 'CB', 'CB', 'RB', 'DM', 'CM', 'DM', 'LW', 'ST', 'RW']],
    ['4-3-3', 'balanced', ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'DM', 'CM', 'LW', 'ST', 'RW']],
    ['4-3-3', 'offensive', ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'AM', 'CM', 'LW', 'ST', 'RW']],
    ['3-4-3', 'defensive', ['GK', 'CB', 'CB', 'CB', 'LM', 'DM', 'CM', 'RM', 'LW', 'ST', 'RW']],
    ['3-4-3', 'balanced', ['GK', 'CB', 'CB', 'CB', 'LM', 'CM', 'CM', 'RM', 'LW', 'ST', 'RW']],
    ['3-4-3', 'offensive', ['GK', 'CB', 'CB', 'CB', 'LM', 'CM', 'AM', 'RM', 'LW', 'ST', 'RW']],
    ['3-5-2', 'defensive', ['GK', 'CB', 'CB', 'CB', 'LM', 'DM', 'CM', 'DM', 'RM', 'ST', 'ST']],
    ['3-5-2', 'balanced', ['GK', 'CB', 'CB', 'CB', 'LM', 'DM', 'CM', 'CM', 'RM', 'ST', 'ST']],
    ['3-5-2', 'offensive', ['GK', 'CB', 'CB', 'CB', 'LM', 'CM', 'AM', 'CM', 'RM', 'ST', 'ST']],
    ['4-2-4', 'defensive', ['GK', 'LB', 'CB', 'CB', 'RB', 'DM', 'DM', 'LW', 'ST', 'ST', 'RW']],
    ['4-2-4', 'balanced', ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'LW', 'ST', 'ST', 'RW']],
    ['4-2-4', 'offensive', ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'AM', 'LW', 'ST', 'ST', 'RW']],
];

function countPositions(codes: string[]): Record<CsvPos, number> {
    const counts = Object.fromEntries(CSV_POS.map((p) => [p, 0])) as Record<CsvPos, number>;
    for (const code of codes) {
        const pos = CODE_TO_POS[code.toUpperCase()];
        if (pos) counts[pos] += 1;
    }
    return counts;
}

/** All formations, built once at module load from the hardcoded list above. */
export const FORMATIONS_DATA: FormationsData = (() => {
    const data: FormationsData = { names: [], byKey: {}, stylesByName: {} };
    for (const [name, rawStyle, codes] of RAW_FORMATIONS) {
        const style = STYLE_FROM_RAW[rawStyle];
        data.byKey[`${name}|${style}`] = buildFormation(name, style, countPositions(codes));
        if (!data.names.includes(name)) data.names.push(name);
        (data.stylesByName[name] ??= []).push(style);
    }
    return data;
})();

export function getFormation(
    data: FormationsData,
    name: FormationName,
    style: Style,
): Formation | null {
    return data.byKey[`${name}|${style}`] ?? null;
}
