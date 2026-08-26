/** Vite's build-time env, guarded: `scripts/checks.ts` imports this module and runs in
 *  plain node, where `import.meta.env` does not exist. */
const ENV: ImportMetaEnv = import.meta.env ?? {};

/** Feature flags. Flip a value to false to disable a feature everywhere quickly. */
export const FEATURES = {
    /** Team chemistry: a cohesion bonus to the user XI's overall rating, plus the
     *  chemistry readouts in the team panel. Set to false to fully disable both the
     *  rating bonus and all chemistry UI. */
    chemistry: true,
    /** Remove placed players from the pitch via an x on the badge (testing aid).
     *  Off by default; set to true to show the control and enable removal. */
    removePlayers: false,
    /** Move a placed player to another of his roles: tap his badge, then tap one of
     *  the slots that light up (an empty one, or a team-mate he can trade places
     *  with). Set to false and a placed badge is inert again, as it used to be. */
    movePlayers: true,
    /** "Random team" shortcut on the setup screen: auto-fill a full valid XI of a
     *  chosen strength and skip the draft (testing aid). Turn off for real users. */
    randomTeam: false,
    /** Show each team's rating as a small chip next to it (desktop only). Set to
     *  false to hide all the rating chips everywhere. */
    teamRatings: true,
    /** Squad & World Cup browser: a read-only reference view (reached from the
     *  masthead) to look through every nation's squad from any tournament. Set to
     *  false to hide the masthead toggle and the whole browse view. */
    squadBrowser: true,
    /** Sticker album: a persistent Panini-style collection of the elite players
     *  (elo within STICKER_TIERS) you draft across runs. Gates the album screen,
     *  the run-end sticker summary, the cup-win reward pick, the draft collectible
     *  markers, and the swap control. Set to false to hide all of it (and skip the
     *  album localStorage reads/writes). */
    stickerAlbum: true,
    /** How stickers are earned.
     *  `true`  - only a **cup win** banks them: the winning XI's collectibles plus the
     *            reward pick. A group exit or a knockout defeat banks nothing, so the
     *            album records what you *won*.
     *  `false` - any finished run banks the final XI's collectibles, win or lose, so
     *            the album records who you *drafted*.
     *  Changes the rule and the copy that explains it (home page, draft call-out).
     *  A losing run still reports in either way, so run history and telemetry are
     *  unaffected by the switch.
     *
     *  BACK OFF since 2026-08-24, having been on for a few hours the same day. The reason
     *  is the measurement, not taste: over 400 simulated runs with a $110 XI at Base
     *  Ascension a run wins the cup only 10% of the time, so win-only banks about a TENTH of
     *  the collectibles any-run does - and against 87 collectibles that is too steep to ever
     *  fill the album. Win-only is the better MEANING (a shelf of what you won, not a list
     *  of everyone you drafted); it just needs a second way to earn cards before it is
     *  playable. That is roadmap item 34 (an album shop): spend Prestige or a currency of
     *  its own on stickers, so the album has an income that does not depend on a 10% event.
     *  Flip this back to `true` when that ships, and re-measure rather than trusting these
     *  figures - the collectible count has moved three times already. */
    stickersOnCupWinOnly: false,
    /** Use real sticker artwork instead of the text+flag placeholder. Drop
     *  <player.id>.png files into art/stickers-src/ and run
     *  `python scripts/build-sticker-art.py` to produce the shipped
     *  public/stickers/<player.id>.webp (e.g. fra-2022-10.webp). StickerCard
     *  renders the image on collected cards with a graceful fallback, so partial art
     *  sets are fine - a player without a file just shows the flag + text. Set to
     *  false to skip the image requests entirely and always use the placeholder. */
    stickerImages: true,
    /** Budget draft ("Transfer Market"): a second way to build the XI - hand-pick
     *  players from all squads within a budget (BUDGET_BY_TIER), priced by rating
     *  (domain/pricing.ts). Adds a "Buy with a budget" setup entry that swaps the
     *  draft's left column to the market (same page). Set false to hide it and keep
     *  only the random roll. */
    budgetDraft: true,
    /** Challenges: permanent honours over a finished Cup Run (a catalogue of one-off
     *  goals), the /challenges catalogue screen, the hub card, and the run-end completion
     *  list. Set false and no challenge is evaluated, no Prestige is paid for one, and the
     *  screen and its entry points disappear. Plan: docs/challenges-spec.html. */
    challenges: true,
    /** Trophy cabinet: a read-only /cabinet screen showing what a career has to show
     *  for itself - the cups it has won by Ascension tier, the records, the honours
     *  summary, the derived badges (domain/badges.ts) and album completion. The career layer
     *  only, like the rest of that layer, and entirely derived: it reads the career and
     *  the album and records nothing of its own, so switching it off removes the route
     *  and the hub link and changes nothing else. Roadmap item 06; comp in
     *  docs/redesign-2026/turf-flat/trophy-cabinet.html. */
    trophyCabinet: true,
    /** Optional accounts: sign in with an emailed 6-digit code so the album, career
     *  and challenges are the same on every device. Derived, not hand-set: it is on
     *  only when the build was given a server (VITE_SUPABASE_URL + _ANON_KEY). With
     *  no server configured, nothing account-related renders, no network call is
     *  made, and the app is the guest-only build it has always been.
     *  See docs/cloud-sync-requirements.md (NFR-1: guest-first). */
    accounts: !!(ENV.VITE_SUPABASE_URL && ENV.VITE_SUPABASE_ANON_KEY),
    /** Player versus player: rooms of 2, 4 or 8 signed-in players drafting against a clock
     *  and playing a live knockout. Derived from BOTH servers, not one (plan P46): a room
     *  needs an account (it is account-only by decision P17) and it needs the referee,
     *  which is deployed by hand and separately. Deriving it from the account server alone
     *  would put a Versus tab on the deployed site the moment accounts were configured,
     *  with every call in it failing - a half-finished deployment that looks like a broken
     *  feature. Plan: docs/pvp-plan.md. */
    pvp: !!(ENV.VITE_SUPABASE_URL && ENV.VITE_SUPABASE_ANON_KEY && ENV.VITE_REFEREE_URL),
} as const;

/** Where the account server lives, when there is one (FEATURES.accounts). The anon
 *  key is public by design; row-level security is what protects data. */
export const SUPABASE = {
    url: ENV.VITE_SUPABASE_URL ?? '',
    anonKey: ENV.VITE_SUPABASE_ANON_KEY ?? '',
} as const;

/** Where the referee lives, when there is one (FEATURES.pvp). A route on the same gateway
 *  as the account server rather than a second hostname (P46), so there is one certificate
 *  and one proxy rule - a second hostname adds a renewal path that can take Versus down on
 *  its own. No key: the referee is called with the player's OWN session token, and the one
 *  thing it will not accept is the anon key (P34, `domain/pvpAuth.ts`). */
export const REFEREE = {
    url: (ENV.VITE_REFEREE_URL ?? '').replace(/\/+$/, ''),
} as const;

/** Collectible sticker tiers, by player `elo` (inclusive on both ends). The single
 *  source of the "who is collectible" rule - a player is collectible iff their elo
 *  falls in one of these ranges. Tune here without touching game logic. */
export const STICKER_TIERS = {
    legendary: { min: 90, max: 92 },
    iconic: { min: 93, max: 96 },
    monumental: { min: 97, max: 99 },
} as const;

/** The canonical tier union used across the codebase. */
export type StickerTier = keyof typeof STICKER_TIERS;

/** The tiers, best first. The single named home for "which order do tiers go in", which
 *  four sites used to recover with `Object.keys(STICKER_TIERS) as StickerTier[]` - a cast
 *  that compiles whatever the array actually holds (hygiene H150).
 *
 *  `satisfies` rather than a plain annotation, so the array keeps its literal element type
 *  AND omitting a tier is a compile error here rather than a missing section on the album
 *  screen. Keep the order: the console summaries `npm run checks` prints read in it. */
export const STICKER_TIER_ORDER = ['monumental', 'iconic', 'legendary'] as const satisfies
    readonly StickerTier[];

/** A tier's rank, best first: 0 = Monumental. Derived from the order above rather than
 *  being a second list, and a function rather than a Record so it needs no cast.
 *
 *  It lives here because it is a fact about tiers, not about how they look. The same
 *  ordering exists in `components/stickerTheme.ts` as `TIER_META[t].order`, which the
 *  album's LAYOUT reads - and the cup-reward rule was reading it too, from a component,
 *  to sort a domain pool (hygiene H142). A domain rule may read this; a screen laying
 *  cards out may read either. */
export const tierRank = (tier: StickerTier): number => STICKER_TIER_ORDER.indexOf(tier);

/** Trade-in cost: how many duplicates (any tier/mix) buy one sticker of that tier
 *  (the player then picks from up to 3 uncollected options). First-guess values;
 *  see `wcsim_album_stats_v1` telemetry to calibrate. */
export const STICKER_TRADE_COST: Record<StickerTier, number> = {
    legendary: 10,
    iconic: 20,
    monumental: 50,
} as const;

/** Budget draft ("Transfer Market"): a reference total "$" for a full XI (see
 *  docs/budget-draft-requirements.md). Prices are convex (domain/pricing.ts), so with
 *  the current curve a budget maps to a uniform-rating ceiling of roughly:
 *  $99 -> all-82, $110 -> all-83, $121 -> all-84. No screen reads this any more - every
 *  build is a career build and takes its budget from BUDGET_BY_TIER below - so it is kept
 *  as the mid-ladder figure the checks harness prices against. */
export const BUDGET_DRAFT = 110;

/** Budget draft: how much cheaper a player is when his sticker is already in your album
 *  (0.25 = 25% off, rounded, never below $1). The collection paying back into the game,
 *  so a big album buys a slightly stronger XI. Applies in BOTH modes: the album is global,
 *  shared by signed-in players and guests, so there is one price rule rather than a
 *  mode-dependent one. Set to 0 to switch the discount off entirely. */
export const STICKER_DISCOUNT = 0.25;

/** Career-scaled transfer budget, indexed by the owned tier of the `transfer-budget`
 *  perk (0 = base). Every build reads its budget from here. Tunable ladder (rises
 *  $70 -> $160). Keep in sync with the
 *  `transfer-budget` perk tiers in domain/career.ts (one entry per tier + the base);
 *  `npm run checks` fails while the two disagree. */
export const BUDGET_BY_TIER = [70, 80, 90, 100, 110, 120, 130, 140, 150, 160] as const;

/** Squad re-rolls a roll draft starts with. The career can add to it: the Extra Re-roll
 *  perk's tier is passed in on START_DRAFT (see App), since the reducer knows nothing
 *  about the career. */
export const INITIAL_REROLLS = 3;

/** Player swaps allowed per run (sticker album feature). Only collectibles can be swapped
 *  in, and only this many times.
 *
 *  Both live HERE rather than in state/gameReducer, which is where they were, because three
 *  other places need them and the layering runs domain -> state, not back:
 *  `domain/challenges.ts` kept its own `ALL_SWAPS = 2` mirror with a comment saying the
 *  harness asserts the two stay in step, and `scripts/gen-collectibles.ts` emits this
 *  number into the server's `economy_constants` table. A fact needed by the domain, the
 *  reducer and the server seed belongs in config, which all three already import. */
export const INITIAL_SWAPS = 2;

/** How many collectible ids the server's `finish_run` accepts for one run. Exceeding it
 *  raises, and the raise rolls the whole bank back - which for a signed-in player is the
 *  blocking unreachable screen, so the client trims to this rather than finding out.
 *
 *  THE SERVER READS THIS NUMBER; it does not state its own (migration 0015, roadmap item
 *  37). `gen-collectibles` emits it into `economy_constants` alongside the trade costs and
 *  the swap cap, and `finish_run_v2` coalesces it there with this figure as the fallback,
 *  so applying a migration before pushing the seed behaves exactly as today. It used to be
 *  the one economy constant each side stated on its own - this one in a hook, the server's
 *  as a bare literal in the function body - which is silent drift over a number whose
 *  disagreement costs somebody a run they played (hygiene H135). `npm run checks` holds the
 *  seed, the fallback and the shape of the test together; see scripts/checks/state.ts for
 *  what each of the three assertions is for. */
export const BANK_CAP = 12;
