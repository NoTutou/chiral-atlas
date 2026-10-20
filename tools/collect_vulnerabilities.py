"""Refresh primary evidence snapshots; no web service or runtime network dependency.

Run manually: python3 tools/collect_vulnerabilities.py
Existing snapshots are reused unless --refresh is supplied.
"""
import concurrent.futures
import datetime
import hashlib
import json
from pathlib import Path
import re
import sys
import urllib.request

ROOT = Path(__file__).resolve().parent.parent / 'knowledge-base'
RAW = ROOT / 'sources'
RAW.mkdir(parents=True, exist_ok=True)
original = ROOT / 'input' / 'BUGS.md'
if not original.exists():
    original.parent.mkdir(parents=True, exist_ok=True)
    original.write_bytes(Path('/home/sflight/PX4_BUG/BUGS/BUGS.md').read_bytes())
ids = re.findall(r'^\|\s*((?:CVE|EDB|GH-ISSUE|GHSA|GHSL|MAVLINK-ISSUE)-[\w-]+)', original.read_text(), re.M)
manifest_path = ROOT / 'sources.json'
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

def fetch(key, url):
    path = RAW / (key + '.json')
    if path.exists() and '--refresh' not in sys.argv:
        return json.loads(path.read_text())
    request = urllib.request.Request(url, headers={'User-Agent': 'chiral-atlas-evidence-collector', 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=40) as res:
        raw = res.read()
    data = json.loads(raw)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    manifest[key] = {'url': url, 'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                     'file': 'sources/' + path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    return data

def cve(cid):
    year, number = cid.split('-')[1:]
    data = fetch(cid, f'https://raw.githubusercontent.com/CVEProject/cvelistV5/main/cves/{year}/{int(number)//1000}xxx/{cid}.json')
    refs = data.get('containers', {}).get('cna', {}).get('references', [])
    for ref in refs:
        match = re.search(r'/security/advisories/(GHSA-[\w-]+)', ref.get('url', ''))
        if match:
            ghsa = match[1]
            fetch(ghsa, f'https://api.github.com/repos/PX4/PX4-Autopilot/security-advisories/{ghsa}')
    return cid

def main():
    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        tasks = {pool.submit(cve, cid): cid for cid in ids if cid.startswith('CVE-')}
        for task in concurrent.futures.as_completed(tasks):
            try:
                print('OK', task.result())
            except Exception as e:
                failures.append(tasks[task])
                print('ERROR', tasks[task], str(e))
    for key, url in [
        ('GHSA-5hvv-q2r5-rppw','https://api.github.com/repos/PX4/PX4-Autopilot/security-advisories/GHSA-5hvv-q2r5-rppw'),
        ('PX4-ADVISORIES','https://api.github.com/repos/PX4/PX4-Autopilot/security-advisories?per_page=100'),
        ('GH-ISSUE-18385','https://api.github.com/repos/PX4/PX4-Autopilot/issues/18385'),
        ('GH-ISSUE-23251','https://api.github.com/repos/PX4/PX4-Autopilot/issues/23251'),
        ('MAVLINK-ISSUE-474','https://api.github.com/repos/mavlink/mavlink/issues/474'),
    ]:
        try:
            data = fetch(key, url)
            if 'ISSUE' in key:
                fetch(key + '-comments', data['comments_url'])
            print('OK', key)
        except Exception as e:
            failures.append(key)
            print('ERROR', key, str(e))
    # Follow primary reports and fixes for the original CVEs. No exploit is executed.
    urls = set()
    for path in RAW.glob('CVE-*.json'):
        data = json.loads(path.read_text())
        for ref in data.get('containers', {}).get('cna', {}).get('references', []):
            url = ref.get('url', '')
            match = re.match(r'https://github.com/([^/]+/[^/]+)/(issues|pull)/(\d+)', url)
            if match:
                repo, kind, number = match.groups()
                urls.add((repo, kind, number))
    urls.add(('PX4/PX4-Autopilot', 'pull', '18411'))
    urls.update(('PX4/PX4-Autopilot', 'pull', n) for n in ['18371', '22834', '22531'])
    urls.update([('apache/incubator-nuttx', 'pull', '3292'), ('apache/incubator-nuttx-apps', 'pull', '647')])
    for repo, kind, number in sorted(urls):
        key = repo.replace('/', '--') + '-' + kind + '-' + number
        endpoint = 'pulls' if kind == 'pull' else 'issues'
        try:
            data = fetch(key, f'https://api.github.com/repos/{repo}/{endpoint}/{number}')
            if kind == 'issues':
                fetch(key + '-comments', data['comments_url'] + '?per_page=100')
        except Exception as e:
            failures.append(key)
            print('ERROR', key, str(e))
    # Extract additional advisories from the already retrieved full index.
    index_path = RAW / 'PX4-ADVISORIES.json'
    index = json.loads(index_path.read_text()) if index_path.exists() else []
    for advisory in index:
        key = advisory['ghsa_id']
        path = RAW / (key + '.json')
        if not path.exists() or ('--refresh' in sys.argv and manifest.get(key, {}).get('extractedFrom') == 'PX4-ADVISORIES'):
            path.write_text(json.dumps(advisory, ensure_ascii=False, indent=2) + '\n')
            manifest[key] = {**manifest['PX4-ADVISORIES'], 'file': 'sources/' + path.name,
                             'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                             'extractedFrom': 'PX4-ADVISORIES'}
    # Reports hosted as Markdown in researchers' repositories, kept as data.
    for key, url in [
        ('report-geofence', 'https://raw.githubusercontent.com/Drone-Lab/PX4-Autopilot/report-the-faliure-of-precheck/report-the-faliure-of-precheck.md'),
        ('report-homepoint', "https://raw.githubusercontent.com/Drone-Lab/PX4-Autopilot/report-can%27t-finish-mission/report-can%27t-finish-mission.md"),
        ('GHSL-2025-087', 'https://securitylab.github.com/advisories/GHSL-2025-087_PX4_PX4-Autopilot/'),
        ('EDB-52339', 'https://www.exploit-db.com/exploits/52339'),
        ('mavlink-signing', 'https://mavlink.io/en/guide/message_signing.html'),
    ]:
        path = RAW / (key + '.txt')
        if key in manifest and (ROOT / manifest[key]['file']).exists() and '--refresh' not in sys.argv:
            continue
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'chiral-atlas-evidence-collector'}), timeout=40) as res:
                path.write_bytes(res.read())
            manifest[key] = {'url': url, 'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                             'file': 'sources/' + path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        except Exception as e:
            failures.append(key)
            print('ERROR', key, str(e))
    manifest_path.write_text(json.dumps(dict(sorted(manifest.items())), ensure_ascii=False, indent=2) + '\n')
    print('Snapshots:', len(manifest))
    if failures:
        print('Incomplete refresh; retained older evidence where available:', ', '.join(sorted(set(failures))))
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
