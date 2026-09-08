#!/bin/sh
#
# Nightly dump of the accounts database, for the NAS. Roadmap item 62, habit 2.
#
# WHY THIS EXISTS. NFR-6 in docs/cloud-sync-requirements.md decided deliberately that
# nothing was backed up, and that was right while there were no accounts and while the
# accounts were being wiped before launch. An album is not re-earnable and a career is not
# re-playable, so the day a collection is real it stops being right.
#
# WHERE THE DUMPS GO, AND WHY IT IS NOT BESIDE THE STACK. A dump on the same disk as the
# database dies with the database, so it has to land somewhere an off-box backup job
# already copies. /volume1/backup is a real shared folder for exactly that. Putting it
# under the stack folder would also mean a stack operation could sweep it.
#
# IT VERIFIES WHAT IT WROTE. A backup nobody has read back is a habit, not a backup, so
# every run lists the dump's own table of contents and refuses to keep a file that cannot
# be read. It writes to a temp name and renames only once that passes, so a half-written
# dump can never be mistaken for a good one.
#
# RETENTION never empties the folder: if pruning would leave nothing, it prunes nothing.
# At ~4 MB a dump, 30 days is about 120 MB.
#
# Run it from DSM's Task Scheduler once a night. It works as root (no sudo needed) or as a
# user holding the NOPASSWD rule for /usr/local/bin/docker.
#
# Restore, into a scratch database first so the live one is never the experiment:
#   docker exec -i supabase-db psql -U postgres -c 'create database restore_test'
#   docker exec -i supabase-db pg_restore -U postgres -d restore_test < <the dump>
#   docker exec -i supabase-db psql -U postgres -d restore_test -c '\dt public.*'
#   docker exec -i supabase-db psql -U postgres -c 'drop database restore_test'
# Over the live database it is pg_restore --clean --if-exists -d postgres.

set -eu

DEST=/volume1/backup/wcsim-db
KEEP_DAYS=30
CONTAINER=supabase-db
DOCKER=/usr/local/bin/docker
MIN_BYTES=100000          # a real dump of this database is megabytes; anything tiny is a failure
MIN_TOC_LINES=50          # and its table of contents has hundreds of entries

if [ "$(id -u)" = "0" ]; then SUDO=""; else SUDO="sudo -n"; fi

mkdir -p "$DEST"
LOG="$DEST/backup.log"
STAMP=$(date +%Y%m%d-%H%M%S)
FINAL="$DEST/wcsim-$STAMP.dump"
TMP="$DEST/.wcsim-$STAMP.part"

say() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }
die() { say "FAILED: $*"; rm -f "$TMP"; exit 1; }

say "start"

# -Fc is the custom format: compressed, and pg_restore can list and filter it.
$SUDO $DOCKER exec "$CONTAINER" pg_dump -U postgres -Fc -d postgres > "$TMP" \
  || die "pg_dump returned non-zero"

[ -s "$TMP" ] || die "dump is empty"

SIZE=$(wc -c < "$TMP")
[ "$SIZE" -ge "$MIN_BYTES" ] || die "dump is only $SIZE bytes, expected at least $MIN_BYTES"

# Read it back. A dump that cannot be listed cannot be restored.
TOC=$($SUDO $DOCKER exec -i "$CONTAINER" pg_restore -l < "$TMP" 2>/dev/null | wc -l) \
  || die "pg_restore could not read the dump"
[ "$TOC" -ge "$MIN_TOC_LINES" ] || die "table of contents has only $TOC lines, expected $MIN_TOC_LINES+"

mv "$TMP" "$FINAL"
say "ok: $FINAL ($SIZE bytes, $TOC toc entries)"

# Prune, but never to nothing.
TOTAL=$(find "$DEST" -maxdepth 1 -name 'wcsim-*.dump' | wc -l)
OLD=$(find "$DEST" -maxdepth 1 -name 'wcsim-*.dump' -mtime +"$KEEP_DAYS" | wc -l)
if [ "$OLD" -gt 0 ] && [ "$TOTAL" -gt "$OLD" ]; then
  find "$DEST" -maxdepth 1 -name 'wcsim-*.dump' -mtime +"$KEEP_DAYS" -delete
  say "pruned $OLD older than $KEEP_DAYS days, $((TOTAL - OLD)) kept"
elif [ "$OLD" -gt 0 ]; then
  say "refused to prune $OLD: it would leave the folder empty"
fi

say "done"
