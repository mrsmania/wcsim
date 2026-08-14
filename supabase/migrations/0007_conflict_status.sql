-- Accounts: make a version conflict fail fast instead of hanging.
--
-- Bug found 2026-08-14 while banking a finished run. bump_version raised its conflict
-- with SQLSTATE 40001 (serialization_failure), which PostgREST classes as retryable
-- and so retries the transaction. The condition is deterministic - the version really
-- does not match - so it retried until the gateway timed out the request at 30s. The
-- client saw a timeout and reported the server as unreachable, which was wrong twice
-- over: the server was fine, and the real answer was "your write was out of date".
--
-- PT409 is PostgREST's convention for "answer this with HTTP 409": no retry, and the
-- message reaches the client intact, where StaleVersionError picks it up.

begin;

create or replace function bump_version(expected integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_version integer;
begin
  select state_version into current_version from profiles where id = auth.uid() for update;
  if current_version is null then
    raise exception 'no profile for this account';
  end if;
  if expected is not null and expected <> current_version then
    raise exception 'stale_version: account is at %, write carried %', current_version, expected
      using errcode = 'PT409';
  end if;
  update profiles set state_version = current_version + 1 where id = auth.uid();
  return current_version + 1;
end;
$$;

commit;
