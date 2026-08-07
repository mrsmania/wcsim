# TODO (open topics)

Raw idea list, newest ideas kept as captured. Nothing here is designed or scheduled
yet; when an item is picked up, spec it (own doc in `docs/`) and move it into
`docs/ROADMAP.md` "Next up". `docs/ROADMAP.md` stays the pipeline of what is actually
being built; this file is the inbox.

Last updated: 2026-08-07.

## 1. Rework the perks and boosts (balance pass + more of them)

Some perks/boosts are out of balance. Concrete example: **Chemistry Catalyst**
(`domain/boons.ts`, `+2 to players from your most-represented nation`, rarity
`common`) is effectively **Golden Generation** (`+2 to the entire XI`, rarity
`legendary`) as soon as the XI is single-nation, which the budget build makes easy
(buy eleven players from one nation). So a common boost matches a legendary one.

- Audit every boost in `domain/boons.ts` for the same failure mode: a conditional
  effect whose condition the player fully controls at build time.
- Options for that one: scale by cluster size, require N+ nations elsewhere, raise its
  rarity, or make the bonus depend on chemistry actually being imperfect.
- Also review the career perks (`domain/career.ts`: Scout Network, Deep Squad, Extra
  Boon, Transfer Budget) for value-per-Prestige consistency.
- **Add more** boosts and perks while in there (the offer pool is small, so runs repeat
  quickly; rarity weighting lives in `offerBoons`).

## 2. Login / user account, cross-device persistence

Everything is `localStorage` today (`wcsim_album_v1`, `wcsim_career_v1`, `wcsim_run_v1`,
the game key), so a second device starts from zero. Want an account so the album,
career status, and future challenges follow the user between devices.

- A requirements draft already exists: `docs/cloud-sync-requirements.md` (with 10 open
  questions, the hardest being how to merge duplicate counts / trade history across
  offline devices). Next step for this item is the design pass, not more requirements.

## 3. Sticker discount in the budget build

Players whose sticker is already collected should cost **x% less** in the transfer
market, where `x` is configurable (a constant in `src/config.ts` is fine, no UI needed).

- Price comes from `domain/pricing.ts` `priceOf(elo)`; the album lives in
  `domain/album.ts` + `state/albumStorage.ts`. So the discount is an album-aware price
  wrapper, and `pricing.ts` must stay pure (pass the collected set in, do not import
  storage into `domain/`).
- Touches everything that shows or sums a price: `BudgetMarket`, the `XiTable` budget
  column, and the auto-fill/upgrade spender (which reserves budget per remaining slot).
- Open question: does the discount apply in Quick Run too, or only Career Mode? (It is
  a collection reward, so it reads as a career perk, but the album is global.)

## 4. More World Cups and collectibles

The dataset covers 1990-2022 (all nine, fully researched). Extend backwards: 1986,
1982, 1978, 1974, 1970 and earlier, which also grows the sticker album automatically
(collectibility is derived from `elo` via `STICKER_TIERS`, no lookup table).

- Method notes from the 1990-2002 research round apply: identical name spellings across
  tournaments for the same person (`personId` is the name slug), distinct people must
  have distinct names, ratings are that-tournament strength on the 60-99 scale.
- Pre-1982 fields are smaller (16 teams in 1970/1974/1978, 24 from 1982), so the group
  draw and any "32 nations" assumptions need a look before adding them.
- `npm run checks` and the dev-time `domain/validateSquads.ts` guard the dataset.
