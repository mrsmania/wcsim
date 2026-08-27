#!/usr/bin/env bash
#
# Deploy the referee to the NAS (roadmap item 41, steps 2 to 5 of the runbook in
# docs/nas-setup.md, "The referee (versus)").
#
# WHY THIS EXISTS. The referee is the first LOCALLY BUILT image this stack has ever had -
# every other container pulls a published image - so something has to carry the source to
# the box and build it there. There is no repository checkout on the NAS and no Docker on
# the author's laptop, which leaves exactly one route: stream a snapshot up, build there.
#
# RUN IT FROM THE REPOSITORY ROOT, in Git Bash, on a machine that can reach the NAS:
#
#   bash scripts/deploy-referee.sh --check  user@192.168.1.115
#   bash scripts/deploy-referee.sh --build  user@192.168.1.115
#   bash scripts/deploy-referee.sh --config user@192.168.1.115
#   bash scripts/deploy-referee.sh --up     user@192.168.1.115
#   bash scripts/deploy-referee.sh --verify user@192.168.1.115
#
# The stages are separate ON PURPOSE, so you can read the output of one before causing the
# next. `--check` changes nothing anywhere. Add `--stack /volume1/docker/wcsim-supabase`
# if the stack does not live where this guesses.
#
# WHAT IT DELIBERATELY DOES NOT DO:
#   - It never takes a password as an argument (argv is visible to every process on the
#     box). `--config` prompts for it, with echo off, and writes it straight to the NAS.
#   - It does not run `alter role pvp_referee login password ...` for you. That is one line
#     you paste into Studio, and it is printed at the right moment.
#   - It cannot add the DSM WebSocket header (Control Panel, no CLI) or set the GitHub
#     repository variable. Both stay manual, and `--verify` reminds you.
#
# EVERY FILE IT OVERWRITES IS BACKED UP FIRST, next to the original, timestamped.

set -euo pipefail

STACK_DEFAULT=/volume1/docker/wcsim-supabase
STAGE=""
TARGET=""
STACK="$STACK_DEFAULT"
BUILD_DIR=/tmp/wcsim-referee-build

while [ $# -gt 0 ]; do
  case "$1" in
    --check|--build|--config|--up|--verify) STAGE="${1#--}"; shift ;;
    --stack) STACK="$2"; shift 2 ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) TARGET="$1"; shift ;;
  esac
done

if [ -z "$STAGE" ] || [ -z "$TARGET" ]; then
  echo "usage: bash scripts/deploy-referee.sh --check|--build|--config|--up|--verify user@host [--stack DIR]" >&2
  exit 2
fi

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok()   { printf '   [ok] %s\n' "$*"; }
warn() { printf '   [!!] %s\n' "$*"; }
die()  { printf '\n\033[1m** %s\033[0m\n' "$*" >&2; exit 1; }

# No connection multiplexing: DSM's sshd drops the control master ("read from master
# failed"), and with key auth there is nothing to save anyway.
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=15)

on() { "${SSH[@]}" "$TARGET" "$@"; }

# The three staged files this repo prepares, and where each belongs on the NAS.
LOCAL_COMPOSE=dkr/docker-compose.yml
LOCAL_CDS=dkr/volumes/api/envoy/cds.yaml
LOCAL_LDS=dkr/volumes/api/envoy/lds.template.yaml

require_local_files() {
  for f in "$LOCAL_COMPOSE" "$LOCAL_CDS" "$LOCAL_LDS"; do
    [ -f "$f" ] || die "missing $f - the staged config is not in this checkout"
  done
  grep -q 'wcsim-referee' "$LOCAL_COMPOSE" \
    || die "$LOCAL_COMPOSE has no referee service - is this the staged copy?"
  grep -q 'name: referee' "$LOCAL_CDS" \
    || die "$LOCAL_CDS has no referee cluster"
  grep -q 'name: referee' "$LOCAL_LDS" \
    || die "$LOCAL_LDS has no referee route"
  ok "the three staged files are present and carry the referee entries"

  # THE SIGN-IN MAIL TRAP, and it has already cost a day (2026-08-26). --config REPLACES
  # the NAS's docker-compose.yml with this local copy, and the four mail keys below are
  # NOT in the stock Supabase compose: it ships them commented out. So a stock-derived
  # local copy reverts every player to GoTrue's built-in "Magic Link" mail, and NOTHING
  # FAILS while it happens - the deploy reports success and the fault only shows up in
  # somebody's inbox at the next sign-in. See docs/nas-setup.md, "The sign-in email".
  local missing=""
  local k
  for k in GOTRUE_MAILER_SUBJECTS_MAGIC_LINK GOTRUE_MAILER_SUBJECTS_CONFIRMATION \
           GOTRUE_MAILER_TEMPLATES_MAGIC_LINK GOTRUE_MAILER_TEMPLATES_CONFIRMATION; do
    grep -q "^[[:space:]]*$k:" "$LOCAL_COMPOSE" || missing="$missing $k"
  done
  [ -z "$missing" ] || die "$LOCAL_COMPOSE is missing the sign-in mail keys:$missing
   Pushing it would revert every player to GoTrue's stock \"Magic Link\" mail. Add them
   under the auth service's 'environment:' as 'KEY: \${KEY}', with the values in the
   stack's .env, then re-run. docs/nas-setup.md, \"The sign-in email\", has all four."
  ok "the four sign-in mail keys are in the staged compose"
}

# Synology puts docker outside a login shell's PATH, and it usually needs root.
detect_docker() {
  DOCKER=$(on 'for c in "docker" "/usr/local/bin/docker" "sudo docker" "sudo /usr/local/bin/docker"; do
              if $c info >/dev/null 2>&1; then echo "$c"; exit 0; fi
            done; echo ""' || true)
  [ -n "$DOCKER" ] || die "no usable docker on the NAS for this account.
   Either add the account to the 'administrators' group, or do the build through
   Container Manager instead: it can build a project from a folder, and --build has
   already put the source in $BUILD_DIR for exactly that case."
  ok "docker on the NAS: $DOCKER"

  COMPOSE=$(on "cd '$STACK' 2>/dev/null && for c in '$DOCKER compose' '$DOCKER-compose' 'docker-compose'; do
               if \$c version >/dev/null 2>&1; then echo \"\$c\"; exit 0; fi
             done; echo ''" || true)
  [ -n "$COMPOSE" ] || die "no usable docker compose on the NAS"
  ok "compose on the NAS: $COMPOSE"
}

# ---------------------------------------------------------------- check ------
stage_check() {
  say "Preflight - this stage changes nothing"
  require_local_files

  on true || die "cannot ssh to $TARGET"
  ok "ssh to $TARGET works"

  on "test -d '$STACK'" || die "no stack folder at $STACK on the NAS (pass --stack DIR)"
  on "test -f '$STACK/docker-compose.yml'" || die "$STACK has no docker-compose.yml"
  on "test -f '$STACK/.env'" || die "$STACK has no .env"
  ok "stack folder looks right: $STACK"

  detect_docker

  say "What is running there now"
  on "cd '$STACK' && $COMPOSE ps --format '   {{.Service}}\t{{.Status}}' 2>/dev/null || $COMPOSE ps"

  say "What this deploy would change"
  printf '   %s\n' \
    "1. copy a snapshot of HEAD to $BUILD_DIR and build the image wcsim-referee" \
    "2. back up and replace three files in $STACK" \
    "3. add PVP_REFEREE_PASSWORD to $STACK/.env" \
    "4. docker compose up -d --remove-orphans, then restart api-gw" \
    "5. curl three endpoints and check the dataset hash"

  local head_hash
  head_hash=$(git rev-parse --short HEAD)
  say "The image would be built from $head_hash ($(git log -1 --format=%s | cut -c1-60))"
  [ -z "$(git status --porcelain)" ] \
    && ok "working tree is clean, so the snapshot is exactly that commit" \
    || warn "working tree is DIRTY - the snapshot is HEAD, so uncommitted changes are NOT included"
}

# ---------------------------------------------------------------- build ------
stage_build() {
  say "Build the referee image on the NAS"
  require_local_files
  detect_docker

  say "Streaming a snapshot of HEAD to $BUILD_DIR"
  # Tracked files at HEAD only: no node_modules, no dkr/, no secrets.
  on "rm -rf '$BUILD_DIR' && mkdir -p '$BUILD_DIR'"
  git archive --format=tar HEAD | on "tar -x -C '$BUILD_DIR'"
  on "test -f '$BUILD_DIR/referee/Dockerfile'" || die "the snapshot did not arrive intact"
  ok "source is on the NAS at $BUILD_DIR"

  say "Building (this compiles and typechecks inside the image; a few minutes)"
  on "cd '$BUILD_DIR' && $DOCKER build -f referee/Dockerfile -t wcsim-referee ."
  ok "image built"

  on "$DOCKER image inspect wcsim-referee --format '   wcsim-referee  {{.Id}}  {{.Created}}'"
}

# --------------------------------------------------------------- config ------
stage_config() {
  say "Copy the three staged config files, and set the referee password"
  require_local_files
  detect_docker

  local ts; ts=$(date +%Y%m%d-%H%M%S)

  copy_verified() {
    local src="$1" dstdir="$2" name; name=$(basename "$src")
    local local_md5 remote_md5
    on "test -f '$dstdir/$name' && cp -p '$dstdir/$name' '$dstdir/$name.bak-$ts' || true"
    scp -O -o BatchMode=yes "$src" "$TARGET:$dstdir/$name" >/dev/null
    local_md5=$(md5sum "$src" | cut -d' ' -f1)
    remote_md5=$(on "md5sum '$dstdir/$name'" | cut -d' ' -f1)
    [ "$local_md5" = "$remote_md5" ] \
      || die "$name did not transfer intact ($local_md5 != $remote_md5)"
    ok "$name copied and verified (previous kept as $name.bak-$ts)"
  }

  copy_verified "$LOCAL_COMPOSE" "$STACK"
  copy_verified "$LOCAL_CDS"     "$STACK/volumes/api/envoy"
  copy_verified "$LOCAL_LDS"     "$STACK/volumes/api/envoy"

  say "The referee's database password"
  printf '   It goes in two places and must match. Nothing is echoed, and it is never\n'
  printf '   passed as an argument or written to a local file.\n\n'
  local pw pw2
  read -r -s -p "   password (blank to skip): " pw; echo
  if [ -z "$pw" ]; then
    warn "skipped - the referee will not start until PVP_REFEREE_PASSWORD is set"
  else
    read -r -s -p "   again: " pw2; echo
    [ "$pw" = "$pw2" ] || die "they do not match"
    case "$pw" in *[!A-Za-z0-9]*) warn "not alphanumeric - fine for SQL, but it must be URL-safe in the connection string";; esac

    on "cp -p '$STACK/.env' '$STACK/.env.bak-$ts'"
    # Replace the line if present, append if not. The value reaches the NAS over the
    # existing ssh channel on stdin, so it is not in argv on either machine.
    printf '%s' "$pw" | on "read -r P; \
      if grep -q '^PVP_REFEREE_PASSWORD=' '$STACK/.env'; then \
        awk -v p=\"\$P\" '/^PVP_REFEREE_PASSWORD=/{print \"PVP_REFEREE_PASSWORD=\" p; next} {print}' \
          '$STACK/.env' > '$STACK/.env.new' && mv '$STACK/.env.new' '$STACK/.env'; \
      else \
        printf '\nPVP_REFEREE_PASSWORD=%s\n' \"\$P\" >> '$STACK/.env'; \
      fi"
    on "grep -q '^PVP_REFEREE_PASSWORD=.\\+' '$STACK/.env'" \
      || die "the password did not land in $STACK/.env"
    ok "PVP_REFEREE_PASSWORD set in $STACK/.env (previous kept as .env.bak-$ts)"

    say "NOW PASTE THIS INTO STUDIO'S SQL EDITOR - the role is still nologin until you do"
    printf "\n   alter role pvp_referee login password '<the same password>';\n\n"
    printf '   (Not run from here on purpose: this script never holds your database\n'
    printf '   credentials, and the password should not go into a second tool.)\n'
  fi
}

# ------------------------------------------------------------------- up ------
stage_up() {
  say "Bring the stack up"
  detect_docker

  on "cd '$STACK' && $COMPOSE config -q" \
    || die "compose refuses the config - the staged YAML has a problem.
   Nothing has been restarted. Put the .bak files back if you want to stop here."
  ok "compose parses the edited files"

  say "docker compose up -d --remove-orphans"
  on "cd '$STACK' && $COMPOSE up -d --remove-orphans"

  say "Restarting the gateway (envoy reads its routes only at startup)"
  on "cd '$STACK' && $COMPOSE restart api-gw"

  say "Where things stand"
  on "cd '$STACK' && $COMPOSE ps --format '   {{.Service}}\t{{.Status}}' 2>/dev/null || $COMPOSE ps"

  say "The referee's own log, last 20 lines"
  on "cd '$STACK' && $COMPOSE logs --tail=20 referee 2>&1 | sed 's/^/   /'" || true
}

# --------------------------------------------------------------- verify ------
stage_up_host() {
  # The public hostname, read from the stack's own .env rather than guessed.
  on "grep -E '^(SUPABASE_PUBLIC_URL|API_EXTERNAL_URL)=' '$STACK/.env' | head -1 | cut -d= -f2-" \
    | tr -d '\r' | sed 's:/*$::'
}

stage_verify() {
  say "Verify"
  # THIS WAS MISSING AND IT COST A WHOLE VERIFY RUN. Steps 4 and 5 reach the database
  # through compose on the NAS, and Synology needs both a full path and sudo for it - so
  # without this the two calls below were written as a bare `docker compose`, which fails,
  # which under `set -euo pipefail` aborts the script inside a command substitution. The
  # symptom is the step-4 heading printing and then nothing at all: no warning, no footer,
  # exit 0 as far as the shell prompt is concerned.
  detect_docker
  local host; host=$(stage_up_host)
  [ -n "$host" ] || die "could not read the public URL from $STACK/.env"
  ok "public URL: $host"

  local want
  want=$(npx --yes esbuild --bundle --format=esm --platform=node scripts/referee-version.ts 2>/dev/null \
           | node --input-type=module 2>/dev/null || true)

  say "1. the referee's version"
  local got; got=$(curl -s --ssl-no-revoke --max-time 15 "$host/referee/version" || true)
  printf '   served:    %s\n' "${got:-<no answer>}"
  printf '   this repo: %s\n' "${want:-<could not compute>}"
  # Distinguish "the referee answered with the wrong hash" from "nothing answered at all".
  # The first version of this reported DATASET MISMATCH for both, which sent the first real
  # deploy off to rebuild a perfectly good image twice while the actual fault was routing.
  local h_want h_got
  h_want=$(printf '%s' "$want" | sed -n 's/.*"dataset":"\([^"]*\)".*/\1/p')
  h_got=$(printf  '%s' "$got"  | sed -n 's/.*"dataset":"\([^"]*\)".*/\1/p')
  case "$got" in
    *'"dataset"'*)
      if [ "$h_want" = "$h_got" ]; then
        ok "dataset $h_got matches - the image carries the same squads as the client"
      else
        warn "DATASET MISMATCH (repo $h_want vs served $h_got). The image was built from a
   different commit: re-run --build, or every player gets 'Versus is updating' instead of a
   room. The hash moved on 2026-08-26 when the 2026 World Cup was added."
      fi ;;
    *'RBAC: access denied'*)
      warn "THE GATEWAY REFUSED IT, the referee never saw it. Its RBAC filter is
   ALLOW-with-policies, so a path matching no policy is denied. The referee route needs its
   own RBACPerRoute allow_all - see the route in lds.template.yaml." ;;
    *'upstream connect'*|*'no healthy upstream'*)
      warn "THE GATEWAY COULD NOT REACH THE REFEREE. Nothing here says the image is wrong.
   Check, in this order: (1) the docker bridge firewall rules - re-run the Task Scheduler
   job, because CONTAINER OPERATIONS wipe them and the symptom is every service behind the
   gateway answering 503, the live accounts stack included; (2) the container is healthy
   ('docker compose ps'); (3) the cluster health check path is one the referee answers
   WITHOUT a session, which means /referee/v1/health and not /version." ;;
    '') warn "no answer at all from $host/referee/version" ;;
    *)  warn "unexpected answer, neither a version nor a known gateway error" ;;
  esac

  say "2. no token at all - must be 401"
  curl -s -o /dev/null -w '   HTTP %{http_code}\n' --ssl-no-revoke --max-time 15 \
    -X POST "$host/referee/v1/rooms" || true

  say "3. the ANON KEY - must ALSO be 401, and this is the one that matters"
  local anon
  anon=$(on "grep -E '^ANON_KEY=' '$STACK/.env' | head -1 | cut -d= -f2-" | tr -d '\r' || true)
  if [ -n "$anon" ]; then
    local body
    body=$(curl -s --ssl-no-revoke --max-time 15 -X POST \
             -H "Authorization: Bearer $anon" "$host/referee/v1/rooms" || true)
    printf '   %s\n' "${body:-<no answer>}"
    case "$body" in
      *not-authenticated*) ok "refused as not-authenticated" ;;
      *) warn "expected a 401 saying not-authenticated. The anon key is a VALID signature
   from the same secret and it ships in the browser bundle, so a referee that only checks
   signatures would accept it from anyone on the internet. Do not go further until this
   reads 401." ;;
    esac
  else
    warn "could not read ANON_KEY from the stack .env - do this curl by hand"
  fi

  say "4. MAKE A REAL ROOM - the first thing here that touches the database"
  # THE CHECK THIS SCRIPT WAS MISSING, and its absence is why wave 5's first player got a
  # 500 from a deploy this script had called verified. Steps 1 to 3 are all database-free:
  # `/version` reads a bundled constant, and both 401s are refused before Postgres is
  # touched. So "verified" meant "the routing and the auth work" and the very first INSERT
  # was made by a player in a browser.
  #
  # A session token is minted ON THE BOX from the stack's own JWT_SECRET, for a real
  # profile id, because the referee correctly refuses everything else - including the anon
  # key, which is what step 3 proves. The room is deleted afterwards.
  local secret profile
  secret=$(on "grep -E '^JWT_SECRET=' '$STACK/.env' | head -1 | cut -d= -f2-" | tr -d '\r' || true)
  profile=$(on "$COMPOSE -f '$STACK/docker-compose.yml' exec -T db psql -U postgres -tAc \"select id from profiles order by created_at limit 1\"" 2>/dev/null | tr -d '\r' | head -1 || true)
  if [ -z "$secret" ] || [ -z "$profile" ]; then
    warn "could not mint a test session (JWT_SECRET or a profile id was unreadable), so the
   database side is STILL unverified. Do not call this deploy done: open a room in the
   browser and watch 'docker compose logs -f referee' while you do."
  else
    ok "minting a session for profile $profile"
    # HS256 by hand, in the shell, so nothing has to be installed on the NAS.
    local token
    token=$(on "python3 - <<'PYEOF'
import base64, hashlib, hmac, json, time
def b64(b): return base64.urlsafe_b64encode(b).rstrip(b'=').decode()
h = b64(json.dumps({'alg':'HS256','typ':'JWT'},separators=(',',':')).encode())
p = b64(json.dumps({'role':'authenticated','sub':'$profile','exp':int(time.time())+300},separators=(',',':')).encode())
sig = b64(hmac.new('''$secret'''.encode(), f'{h}.{p}'.encode(), hashlib.sha256).digest())
print(f'{h}.{p}.{sig}')
PYEOF" | tr -d '\r' | tail -1)
    local made
    made=$(curl -s --ssl-no-revoke --max-time 20 -X POST \
             -H "Authorization: Bearer $token" -H 'content-type: application/json' \
             -d '{"visibility":"private","size":2,"method":"budget","budget":110,"years":[],"pickSeconds":20}' \
             "$host/referee/v1/rooms" || true)
    printf '   %s\n' "${made:-<no answer>}"
    case "$made" in
      *'"code"'*'"status":"lobby"'*)
        local made_code; made_code=$(printf '%s' "$made" | sed -n 's/.*"code":"\([A-Z0-9]*\)".*/\1/p')
        ok "a room was created and read back: $made_code"

        say "5. NOW CHANGE IT - creating a room never READS one back"
        # THE SECOND CHECK THIS SCRIPT WAS MISSING, and it cost a second broken deploy.
        # Step 4 builds the room object in memory and inserts it, so nothing there reads a
        # room out of Postgres - and that is precisely the half that broke on 2026-08-27:
        # two columns the row mapper needs were absent from the two selects that fetch a
        # room, so the referee could open one and then failed on every join, ready, start
        # and pick. This script called that deploy verified, because creating is the one
        # operation the bug did not touch. One more curl covers load, mutate and save.
        local changed
        changed=$(curl -s --ssl-no-revoke --max-time 20 -X POST \
                    -H "Authorization: Bearer $token" -H 'content-type: application/json' \
                    -d '{"formationName":"4-4-2","style":"bal","ready":true}' \
                    "$host/referee/v1/rooms/$made_code/lineup" || true)
        printf '   %s\n' "${changed:-<no answer>}"
        case "$changed" in
          *'"formationName":"4-4-2"'*) ok "read back, changed and saved" ;;
          *referee-error*)
            warn "THE REFEREE THREW ON A ROOM IT HAD JUST CREATED. So creating one works and
   reading one back does not, which is the 2026-08-27 failure exactly. The reply names the
   SQLSTATE where there is one; the log has the rest. NO SQLSTATE at all means the fault is
   in the row mapping rather than in Postgres: every column referee/src/rows.ts reads must
   be named in the selects in referee/src/pgStore.ts, which npm run checks asserts." ;;
          *) warn "expected the room back carrying the new formation. The read-and-save path
   is NOT verified, which is most of what a room does." ;;
        esac

        on "$COMPOSE -f '$STACK/docker-compose.yml' exec -T db psql -U postgres -qc \"delete from pvp_rooms where code = '$made_code'\"" >/dev/null 2>&1 \
          && ok "test room deleted" || warn "could not delete the test room $made_code - do it in Studio" ;;
      *no-display-name*)
        warn "THE REFEREE CANNOT READ profiles.display_name. That is a POLICY, not a grant:
   0016 grants it three columns and adds no policy, and row-level security denies by
   default. 0017's profiles_referee_read is the fix - check it is applied." ;;
      *referee-error*)
        warn "THE REFEREE THREW. Its reply now names the SQLSTATE; the container log has the
   rest: 'docker compose logs --tail=50 referee'. 42501 is a missing grant, 42703 a column
   the image expects and the schema has not got (rebuild from HEAD), 23502 a not-null with
   no default, 28P01 a wrong pvp_referee password." ;;
      *unauthorized*)
        warn "the referee refused a token signed with the stack's own JWT_SECRET, so the
   container was given a different one. Check REFEREE_DATABASE_URL's neighbour
   SUPABASE_JWT_SECRET in the compose service." ;;
      *) warn "unexpected answer - the database side is not verified" ;;
    esac
  fi

  say "Still yours to do, neither has a CLI"
  printf '   %s\n' \
    "a. DSM -> Control Panel -> Login Portal -> Advanced -> Reverse Proxy -> your rule" \
    "   -> Custom Header -> Create -> WebSocket." \
    "   Missing it looks like 'the lobby never updates', with a clean 200 in the logs." \
    "b. Set the GitHub repository VARIABLE VITE_REFEREE_URL to $host/referee and push." \
    "   That is the first step a player can see. Unset it to undo the whole thing."
}

case "$STAGE" in
  check)  stage_check  ;;
  build)  stage_build  ;;
  config) stage_config ;;
  up)     stage_up     ;;
  verify) stage_verify ;;
esac

say "done: --$STAGE"
