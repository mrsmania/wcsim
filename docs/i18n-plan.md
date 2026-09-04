# Making Mondialino multilingual

A plan, not a change. Nothing here is built. Written 2026-09-04, rewritten the same day
after a review that found nine factual errors in the first draft; the corrections are kept
in the text where they are load-bearing, because most of them were the first draft reading
`CLAUDE.md` where it should have read the code.

The shape: **one flat message catalogue per language, typed against the English one, and no
library.** Everything else is consequence.

---

## 0. The one thing the owner has to decide

**Which languages.** Recommendation: **English and German first, French and Italian after.**
Swiss domain, three national languages, English stays the source of truth either way.

The honest cost, up front: **the code is about a week and the German is the rest of it.**
Every decision below is aimed at making the second language expensive once and the third and
fourth nearly free, because that is the only part of this a plan can change.

One other decision is owed later, in wave 3, and section 8.1 states it.

---

## 1. What is being translated

Measured against `ec20975`.

| Where | How much |
| --- | --- |
| Screens (`src/components/**`, 70 files) | ~700 strings, mostly inline JSX |
| Challenges (`domain/challenges.ts`) | 130 names + 130 descriptions |
| Boosts (`domain/boons.ts`) | 33 names + descriptions |
| **`domain/pvpView.ts`** | ~90. The whole versus copy layer, 923 lines |
| Perks, Ascensions, badges (`career.ts`, `ascension.ts`, `badges.ts`) | ~50 |
| Referee refusals (`components/versus/refereeMessage.ts`) | ~40 |
| Chemistry categories, round names, style labels, tier names | ~30 |
| Nation names (`data/squads.ts`) | 87 distinct |
| `index.html` | the meta description, and `lang="en"` |

Call it **1,100 to 1,300 strings plus 87 nations.**

**`domain/pvpView.ts` is the one to notice.** A third of the copy in this game is not in
`components/` at all: `pvpView` holds the versus strings, the strength labels, the round
names and the relative-time sentences, and `challenges.ts`, `boons.ts`, `career.ts`,
`badges.ts`, `chemistry.ts` and `run.ts` all hold copy too. Any sweep that looks only at
`components/` goes green over an entirely English versus mode.

**Out of scope, permanently:** player names (a name is an identity here, `personId` is its
slug); position codes and formation names, which are international notation, though the
style labels beside them do translate; every design doc, `CLAUDE.md`, this file, commit
messages and the checks harness's own output, the repo's working language being English;
`docs/players.html` and `docs/missing-sticker-art.html`, which are generated developer
artifacts.

**Three things that look like problems and are not**, recorded so nobody has to check again:
**RTL** does not arise (en/de/fr/it are all left to right; Arabic is the trigger to revisit
2.1). **Fonts** are fine: `index.html` loads the three faces from Google Fonts with no subset
pinned, so latin-ext arrives by unicode-range and every accent in the four languages is
covered. **The account server and the referee need nothing** (section 6).

---

## 2. The mechanism

### 2.1 A flat catalogue per language, English is the source

```
src/i18n/
  en.ts    the catalogue, and the only place a new string is added
  de.ts    the same keys, German values
  index.ts t(), the plural helper, the Intl wrappers
```

`de.ts` is typed `Catalogue`, where `type Catalogue = typeof en`, so **a key missing from
German is a build error** rather than a silent fallback. `tsc -b` already runs on every
build and in CI, which is the whole argument for writing this by hand.

**Keys are flat and dotted, and the values carry no `as const`.** Both halves of that matter
at this size:

```ts
export const en = {
  'build.complete.eyebrow': 'Complete',
  'draft.rerollsLeft': { one: '{n} re-roll left', other: '{n} re-rolls left' },
};
```

Flat, because `t('a.b.c')` over a NESTED object needs a recursive template-literal path type,
and at ~1,200 leaves that is a known `tsc` blow-up: editor completion measured in seconds,
and every typo answered with `not assignable to '"a.b" | ... 1,198 more'`. A flat object
makes `keyof typeof en` a plain union, which is cheap and readable, and jump-to-definition
on a key works. No `as const`, because widening the values to `string` is exactly what lets
`de.ts` hold different text while still being forced to keep a plural key plural.

**No i18next, no react-intl, no ICU.** This repo has six runtime dependencies, no state
library and no test runner; ICU's plural machinery buys nothing for four one/other
languages; and 40 KB of message parser on the boot path is not what a bundle that lazy-loads
its auth client wants. **If a language with a real plural system ever lands, this is the
decision to revisit**, and 2.3 says what changes.

### 2.2 How a component reaches `t`

**`t` is a module-level function over a module-level `active` language, and `App` renders
its subtree under `key={settings.language}`.** Switching language remounts the tree.

This is the part the first draft got wrong, and the correction is the more interesting
answer. It claimed a `useT()` hook reading `useSettings`, which cannot work:
**`useSettings` is called exactly once, at `App.tsx:55`, and prop-drilled; there is no
`createContext` or `useContext` anywhere in `src/`.** Calling it again inside a hook would
mint a second, independent copy of the settings. A remount instead costs one attribute,
needs no context and no provider, keeps the "no state library" property that section 2.1
leans on, and is exactly right for a thing that changes twice in a lifetime.

**No JSX in the catalogue.** The pattern already everywhere is a sentence broken by markup
(`Formation <b>4-3-3</b>`). Split the label from the value, which is what most of those
already are; where a value genuinely sits mid-sentence, the whole sentence takes a `{n}`
placeholder and loses the bold. A `tx()` returning nodes would put a JSX-shaped thing in the
middle of a table a translator edits, which is how a translator breaks a screen.

### 2.3 Plurals

Around eighteen sites, of which eleven are `` `${n} re-roll${n === 1 ? '' : 's'}` `` and the
rest are not: whole phrases (`cupRun/BoostOffer.tsx:76`), noun swaps
(`CabinetScreen.tsx:393`, `SquadBrowser.tsx:157`) and hand-built relative time
(`pvpView.ts:378-381`, `:919-922`). All become `{ one, other }` entries and `t()` branches on
`n === 1`, which is the whole rule in all four languages.

**Two English-shaped helpers do not survive translation and are not plurals**:
`matchUi.tsx:336` builds `1st / 2nd / 3rd / Nth`, and the relative-time strings above.
Both need naming as work rather than being folded into "Intl formatting" in a closing pass.

### 2.4 Where the catalogue lands in the bundle

**One measurement is owed before this is settled.** `App.tsx:32-40` lazy-loads seven route
chunks, so today each route's copy rides inside its own chunk and costs nothing until you
navigate there. A single `en.ts` imported from everywhere pulls **all** of it, versus
included, onto the boot path. That may well be fine at ~20 KB gzipped for a pair of
languages, against a bundle already carrying a 9,625-row dataset. It is a decision to take
against a measured number, not against the first draft's assumption that splitting would
cost a round trip: there is no round trip today.

---

## 3. Vocabulary, and why there is no `glossary.ts`

The request was for a glossary. The first draft built one: a 60-term table, one row per
language, with a check reconciling it against the catalogue. **The review's argument for
deleting it is right and worth writing down, because it will be proposed again.**

Once `de.ts` exists, **it is the glossary.** The way to find how "boost" was rendered is to
grep `de.ts`, which is authoritative, properly inflected and cannot drift, because it is the
shipped copy. A separate table duplicates its English column, and then needs a check whose
only job is to keep the duplicate honest: a mechanism existing to serve another mechanism,
which is what this project's audit exists to remove. The first draft even conceded the point
by ruling out interpolating the glossary at runtime, which is correct (pasting a nominative
into the middle of a German sentence is exactly the machine-translation feel this is meant to
avoid) and which left it a document, and documents rot.

**What survives, and does the work the request actually wanted:**

- **A `term.*` block inside the catalogue** for the recurring nouns the game renders on their
  own: the six tab labels, the three sticker tiers, boost, perk, Prestige, Ascension, run,
  XI, re-roll, swap, chemistry, duel, room, seat. Real keys in the real catalogue, so
  coverage is checked for free and nothing can drift out of use.
- **A translator brief as a comment block at the top of `de.ts`**: the house rules ("rating"
  and never "elo", "boost" and never "boon", no em-dashes), the words to keep in English
  (Mondialino, Cup Run, Prestige), and the standing instruction in 7.2 about numbers.

The consistency the request was after comes from one person writing one file with that brief
in front of them, and from 5.2 catching the case where it slips. Not from a second table.

**One claim the first draft made here was simply false**, and it mattered: it said the
no-elo and no-boon rules are "already checked". They are not. The only checked house rule is
the em-dash sweep (`assets.ts:305`, plus a second pass over challenge copy at
`challenges.ts:58`). "Rating, never elo" is prose in `CLAUDE.md` and nothing enforces it. If
that rule is worth a check, it is worth one in English first, in its own commit, and it has
nothing to do with this.

---

## 4. Nations, and the two places translating them breaks something

`Squad.nation` is an English literal repeated per squad, and it is an id as much as a label.
**The dataset does not change.** A `nation.BRA` key block inside the catalogue holds the
names, generated for English from the dataset once and asserted against it, so a new
tournament bringing a new nation fails the build until it is named in every language. Period
identities keep period names: `URS` is Sowjetunion, not Russland; `ZAI` and `COD` stay two
entries.

**A display map alone is not enough, and this is the part a plan usually misses.** Two
domain modules key off the English literal:

- **Sorting.** `domain/market.ts:108` sorts the market's country facet by
  `a.nation.localeCompare(b.nation)`, and `domain/archive.ts:47,64` does the same for the
  squad browser. Translate only the display and the German list is alphabetised by its
  English names, with Deutschland filed between Ghana and Greece.
- **Searching.** `domain/market.ts:168` builds its haystack as
  `` `${name} ${sq.nation} ${code} ${year}` ``, and `archive.ts`'s `searchArchive` is the
  same shape. A German player typing "Brasilien" gets nothing.

Both fix the same way (sort and search the translated name, keep the code as the id), and
both are behavioural changes in `domain/`, which is where the checks are.

---

## 5. What `npm run checks` has to hold

Three, not six. The first draft proposed a check duplicating an existing check, a note
wearing a check's clothes, and one guarding the deleted glossary.

**5.1 The missing-key list.** Nominally the type system's job, and the reason to build it
anyway is the error message: when `de.ts` is short 400 keys, `tsc` reports three property
names and "397 more", once, on the object literal. That is 400 build-and-fix cycles. A check
that prints the whole list is what makes the type usable at this size. Vacuity guard: it has
to find more than a thousand keys.

**5.2 Placeholder parity.** Every locale's value carries the same `{tokens}` as English's, no
more and no fewer. **This is the one catching a failure nothing else can see** (a dropped
`{n}` is a sentence promising a number it never prints) and it should be the first thing
built.

**5.3 Nothing user-facing left behind**, sweeping `src/components/**` **and `src/domain/**`**
for string literals and JSX text that look like copy and are not a catalogue lookup. It
cannot be exact: an allowlist carries the genuine exceptions (section 7.1) and every entry
says why. Mutation-test it by putting one English sentence back.

**And an inventory of the checks that already read this copy**, which is owed by any wave
that turns a string into a key:

- **Three checks assert a number against the sentence promising it**, all in
  `scripts/checks/career.ts` (lines 159, 174/181, 406: the dollar ladder, Extra Choice and
  Deep Squad and Scout Network, the re-roll ordinal). They go red the moment perk
  descriptions become keys, and must be rewritten to look up `en[key]`. **They stay reading
  English**, because they assert arithmetic against a sentence and only one language can be
  the reference; 5.2 is what carries the guarantee to German. (`CLAUDE.md` says there are
  five of these and names the chemistry thresholds, the boot palette and the market's budget
  lookup. There are three: `chemistry.ts` and `market.ts` contain no such assertion, and the
  boot-palette check compares hex literals, not copy.)
- **`challenges.ts:58` goes VACUOUS rather than red**, which is worse. It asserts no em-dash
  in `c.name` and `c.description`; turn those into keys and it starts asserting, for ever and
  silently, that key strings contain no em-dashes. A check quietly becoming vacuous is this
  project's named first sin.

---

## 6. The server and the referee get nothing

**No route takes a language and none should.** The referee already answers in codes
(`already-in-a-room`, `room-full`) which `refereeMessage.ts` turns into sentences on the
client: the right seam, built for a different reason, and now one more catalogue block.
Display names, room codes and player names are not translated. The account server stores the
language only as a field inside the settings blob it already writes whole, and never reads
it.

So **no migration and no referee rebuild are owed**, which is unusual for a change this size
and is worth not throwing away.

**One rough edge in that seam.** `refereeMessage` also composes `` `Could not ${what}.` ``
(lines 148, 173) where `what` is an English verb phrase from the caller: `'save that name'`,
`'take a seat'`, `'do that'`, `'send a rematch'`, `'open a room'`, at five sites across four
files. German has no equivalent construction, so each becomes a whole sentence. Not
mechanical.

---

## 7. Choosing a language, and the things outside React

**7.1 The setting.** `Settings.language: 'en' | 'de'`, a control in the settings sheet beside
the theme toggle, persisted in `wcsim_settings_v1` for a guest and in the settings jsonb for
an account, so **no migration on either side**. It is a field of `Settings`, so `toStored`
carries it by construction. (The first draft warned about the trap that makes `watchedDuels`
a required parameter of `toStored`; that trap exists precisely because `watchedDuels` is
*not* part of `Settings`, so it does not apply here.)

The default is the browser's, once, on a first load with nothing stored, and after that it is
whatever the player set. A preference that re-guesses on a borrowed laptop is worse than one
occasionally wrong on the first visit.

**7.2 `<html lang>`.** `index.html:2` hardcodes `lang="en"`, and the pre-paint script a few
lines below stamps only the theme, so the boot cover paints under `lang="en"` whatever the
player chose. Stamp the language there too, from the same stored read. It is what tells a
screen reader which voice to use and a browser not to offer to translate a page that is
already translated. `index.html:6-9` also holds an English meta description.

**7.3 `UnreachableScreen` and `ErrorBoundary` stay English.** Both hand-write their markup on
purpose: the first renders before the app exists, the second has no imports beyond React so
that it renders when whatever it wraps has taken the app down. An error screen that throws
while looking up the word for "something went wrong" is the worst available outcome. They go
on 5.3's allowlist, and the note goes in their headers beside the one already there.

**7.4 The sign-in mail is bilingual, not translated.** `public/email/otp.html` deploys with
the site, but GoTrue picks a template by URL and has no idea who is signing in, and the
subject line and sender name are NAS settings rather than repo files. So: one mail, one code,
two short paragraphs. The rename already caught this file out once by leaving the NAS half
behind, so the subject line is part of the job or the job is not done.

---

## 8. Order of work

Five waves. Each builds, passes `npm run checks` and is pushed on its own, and each leaves
the app fully working in English, because the type system will not let German be half-written.

1. **The machinery, proved on one screen.** `src/i18n/`, `Settings.language`, the remount
   key, `<html lang>`, the plural helper, checks 5.1 and 5.2. First screen across is **the
   settings sheet itself**, because the control lives there: switching language in front of
   the words that just changed is the proof.
2. **The flat catalogues.** Challenges, boosts, perks, Ascensions, badges, chemistry
   categories, the referee's refusals. Mechanical, high volume, no layout risk, more than a
   third of the total, and it takes the three `career.ts` checks and `challenges.ts:58` with
   it. Doing it early is what makes the rest feel small.
3. **The screens a new player meets first.** Front page, build page, transfer market, the
   settings sheet's neighbours. This is the wave that meets 8.1 and 8.2.
4. **Everything else.** The run, career, honours, cabinet, album, squad browser, and versus
   as a unit (it moves through `pvpView` and `refereeMessage` rather than screen by screen).
   Nations land here too, with the sorting and searching in section 4.
5. **The closing pass.** `Intl` for numbers and dates, the ordinal and relative-time helpers
   from 2.3, check 5.3 with its allowlist (last, because it can only be honest once
   everything has moved), and the bilingual mail.

French and Italian, if they happen, are then one file each and no code changes at all.

---

## 9. The risks, in the order they will bite

**9.1 German is 20 to 35% longer, and this app is built out of narrow columns.** The
bracket's match boxes, the market rows, the perk tiles, the phone tab bar, the challenge
ledger's two-up rows. **Every wave has to be looked at in German at 360px**, not just built.
This is the real cost of waves 3 and 4 and it is not typing.

**9.2 The header needs its wrap breakpoint moved, and that is all.** The first draft called
this the headline risk on a misreading worth correcting, because the same misreading is one
sentence away in `CLAUDE.md`: the famous **six pixels** was the state *before* the tagline was
deleted, and deleting it bought **196px**, with another ~80px arriving when the shared minimum
tab width came off with the chip. So the row has roughly 190px of slack, and German's six
labels are about 70px wider than English's. What actually moves is the measured minimum, from
978px to about 1050, which is past the `max-[1040px]` wrap. Raise the breakpoint for every
language rather than branching on one, and remember Tailwind's max variant is strictly less
than what it is given.

**9.3 Sentences fragmented across markup.** The `Formation <b>4-3-3</b><br/>Style
<b>Balanced</b>` pattern is everywhere and German puts the verb somewhere else. 2.2's answer
covers it, but each one is a judgement rather than a substitution, which is why the string
count in section 1 undersells the work.

**9.4 A translation making a promise the code does not keep.** 5.2 plus the three `career.ts`
checks is the answer, and it holds only while every number in a sentence is a placeholder. **A
German sentence that spells a figure out in words is the failure none of this can catch**, so
it goes in the brief in section 3.
