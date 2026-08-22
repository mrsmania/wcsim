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
     *  unaffected by the switch. */
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
     *  summary, the derived badges (domain/badges.ts) and album completion. Career Mode
     *  only, like the rest of that layer, and entirely derived: it reads the career and
     *  the album and records nothing of its own, so switching it off removes the route
     *  and the hub link and changes nothing else. Roadmap item 06; comp in
     *  docs/redesign-2026/turf-flat/trophy-cabinet.html. */
    trophyCabinet: true,
    /** Run nodes: the stop between two Cup Run rounds is not always a boost pick. With
     *  this on, the stop after the Round of 16 is a **shop** (spend Form on something you
     *  choose) and the one after the Semi-final is an **event** (a themed either/or, which
     *  is where the curses live). Roadmap item 04; see `docs/run-nodes-plan.md`.
     *
     *  **OFF since 2026-08-22, by the owner, and the reason is worth keeping.** A currency
     *  needs enough transactions to be worth reasoning about, and a World Cup has SEVEN
     *  matches. Earning Form in the semi-final is close to meaningless - there is one stop
     *  left to spend it at and no time to plan around it. Form works in a 20+ game league
     *  and does not work here, which is a fact about the format rather than about the
     *  tuning, so no amount of reprising fixes it.
     *
     *  What the slices under it are worth keeping for: the **effect ledger**
     *  (`domain/effects.ts`) and **expiry** are unflagged and load-bearing, and the node
     *  MACHINERY is a working way to ask a question that is not "which of these numbers is
     *  biggest". A future node kind that costs something other than a currency can reuse
     *  all of it. Off, every stop is a boost pick, exactly as the run was before. */
    runNodes: false,
    /** Whether a challenge PAYS Prestige. One switch for both halves, deliberately: with
     *  it false nothing is paid AND no award is shown anywhere (the catalogue rows, the
     *  hub card, the run-end list, the counter's Prestige cell), because Prestige arriving
     *  from an invisible source is worse than either.
     *  ON since 2026-08-19, once the numbers were sized by simulation: `AWARD` is 2/5/12
     *  (see the note beside it in domain/challenges.ts), which puts the whole catalogue at
     *  about a third of the perk shop and challenges at ~1/6 of a long career's Prestige,
     *  so runs stay clearly the primary faucet. The first guess of 10/30/75 was worth
     *  nearly twice the shop, which is what kept this off.
     *  The tier (bronze/silver/gold) stays visible either way: it reads as difficulty.
     *  NOTE if it is ever switched off and on again: flipping it does NOT pay the backlog.
     *  The wallet is only credited by `applyRunResult` for the ids completed in that run,
     *  while the catalogue counter and the hub read `challengeProgress().prestige`, which
     *  is computed from every completion held - so the two would disagree by the arrears.
     *  That cost nothing here because it went on before there was any real save to owe. */
    challengeAwards: true,
    /** Optional accounts: sign in with an emailed 6-digit code so the album, career
     *  and challenges are the same on every device. Derived, not hand-set: it is on
     *  only when the build was given a server (VITE_SUPABASE_URL + _ANON_KEY). With
     *  no server configured, nothing account-related renders, no network call is
     *  made, and the app is the guest-only build it has always been.
     *  See docs/cloud-sync-requirements.md (NFR-1: guest-first). */
    accounts: !!(ENV.VITE_SUPABASE_URL && ENV.VITE_SUPABASE_ANON_KEY),
} as const;

/** Where the account server lives, when there is one (FEATURES.accounts). The anon
 *  key is public by design; row-level security is what protects data. */
export const SUPABASE = {
    url: ENV.VITE_SUPABASE_URL ?? '',
    anonKey: ENV.VITE_SUPABASE_ANON_KEY ?? '',
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
 *  shared by Quick Run, Career Mode and guests, so there is one price rule rather than a
 *  mode-dependent one. Set to 0 to switch the discount off entirely. */
export const STICKER_DISCOUNT = 0.25;

/** Career-scaled transfer budget, indexed by the owned tier of the `transfer-budget`
 *  perk (0 = base). Every build reads its budget from here. Tunable ladder (rises
 *  $70 -> $150). Keep in sync with the
 *  `transfer-budget` perk tiers in domain/career.ts (one entry per tier + the base). */
export const BUDGET_BY_TIER = [70, 80, 90, 100, 110, 120, 130, 140, 150] as const;
