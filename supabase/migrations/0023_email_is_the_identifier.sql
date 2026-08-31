-- Accounts: the email address is the identifier.
--
-- Two things had been sharing the job of saying who somebody is, and only one of them was
-- enforced. The **display name** carries a unique index (0016's `profiles_name_key_uniq`,
-- on the folded key) and is what a lobby shows; the **email address** is what you sign in
-- with, and `profiles.email` has been a plain `text not null` since 0001 with no constraint
-- on it at all. So the game's identity rule was, in effect, "your name", which is exactly
-- backwards: a name is a label a player should be able to change, and the address is the
-- one fact that decides which account a code lets you into.
--
-- This file makes the address the identifier. It does NOT relax the name rule: a name is
-- still one per person (decided 2026-08-31), so a lobby stays readable, and a rename is now
-- offered on the versus page because nothing in a room stores a name - every screen reads
-- it off `profiles` through a join, so a change reaches a room already in flight.
--
-- THREE THINGS, AND THE THIRD IS THE ONE THAT MATTERS MOST.
--
-- 1. FOLD WHAT IS STORED. `create_profile` has copied `auth.users.email` across verbatim
--    since 0004. GoTrue lowercases an address on signup, so in practice every row is
--    already folded and this update touches nothing - but "in practice" is not a
--    constraint, and an address inserted by hand in Studio is not held to it. The index
--    below has to be able to trust one form.
--
-- 2. ONE ACCOUNT PER ADDRESS. A unique index, which is the actual ask. It is a BACKSTOP
--    rather than the first line of defence: GoTrue keeps its own unique index on
--    `auth.users.email`, so a second signup on a taken address never reaches this. That is
--    the right shape for an invariant - the thing that must be true is stated where it can
--    be checked, not left as a property of another component's schema.
--
-- 3. AN ADDRESS THAT CHANGES IS CARRIED ACROSS. This is the half that was actually broken
--    and it is why the file is not one `create index`. `profiles.email` is written once, at
--    signup, and never again, so a change of address (GoTrue supports one, and the owner can
--    make one from Studio or the admin API) left the copy here pointing at the old address
--    for ever. An identifier that goes stale is worse than no identifier: two accounts can
--    then hold the same address, one in `auth.users` and one in `profiles`, and the unique
--    index would be guarding a value nothing writes. Hence `sync_profile_email`.
--
-- WHAT THIS DELIBERATELY DOES NOT DO. It does not grant the referee a look at `email`
-- (P34: it holds `select (id, display_name, name_key) on profiles` and stops there, and an
-- address is not a room's business), it does not make an address searchable by anybody, and
-- it does not add an email-change screen to the client. A duel is addressed by link and by
-- nothing else since 0022, so nothing in the game needs to look an account up by address.
--
-- BEFORE APPLYING, run the duplicate check. This is the one statement here that can fail on
-- real data, and it fails loudly and correctly:
--
--   select lower(btrim(email)) as e, count(*), array_agg(id)
--     from profiles group by 1 having count(*) > 1;
--
-- Zero rows means step 2 will pass. Rows mean two accounts really do share an address, and
-- that is a decision to take by hand (which of the two keeps it) before this file goes in,
-- not something a migration may guess at.
--
-- VERIFY, on the server, after applying:
--   1. `select indexdef from pg_indexes where indexname = 'profiles_email_uniq';` - present.
--   2. `select count(*) from profiles where email <> lower(btrim(email));` - 0.
--   3. In a transaction: `insert into profiles (id, email) select gen_random_uuid(),
--      email from profiles limit 1;` is refused by `profiles_email_uniq`. Roll it back.
--      (It is refused by the foreign key to `auth.users` too, so read the error: it must
--      name the index, not the key. If it names the key, use an id that really exists in
--      `auth.users` and has no profile, or trust check 1.)
--   4. `select tgname from pg_trigger where tgrelid = 'auth.users'::regclass
--      and not tgisinternal;` - `create_profile_on_signup` and `sync_profile_email_on_change`.
--   5. In a transaction, `update auth.users set email = 'x' || email where id =
--      (select id from profiles limit 1);` then read that profile's email: it moved with it.
--      Roll it back.
--   6. Sign in from the game with the real account. It must be the same account, with the
--      same album, career and versus name - the point of this file is that nothing about
--      identity moved, only that it is now stated.
--
-- ROLLBACK. Nothing here destroys anything (step 1 folds case, which GoTrue had already
-- done), so the rollback is three drops and the old function body:
--
--   drop trigger if exists sync_profile_email_on_change on auth.users;
--   drop function if exists sync_profile_email();
--   drop index if exists profiles_email_uniq;
--   -- and, to put `create_profile` back exactly as 0004 had it:
--   create or replace function create_profile()
--   returns trigger language plpgsql security definer set search_path = public as $$
--   begin
--     insert into profiles (id, email) values (new.id, new.email)
--     on conflict (id) do nothing;
--     return new;
--   end;
--   $$;
--
-- Everything below is idempotent, so a re-run is a no-op rather than an error.

begin;

-- --------------------------------------------------------------------------
-- 1. One form
-- --------------------------------------------------------------------------

update profiles
   set email = lower(btrim(email))
 where email <> lower(btrim(email));

-- --------------------------------------------------------------------------
-- 2. One account per address
-- --------------------------------------------------------------------------

-- On the column rather than on `lower(email)`, because step 1 and the two functions below
-- are what keep the column folded, and an expression index would let the raw text drift
-- while still reading as unique. If the stored form is the folded form, the plain index is
-- the honest statement of the rule.
create unique index if not exists profiles_email_uniq on profiles (email);

-- --------------------------------------------------------------------------
-- 3. Signup, and a change of address
-- --------------------------------------------------------------------------

-- SUPERSEDES 0004's copy: the only change is the fold. See supabase/migrations/README.md.
create or replace function create_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email) values (new.id, lower(btrim(new.email)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_on_signup on auth.users;
create trigger create_profile_on_signup
  after insert on auth.users
  for each row execute function create_profile();

-- The identifier cannot be allowed to go stale. `on conflict (id) do nothing` in the
-- function above means a profile is written once and never touched again, which was right
-- while nothing else depended on the value and is not right now.
--
-- Guarded on the folded forms differing, so confirming an address that only changed case is
-- not a write. No `on conflict` clause: if the incoming address is somehow held by another
-- profile the update must FAIL and take the auth-side change down with it, rather than
-- leaving two accounts disagreeing about who owns it.
create or replace function sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
     set email = lower(btrim(new.email))
   where id = new.id
     and email <> lower(btrim(new.email));
  return new;
end;
$$;

drop trigger if exists sync_profile_email_on_change on auth.users;
create trigger sync_profile_email_on_change
  after update of email on auth.users
  for each row
  when (new.email is not null)
  execute function sync_profile_email();

-- 0008's lesson, and it applies to a trigger function too even though nothing is meant to
-- call this one directly: Postgres makes a new function executable by PUBLIC and the
-- Supabase image grants it to `anon` and `authenticated` on top. A trigger fires as its
-- owner regardless of who may execute it, so revoking costs nothing and closes the one
-- thing a `security definer` function should never leave open.
revoke all on function sync_profile_email() from public, anon, authenticated;

commit;
