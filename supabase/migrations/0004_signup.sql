-- Accounts: signup wiring. See docs/cloud-sync-design.md §8.
--
-- Two triggers on Auth's user table:
--   1. the invite gate (D12) - one place, so it covers Google and email OTP alike
--   2. the profile row every other table hangs off
--
-- Opening signup to the world later (D7, FR-22) is dropping the first trigger. That
-- is the config change the "public later" decision promised, not a rewrite.

begin;

-- --------------------------------------------------------------------------
-- 1. Invite gate
-- --------------------------------------------------------------------------

-- DROPPED IN 0005 (signup was opened). SUPERSEDED BY 0005; see README.md here.
create or replace function enforce_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from allowed_emails
    where lower(email) = lower(new.email)
  ) then
    raise exception 'signup is invite-only';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_invite_on_signup on auth.users;
create trigger enforce_invite_on_signup
  before insert on auth.users
  for each row execute function enforce_invite();

-- --------------------------------------------------------------------------
-- 2. Profile creation
-- --------------------------------------------------------------------------

-- Every account needs its profile row before anything else can reference it, and
-- `state_version` starts at 0 so the client's first write can carry 0.
create or replace function create_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_on_signup on auth.users;
create trigger create_profile_on_signup
  after insert on auth.users
  for each row execute function create_profile();

commit;
