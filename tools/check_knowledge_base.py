"""Offline integrity checks for the researched catalog and its evidence chain."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / 'knowledge-base'
read = lambda name: json.loads((BASE / name).read_text())
catalog, manifest = read('catalog.json'), read('sources.json')
records = catalog['records']
by_id = {r['id']: r for r in records}
original = BASE / 'input/BUGS.md'
original_ids = set(re.findall(r'^\|\s*((?:CVE|EDB|GH-ISSUE|GHSA|GHSL|MAVLINK-ISSUE)-[\w-]+)', original.read_text(), re.M))
assert len(original_ids) == 30 and original_ids <= by_id.keys()
upstream = Path('/home/sflight/PX4_BUG/BUGS/BUGS.md')
if upstream.exists():
    assert upstream.read_bytes() == original.read_bytes(), 'Original input changed'
assert len(by_id) == len(records) == catalog['recordCount'] == 32
assert len({r['canonicalId'] for r in records}) == catalog['groupCount'] == 29
assert sum(r['original'] is not None for r in records) == catalog['originalCount'] == 30
assert {r['shelf'] for r in records} == set('ABCDEF')
assert len(manifest) == catalog['snapshotCount']
for key, source in manifest.items():
    path = BASE / source['file']
    assert path.is_relative_to(BASE / 'sources'), key
    assert path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == source['sha256'], key
    assert source['url'].startswith('https://') and source['retrievedAt'], key

for r in records:
    rid = r['id']
    assert r['canonicalId'] in by_id
    assert len(r['tracks']) == 6 and all(t['body'].strip() for t in r['tracks']), rid
    assert all(r[k] for k in ['title', 'component', 'trigger', 'rootCause', 'impact', 'affected', 'fixed', 'remediation', 'verification']), rid
    sources = {s['id']: s for s in r['sources']}
    assert sources and len({s['url'] for s in sources.values()}) == len(sources), rid
    for sid, s in sources.items():
        assert sid in manifest and s['snapshot'] == manifest[sid]['file'], (rid, sid)
        assert s['sha256'] == manifest[sid]['sha256'] and s['method'], (rid, sid)
        assert s['url'].startswith('https://'), (rid, sid)
    for track in r['tracks']:
        assert track['sources'] and set(track['sources']) <= sources.keys(), rid
    for rating in r['ratings']:
        assert rating['source'] in sources and (rating['score'] is None or 0 <= rating['score'] <= 10), rid
    assert r['rating'] in r['ratings'] or (r['severity'] == 'Unknown' and r['rating']['score'] is None), rid
    assert all(t['source'] in sources for t in r['timeline']), rid
    assert len({rel['id'] for rel in r['related']}) == len(r['related']), rid
    for rel in r['related']:
        assert rel['id'] != rid and rel['id'] in by_id and rel['reason'], rid
        back = next(x for x in by_id[rel['id']]['related'] if x['id'] == rid)
        assert back['type'] == rel['type'] and back['reason'] == rel['reason'], rid
        if rel['type'] == '同一问题 / 证据':
            assert r['canonicalId'] == by_id[rel['id']]['canonicalId'], rid
        else:
            assert r['canonicalId'] != by_id[rel['id']]['canonicalId'], rid

# Guard consequential corrections against accidentally restoring input-table claims.
for rid, severity, score in [
    ('CVE-2026-32709', 'Medium', 5.4), ('CVE-2026-32706', 'High', 7.1),
    ('CVE-2026-32708', 'High', 7.8), ('CVE-2026-32713', 'Medium', 4.3),
    ('GH-ISSUE-18385', 'Unknown', None), ('GHSL-2025-087', 'Medium', None),
]:
    assert (by_id[rid]['severity'], by_id[rid]['rating']['score']) == (severity, score), rid
assert '未合并' in by_id['CVE-2024-24255']['fixed']
assert '未复现' in json.dumps(by_id['CVE-2024-38952'], ensure_ascii=False)
assert '不能据此确认 RCE' in by_id['CVE-2024-30799']['impact']
assert '读取' in by_id['CVE-2024-40427']['impact']

# Rebuilding must not change either generated artifact without an input change.
artifacts = [BASE / 'catalog.json', BASE / 'VERIFICATION.md']
before = [p.read_bytes() for p in artifacts]
subprocess.run([sys.executable, str(ROOT / 'tools/build_knowledge_base.py')], check=True)
assert before == [p.read_bytes() for p in artifacts], 'Generated artifacts were stale'
print(f'PASS: {len(records)} records, {len(original_ids)} originals, {catalog["groupCount"]} groups, '
      f'{len(manifest)} evidence files; hashes, provenance, relationships, corrections and deterministic build.')
