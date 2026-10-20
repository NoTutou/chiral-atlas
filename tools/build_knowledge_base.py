"""Build the static catalog from curated facts and saved primary evidence. Offline."""
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent / 'knowledge-base'

def read(path):
    return json.loads(path.read_text())

def build():
    curated = read(ROOT / 'curation.json')
    manifest = read(ROOT / 'sources.json')
    evidence = {}
    for key, item in manifest.items():
        path = ROOT / item['file']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == item['sha256'], key
        if path.suffix == '.json':
            evidence[key] = read(path)
    originals = {}
    for line in (ROOT / 'input/BUGS.md').read_text().splitlines():
        cells = [v.strip() for v in line.strip().strip('|').split('|')]
        if cells and re.fullmatch(r'(?:CVE|EDB|GH-ISSUE|GHSA|GHSL|MAVLINK-ISSUE)-[\w-]+', cells[0]):
            originals[cells[0]] = cells
    assert len(originals) == 30
    aliases = {'GHSA-5hvv-q2r5-rppw': 'CVE-2023-46256', 'GH-ISSUE-23251': 'CVE-2024-38951', 'EDB-52339': 'CVE-2025-5640'}
    records = []
    for cur in curated:
        rid = cur['id']
        keys = list(dict.fromkeys(([rid] if rid in manifest else []) + cur['extraSources']))
        # Include the official CVE's advisory/report references and report comments.
        for key in list(keys):
            d = evidence.get(key, {})
            if key.startswith('CVE-'):
                for ref in d.get('containers', {}).get('cna', {}).get('references', []):
                    url = ref.get('url', '')
                    for other, meta in manifest.items():
                        od = evidence.get(other, {})
                        if isinstance(od, dict) and (od.get('html_url') == url or meta['url'] == url):
                            keys.append(other)
            if key.startswith('GHSA-') and isinstance(d, dict) and d.get('cve_id') in manifest:
                keys.append(d['cve_id'])
            if key == 'CVE-2021-34125':
                keys += ['apache--incubator-nuttx-pull-3292', 'apache--incubator-nuttx-apps-pull-647']
        for key in list(keys):
            if key + '-comments' in manifest:
                keys.append(key + '-comments')
        keys = list(dict.fromkeys(keys))
        assert all(key in manifest for key in keys), rid
        sources, ratings, cwes, names, timeline, official_aliases = [], [], [], [], [], []
        published, updated = [], []
        for key in keys:
            m = manifest[key]
            d = evidence.get(key, {})
            if isinstance(d, list):
                label = key + ' · 讨论回复'
                url = d[0].get('html_url', m['url']) if d else m['url']
            else:
                url = d.get('html_url', m['url'])
                label = d.get('title') or d.get('summary') or key
            method = m.get('retrievalMethod', '官方/原始材料快照（JSON 已规范化排版）' if m['file'].endswith('.json') else '原始页面/报告快照')
            if key.startswith('CVE-'):
                url = 'https://www.cve.org/CVERecord?id=' + key
                cna = d.get('containers', {}).get('cna', {})
                label = key + ' · CVE CNA 记录'
                names.append(cna.get('title', ''))
                meta = d.get('cveMetadata', {})
                if meta.get('datePublished'):published.append(meta['datePublished']);timeline.append({'time':meta['datePublished'],'event':key+' 发布','source':key})
                if meta.get('dateUpdated'):updated.append(meta['dateUpdated'])
                for metric in cna.get('metrics', []):
                    for name in ['cvssV3_1', 'cvssV3_0', 'cvssV4_0', 'cvssV2_0']:
                        v = metric.get(name)
                        if v:
                            ratings.append({'source':key,'version':v.get('version', name),'score':v['baseScore'],'severity':v.get('baseSeverity','UNKNOWN').title(),'vector':v.get('vectorString','')})
                for problem in cna.get('problemTypes', []):
                    cwes += [a['cweId'] for a in problem.get('descriptions', []) if a.get('cweId')]
            elif key.startswith('GHSA-'):
                names.append(d.get('summary', ''))
                official_aliases += [a['value'] for a in d.get('identifiers', []) if a.get('value') != rid]
                cwes += [a['cwe_id'] for a in d.get('cwes', [])]
                cvss = d.get('cvss') or {}
                if cvss.get('score') is not None:
                    ratings.append({'source':key,'version':(cvss.get('vector_string') or 'CVSS:3.1').split('/')[0].replace('CVSS:',''),'score':cvss['score'],'severity':d.get('severity','unknown').title(),'vector':cvss.get('vector_string') or ''})
                elif d.get('severity'):
                    ratings.append({'source':key,'version':'未提供','score':None,'severity':d['severity'].title(),'vector':''})
                if d.get('published_at'):published.append(d['published_at']);timeline.append({'time':d['published_at'],'event':key+' 公告发布','source':key})
                if d.get('updated_at'):updated.append(d['updated_at'])
            elif isinstance(d, dict):
                if key == rid and d.get('title'):names.append(d['title'])
                if d.get('created_at'):published.append(d['created_at']);timeline.append({'time':d['created_at'],'event':'原始报告/提案创建','source':key})
                if d.get('updated_at'):updated.append(d['updated_at'])
                if d.get('merged_at'):timeline.append({'time':d['merged_at'],'event':'修复 PR 合并（不等同于已发布版本）','source':key})
            sources.append({'id':key,'label':label,'url':url,'snapshot':m['file'],'retrievedAt':m['retrievedAt'],'sha256':m['sha256'],'method':method})
        # The same report may be saved under both an input ID and an API key.
        # Count it once in a record's source list, keeping the original input key.
        sources = list({s['url']: s for s in reversed(sources)}.values())[::-1]
        keys = [s['id'] for s in sources]
        ratings = [r for r in ratings if r['source'] in keys]
        timeline = [t for t in timeline if t['source'] in keys]
        # Consistent display baseline: CNA CVSS 3.1, then 3.0, then 4.0; other scores retained.
        priority = {'3.1':0,'3.0':1,'4.0':2,'2.0':3,'未提供':4}
        ratings.sort(key=lambda r:(priority.get(r['version'],5),not r['source'].startswith('CVE-')))
        rating = ratings[0] if ratings else {'source':None,'version':None,'score':None,'severity':'Unknown','vector':''}
        canonical = aliases.get(rid, rid)
        tags = list(dict.fromkeys([{'A':'内存与边界','B':'认证与通信','C':'文件与权限','D':'并发与生命周期','E':'飞行逻辑','F':'供应链与构建'}[cur['shelf']], *cwes, rating['severity'], *(['MAVLink'] if 'mavlink' in (cur['component']+' '+cur['trigger']).lower() else []), *(['原始报告'] if 'ISSUE' in rid else []), *(['公开 PoC'] if rid.startswith('EDB') else [])]))
        tracks = [{'t':name,'body':cur[field],'sources':keys} for name,field in [('触发条件与逻辑','trigger'),('根因与代码路径','rootCause'),('影响与危害边界','impact')]]
        tracks += [{'t':'受影响版本与修复','body':cur['affected']+'\n\n'+cur['fixed'],'sources':keys},{'t':'缓解与处置建议','body':cur['remediation'],'sources':keys},{'t':'核验说明与不确定项','body':cur['verification']+'\n\n'+'\n\n'.join(cur['notes']),'sources':keys}]
        records.append({**cur,'canonicalId':canonical,'original':originals.get(rid),'origin':'BUGS.md 原有档案' if rid in originals else '补充官方公告','aliases':sorted(set(official_aliases)-{rid}),'en':next((n for n in names if n),cur['component']),'summary':cur['rootCause']+' '+cur['impact'],'tags':tags,'cwes':sorted(set(cwes)),'rating':rating,'ratings':ratings,'severity':rating['severity'],'sources':sources,'source': 'CVE CNA / 原始证据' if any(k.startswith('CVE-') for k in keys) else '官方公告 / 原始报告','published':min(published)[:10] if published else None,'updated':max(updated or published)[:10] if updated or published else None,'verifiedAt':max(s['retrievedAt'] for s in sources),'tracks':tracks,'timeline':sorted(timeline,key=lambda t:t['time']),'related':[]})
    by_id = {r['id']:r for r in records}
    def connect(a,b,kind,reason):
        for x,y in [(a,b),(b,a)]:
            if not any(t['id']==y for t in by_id[x]['related']):
                by_id[x]['related'].append({'id':y,'type':kind,'reason':reason})
    for a,b in aliases.items():connect(a,b,'同一问题 / 证据','公开编号或原始引用对应同一问题；保留档案，问题组去重。')
    clusters = [(['CVE-2020-10281','CVE-2020-10282','CVE-2020-10283'],'MAVLink 协议机密性、认证及降级的不同问题。'),(['CVE-2021-46896','CVE-2024-38951','CVE-2025-5640'],'同属轨迹航点消息及 valid_points 处理；没有官方重复 CVE 结论。'),(['CVE-2023-47625','CVE-2026-32706'],'同为 CRSF 解析；未知类型和已知可变长度类型的不同缺陷。'),(['CVE-2024-40427','CVE-2025-9020','CVE-2026-32724'],'MAVLink shell 输入及生命周期的不同缺陷。'),(['CVE-2024-38952','CVE-2025-15150','CVE-2026-32743'],'日志相关字符串处理；不同输入路径、版本与证据。'),(['CVE-2026-32709','CVE-2026-32713'],'MAVLink FTP 路径边界和会话校验的不同缺陷。'),(['CVE-2024-24255','CVE-2024-29460','CVE-2024-30799','GHSA-x57h-c282-63hg'],'飞行状态、任务或围栏逻辑问题；触发条件和证据分别列明。'),(['GHSL-2025-087','GHSA-rfc7-3pxc-c68p'],'PX4 GitHub Actions 中不同工作流的命令注入。'),(['GH-ISSUE-18385','CVE-2021-46896'],'早期 MAVLink 消息计数与数组边界报告；独立输入路径。')]
    for ids,reason in clusters:
        for i,a in enumerate(ids):
            for b in ids[i+1:]:connect(a,b,'相关机制',reason)
    assert len(by_id)==len(records) and set(originals)<=set(by_id)
    catalog={'schemaVersion':1,'verifiedAt':max(m['retrievedAt'] for m in manifest.values()),'originalCount':len(originals),'recordCount':len(records),'groupCount':len({r['canonicalId'] for r in records}),'snapshotCount':len(manifest),'ratingPolicy':'主评级依次优先 CVSS 3.1、3.0、4.0、2.0；同版本优先 CNA，保留全部来源评级。没有来源评级时显示未评级，仅有等级时注明无分数。','records':records}
    (ROOT/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
    lines=['# 核验覆盖表','','原有 30 条完整保留，另补充 2 条官方公告；32 份档案归为 29 个问题组。所有档案均为公开证据整理，未在本机复现。','','| 档案 | 来源 | 评级（主口径） | 修复状态 | 核验边界 |','|---|---|---|---|---|']
    for r in records:
        ra=r['rating'];rate=f"{ra['severity']} {ra['score'] if ra['score'] is not None else '未提供分数'}"
        primary = next((s for s in r['sources'] if s['id'] == r['id']), r['sources'][0])
        boundary = '；'.join(t.rstrip('。；') for t in [r['verification'], *r['notes']] if t)
        lines.append(f"| [{r['id']}]({primary['url']}) | {r['origin']} | {rate} | {r['fixed']} | {boundary} |")
    (ROOT/'VERIFICATION.md').write_text('\n'.join(lines)+'\n')
    print(f"Built {len(records)} records / {catalog['groupCount']} groups / {len(manifest)} evidence files")

if __name__=='__main__':build()
