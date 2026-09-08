#!/usr/bin/env python3
"""
Take the database admin console off the public internet, leaving it on the LAN and the VPN.

WHY THIS IS A SURGICAL PATCH AND NOT A NEW FILE. `dkr/` is a mirror of the NAS and it goes
stale in both directions, so shipping a whole `lds.template.yaml` from the laptop is how the
mailer settings were silently reverted on 2026-08-26. This edits the LIVE file in place and
refuses to touch it unless it finds exactly what it expects, so a drifted server is a
refusal with the reason printed rather than a wrong file installed.

WHAT IT CHANGES. The listener's last route is a catch-all: anything not claimed by
/auth/v1/, /rest/v1/, /referee/, /pg/ or /mcp goes to the admin console, guarded by one
basic-auth password, in front of a postgres SUPERUSER connection. It becomes two routes:
the console when the request is addressed to the NAS itself, and a bare 404 otherwise.

MATCHED ON THE HOST, AND IT FAILS CLOSED. Envoy cannot tell a LAN browser from the internet
by address: the DSM reverse proxy dials the same listener over loopback, so every internet
request arrives from the host. What DOES differ is what the request asks FOR. A browser on
the LAN asks for the NAS (192.168.1.115:8000); a player, or anybody else on the internet,
asks for the public hostname. Anything this rule does not recognise falls through to the
404, so a host header nobody predicted is refused rather than let in.

THE GAME IS UNTOUCHED. Sign-in, saving and versus live on their own prefixes, which are
matched earlier and never reach either of these routes. The only thing that stops answering
publicly is the console.

Usage, on the NAS:
    python3 studio-lan-only.py --check     # says what it would do, changes nothing
    python3 studio-lan-only.py --apply     # backs the file up, then edits it
    python3 studio-lan-only.py --revert    # puts the newest backup back

Applying does NOT restart anything. That is a separate, deliberate step.
"""

import argparse
import glob
import io
import os
import shutil
import sys
import time

LDS = os.environ.get('LDS_PATH') or '/volume1/docker/wcsim-supabase/volumes/api/envoy/lds.template.yaml'

# The LAN address the console keeps answering on. A prefix match, so the :8000 port comes
# along for free. Add another entry if you reach the NAS by name rather than by address;
# do NOT add the public hostname, which is the whole point of the change.
LAN_HOSTS = ['192.168.1.115']

# The catch-all as it stands today, matched whole so a drifted file is a refusal rather
# than a silent half-edit. Kept at the file's own indentation.
OLD = """                      - match:
                          prefix: /
                        route:
                          cluster: studio
                          timeout: 30s
                        request_headers_to_remove:
                          - authorization
                        request_headers_to_add:
                          - header:
                              key: X-Forwarded-Prefix
                              value: /
                            append_action: ADD_IF_ABSENT
                        typed_per_filter_config:
                          envoy.filters.http.rbac:
                            '@type': >-
                              type.googleapis.com/envoy.extensions.filters.http.rbac.v3.RBACPerRoute
                            rbac:
                              rules:
                                action: ALLOW
                                policies:
                                  allow_all:
                                    permissions:
                                      - any: true
                                    principals:
                                      - any: true
"""

RBAC_ALLOW = """                        typed_per_filter_config:
                          envoy.filters.http.rbac:
                            '@type': >-
                              type.googleapis.com/envoy.extensions.filters.http.rbac.v3.RBACPerRoute
                            rbac:
                              rules:
                                action: ALLOW
                                policies:
                                  allow_all:
                                    permissions:
                                      - any: true
                                    principals:
                                      - any: true
"""


def new_block():
    hosts = '\n'.join(
        "                            - name: ':authority'\n"
        "                              string_match:\n"
        "                                prefix: '%s'" % h
        for h in LAN_HOSTS
    )
    return (
        """                      # THE ADMIN CONSOLE IS LAN-ONLY (2026-09-08, roadmap item 61).
                      # It used to answer at the root of the PUBLIC hostname behind one
                      # basic-auth password, in front of a postgres SUPERUSER connection, so a
                      # password that leaked once was total control of the database from
                      # anywhere in the world. It now answers only when the request is
                      # addressed to the NAS itself: http://192.168.1.115:8000/
                      #
                      # MATCHED ON THE HOST, BECAUSE THE ADDRESS CANNOT TELL THEM APART. The
                      # DSM reverse proxy dials this same listener over loopback, so every
                      # internet request arrives from the host and there is no client address
                      # to filter on. What differs is what the request ASKS FOR.
                      #
                      # IT FAILS CLOSED, WHICH IS THE POINT. Anything this rule does not
                      # recognise falls through to the 404 below rather than to the console, so
                      # a host header nobody predicted is refused rather than admitted. Add a
                      # prefix here if you reach the NAS by name; never add the public one.
                      #
                      # The password still guards the LAN path. This narrows WHERE the console
                      # can be reached from, and changes nothing about the game: /auth/v1/,
                      # /rest/v1/ and /referee/ are matched earlier and never reach here.
                      - name: studio-lan
                        match:
                          prefix: /
                          headers:
"""
        + hosts
        + "\n"
        + """                        route:
                          cluster: studio
                          timeout: 30s
                        request_headers_to_remove:
                          - authorization
                        request_headers_to_add:
                          - header:
                              key: X-Forwarded-Prefix
                              value: /
                            append_action: ADD_IF_ABSENT
"""
        + RBAC_ALLOW
        + """
                      # Everything else asking for the root gets nothing, and gets it with NO
                      # password prompt: a prompt would confirm there is something here worth
                      # guessing at. basic_auth is switched off for this route for that reason
                      # alone, and it answers before any cluster is reached.
                      - name: studio-not-here
                        match:
                          prefix: /
                        direct_response:
                          status: 404
                          body:
                            inline_string: "not found\\n"
                        typed_per_filter_config:
                          envoy.filters.http.basic_auth:
                            '@type': >-
                              type.googleapis.com/envoy.config.route.v3.FilterConfig
                            disabled: true
                          envoy.filters.http.rbac:
                            '@type': >-
                              type.googleapis.com/envoy.extensions.filters.http.rbac.v3.RBACPerRoute
                            rbac:
                              rules:
                                action: ALLOW
                                policies:
                                  allow_all:
                                    permissions:
                                      - any: true
                                    principals:
                                      - any: true
"""
    )


def read(path):
    """The file with its line endings NORMALISED for matching, plus what they really were.

    Reading in text mode turns CRLF into LF, and writing it back then converts the whole
    file: a one-route change arrives as a thousand-line diff nobody can review, on a live
    server. So read the endings verbatim, match against LF, and put them back on write.
    """
    raw = io.open(path, encoding='utf-8', newline='').read()
    return raw.replace('\r\n', '\n'), ('\r\n' if '\r\n' in raw else '\n')


def write(path, text, eol):
    io.open(path, 'w', encoding='utf-8', newline='').write(
        text if eol == '\n' else text.replace('\n', '\r\n'))


def die(msg):
    sys.stderr.write('REFUSED: %s\n' % msg)
    raise SystemExit(1)


def inspect():
    if not os.path.exists(LDS):
        die('%s does not exist. Wrong box, or the stack moved.' % LDS)
    s, eol = read(LDS)
    if 'studio-lan' in s:
        print('Already applied: the file already carries the studio-lan route.')
        print('Nothing to do. Use --revert to undo it.')
        return s, eol, False
    n = s.count(OLD)
    if n == 0:
        die(
            'the catch-all route is not what this patch expects, so the live file has '
            'drifted.\nNothing has been changed. Send the last 40 lines of\n  %s\nand the '
            'patch will be rebuilt against it.' % LDS
        )
    if n > 1:
        die('found the catch-all route %d times, expected once. Nothing changed.' % n)
    print('Found the catch-all route once, as expected.')
    print('It will become two routes: the console for %s, a 404 for everything else.'
          % ', '.join(LAN_HOSTS))
    return s, eol, True


def apply_it():
    s, eol, todo = inspect()
    if not todo:
        return
    stamp = time.strftime('%Y%m%d-%H%M%S')
    backup = '%s.bak-%s' % (LDS, stamp)
    shutil.copy2(LDS, backup)
    out = s.replace(OLD, new_block())
    # Belt and braces: the console must still be reachable somehow, and the refusal must
    # exist. A patch that produced neither would lock the owner out of their own database.
    if 'studio-lan' not in out or 'studio-not-here' not in out:
        os.remove(backup)
        die('the edited text is missing one of the two routes. Nothing written.')
    write(LDS, out, eol)
    print('Written. Previous file kept as:\n  %s' % backup)
    print('')
    print('NOTHING IS LIVE YET. Envoy reads its routes at startup, so apply it with:')
    print('  cd /volume1/docker/wcsim-supabase \\')
    print('    && sudo -n /usr/local/bin/docker compose restart api-gw')


def revert():
    backups = sorted(glob.glob('%s.bak-*' % LDS))
    if not backups:
        die('no backup found beside %s' % LDS)
    newest = backups[-1]
    shutil.copy2(newest, LDS)
    print('Restored from:\n  %s' % newest)
    print('Restart the gateway for it to take effect:')
    print('  cd /volume1/docker/wcsim-supabase \\')
    print('    && sudo -n /usr/local/bin/docker compose restart api-gw')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--check', action='store_true', help='say what would happen, change nothing')
    g.add_argument('--apply', action='store_true', help='back up, then edit the live file')
    g.add_argument('--revert', action='store_true', help='restore the newest backup')
    a = ap.parse_args()
    if a.check:
        inspect()
    elif a.apply:
        apply_it()
    else:
        revert()
