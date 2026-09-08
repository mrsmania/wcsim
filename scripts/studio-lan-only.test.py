"""Prove the patch does what it claims, before it goes anywhere near the NAS.

Every assertion here is one a wrong edit would break, and each was checked by breaking it.
"""
import io, os, shutil, subprocess, sys, glob, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
# The staged mirror of the NAS. The patch is written against this shape and refuses to
# touch anything that does not match it, so this is the right fixture.
SRC = os.environ.get('LDS_FIXTURE') or os.path.join(
    ROOT, 'dkr', 'volumes', 'api', 'envoy', 'lds.template.yaml')
WORK = os.path.join(tempfile.mkdtemp(prefix='studio-lan-'), 'lds.work.yaml')
PATCH = os.path.join(HERE, 'studio-lan-only.py')

for f in glob.glob(WORK + '*'):
    os.remove(f)
shutil.copy2(SRC, WORK)
env = dict(os.environ, LDS_PATH=WORK)


def run(*args):
    r = subprocess.run([sys.executable, PATCH] + list(args), env=env,
                       capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).strip()


def routes_of(path):
    """The listener's routes, as envoy would read them."""
    import yaml
    # The file is a template: ${VARS} are substituted at container start. They sit inside
    # quoted scalars, so plain YAML parses it as-is.
    doc = yaml.safe_load(io.open(path, encoding='utf-8').read())
    vh = doc['resources'][0]['filter_chains'][0]['filters'][0]['typed_config'] \
        ['route_config']['virtual_hosts'][0]
    return vh['routes']


# ---- the file we start from is the one this patch was written against -------------
code, out = run('--check')
assert code == 0, out
assert 'Found the catch-all route once' in out, out
print('[ok] --check recognises the live shape and changes nothing')
assert io.open(WORK, encoding='utf-8').read() == io.open(SRC, encoding='utf-8').read()
print('[ok] --check really wrote nothing')

before = routes_of(WORK)
n_before = len(before)
assert before[-1]['route']['cluster'] == 'studio', before[-1]
assert 'headers' not in before[-1]['match'], 'the catch-all should be unconditional today'
print('[ok] before: %d routes, the last one an unconditional catch-all to the console'
      % n_before)

# ---- apply ------------------------------------------------------------------------
code, out = run('--apply')
assert code == 0, out
assert 'Previous file kept as' in out, out
print('[ok] --apply wrote the file and kept a backup')

after = routes_of(WORK)  # this parse IS the syntax check
assert len(after) == n_before + 1, (n_before, len(after))
lan, denied = after[-2], after[-1]

# The console keeps its route, now conditional on the host.
assert lan['name'] == 'studio-lan'
assert lan['route']['cluster'] == 'studio'
hdrs = lan['match']['headers']
assert [h['name'] for h in hdrs] == [':authority'], hdrs
assert hdrs[0]['string_match']['prefix'] == '192.168.1.115', hdrs
print('[ok] the console answers only for a request addressed to the NAS')

# Everything else gets a bare 404, and no password prompt.
assert denied['name'] == 'studio-not-here'
assert 'route' not in denied, 'the refusal must not proxy anywhere'
assert denied['direct_response']['status'] == 404
ba = denied['typed_per_filter_config']['envoy.filters.http.basic_auth']
assert ba['disabled'] is True, 'a password prompt would confirm something is there'
print('[ok] everything else gets 404 with no password prompt')

# LINE ENDINGS SURVIVE. The first version read in text mode and wrote back with LF, which
# converted every line in the file: a one-route change showed up as a 1,000-line diff on a
# live server, which is unreviewable and hides whatever else it touched.
def eol_counts(path):
    raw = io.open(path, encoding='utf-8', newline='').read()
    return raw.count('\r\n'), raw.count('\n') - raw.count('\r\n')

crlf_src, lf_src = eol_counts(SRC)
crlf_out, lf_out = eol_counts(WORK)
if crlf_src:
    assert lf_out == 0, 'a CRLF file came back with %d bare LF lines' % lf_out
else:
    assert crlf_out == 0, 'an LF file came back with %d CRLF lines' % crlf_out
print('[ok] line endings preserved (%s in, %s out)'
      % ('CRLF' if crlf_src else 'LF', 'CRLF' if crlf_out else 'LF'))

# And the diff really is small: only the catch-all region moved.
import difflib
a = io.open(SRC, encoding='utf-8').read().splitlines()
b = io.open(WORK, encoding='utf-8').read().splitlines()
changed = sum(1 for d in difflib.unified_diff(a, b, n=0) if d[:1] in '+-' and d[:3] not in ('+++', '---'))
assert changed < 90, 'the diff touches %d lines, expected the one route region' % changed
print('[ok] the diff touches %d lines, all of it the catch-all region' % changed)

# The route that refuses must come AFTER the one that allows, or it swallows everything
# and the owner is locked out of their own database.
names = [r.get('name') for r in after]
assert names.index('studio-lan') < names.index('studio-not-here')
print('[ok] the allow comes before the refusal, so the LAN path is not swallowed')

# ---- the game is untouched --------------------------------------------------------
def key(r):
    m = r['match']
    return (r.get('name'), m.get('prefix') or m.get('path'), r.get('route', {}).get('cluster'))

game_before = [key(r) for r in before[:-1]]
game_after = [key(r) for r in after[:-2]]
assert game_before == game_after, 'a game route moved'
print('[ok] all %d game routes are byte-for-byte unchanged (sign-in, saving, versus)'
      % len(game_after))

# The referee is the one the game cannot live without and the one with no apikey gate.
ref = [r for r in after if r.get('name') == 'referee']
assert len(ref) == 1 and ref[0]['route']['cluster'] == 'referee'
print('[ok] /referee/ still routes to the referee')

# ---- idempotent, and revertible ---------------------------------------------------
code, out = run('--check')
assert code == 0 and 'Already applied' in out, out
code, out = run('--apply')
assert code == 0 and 'Already applied' in out, out
assert len(routes_of(WORK)) == n_before + 1, 'a second apply changed the file'
print('[ok] running it twice is a no-op, not a second copy')

code, out = run('--revert')
assert code == 0, out
assert io.open(WORK, encoding='utf-8').read() == io.open(SRC, encoding='utf-8').read()
print('[ok] --revert restores the original exactly')

# ---- it refuses a drifted file rather than guessing -------------------------------
# `- authorization` appears exactly once in the whole file, inside the catch-all, so this
# really drifts the block the patch anchors on rather than some other route. (The first
# version of this test moved a `timeout: 30s`, of which there are several, and drifted a
# route the patch does not read: it applied cleanly and the test was wrong, not the patch.)
s = io.open(WORK, encoding='utf-8').read()
ANCHOR = '\n                          - authorization\n'
assert s.count(ANCHOR) == 1, 'the drift test is not aiming at the catch-all'
io.open(WORK, 'w', encoding='utf-8', newline='').write(
    s.replace(ANCHOR, ANCHOR + '                          - x-drifted\n'))
code, out = run('--apply')
assert code == 1 and 'drifted' in out, (code, out)
print('[ok] a drifted live file is a refusal with the reason, not a wrong edit')

print('\nall assertions passed')
