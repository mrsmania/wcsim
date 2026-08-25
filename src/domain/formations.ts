import type { Position } from '../data/types';

export type Style = 'def' | 'bal' | 'off';
export const STYLES: readonly Style[] = ['def', 'bal', 'off'];
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
// This module used to run a whole lowercase parallel vocabulary - `CsvPos` plus `CSV_POS`
// (a clone of `Position`), a 12-entry `CODE_TO_POS` bridge, `Member.pos` beside
// `Member.matchPos`, `mem()`'s never-passed `label` parameter, and `RawStyle` plus
// `STYLE_FROM_RAW` (a second name for `Style`) - for a CSV it no longer reads: the data is
// the hardcoded array below, authored in uppercase. Everything keys on `Position` and
// `Style` directly now, which also removes the cast in `countPositions` (hygiene H71).
// The emitted `Slot.position` and `Slot.label` are unchanged.

interface Member {
    pos: Position;
    label: string;
}

function mem(pos: Position): Member {
    return { pos, label: pos };
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
    { baseY: 22, members: [mem('LW'), mem('ST'), mem('RW')] },
    { baseY: 36, members: [mem('AM')] },
    { baseY: 49, members: [mem('LM'), mem('CM'), mem('RM')] },
    { baseY: 62, members: [mem('DM')] },
    { baseY: 76, members: [mem('LB'), mem('CB'), mem('RB')] },
    { baseY: 94, fixed: true, members: [mem('GK')] },
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
const Y_NUDGE: Partial<Record<Position, number>> = {
    LB: -3,
    RB: -3,
    LM: -2,
    RM: -2,
    LW: 3,
    RW: 3,
};
// Gentle bow on central lines of three or more (the middle sits a touch deeper).
const CENTER_ARC = 2;

/** Which touchline a position belongs to (drives its x). */
const SIDE: Record<Position, 'L' | 'C' | 'R'> = {
    GK: 'C',
    LB: 'L',
    CB: 'C',
    RB: 'R',
    DM: 'C',
    LM: 'L',
    CM: 'C',
    RM: 'R',
    AM: 'C',
    LW: 'L',
    RW: 'R',
    ST: 'C',
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Lay out one band's members into slots at vertical line `bandY`: order them
 *  left -> centre -> right, bow central runs of 3+, spread rows with flanking
 *  wide roles evenly between the touchlines (central-only rows cluster around the
 *  middle), and apply each role's depth nudge. */
function placeRow(entries: Member[], bandY: number): Slot[] {
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

    const slots: Slot[] = [];
    const labelCount: Record<string, number> = {};
    for (const { m, x, dy } of placed) {
        labelCount[m.label] = (labelCount[m.label] ?? 0) + 1;
        slots.push({
            id: `${m.label}${labelCount[m.label]}`,
            position: m.pos,
            label: m.label,
            x: round1(x),
            y: round1(bandY + (Y_NUDGE[m.pos] ?? 0) + dy),
        });
    }
    return slots;
}

function buildFormation(
    name: string,
    style: Style,
    counts: Partial<Record<Position, number>>,
): Formation {
    const slots: Slot[] = [];
    for (const band of BANDS) {
        // Expand each member by its count.
        const entries: Member[] = [];
        for (const m of band.members) {
            for (let k = 0; k < (counts[m.pos] ?? 0); k++) entries.push(m);
        }
        if (entries.length === 0) continue;

        const bandY = band.fixed ? band.baseY : band.baseY + SHIFT[style];
        slots.push(...placeRow(entries, bandY));
    }
    return { name, style, slots };
}

/** The long style names `RAW_FORMATIONS` is authored with, mapped to `Style`. Kept because
 *  the rows read better spelled out; it is a labelling of `Style`, not a second type. */
const STYLE_FROM_RAW = {
    defensive: 'def',
    balanced: 'bal',
    offensive: 'off',
} as const satisfies Record<string, Style>;

// Hardcoded formations (mirrors public/formations/formations_summary.csv). Each
// row lists the 11 on-pitch roles; order is irrelevant since the layout is
// derived from role counts. Add a row to add a formation/style.
const RAW_FORMATIONS: [string, keyof typeof STYLE_FROM_RAW, Position[]][] = [
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

/** How many of each role a formation's eleven codes call for. The codes ARE `Position`s, so
 *  there is no lowercase bridge to cross and no cast to recover the key type. */
function countPositions(codes: Position[]): Partial<Record<Position, number>> {
    const counts: Partial<Record<Position, number>> = {};
    for (const pos of codes) counts[pos] = (counts[pos] ?? 0) + 1;
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

/** One formation by name + style, or null if that pairing does not exist.
 *
 *  Reads `FORMATIONS_DATA` directly. It used to take the data as a parameter and all three
 *  call sites passed this module's own singleton, so the parameter only ever had one value
 *  (hygiene H71). */
export function getFormation(name: FormationName, style: Style): Formation | null {
    return FORMATIONS_DATA.byKey[`${name}|${style}`] ?? null;
}

// ---------------------------------------------------------------------------
// Slot-to-slot assignment. Pure geometry over `Slot`, used by the board to slide its
// eleven circles to a new formation rather than having them appear and disappear.
//
// It lived in `Pitch.tsx` - 65 lines of min-cost matching inside the component that
// renders the result, which is the clearest case of logic in a leaf in the codebase
// (hygiene H59). Nothing here touches React, the DOM or a Player.
// ---------------------------------------------------------------------------

const slotDist = (a: Slot, b: Slot) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Hungarian algorithm: min-cost perfect assignment for a square cost matrix.
 *  Returns colForRow[i] = the column assigned to row i. */
function hungarian(cost: number[][]): number[] {
    const n = cost.length;
    const u = new Array(n + 1).fill(0);
    const v = new Array(n + 1).fill(0);
    const p = new Array(n + 1).fill(0); // p[col] = row matched to col
    const way = new Array(n + 1).fill(0);
    for (let i = 1; i <= n; i++) {
        p[0] = i;
        let j0 = 0;
        const minv = new Array(n + 1).fill(Infinity);
        const used = new Array(n + 1).fill(false);
        do {
            used[j0] = true;
            const i0 = p[j0];
            let delta = Infinity;
            let j1 = -1;
            for (let j = 1; j <= n; j++) {
                if (used[j]) continue;
                const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
                if (cur < minv[j]) {
                    minv[j] = cur;
                    way[j] = j0;
                }
                if (minv[j] < delta) {
                    delta = minv[j];
                    j1 = j;
                }
            }
            for (let j = 0; j <= n; j++) {
                if (used[j]) {
                    u[p[j]] += delta;
                    v[j] -= delta;
                } else {
                    minv[j] -= delta;
                }
            }
            j0 = j1;
        } while (p[j0] !== 0);
        do {
            const j1 = way[j0];
            p[j0] = p[j1];
            j0 = j1;
        } while (j0);
    }
    const colForRow = new Array(n).fill(0);
    for (let j = 1; j <= n; j++) colForRow[p[j] - 1] = j - 1;
    return colForRow;
}

/**
 * Reassign each existing circle (prev[k]) to a slot in `next` so total movement
 * is minimised (squared distance, which discourages long cross-pitch jumps), and
 * the 11 circles persist and slide to their closest new positions rather than
 * appearing/disappearing. Returns an array aligned to circle index k.
 */
export function assignNearest(prev: Slot[], next: Slot[]): Slot[] {
    const cost = prev.map((p) => next.map((q) => slotDist(p, q)));
    const colForRow = hungarian(cost);
    return prev.map((_, i) => next[colForRow[i]]);
}
