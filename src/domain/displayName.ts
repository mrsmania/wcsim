// ---------------------------------------------------------------------------
// A name a stranger can be shown, and the rule that keeps two of them apart.
//
// Wave 3 of docs/pvp-plan.md, decision P22. Pure and framework-free, because BOTH sides
// need it and they must agree exactly: the client normalises before it offers a name, and
// the referee normalises again before it believes one. A rule enforced in one place only is
// a rule the other side can walk around.
//
// WHY UNIQUENESS IS ON A FOLDED KEY AND NOT ON THE TEXT. Migration 0016 put the unique
// index on `profiles.name_key` rather than on `display_name`, so this module owns what that
// key is. Without folding, `Mario`, `mario`, `Mario ` and `Mar io` all coexist and are
// indistinguishable at a glance in a lobby - which is the cheap grief in a game whose only
// moderation is the owner renaming an account by hand (P22 rules out a word filter).
//
// WHAT THE CODEPOINT SET IS ACTUALLY FOR, and it is not tidiness. Folding case and
// collapsing spaces cannot separate `Mario` from a Greek-omicron `Mariο`: they are
// different characters, so they fold to different keys and both are accepted. The only
// thing that stops that class of impersonation is refusing the second script outright, so
// the set here is **Latin script, marks and digits** plus a short punctuation list. Accents
// are in (this is a game about fourteen World Cups; refusing `Müller` would be absurd),
// whole other alphabets are out. That is a real cost - somebody who writes their name in
// Cyrillic cannot - and it is the trade P22's unique-and-readable name implies.
//
// It is the enforceable HALF, and the module says so rather than implying more: `rn` and
// `m` still look alike at 13px, and no rule short of a confusables table catches that.
// What answers the rest is the HOST, who can throw anybody out of their own room: the
// report-this-name button that used to be P22's answer went on 2026-09-02, because a queue
// only the owner ever read did nothing about the room you were sitting in at the time.
// ---------------------------------------------------------------------------

/** The length bounds, in codepoints of the normalised name rather than in UTF-16 units:
 *  an astral character is one character to a reader and two to `String.length`. */
export const NAME_MIN = 3;
export const NAME_MAX = 16;

/** Characters that are invisible, or that reorder what follows them. Stripped rather than
 *  refused, because a paste from a web page routinely carries one and the player cannot
 *  see what they would be being told off for. The bidi controls are the dangerous half:
 *  they can make a name RENDER as something other than what it is. */
const INVISIBLE =
  /[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/gu;

/** Anything that is not a printable character we allow, once the invisibles are gone.
 *  Control characters included: they are not whitespace and must not survive. */
const DISALLOWED = /[^\p{Script=Latin}\p{Mark}\p{Nd} \-_.']/gu;

/** Why a name was refused. A LIST, like `XiFault`, so a player is told everything wrong at
 *  once rather than discovering the second fault after fixing the first. */
export type NameFault = 'too-short' | 'too-long' | 'bad-character';

export interface NameVerdict {
  ok: boolean;
  /** The name as it will be STORED and shown - normalised, never the raw input. */
  name: string;
  /** The folded key uniqueness is judged on. Empty when the name is not ok. */
  key: string;
  faults: NameFault[];
  /** The characters that were refused, for a message that says which. Empty when none. */
  rejected: string[];
}

/**
 * The display form: what gets stored and shown.
 *
 * NFC first, because the same accented letter has two encodings and only one of them
 * matches the other side's key. Then the invisibles go, then every run of whitespace
 * becomes one plain space, then the ends are trimmed. The order is deliberate: stripping
 * the invisibles BEFORE collapsing whitespace means a zero-width space wedged between two
 * words leaves one ordinary space rather than a double one that then has to be cleaned up
 * again.
 */
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * The key uniqueness is judged on: the display form, folded.
 *
 * `toLowerCase` is an approximation of Unicode case folding and it is the right one here.
 * Full folding differs only in cases this codepoint set does not admit, and JavaScript has
 * no `toCaseFold`; what matters is that the client and the referee compute the SAME key,
 * which they do because they both call this function.
 */
export function nameKeyOf(raw: string): string {
  return normalizeName(raw).toLocaleLowerCase('en-US');
}

/** Codepoints, not UTF-16 units. */
function lengthOf(name: string): number {
  return [...name].length;
}

/**
 * Judge a name a player typed.
 *
 * Returns the normalised form whether or not it passed, so a caller can show what the name
 * would become - the difference between "that is not allowed" and "we would call you this".
 */
export function validateName(raw: string): NameVerdict {
  const name = normalizeName(raw);
  const faults: NameFault[] = [];
  const rejected = [...new Set(name.match(DISALLOWED) ?? [])];
  const n = lengthOf(name);
  if (n < NAME_MIN) faults.push('too-short');
  if (n > NAME_MAX) faults.push('too-long');
  if (rejected.length) faults.push('bad-character');
  return {
    ok: faults.length === 0,
    name,
    key: faults.length === 0 ? nameKeyOf(name) : '',
    faults,
    rejected,
  };
}

/** Three letters for the compact bracket cells. `pvpTeam` takes a `code` and deliberately
 *  does not derive one, because shortening a user-supplied name is a presentation decision
 *  with its own normalisation - this is that decision, in one place, so two screens cannot
 *  disagree about what a player is called in a tree. */
export function codeOf(name: string): string {
  const letters = [...normalizeName(name)].filter((c) => /[\p{Script=Latin}\p{Nd}]/u.test(c));
  return (letters.join('').slice(0, 3) || '???').toLocaleUpperCase('en-US');
}
