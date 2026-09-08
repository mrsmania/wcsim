# Making Mondialino multilingual

A plan, not a change. Nothing here is built. Written 2026-09-08, rewritten twice the same
day: once after a review found nine factual errors, and again when the language list grew
from six locales to fourteen, which turned three of this document's stated non-issues into
real work and made one large piece of it nearly free.

The shape, unchanged through both: **one flat message catalogue per locale, typed against
English, and no library.** Everything else is consequence.

---

## 0. The language list, and what it costs

**Settled 2026-09-08. Fourteen locales, ten languages:**

| Wave | Locales |
| --- | --- |
| First | `en`, `de` |
| Then | `fr`, `it`, `pt-PT`, `pt-BR`, `es-ES`, `es-MX`, `es-AR` |
| Then | `zh-Hans`, `ja`, `id`, `tr` |
| Last, and only if it is done properly | `ar` |

**This is no longer a code change with translation attached.** Fourteen locales times ~1,200
strings is **around 17,000 strings**, and nobody is ever going to hand-verify all of them.
That single fact is what the rest of this document is now organised around: the machinery
below is not there to make translating pleasant, it is the only thing standing between
"fourteen languages" and "twelve broken ones". The checks in section 6 are the deliverable
as much as the catalogue is.

The realistic route for the long tail is machine translation reviewed by a speaker, per
locale, and the checks are what make that safe rather than reckless. English and German are
worth writing by hand.

**Two things still want the owner, and neither blocks a start.**

**0.1 Arabic is a commitment, not a checkbox.** It is the only right-to-left locale in the
list, and section 5 is what it actually costs: ~124 direction-sensitive utilities to swap,
a decision each about the pitch and the bracket, and a real rendering bug in the app's
letter-spacing. Shipping it half-done is worse than not shipping it, because a mirrored
layout that is 90% mirrored reads as broken rather than as foreign. **The honest options are
do it properly as its own wave, or leave it off the list.** It is last for that reason.

**0.2 `es-MX` is the thinnest file in the list.** `es-AR` earns its own outright:
Argentina uses **voseo**, so every imperative in the game differs (`elegí` / `poné` / `mirá`
against `elige` / `pon` / `mira`), and this app is built out of imperatives. `es-MX` against
`es-ES` is vocabulary and `ustedes`, which is real but thinner. It is kept because it was
asked for and because the file costs an afternoon once `es-ES` exists; if the list is ever
trimmed, it is the first candidate.

---

## 1. What is being translated

Measured against `f461000`.

| Where | How much |
| --- | --- |
| Screens (`src/components/**`, 70 files) | ~700 strings, mostly inline JSX |
| Challenges (`domain/challenges.ts`) | 130 names + 130 descriptions |
| Boosts (`domain/boons.ts`) | 33 names + descriptions |
| **`domain/pvpView.ts`** | ~90. The whole versus copy layer, 923 lines |
| Perks, Ascensions, badges | ~50 |
| Referee refusals (`components/versus/refereeMessage.ts`) | ~40 |
| Chemistry categories, round names, style labels, tier names | ~30 |
| Nation names | 87 distinct, of which **82 come free**, see section 4 |
| `index.html` | the meta description, and `lang="en"` |

**~1,200 strings a locale, ~17,000 in total.**

**`domain/pvpView.ts` is the one to notice.** A third of the copy in this game is not in
`components/` at all: it holds the versus strings, the strength labels, the round names and
the relative-time sentences, with more in `challenges.ts`, `boons.ts`, `career.ts`,
`badges.ts` and `run.ts`. A sweep that looks only at `components/` goes green over an
entirely English versus mode.

**Out of scope, permanently:** player names (a name is an identity here, `personId` is its
slug); position codes and formation names, which are international notation, though the
style labels beside them do translate; every design doc, `CLAUDE.md`, this file, commit
messages and the checks harness's own output; `docs/players.html` and
`docs/missing-sticker-art.html`, which are generated developer artifacts.

---

## 2. The mechanism

### 2.1 A flat catalogue per locale, English is the source

```
src/i18n/
  en.ts     the catalogue, and the only place a new string is added
  de.ts     the same keys, German values
  ...       twelve more, one file each
  index.ts  t(), the plural helper, the Intl wrappers
```

Each locale is typed `Catalogue`, where `type Catalogue = typeof en`, so **a key missing
from a locale is a build error** rather than a silent fallback. `tsc -b` already runs on
every build and in CI, which is the whole argument for writing this by hand. At fourteen
locales it is also the only argument that matters: a fallback to English would mean twelve
locales quietly shipping half-translated for months.

**Keys are flat and dotted, and the values carry no `as const`.** Flat, because `t('a.b.c')`
over a NESTED object needs a recursive template-literal path type, and at ~1,200 leaves that
is a known `tsc` blow-up: editor completion measured in seconds, and every typo answered
with `not assignable to '"a.b" | ... 1,198 more'`. A flat object makes `keyof typeof en` a
plain union, which is cheap and readable. No `as const`, because widening the values to
`string` is exactly what lets a translation hold different text while still being forced to
keep a plural key plural.

**Still no i18next, no react-intl, no ICU, and the fourteen-locale list makes that case
stronger rather than weaker.** Everything the long list needs is already in the browser:
`Intl.PluralRules` (section 2.3), `Intl.DisplayNames` (section 4), `Intl.Collator` and
`localeCompare` (section 4), `Intl.NumberFormat` and `Intl.DateTimeFormat`. **The rule is
that this code calls `Intl` and never re-implements it**, which is where the first draft was
wrong: it hand-rolled a plural rule that is wrong in eight of the fourteen.

### 2.2 How a component reaches `t`

**`t` is a module-level function over a module-level `active` locale, and `App` renders its
subtree under `key={settings.language}`.** Switching locale remounts the tree.

`useSettings` is called exactly once, at `App.tsx:55`, and prop-drilled; there is no
`createContext` or `useContext` anywhere in `src/`, so a `useT()` hook reading it would mint
a second, independent copy of the settings. A remount costs one attribute, needs no context
and no provider, keeps the "no state library" property section 2.1 leans on, and is exactly
right for a thing that changes twice in a lifetime. It also gives the RTL and font switches
in section 5 a clean moment to happen in.

**No JSX in the catalogue.** The pattern already everywhere is a sentence broken by markup
(`Formation <b>4-3-3</b>`). Split the label from the value; where a value genuinely sits
mid-sentence, the whole sentence takes a `{n}` placeholder and loses the bold. A `tx()`
returning nodes would put a JSX-shaped thing in the middle of a table a translator edits.

### 2.3 Plurals go through `Intl.PluralRules`, and the hand-rolled rule is wrong in eight
### of fourteen

The first draft said "`n === 1` is the whole rule in all four languages". With fourteen
locales that is false, and measured rather than assumed:

| Locale | Categories it uses |
| --- | --- |
| `en`, `de`, `tr` | one, other |
| `fr`, `it`, `pt-PT`, `pt-BR`, `es-*` | one, other, **many** |
| `zh-Hans`, `ja`, `id` | **other only** |
| `ar` | **zero, one, two, few, many, other** |

Three things in that table are traps:

- **Arabic has six forms**, and they are all reachable: 0 is `zero`, 1 `one`, 2 `two`, 3
  `few`, 11 `many`, 100 `other`. Every one of those numbers appears in this game.
- **French and Portuguese count zero as `one`** (`0 point`, `0 ponto`) where Spanish and
  Italian count it as `other`. So `n === 1` is wrong for French at zero, which is a state
  this app shows constantly (no re-rolls left, no duplicates, no cups).
- **The Romance `many` only fires from 1,000,000**, which this game never reaches. It is a
  category the locale declares and can never display here.

So a plural value is `{ other: string }` plus whichever other categories the locale needs,
declared through a small `p()` wrapper so the type widens to `Plural` rather than to the
English shape, and `t()` selects with `new Intl.PluralRules(active).select(n)`. **Requiring
every locale to fill every category it declares would demand dead entries** (Romance `many`),
and **letting any category fall back to `other` silently** is the failure this whole design
exists to prevent. Check 6.3 resolves it: assert each locale supplies exactly the categories
`Intl.PluralRules` can actually return for the range of numbers this game produces.

**Two English-shaped helpers are not plurals and do not survive translation either**:
`matchUi.tsx:336` builds `1st / 2nd / 3rd / Nth`, and `pvpView.ts:378-381` and `:919-922`
hand-build relative time. Both need naming as work rather than folding into a closing pass.

### 2.4 Fourteen locales settle the bundle question: the split is mandatory

`App.tsx:32-40` lazy-loads seven route chunks, so today each route's copy rides inside its
own chunk and costs nothing until you navigate there. A catalogue imported from everywhere
pulls all of it onto the boot path. At two locales that is perhaps 20 KB gzipped and
arguable. **At fourteen it is not arguable**: thirteen of them are dead weight for any given
player, and Arabic and CJK bring fonts with them (5.3).

So: **eager `en`, every other locale a dynamic import resolved before the first render.**
`main.tsx` already awaits the stored read before rendering, so there is a place to put the
wait and the boot cover already exists to hide it. What must NOT happen is the split
arriving as a fallback to English for a chunk that has not loaded, which is the silent
half-translated screen the type system exists to make impossible: the import is awaited, or
the render does not happen.

Wave 1 may ship eager and measure. The split lands with whichever locale is third.

---

## 3. Vocabulary, and why there is no `glossary.ts`

The request that started this asked for a glossary, and the first draft built one: a 60-term
table, one row per language, with a check reconciling it against the catalogue. **The
argument for deleting it holds, and is written down because it will be proposed again.**

Once a locale file exists, **it is the glossary.** The way to find how "boost" was rendered
in German is to grep `de.ts`, which is authoritative, properly inflected and cannot drift,
because it is the shipped copy. A separate table duplicates its English column and then needs
a check whose only job is keeping the duplicate honest: a mechanism serving a mechanism.
Interpolating a glossary at runtime is worse still, since pasting a nominative into the
middle of a German sentence, or an unsuffixed proper noun into a Turkish one (5.4), is
exactly the machine-translation feel this is meant to avoid.

**What survives, and does the work the request actually wanted:**

- **A `term.*` block inside the catalogue** for the recurring nouns the game renders on their
  own: the six tab labels, the three sticker tiers, boost, perk, Prestige, Ascension, run,
  XI, re-roll, swap, chemistry, duel, room, seat. Real keys in the real catalogue, so
  coverage is checked for free and nothing drifts out of use.
- **A translator brief as a comment block at the top of each locale file**, and at fourteen
  locales this is the piece that matters most, because it is the only instruction most
  translators will ever get. It carries: the house rules ("rating" and never "elo", "boost"
  and never "boon", no em-dashes), the words that stay English (Mondialino, Cup Run,
  Prestige), the standing instruction that **a number in a sentence must stay a placeholder
  and must never be spelled out in words** (10.4), and for the three Spanish and two
  Portuguese files, the one line saying which variety this file is and what it must not
  borrow from its sibling.

**One claim the first draft made here was false and matters more at fourteen locales**: it
said the no-elo and no-boon rules are "already checked". They are not. The only checked house
rule is the em-dash sweep (`assets.ts:305`, plus a pass over challenge copy at
`challenges.ts:58`). "Rating, never elo" is prose in `CLAUDE.md` and nothing enforces it.

---

## 4. Nations: 82 of 87 come free, and the other 5 are silently wrong

**This is the one place the long list made the job smaller.** `Intl.DisplayNames` ships
every country name in every locale, from the browser's own CLDR data. Verified on all
fourteen:

```
BR   Brazil / Brasilien / Brésil / Brasile / Brasil / 巴西 / ブラジル / البرازيل
KR   South Korea / Südkorea / Corée du Sud / 韩国 / 韓国 / Güney Kore / كوريا الجنوبية
```

It even splits the locales correctly without being asked: `es-AR` answers **Costa de
Marfil** where `es-ES` and `es-MX` answer **Côte d'Ivoire**, and `pt-BR` answers **Costa do
Marfim** where `pt-PT` answers **Côte d'Ivoire (Costa do Marfim)**. That is evidence the
locale split is not cosmetic, arriving for nothing.

So: **a FIFA-code to ISO-code map, written once (87 entries), and `Intl.DisplayNames` for the
rest.** That replaces what would have been 1,218 hand-written nation names with 87 lines and
no translation work at all.

**The five historical nations do not come free, and the danger is that they answer anyway.**
Measured:

| Dataset | `Intl.DisplayNames` says | Should say |
| --- | --- | --- |
| `URS` Soviet Union | **Russia** | Soviet Union |
| `YUG` Yugoslavia | **Serbia** | Yugoslavia |
| `TCH` Czechoslovakia | **Serbia** | Czechoslovakia |
| `ZAI` Zaire | **Congo - Kinshasa** | Zaire |
| `GDR` East Germany | **Germany** | East Germany |

Not an error, not a blank: a confident wrong answer, in fourteen locales at once, of exactly
the kind this project's audit exists to catch. `TCH` answering "Serbia" would also collide
with a real nation already in the dataset. **So the five are hand-written overrides, checked
to exist in every locale, and the check must assert the override is USED rather than merely
present** (that is its vacuity guard). Five terms times fourteen is seventy strings, which
is the whole hand-written nation cost.

**And a display map alone is still not enough.** Two domain modules key off the English
literal:

- **Sorting.** `domain/market.ts:108` sorts the market's country facet by
  `a.nation.localeCompare(b.nation)`, and `domain/archive.ts:47,64` does the same. Translate
  only the display and the German list is alphabetised by its English names. **The locale
  has to be passed**: `localeCompare(b, active)`. Measured, it is not cosmetic. Chinese
  without it sorts by codepoint (`巴西, 德国, 阿根廷, 韩国`) and with it by pinyin
  (`阿根廷, 巴西, 德国, 韩国`); Turkish without it files `İtalya` wrongly against `Isviçre`.
- **Searching.** `domain/market.ts:168` builds its haystack as
  `` `${name} ${sq.nation} ${code} ${year}` ``, and `archive.ts`'s `searchArchive` is the
  same shape. A German player typing "Brasilien" gets nothing, and a Japanese player typing
  ブラジル gets nothing. Search the translated name **and** keep the English one and the code
  in the haystack, so a player who knows the FIFA code or the English name is never worse off.

---

## 5. Script and direction: the part the short list did not have

The six-locale plan recorded RTL and fonts as non-issues. Adding Arabic, Chinese, Japanese
and Turkish makes all of that wrong. This section is the honest cost of those four.

### 5.1 Arabic is right-to-left, and it is its own wave

Stamp `dir` alongside `lang` (section 8.1) and then deal with what does not mirror by itself.
Counted in `src/`:

- **~124 direction-sensitive Tailwind utilities**: 45 `ml-`/`mr-`/`pl-`/`pr-`, 41
  `text-left`/`text-right`, 23 `left-`/`right-`, 15 `border-l`/`border-r`. Tailwind v4 has
  the logical equivalents (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`,
  `text-end`, `border-s`, `border-e`), so this is a mechanical sweep, and one that leaves
  every other locale byte-identical. **`dist/assets/*.css` should be checked for exactly
  that**, the way the wave-3 token migration proved itself.
- **`shadow-hard`, 17 uses.** The signature hard offset shadow falls to one side; in a
  mirrored layout it should fall to the other. It is a token in `index.css`, so it is one
  logical variant rather than 17 edits.
- **The pitch does NOT mirror, and this is the interesting one.** `Pitch.tsx` draws a
  top-down board where the left-back stands on the left. That is a fact about football, not
  about reading order, and mirroring it would put the LB on the right for Arabic players and
  be simply wrong. The board subtree gets an explicit `dir="ltr"` and a comment saying why.
- **The bracket DOES mirror.** A knockout tree is a reading-order diagram flowing toward the
  final, so in Arabic it should flow right to left. But its `bkt-` CSS positions the
  connectors off each match box with `::after`, which `CLAUDE.md` already warns is fragile,
  so this is real work. **If it is not done, the tree takes `dir="ltr"` as a stated
  exception rather than being left half-mirrored.**
- **Meters and the pick clock fill from the start edge** and must mirror with it.

**None of this is hard; all of it is a sweep, and half-doing it is the failure mode.** Hence
0.1 and hence Arabic being last.

### 5.2 The app's letter-spacing breaks Arabic, and that is a rendering bug rather than a
### matter of taste

Arabic is cursive: its letters join. **`letter-spacing` pulls those joins apart**, and this
app uses `tracking-` **124 times**, including on the mono captions that are its signature
(`tracking-[0.18em]` on every eyebrow). Left alone, every caption in the Arabic build renders
as disconnected letterforms, which to an Arabic reader looks like a font that has failed.

The fix is a rule zeroing `letter-spacing` under `[lang="ar"]` in `index.css`, and the reason
it goes in the stylesheet rather than into 124 class strings is that it is a property of the
script, not of any one component.

### 5.3 The three fonts cover none of the four new scripts

`index.html` loads Archivo, Schibsted Grotesk and Spline Sans Mono, all Latin. Arabic,
Chinese and Japanese fall through to `system-ui`, so they render (no tofu on any modern
device) but the game's whole typographic identity vanishes in three of fourteen locales.
Noto Sans Arabic, Noto Sans SC and Noto Sans JP are the answer, **loaded per locale and never
all at once**: the CJK families are large even as unicode-range subsets, which is the other
half of 2.4's argument.

**Mind the trap already recorded in `CLAUDE.md`**: the font `<link>` sits above the module
script and **a pending stylesheet blocks script execution**, which is why the app never boots
in a sandbox with no route to Google Fonts. Adding a per-locale font link makes that path
longer, so the locale's font must be requested by the same pre-paint script that stamps the
theme, and must not be able to block the boot.

One thing survives everywhere and is worth knowing: **the mono numeral face still applies**,
because ratings, scorelines and prices stay in Western digits in every locale on this list
(plain `ar` uses Western digits in CLDR; it is `ar-EG` and `ar-SA` that use `١٢٣`, and this
list does not contain them). So the data voice of the app is intact even where the display
face is not.

### 5.4 Turkish has two traps, and the `lang` stamp fixes the larger one for free

- **Casing.** In Turkish, uppercase `i` is `İ` and uppercase `ı` is `I`. Measured:
  `'indirim'.toUpperCase()` gives `INDIRIM`, and `toLocaleUpperCase('tr')` gives `İNDİRİM`.
  This app applies CSS `uppercase` **101 times**. Browsers apply `text-transform` per the
  element's language, **so stamping `<html lang>` (section 8.1) fixes all 101 at once** and
  is a correctness requirement rather than only an accessibility one.
  The JS side is nearly clean: of 20 case transforms in `src/`, all but one act on room codes
  and country codes, which are ASCII. The exception is **`pvpRoom.ts:1289`**,
  `m.name.slice(0,3).toUpperCase()`, which acts on a **display name**, so it mis-cases a
  Turkish name and chops an Arabic one mid-word. It is the "a name is not a first word"
  lesson one layer down.
- **Suffixes.** Turkish is agglutinative with vowel harmony, so a case ending depends on the
  stem's last vowel (`Brezilya'nın` against `Türkiye'nin`). **Any sentence that appends a
  suffix to an interpolated proper noun is broken**, and no placeholder system can fix it.
  It goes in the brief: restructure the sentence so the interpolated name is not inflected.

### 5.5 Chinese and Japanese run SHORT, which changes what the layout review is for

CJK typically occupies 50 to 70% of the English width. So the long-text risk (10.1) is
German's alone, and the CJK risk is the opposite one: labels sized for a long word now sit in
a box with a lot of air, and mono captions with wide tracking look wrong twice over (5.2).
Neither breaks anything. Both want a look.

---

## 6. What `npm run checks` has to hold

At fourteen locales these are not belt and braces, they are the product.

**6.1 The missing-key list.** Nominally the type system's job; built anyway for the error
message, because `tsc` reports three property names and "397 more", once, on the object
literal, which is 400 build-and-fix cycles. Vacuity guard: it has to find more than a
thousand keys, in every locale.

**6.2 Placeholder parity.** Every locale's value for a key carries the same `{tokens}` as
English's, no more and no fewer. **The single most valuable check here**: a dropped `{n}` is
a sentence promising a number it never prints, and with thirteen locales nobody is reading,
it is the only thing that would ever notice.

**6.3 Plural category coverage.** Every plural entry supplies exactly the categories
`Intl.PluralRules` can return for that locale over the range of numbers this game produces,
no fewer (a silent fall-through) and no more (a dead Romance `many`). Vacuity guard: assert
the Arabic entries carry six categories and the Japanese ones carry one, so a check that has
quietly stopped reading the rules fails rather than passing.

**6.4 Nothing user-facing left behind**, sweeping `src/components/**` **and `src/domain/**`.
It cannot be exact: an allowlist carries the genuine exceptions (8.2) and every entry says
why. Mutation-test it by putting one English sentence back.

**And an inventory of the checks that already read this copy**, owed by any wave that turns
a string into a key:

- **Three checks assert a number against the sentence promising it**, all in
  `scripts/checks/career.ts` (lines 159, 174/181, 406). They go red the moment perk
  descriptions become keys and must be rewritten to look up `en[key]`. **They stay on
  English**, because they assert arithmetic against a sentence and only one locale can be the
  reference; 6.2 is what carries the guarantee to the other thirteen. (`CLAUDE.md` says there
  are five and names three that do not exist as copy checks. There are three.)
- **`challenges.ts:58` goes VACUOUS rather than red**, which is worse: it asserts no em-dash
  in `c.name` and `c.description`, and once those are keys it asserts, for ever and silently,
  that key strings contain no em-dashes.

---

## 7. The server and the referee get nothing

**No route takes a locale and none should.** The referee already answers in codes
(`already-in-a-room`, `room-full`) which `refereeMessage.ts` turns into sentences on the
client: the right seam, built for a different reason, and now one more catalogue block.
Display names, room codes and player names are not translated. The account server stores the
locale only as a field inside the settings jsonb it already writes whole, and never reads it.

So **no migration and no referee rebuild are owed**, which is remarkable for a change this
size and is worth not throwing away.

**One rough edge in that seam.** `refereeMessage` composes `` `Could not ${what}.` `` (lines
148, 173) where `what` is an English verb phrase from the caller: `'save that name'`,
`'take a seat'`, `'do that'`, `'send a rematch'`, `'open a room'`, at five sites across four
files. No other language on this list has that construction, and Turkish and Japanese put the
verb somewhere else entirely. Each becomes a whole sentence.

---

## 8. Choosing a locale, and the things outside React

**8.1 The setting, and the two attributes it stamps.** `Settings.language: Locale`, a control
in the settings sheet beside the theme toggle, persisted in `wcsim_settings_v1` for a guest
and in the settings jsonb for an account, so **no migration on either side**. It is a field
of `Settings`, so `toStored` carries it by construction.

`index.html:2` hardcodes `lang="en"`, and the pre-paint script a few lines below stamps only
the theme. **It must stamp `lang` and `dir` too, from the same stored read**, and section 5
is why that is not decoration: `lang` decides Turkish casing on 101 uppercase rules and
whether the Arabic letter-spacing rule applies, and `dir` decides the whole layout. Fourteen
locales also make the fallback chain worth stating: **match the full tag, then the bare
language, then English.** So `pt-BR` lands on `pt-BR`, a bare `pt` on `pt-PT`, a bare `es` on
`es-ES`, `zh-TW` on `en` rather than on Simplified. Guessed once on a first load, then never
again.

**8.2 `UnreachableScreen` and `ErrorBoundary` stay English.** Both hand-write their markup on
purpose: the first renders before the app exists, the second has no imports beyond React so
that it renders when whatever it wraps has taken the app down. An error screen that throws
while looking up the word for "something went wrong" is the worst available outcome. They go
on 6.4's allowlist, and the note goes in their headers beside the one already there.

**8.3 The sign-in mail.** GoTrue picks a template by URL and has no idea who is signing in,
and the subject line and sender name are NAS settings rather than repo files. Bilingual was
the answer at two locales; **at fourteen it is not**, so the mail stays English and short,
and the code itself is the only thing that matters in it. Revisit only if a locale ever
carries enough players to justify the sign-in request carrying a locale.

---

## 9. Order of work

1. **The machinery, proved on one screen.** `src/i18n/`, `Settings.language`, the remount
   key, `lang` and `dir` stamped pre-paint, `Intl.PluralRules` behind `t()`, checks 6.1, 6.2
   and 6.3. First screen across is **the settings sheet itself**, because the control lives
   there: switching locale in front of the words that just changed is the proof.
2. **The flat catalogues.** Challenges, boosts, perks, Ascensions, badges, chemistry
   categories, the referee's refusals. Mechanical, high volume, no layout risk, more than a
   third of the total, and it takes the three `career.ts` checks and `challenges.ts:58` with
   it.
3. **The screens a new player meets first.** Front page, build page, transfer market, the
   settings sheet's neighbours. This is the wave that meets 10.1.
4. **Everything else.** The run, career, honours, cabinet, album, squad browser, and versus
   as a unit (it moves through `pvpView` and `refereeMessage` rather than screen by screen).
   Nations land here too, with the `Intl.DisplayNames` map, the five overrides, and the
   sorting and searching in section 4.
5. **The closing pass for the Latin locales.** `Intl` for numbers and dates, the ordinal and
   relative-time helpers from 2.3, check 6.4 with its allowlist, and the bundle split.
   **`de`, `fr`, `it`, `pt-PT`, `pt-BR`, `es-ES`, `es-MX`, `es-AR`, `id` and `tr` are one
   file each and no code changes at all** from here, except Turkish, which needs only the
   `lang` stamp already shipped in wave 1.
6. **CJK.** `zh-Hans` and `ja`: the per-locale font loading in 5.3, the tracking review in
   5.5, and the collation in section 4 proved against pinyin.
7. **Arabic, or not at all.** The RTL sweep in 5.1, the letter-spacing rule in 5.2, the font,
   and the two explicit decisions about the pitch and the bracket. Its own wave because it is
   the only one that touches layout everywhere, and because 0.1 says it is a commitment.

---

## 10. The risks, in the order they will bite

**10.1 German is 20 to 35% longer, and this app is built out of narrow columns.** The
bracket's match boxes, the market rows, the perk tiles, the phone tab bar, the challenge
ledger's two-up rows. **Every wave has to be looked at in German at 360px.** French runs 15 to
20% longer and the two Portuguese and three Spanish 20 to 25%, so **a layout that survives
German survives all nine Latin locales**, which is what makes one review cover them. Turkish
and Indonesian sit inside that range too. CJK is the opposite problem and a milder one (5.5),
and Arabic is not a length problem at all (5.1).

**10.2 Arabic half-mirrored.** Section 5.1's sweep is mechanical and there is a lot of it, so
the way this fails is by being 90% done and shipped. The mitigation is that it is last, its
own wave, and 0.1 says out loud that not shipping it is an acceptable outcome.

**10.3 Twelve locales nobody reads.** With machine translation in the loop, checks 6.2 and
6.3 are the entire safety net, and a translation that reads oddly will simply ship. Accept
that, and make the reporting route cheap: whatever is wrong will be reported by a player, so
the value is in the fix being a one-line edit to one file, which this design already gives.

**10.4 A translation making a promise the code does not keep.** 6.2 plus the three
`career.ts` checks is the answer, and it holds only while every number in a sentence is a
placeholder. **A sentence that spells a figure out in words is the failure none of this can
catch**, so it goes in the brief in section 3.

**10.5 Sentences fragmented across markup.** The `Formation <b>4-3-3</b><br/>Style
<b>Balanced</b>` pattern is everywhere, and German, Turkish and Japanese all put the verb
somewhere else. 2.2's answer covers it, but each one is a judgement rather than a
substitution, which is why the string count in section 1 undersells the work.
