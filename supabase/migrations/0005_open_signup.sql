-- Accounts: open signup (supersedes the invite gate in 0004).
--
-- D12 originally restricted signup to an allowlist ("private now, public later",
-- D7). Decided 2026-08-13: registration is open to anyone. There is no separate
-- register step - one email field, a 6-digit code, and you are in, whether it is a
-- first visit or a return.
--
-- What this removes is only the gate. Everything else stands: row-level security
-- still isolates accounts from each other, and the economy functions still validate.

begin;

drop trigger if exists enforce_invite_on_signup on auth.users;
drop function if exists enforce_invite();
drop table if exists allowed_emails;

commit;

-- Two consequences worth knowing, both about strangers rather than security:
--
-- 1. Rate limits now matter. Auth's own per-IP and per-email limits are the only
--    thing between a script and the mail quota, and the Gmail sender caps out around
--    500 messages a day (D5). Tighten the Auth limits if that is ever approached.
-- 2. Deliverability now matters. A plain gmail.com sender lands in spam often, which
--    is survivable for people who were told to look there and much less so for
--    strangers who just wanted to log in. The fix, when it matters, is a sender on
--    an owned domain with SPF and DKIM (a transactional provider), not more config
--    on the Gmail account.
