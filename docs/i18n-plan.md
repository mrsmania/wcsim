# Making Mondialino multilingual

A plan, not a change. Nothing here is built yet. Written 2026-09-04.

The shape of it: **one message catalogue per language, plus a glossary of the game's own
vocabulary that every catalogue is checked against.** The catalogue is the mechanism, the
glossary is the discipline. Neither is a library.

---

## 0. The one thing the owner has to decide

**Which languages.** Everything below is written so that adding the second language is the
expensive step and the third and fourth are cheap, but the LIST changes what the first wave
costs and it is not a technical call.

Recommendation: **English and German first, French and Italian after.** The site is on a
Swiss domain, the three of those are national languages, and English stays the source of
truth either way (see 2.1). If the answer is "English and German and stop", drop sections
9.3 and 9.4 and the plan gets about a third smaller.

Nothing else in this document needs an answer before work starts.

---

## 1. What is actually being translated

Measured against `ec20975`, not estimated.

| Where | Roughly how much | Notes |
| --- | --- | --- |
| Screens (`src/components/**`, 51 files) | ~700 strings | Mostly inline JSX, often one sentence split across `<br/>`, `<b>` and `{' '}` |
| The challenge catalogue (`domain/challenges.ts`) | 130 names + 130 descriptions | One flat table. The single biggest block, and the easiest |
| The boost catalogue (`domain/boons.ts`) | 32 names + 32 descriptions | Same shape |
| Perk shop, Ascension ladder, badges (`domain/career.ts`, `ascension.ts`, `badges.ts`) | ~50 | Several promise a number in the sentence, see 6.2 |
| Referee refusals (`components/versus/refereeMessage.ts`) | ~40 | Already a code to sentence map, so already the right shape |
| Chemistry categories, knockout round names, style labels, tier names | ~30 | Small enum label maps |
| Nation names (`data/squads.ts`) | ~90 distinct | See 4 |
| `index.html` boot cover | 1 (an aria-label) | See 8.1 |

Call it **1,100 to 1,300 strings** plus 90 nations. The dataset's 9,625 player rows are
NOT in that number and never will be (see 4).

**What is deliberately out of scope**, so nobody has to ask twice:

- **Player names.** They are identities (`personId` is the name slug); translating one
  splits a person in two.
- **`docs/players.html`, every design doc, this file, `CLAUDE.md`, commit messages.** The
  repo's working language is English and stays English.
- **Position codes (GK, LB, CB, ...) and formation names (4-3-3).** International notation.
  The STYLE labels beside them (Defensive / Balanced / Offensive) do translate.
- **The sign-in email** (`public/email/otp.html` plus the GoTrue subject and sender on the
  NAS). See 8.2.
- **Everything the referee and the account server store or send.** See 7.

---

## 2. The mechanism

### 2.1 One catalogue per language, English is the source

```
src/i18n/
  en.ts          the catalogue, and the ONLY place a new string is added
  de.ts          same keys, German values
  glossary.ts    the game's vocabulary, per language (section 3)
  nations.ts     FIFA code -> name, per language (section 4)
  index.ts       useT(), the plural helper, the Intl wrappers
```

`en.ts` exports a plain nested object of strings. `de.ts` is typed as
`Catalogue` where `type Catalogue = typeof en`, so **a key missing from German is a build
error**, not a runtime fallback to English. That is the whole reason to write this by hand
rather than reach for a library: `tsc -b` already runs on every build and in CI, and it is
a better guard than any lint rule a library ships with.

No i18next, no react-intl, no ICU. Three reasons, in order: this repo has no state library
and no test runner and does not want a third dependency of that class; ICU's plural
machinery buys nothing for English, German, French and Italian, all of which are
one/other (see 2.3); and a bundle that already lazy-loads its auth client is not going to
be happy about 40 KB of message parser on the boot path.

**If a fifth language with a real plural system ever lands (Polish, Russian, Arabic), this
decision is the one to revisit**, and 2.3 says exactly what would have to change.

### 2.2 Reading a string

```ts
const t = useT();
t('build.complete.eyebrow')            // 'Complete'
t('build.complete.drafted', { n: 11 }) // '11 of 11 drafted'
```

`useT` reads the active language off `useSettings` (section 5) and returns a bound
lookup. Placeholders are `{name}`, substituted by a five-line function. Interpolation
values are `string | number` only.

**Copy that wraps a value in markup does not go in the catalogue as markup.** The pattern
already in the tree is a sentence broken by `<b>`:

```tsx
Formation <b className="text-ink">{formation.name}</b>
```

Two ways out and the plan takes the second:

- `tx()` returning a `ReactNode[]`, so a placeholder can be given a node. Powerful, and it
  puts a JSX-shaped thing in the middle of a string table where a translator will break it.
- **Split the label from the value**, which is what most of these already are:
  `t('build.formationLabel')` then the bold value beside it. Where a sentence genuinely has
  a value in the middle of it, the whole sentence takes a `{n}` placeholder and loses the
  bold. There are fewer of these than it looks like, and every one of them reads fine
  unbolded.

So there is **no `tx`, and no JSX in the catalogue at all.** If a case turns up that
genuinely needs it, that is a decision to take then, on that case, in writing.

### 2.3 Plurals

There are **21 hand-rolled plurals** in the tree today, all of the shape
`` `${n} re-roll${n === 1 ? '' : 's'}` ``. They become:

```ts
'draft.rerollsLeft': { one: '{n} re-roll left', other: '{n} re-rolls left' },
```

and `t()` picks the branch off `n === 1`. English, German, French and Italian all agree
that this is the whole rule (French's "0 is singular" difference is not reachable here:
zero re-rolls is rendered by its own copy). A language with more forms would need
`Intl.PluralRules` and a wider value type, which is a change to two functions and every
plural entry, and is the price of the decision in 2.1.

### 2.4 What happens to a catalogue value at build time

Nothing clever. Both catalogues ship in the main bundle. `en.ts` plus `de.ts` at ~1,200
strings each is roughly 60 KB of source, well under 20 KB gzipped for the pair, against a
bundle that already carries a 9,625-row dataset. **Splitting them into lazy chunks is not
worth the flash of an untranslated screen**, and would put a network round trip on the boot
path that the boot cover exists to hide. If four languages measurably move the bundle,
lazy-load the non-active ones then, with a measurement, not now.

---

## 3. The glossary

This is the half the request was actually about, and it is not the same thing as the
catalogue.

`src/i18n/glossary.ts` holds **the game's own vocabulary, one entry per term, with the
agreed rendering in every language**:

```ts
export const GLOSSARY = {
  boost:      { en: 'boost',        de: 'Boost' },
  cupRun:     { en: 'Cup Run',      de: 'Cup Run' },
  rating:     { en: 'rating',       de: 'Bewertung' },
  prestige:   { en: 'Prestige',     de: 'Prestige' },
  xi:         { en: 'XI',           de: 'Elf' },
  drawnSquad: { en: 'drawn squad',  de: 'gezogener Kader' },
  ...
} as const;
```

Around 60 terms: boost, perk, Prestige, Ascension, Cup Run, run, XI, drawn squad, re-roll,
swap, transfer market, budget, rating, chemistry, sticker, album, duplicate, trade, cup,
group stage, knockout, bracket, honours, challenge, badge, trophy cabinet, room, duel,
seat, referee, window, pick, formation, style, and the six tab names.

It does three jobs, and only the first is obvious:

1. **Consistency.** One word for "boost" on all fourteen screens that mention one. Without
   this a second translator, or the same one six weeks later, invents a second word and the
   game reads as though two people wrote it.
2. **It carries the house rules into the other language.** The existing rules are already
   checked, not just written down: no "elo" (it is "rating"), no "boon" (it is "boost"),
   no em-dashes. Those are English-shaped rules and a German catalogue can break every one
   of them without a single check going red. The glossary is where the banned word gets its
   per-language partner, and 6.1 is the check.
3. **It is what a translator is handed.** The glossary plus the English catalogue is the
   whole brief. Nobody should have to read `CLAUDE.md` to learn that "boon" is not a word
   this game says out loud.

**The catalogue does not interpolate the glossary at runtime.** A German sentence needs the
term declined ("dem Boost", "der Boosts") and a lookup that pastes a nominative in the
middle of a sentence produces exactly the machine-translation feel this is meant to avoid.
The glossary is a **reference and a check**, and the catalogue writes the word out in full,
inflected properly, every time. That is the single most important line in this section.

---

## 4. Nation names

`Squad.nation` is an English literal repeated per squad (`squad('BRA', 'Brazil', 1970, ...)`).
It is an id as much as a label: `/squads` routes on the code, and the checks and the
dataset scans read it.

So: **the dataset does not change.** `src/i18n/nations.ts` is a `Record<Code, string>` per
language, ~90 entries, and every screen that prints a nation goes through it. English's map
is generated from the dataset once and asserted against it by the checks, so a new
tournament that brings a new nation fails the build until its name is added in every
language. That check is the whole reason to generate rather than hand-write the English half.

Period identities keep their period names: `URS` is "Soviet Union" / "Sowjetunion", not
"Russia". `ZAI` and `COD` stay two entries.

---

## 5. Choosing a language

`Settings.language: 'en' | 'de'`, alongside `theme` and `difficulty`:

- **A control in the settings sheet**, beside the theme toggle. It is the same shape as
  the theme control and belongs in the same sheet.
- **Persisted in the same row.** `wcsim_settings_v1` for a guest, and for an account it
  rides in the settings jsonb blob exactly as `watched` does, so **no migration** is
  needed on either side. Mind the trap that blob already carries: `toStored` writes the
  row whole, so a save that does not carry every field deletes the ones it dropped. The
  language field is required in `StoredSettings` for that reason, and the checks assert
  the round trip like they do for `poolYears` and `collapsedFamilies`.
- **The default is the browser's**, once, on the first load with nothing stored:
  `navigator.language.startsWith('de') ? 'de' : 'en'`. After that it is whatever the
  player set, forever, because a preference that re-guesses on a borrowed laptop is worse
  than one that is occasionally wrong on the first visit.
- **`useSettings` stamps `<html lang>`** the way it already stamps the theme. That is not
  decoration: it is what tells a screen reader which voice to use and a browser whether to
  offer a translation of a page that is already translated.

---

## 6. What `npm run checks` has to hold

The repo's standing rule is that a new check needs a vacuity guard and is worth
mutation-testing. Six new ones, in `scripts/checks/i18n.ts`, a module of its own so
`checks/meta.ts` sees it:

**6.1 Key coverage.** Every locale has every key. Mostly the type system's job, and the
check exists for keys built at runtime (a challenge id, a boost id, a refusal code) that
the type cannot see. Vacuity guard: the scan has to find more than a thousand keys.

**6.2 Placeholder parity.** Every locale's value for a key carries the same `{tokens}` as
English's, no more and no fewer. This is the check that catches the real failure mode:
a translator drops `{n}` and the sentence promises a number it never prints.

**6.3 The house rules, per language.** No em-dashes anywhere in any catalogue (the existing
sweep covers `src/`, so this is free once the catalogues live there). No banned term in any
language: "elo" in English, and each language's own version of the same rule, listed in the
glossary. Vacuity guard: the scan fails when it matches nothing, the way the audit's own
grep checks do.

**6.4 The copy-versus-number checks keep reading English, and that has to be stated.**
Five existing checks assert that a number and the sentence promising it agree (the perk
shop's dollar ladder, the extra re-roll's ordinal, the chemistry thresholds, the boot
palette, the market's budget lookup). They read the English catalogue and nothing else,
because they are asserting arithmetic against a sentence and only one language can be the
reference. 6.2 is what carries the guarantee across to German: if the English sentence
holds the right number and the German one has the same placeholder, the German sentence
holds it too. **That pairing is the load-bearing part of this whole section** and the
reason those five checks do not each need a German twin.

**6.5 Nothing user-facing left behind.** A sweep over `src/components/**` for string
literals and JSX text that look like copy and are not a catalogue lookup. It cannot be
exact and should not pretend to be: an allowlist carries the genuine exceptions
(`UnreachableScreen` and `ErrorBoundary`, see 8.1) and every entry on it says why.
Mutation-test it by putting one English sentence back into a component.

**6.6 The glossary covers itself.** Every glossary term has an entry in every language, and
the English side of each entry actually appears somewhere in the English catalogue. The
second half is what stops the glossary drifting into a list of words the game no longer
uses.

---

## 7. What the server and the referee must not learn

**Neither of them gets a language.** This is worth stating because the natural instinct is
to send one.

- The **referee already answers in codes** (`already-in-a-room`, `room-full`, `bad-room`)
  and `refereeMessage.ts` turns them into sentences on the client. That is exactly the
  right seam and it was built for a different reason. Translating is now one more catalogue
  block. **Do not add a `lang` parameter to any referee route.**
- **Display names, room codes and player names are not translated.** A name is a name.
- The **account server** stores the language only as a field inside the settings blob it
  already stores whole. It never reads it.

So the whole feature is client-side, and neither a migration nor a referee rebuild is owed.
That is unusual for a change this size and it is worth not throwing away.

---

## 8. The three things outside React

**8.1 `UnreachableScreen` and `ErrorBoundary`.** Both write their own markup by hand, on
purpose: the first renders before the app exists and the second has no imports beyond
React, so that it still renders when whatever it wraps has taken the app down. Importing a
catalogue into either would put the whole i18n module on those paths, and an error screen
that throws while looking up the word for "something went wrong" is the worst possible
outcome. **They stay English**, they go on the 6.5 allowlist, and the note in their headers
says so beside the note that is already there about the class strings.

**8.2 The sign-in email.** `public/email/otp.html` deploys with the site, but its subject
line and sender name are GoTrue settings on the NAS, and GoTrue picks a template by URL
with no idea who is signing in. Making it multilingual means either a language in the
sign-in request or a bilingual mail. **The plan is a bilingual mail**: the same code, the
same button, two short paragraphs. It costs one file, no server work, and it is what most
Swiss products do. Note the rename already caught this file out once by leaving the NAS
half behind, so the subject line is part of the job or it is not done.

**8.3 The boot cover** (`index.html`) carries the wordmark and one aria-label. The wordmark
is a name and does not translate. The aria-label can be left in English or set by the same
inline script that reads the stored theme, which already exists a few lines above it. Cheap
either way; not worth a decision.

---

## 9. Order of work

Each wave builds, passes `npm run checks` and is pushed on its own. **A wave leaves the app
fully working in English** even if German is half-written, because the type system will not
let German be half-written and the catalogue is where the incomplete state would have to be.

**Wave 1: the machinery, and one screen to prove it.**
`src/i18n/` with `en.ts`, `de.ts`, `glossary.ts`, `index.ts`; `Settings.language` and the
sheet control; `<html lang>`; the plural helper; checks 6.1, 6.2, 6.3 and 6.6. Move
**the settings sheet itself** across as the first screen, because it is where the control
lives, so switching language in front of the words that just changed is the proof.

**Wave 2: the flat catalogues.** Challenges (260 entries), boosts (64), perks, Ascensions,
badges, chemistry categories, the referee's refusals. Mechanical, high volume, no layout
risk, and it is more than a third of the total. Doing it early is what makes the later
waves feel small. `Challenge.name` and `.description` become keys rather than strings, and
the five checks in 6.4 go on reading English.

**Wave 3: the front page, the build page, the settings sheet's neighbours.** The first
screens a new player sees. This is the wave that meets the layout risk in section 10.

**Wave 4: the run.** Cup Run screen, boost offer, round review, the bracket, the group
table, match cards.

**Wave 5: career, honours, cabinet, album, squad browser.**

**Wave 6: versus.** Last on purpose: it is the largest surface, it is the one still being
played in by hand, and every string in it is already reached through `pvpView` or
`refereeMessage`, so it moves as a unit rather than screen by screen.

**Wave 7: nations, `Intl` number and date formatting, check 6.5 with its allowlist, and the
bilingual sign-in mail.** The closing pass. 6.5 comes last because it can only be honest
once everything else has moved.

French and Italian, if they happen, are then one file each plus a glossary column, and no
code changes at all. That is the payoff for the type-driven catalogue.

---

## 10. The risks, in the order they will actually bite

**10.1 The header does not fit German, and this is arithmetic rather than a worry.**
`CLAUDE.md` records it: the one-line header's tab row needs **581px** against **575px** of
spare width, and the tagline "Draft a random XI. Win the cup." was **deleted** to buy those
six pixels. Play / Career / Album / Records / Squads / Versus is 34 characters; Spielen /
Karriere / Album / Rekorde / Kader / Versus is 38, about 12% wider, call it 70px. **The
German header wraps to two lines at every width the English one fits on one.** So wave 3
owes a decision, and it is the owner's: shorter German labels (Spiel / Karriere / Album /
Rekorde / Kader / Duell), a lower wrap breakpoint for non-English, or the header simply
being two lines in German. None of the three is free and the plan does not pick one.

**10.2 German is 20 to 35% longer than English everywhere else too**, and this app is
built out of narrow columns: the bracket's match boxes, the market rows, the perk tiles,
the phone tab bar, the challenge ledger's two-up rows. **Every wave has to be looked at in
German at 360px**, not just built. Budget real time for it; this is the part that is not
typing.

**10.3 Sentences fragmented across markup.** The `Formation <b>4-3-3</b><br/>Style
<b>Balanced</b>` pattern is everywhere, and German puts the verb somewhere else. 2.2's
answer (label and value split, or one whole sentence with a placeholder and no bold) covers
it, but each one is a judgement rather than a substitution, which is why the string count
in section 1 undersells the work by a fair margin.

**10.4 A translation makes a promise the code does not keep.** The five copy-versus-number
checks exist because that has happened here before. 6.2 plus 6.4 is the answer and it holds
only while every number in a sentence is a placeholder. **A German sentence that spells out
a figure is the failure this cannot catch**, so it goes in the translator's brief.

**10.5 The glossary going stale.** It is a document, and documents drift. 6.6 is what stops
it, and it only works because it checks the English side against the English catalogue
rather than checking the glossary against itself.

---

## 11. What this costs, roughly

Wave 1 is a day of real thought and not much typing. Wave 2 is volume: 400-odd entries,
mechanical, and mostly a matter of writing good German rather than good code. Waves 3 to 6
are the long middle, and their cost is 10.2 rather than the strings. Wave 7 is a day.

The honest summary: **the code is a week and the German is the rest of it.** Every
technical decision above is aimed at making the second language expensive once and the
third and fourth nearly free, because that is the only part of this a plan can actually
change.
