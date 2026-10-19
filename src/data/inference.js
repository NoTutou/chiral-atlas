/* =========================================================
   inference page — preset sample cargo + goal presets
   Samples describe a small "archive sync service" so the local
   heuristic engine has real requirements / code / diff to reason over.
   ========================================================= */

const SPEC = `# 档案同步服务 · 需求与设计说明 v1.3

## 1. 背景
档案同步服务（archive-sync）负责把外部来源的档案元数据同步到本地档案库，
并维护检索索引。服务以 HTTP 接口对内提供增、改、删能力。

## 2. 功能需求
- REQ-01 支持按来源批量拉取档案元数据，单批不超过 500 条。
- REQ-02 新增与更新操作需写入审计日志（操作者、时间、档案 ID）。
- REQ-03 同步失败时需记录失败原因并支持重试，重试次数不超过 3 次。
- REQ-04 检索索引需在数据变更后 60 秒内完成增量更新。
- REQ-05 删除档案必须校验操作者权限（role ≥ editor），并写入审计日志。
- REQ-06 所有外部请求必须设置超时，超时时间不超过 5 秒。
- REQ-07 索引键长度上限 64 字节，超长输入需截断或拒绝。
- REQ-08 配置中的凭据不得写入代码仓库，统一从环境变量读取。

## 3. 非功能需求
- 单实例处理能力 ≥ 200 次/秒，P95 延迟 ≤ 120 ms。
- 关键路径需有单元测试，覆盖率目标 70%。

## 4. 接口
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /records | 新增或更新档案 |
| DELETE | /records/<id> | 删除档案 |
| POST | /sync | 触发同步 |

## 5. 模块划分
- sync_service.py ：接口层与同步逻辑
- indexer.c ：索引键生成与写入（性能敏感，C 实现）
- audit.py ：审计日志（已有组件，本次不改动）

## 6. 验收
1. 删除接口在无权限时返回 403，且无数据被删除。
2. 外部来源不可达时，同步在 5 秒内失败并记录原因。
3. 索引键超长时不得发生越界写入。
`;

const PY = `"""archive-sync: HTTP service that syncs external archive metadata."""
import json
import time
import sqlite3
import requests
from flask import Flask, request, jsonify

from audit import audit_log
from auth import current_user, has_role

app = Flask(__name__)
DB_PATH = "archive.db"
API_TOKEN = "changeme-0000-local"   # TODO: move to env (REQ-08)
SOURCES = ["https://source-a.example/api", "https://source-b.example/api"]


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def fetch_remote(url, page):
    # pull one page of metadata from an external source
    resp = requests.get(url, params={"page": page, "size": 500},
                        headers={"Authorization": API_TOKEN})
    resp.raise_for_status()
    return resp.json()["items"]


def upsert_record(rec, user):
    db = get_db()
    db.execute(
        "INSERT OR REPLACE INTO records(id, title, shelf, body) VALUES (?, ?, ?, ?)",
        (rec["id"], rec["title"], rec["shelf"], rec.get("body", "")),
    )
    db.commit()
    audit_log(user, "upsert", rec["id"])


def delete_record(record_id, user):
    db = get_db()
    db.execute("DELETE FROM records WHERE id = ?", (record_id,))
    db.commit()
    return True


@app.route("/records", methods=["POST"])
def post_record():
    rec = request.get_json()
    upsert_record(rec, current_user())
    return jsonify(ok=True)


@app.route("/records/<record_id>", methods=["DELETE"])
def remove_record(record_id):
    delete_record(record_id, current_user())
    return jsonify(ok=True)


@app.route("/sync", methods=["POST"])
def sync():
    total, failed = 0, []
    for url in SOURCES:
        for page in range(1, 50):
            for attempt in range(5):
                try:
                    items = fetch_remote(url, page)
                    break
                except:
                    time.sleep(2)
            else:
                failed.append((url, page))
                continue
            if not items:
                break
            for rec in items:
                upsert_record(rec, "sync-bot")
                total += 1
    rebuild_index()
    return jsonify(total=total, failed=failed)


def rebuild_index():
    # FIXME: full rebuild on every sync, should be incremental (REQ-04)
    db = get_db()
    rows = db.execute("SELECT id, title, shelf FROM records").fetchall()
    keys = []
    for r in rows:
        for other in rows:
            if r["id"] != other["id"] and r["title"] == other["title"]:
                keys.append((r["id"], other["id"]))
    with open("index.json", "w") as f:
        json.dump({"dups": keys, "count": len(rows), "built": time.time(), "version": 3, "shelves": sorted({r["shelf"] for r in rows})}, f)


if __name__ == "__main__":
    app.run(port=8080)
`;

const C = `/* indexer.c — index key generation for archive-sync (performance critical) */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define KEY_MAX 64

typedef struct {
    char key[KEY_MAX];
    long offset;
} index_entry;

/* build "<shelf>:<id>:<title>" into the entry key */
void build_key(index_entry *e, const char *shelf, const char *id, const char *title)
{
    char buf[KEY_MAX];
    strcpy(buf, shelf);
    strcat(buf, ":");
    strcat(buf, id);
    strcat(buf, ":");
    strcat(buf, title);
    memcpy(e->key, buf, KEY_MAX);
}

/* safe variant used by the batch path */
int build_key_n(index_entry *e, const char *shelf, const char *id)
{
    size_t need = strlen(shelf) + strlen(id) + 2;
    if (need > KEY_MAX) {
        return -1;
    }
    snprintf(e->key, KEY_MAX, "%s:%s", shelf, id);
    return 0;
}

index_entry *alloc_entries(size_t n)
{
    index_entry *arr = malloc(n * sizeof(index_entry));
    memset(arr, 0, n * sizeof(index_entry));
    return arr;
}

int write_index(const char *path, index_entry *arr, size_t n)
{
    FILE *fp = fopen(path, "wb");
    if (fp == NULL) {
        return -1;
    }
    size_t w = fwrite(arr, sizeof(index_entry), n, fp);
    fclose(fp);
    return w == n ? 0 : -1;
}

int main(int argc, char **argv)
{
    size_t n = 1024;
    index_entry *arr = alloc_entries(n);
    build_key(&arr[0], "C", "C-001", argc > 1 ? argv[1] : "default");
    build_key_n(&arr[1], "C", "C-002");
    return write_index("index.bin", arr, 2);
}
`;

const PATCH = `diff --git a/sync_service.py b/sync_service.py
index 4c1e2a0..9b7f310 100644
--- a/sync_service.py
+++ b/sync_service.py
@@ -38,11 +38,9 @@ def upsert_record(rec, user):

 def delete_record(record_id, user):
-    if not has_role(user, "editor"):
-        raise PermissionError("editor role required")
     db = get_db()
     db.execute("DELETE FROM records WHERE id = ?", (record_id,))
     db.commit()
-    audit_log(user, "delete", record_id)
     return True


@@ -62,14 +60,18 @@ def sync():
     total, failed = 0, []
     for url in SOURCES:
-        for page in range(1, 20):
-            items = fetch_remote(url, page)
+        for page in range(1, 50):
+            for attempt in range(5):
+                try:
+                    items = fetch_remote(url, page)
+                    break
+                except:
+                    time.sleep(2)
+            else:
+                failed.append((url, page))
+                continue
             if not items:
                 break
             for rec in items:
                 upsert_record(rec, "sync-bot")
                 total += 1
+    # TODO: add tests for retry path
     rebuild_index()
`;

const CTX = `# 补充上下文 · archive-sync

- 服务部署在内网，DELETE /records 目前只对运维工具开放，但计划在下季度开放给前端。
- 最近一次提交（commit 9b7f310）为了"简化删除流程"移除了权限判断，提交说明里没有提到原因。
- 当前没有针对 sync 重试路径的测试；tests/ 目录下只有 test_upsert.py。
- 线上数据量约 12 万条，rebuild_index 单次耗时已经超过 40 秒。
- 审计组要求：所有删除操作必须可追溯（对应 REQ-05）。
`;

export const SAMPLES = [
  { id: 's-spec', name: 'archive_spec.md', kind: 'doc', text: SPEC },
  { id: 's-py', name: 'sync_service.py', kind: 'code', lang: 'python', text: PY },
  { id: 's-c', name: 'indexer.c', kind: 'code', lang: 'c', text: C },
  { id: 's-patch', name: 'commit_9b7f310.patch', kind: 'patch', text: PATCH },
  { id: 's-ctx', name: 'context.md', kind: 'text', text: CTX },
];

export const GOALS = [
  ['综合评估', '评估该模块的需求符合度、安全性、工程质量与潜在影响，给出各维度评分与处置建议'],
  ['安全审查', '重点审查权限控制、不安全调用与凭据管理，评估风险等级与影响范围'],
  ['变更评审', '评审最近一次提交引入的风险，判断是否可以合入主干'],
];

/* =========================================================
   local heuristic "reasoning engine"
   analyze(cargo, goal) -> deterministic result for the same input.
   cargo item: { id, name, kind: 'doc'|'code'|'patch'|'text'|'record', text }
   ========================================================= */
export const DIMS = [
  { k: 'acc', zh: '准确性', en: 'ACCURACY', w: 1, ok: '需求与实现一致' },
  { k: 'cmp', zh: '完整性', en: 'COMPLETENESS', w: 1, ok: '异常路径覆盖完整' },
  { k: 'sec', zh: '安全性', en: 'SECURITY', w: 1.4, ok: '未发现高危问题' },
  { k: 'mnt', zh: '可维护性', en: 'MAINTAIN.', w: 0.8, ok: '结构清晰' },
  { k: 'prf', zh: '性能', en: 'PERFORMANCE', w: 0.8, ok: '实时性满足' },
  { k: 'cpl', zh: '合规性', en: 'COMPLIANCE', w: 1, ok: '需求追踪完整' },
];
const DIMI = Object.fromEntries(DIMS.map((d, i) => [d.k, i]));

export const extOf = (name) => (name.match(/\.([A-Za-z0-9]+)$/)?.[1] || '').toLowerCase();
const CODE_EXT = ['c', 'h', 'cc', 'cpp', 'hpp', 'py', 'js', 'mjs', 'ts', 'tsx', 'jsx', 'java', 'go', 'rs', 'rb', 'php', 'cs', 'kt', 'swift', 'lua', 'sh'];
export function kindOf(name, text = '') {
  const e = extOf(name);
  if (e === 'patch' || e === 'diff' || /^diff --git /m.test(text)) return 'patch';
  if (CODE_EXT.includes(e)) return 'code';
  if (/REQ-\d+|需求|requirement/i.test(text)) return 'doc';
  return 'text';
}
const langOf = (name) => {
  const e = extOf(name);
  if (e === 'py') return 'py';
  if (['c', 'h', 'cc', 'cpp', 'hpp'].includes(e)) return 'c';
  if (['js', 'mjs', 'ts', 'tsx', 'jsx'].includes(e)) return 'js';
  return 'other';
};
export const langFor = langOf;

const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const CTRL = new Set(['if', 'for', 'while', 'switch', 'return', 'sizeof', 'else', 'do']);

/* function table: [{name, line (1-based), end}] */
function functionsOf(lines, lang) {
  const out = [];
  if (lang === 'py') {
    lines.forEach((l, i) => {
      const m = l.match(/^(\s*)def\s+(\w+)\s*\(/);
      if (!m) return;
      const ind = m[1].length;
      let end = i;
      for (let j = i + 1; j < lines.length; j++) {
        const s = lines[j];
        if (!s.trim()) continue;
        if (s.match(/^\s*/)[0].length <= ind && !s.trim().startsWith('#')) break;
        end = j;
      }
      out.push({ name: m[2], line: i + 1, end: end + 1 });
    });
  } else if (lang === 'c' || lang === 'js') {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const m = l.match(/^\s*(?:[\w*]+\s+)+\**\s*(\w+)\s*\([^;]*\)\s*\{?\s*$/) || l.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/) || l.match(/^\s*(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/);
      if (!m || CTRL.has(m[1])) continue;
      let depth = 0, started = false, end = i;
      for (let j = i; j < lines.length && j < i + 400; j++) {
        for (const ch of lines[j]) { if (ch === '{') { depth++; started = true; } else if (ch === '}') depth--; }
        if (started && depth <= 0) { end = j; break; }
        if (!started && j > i + 1) break;
      }
      if (!started) continue;
      out.push({ name: m[1], line: i + 1, end: end + 1 });
      i = end;
    }
  }
  return out;
}

export function estTokens(text) {
  const cjk = (text.match(/[一-鿿]/g) || []).length;
  return Math.round(cjk * 1.1 + (text.length - cjk) / 3.8);
}

export function analyze(cargo, goal = '') {
  const files = cargo.map((c) => {
    const lines = c.text.replace(/\r\n?/g, '\n').split('\n');
    const kind = c.kind === 'record' ? 'doc' : c.kind;
    const lang = kind === 'code' ? langOf(c.name) : 'other';
    return { name: c.name, kind, lang, lines, text: c.text, fns: kind === 'code' ? functionsOf(lines, lang) : [], commentRatio: 0, stat: { add: 0, del: 0, hunks: 0 } };
  });
  const docs = files.filter((f) => f.kind === 'doc' || f.kind === 'text');
  const code = files.filter((f) => f.kind === 'code');
  const patches = files.filter((f) => f.kind === 'patch');
  const allText = files.map((f) => f.text).join('\n');

  /* ---------- extraction ---------- */
  const reqs = [];
  docs.forEach((f) => f.lines.forEach((l, i) => {
    const m = l.match(/\b(REQ-\d+)\b[\s:：.-]*(.*)/);
    if (m && !reqs.some((r) => r.id === m[1])) reqs.push({ id: m[1], text: m[2].trim(), file: f.name, line: i + 1 });
  }));
  const endpoints = [];
  code.forEach((f) => f.lines.forEach((l, i) => {
    let path, method;
    let m = l.match(/@\w+\.route\(\s*["']([^"']+)["'](?:.*methods\s*=\s*\[([^\]]*)\])?/);
    if (m) { path = m[1]; method = (m[2] || 'GET').replace(/["'\s]/g, ''); }
    else if ((m = l.match(/\b(?:app|router)\.(get|post|put|delete|patch)\(\s*["']([^"']+)/))) { path = m[2]; method = m[1].toUpperCase(); }
    else return;
    const hd = f.fns.find((fn) => fn.line > i + 1 && fn.line <= i + 3);
    endpoints.push({ path, method, file: f.name, line: i + 1, handler: hd?.name, hfn: hd });
  }));
  const fnsAll = code.flatMap((f) => f.fns.map((fn) => ({ ...fn, file: f.name })));

  /* ---------- findings ---------- */
  const F = [];  // {kind, sev, dims[], file, line, msg, short, ...}
  const P = [];  // positive evidence {kind, file, line, msg}
  const add = (o) => F.push(o);
  const reqBy = (re) => reqs.find((r) => re.test(r.text));
  const bodyOf = (f, fn) => f.lines.slice(fn.line - 1, fn.end).join('\n');

  const authReq = reqBy(/权限|鉴权|permission|authori|role/i);
  const auditReq = reqBy(/审计|audit/i);
  const timeoutReq = reqBy(/超时|timeout/i);
  const secretReq = reqBy(/凭据|密钥|secret|credential|token/i);
  const retryReq = reqBy(/重试|retry/i);
  const lenReq = reqBy(/长度|length|截断/i);
  const testReq = reqs.find((r) => /测试|test|覆盖率|coverage/i.test(r.text)) ||
    docs.map((f) => { const i = f.lines.findIndex((l) => /测试|覆盖率|unit test/i.test(l)); return i >= 0 ? { id: null, text: f.lines[i].replace(/^[-*\s#]+/, ''), file: f.name, line: i + 1 } : null; }).find(Boolean);

  code.forEach((f) => {
    const L = f.lines;
    f.fns.filter((fn) => /delete|remove|drop|purge|destroy|erase/i.test(fn.name)).forEach((fn) => {
      const body = bodyOf(f, fn);
      const wraps = f.fns.some((o) => o !== fn && /delete|remove|drop|purge/i.test(o.name) && new RegExp('\\b' + o.name + '\\s*\\(').test(body));
      if (wraps) return; // thin wrapper: the inner function carries the finding
      if (!/has_role|check_perm|permission|authoriz|require_role|is_admin|can_delete|\bauth\w*\(/i.test(body)) {
        add({ kind: 'auth', sev: authReq ? 3 : 2, dims: ['sec', 'cpl', 'acc'], file: f.name, line: fn.line, fn: fn.name, req: authReq?.id,
          msg: `${fn.name}() 执行删除前未校验操作者权限${authReq ? `，与 ${authReq.id} 冲突` : ''}`, short: '删除未鉴权' });
      }
      if (auditReq && !/audit/i.test(body)) {
        add({ kind: 'audit', sev: 2, dims: ['cpl', 'cmp'], file: f.name, line: fn.line, fn: fn.name, req: auditReq.id,
          msg: `${fn.name}() 未写入审计日志（${auditReq.id}）`, short: '缺少审计' });
      }
    });
    L.forEach((l, i) => {
      const ln = i + 1;
      const s = l.replace(/\/\/.*$|#.*$/, '');
      let m;
      if (f.lang === 'c' && (m = s.match(/\b(strcpy|strcat|sprintf|gets|vsprintf)\s*\(/))) {
        if (!F.some((x) => x.kind === 'unsafe' && x.file === f.name))
          add({ kind: 'unsafe', sev: 3, dims: ['sec', 'cmp'], file: f.name, line: ln, call: m[1], req: lenReq?.id,
            msg: `${m[1]}() 写入定长缓冲区且未限长${lenReq ? `（${lenReq.id} 要求限长）` : ''}`, short: `${m[1]}() 未限长` });
      }
      if (f.lang !== 'c' && (m = s.match(/\b(eval|exec)\s*\(|os\.system\s*\(|shell\s*=\s*True|pickle\.loads\s*\(|child_process\.exec\s*\(/))) {
        add({ kind: 'unsafe', sev: 3, dims: ['sec'], file: f.name, line: ln, call: (m[1] || m[0]).replace(/\s*\($/, ''),
          msg: `动态执行 / 反序列化调用：${trunc(l.trim(), 36)}`, short: '动态执行' });
      }
      if ((m = l.match(/\b(api[_-]?key|\w*token|secret|passw(?:or)?d)\w*\s*[:=]\s*["']([^"']{4,})["']/i)) && !/environ|getenv|process\.env/.test(l)) {
        add({ kind: 'secret', sev: 3, dims: ['sec', 'cpl'], file: f.name, line: ln, req: secretReq?.id,
          msg: `凭据 ${m[1]} 以明文写在代码中${secretReq ? `，违反 ${secretReq.id}` : ''}`, short: '凭据硬编码' });
      }
      if (/\brequests\.(get|post|put|delete|request|patch)\s*\(/.test(s)) {
        let call = '', depth = 0;
        for (let j = i; j < Math.min(L.length, i + 8); j++) {
          call += L[j];
          for (const ch of L[j]) { if (ch === '(') depth++; else if (ch === ')') depth--; }
          if (depth <= 0) break;
        }
        if (!/timeout\s*=/.test(call))
          add({ kind: 'timeout', sev: 2, dims: ['prf', 'cmp'], file: f.name, line: ln, req: timeoutReq?.id,
            msg: `外部请求未设置 timeout${timeoutReq ? `（${timeoutReq.id} 要求 ≤ 5s）` : ''}`, short: '请求无超时' });
        else P.push({ kind: 'timeout-ok', file: f.name, line: ln, msg: '外部请求设置了超时' });
      }
      if (/^\s*except\s*:\s*$/.test(l) || /catch\s*\([^)]*\)\s*\{\s*\}/.test(l))
        add({ kind: 'except', sev: 2, dims: ['cmp', 'mnt'], file: f.name, line: ln, msg: '裸 except 吞掉所有异常，失败原因未记录', short: '异常被吞' });
      if ((m = l.match(/\b(TODO|FIXME|XXX|HACK)\b[:：]?\s*(.*)/)))
        add({ kind: 'todo', sev: 1, dims: ['cmp', 'mnt'], file: f.name, line: ln, msg: `${m[1]}：${trunc(m[2] || '待处理', 30)}`, short: '遗留 TODO' });
      if ((m = s.match(/(\w+)\s*=\s*(?:\([^)]*\)\s*)?(malloc|calloc|realloc)\s*\(/))) {
        const nxt = L.slice(i + 1, i + 4).join('\n');
        if (!new RegExp(`if\\s*\\(\\s*!?\\s*${m[1]}\\b|${m[1]}\\s*==\\s*NULL|NULL\\s*==\\s*${m[1]}`).test(nxt))
          add({ kind: 'nullchk', sev: 2, dims: ['cmp', 'sec'], file: f.name, line: ln, msg: `${m[2]}() 返回值未判空即使用`, short: '未判空' });
      }
      if ((m = l.match(/^(\s*)for\s+(\w+)\s+in\s+(\w+)\s*:/))) {
        const coll = m[3];
        if (L.slice(i + 1, i + 4).some((x) => new RegExp(`for\\s+\\w+\\s+in\\s+${coll}\\s*:`).test(x)))
          add({ kind: 'quadratic', sev: 2, dims: ['prf'], file: f.name, line: ln, msg: `对 ${coll} 的嵌套遍历为 O(n²)`, short: 'O(n²) 遍历' });
      }
      if (retryReq && (m = l.match(/for\s+(attempt|retry|tries)\w*\s+in\s+range\((\d+)\)/))) {
        const lim = +(retryReq.text.match(/(\d+)\s*次/)?.[1] || 3);
        if (+m[2] > lim) add({ kind: 'mismatch', sev: 2, dims: ['acc', 'cpl'], file: f.name, line: ln, req: retryReq.id,
          msg: `重试 ${m[2]} 次，超过 ${retryReq.id} 规定的 ${lim} 次`, short: '重试次数不符' });
      }
      if (l.length > 120 && !F.some((x) => x.kind === 'longline' && x.file === f.name))
        add({ kind: 'longline', sev: 1, dims: ['mnt'], file: f.name, line: ln, msg: `单行 ${l.length} 字符，超过 120`, short: '超长行' });
      // positive evidence
      if (/\.execute\(/.test(s) && !/\.execute\(\s*f["']|["']\s*\+\s*\w|["']\s*%\s*[(\w]|\.format\(/.test(L.slice(i, i + 2).join(' ')) && /\?|%s/.test(L.slice(i, i + 2).join(' ')))
        P.push({ kind: 'param-sql', file: f.name, line: ln, msg: 'SQL 使用参数化占位符' });
      if (/\.execute\(\s*f["']|\.execute\([^)]*["']\s*\+|\.execute\([^)]*%\s*\(|\.execute\([^)]*\.format\(/.test(l))
        add({ kind: 'sqli', sev: 3, dims: ['sec'], file: f.name, line: ln, msg: 'SQL 由字符串拼接构造', short: 'SQL 拼接' });
      if (/if\s*\(\s*\w+\s*>\s*\w*MAX\w*|snprintf\s*\(|strncpy\s*\(|strlcpy\s*\(/.test(s)) P.push({ kind: 'bound', file: f.name, line: ln, msg: '同文件已有长度上限检查 / 有界写入' });
    });
    f.fns.forEach((fn) => {
      const n = fn.end - fn.line + 1;
      if (n > 24) add({ kind: 'longfn', sev: 1, dims: ['mnt'], file: f.name, line: fn.line, fn2: fn.name, msg: `${fn.name}() 长 ${n} 行，职责过多`, short: '函数过长' });
    });
    const com = L.filter((l) => /^\s*(#|\/\/|\/\*|\*|""")/.test(l) || /\s(#|\/\/)\s/.test(l)).length, loc = L.filter((l) => l.trim()).length || 1;
    f.commentRatio = com / loc;
  });

  patches.forEach((f) => {
    const st = f.stat;
    f.lines.forEach((l, i) => {
      if (/^@@/.test(l)) st.hunks++;
      else if (/^\+(?!\+\+)/.test(l)) {
        st.add++;
        if (/TODO|FIXME/.test(l)) add({ kind: 'todo', sev: 1, dims: ['cmp'], file: f.name, line: i + 1, msg: `补丁新增 ${trunc(l.slice(1).trim(), 30)}`, short: '新增 TODO' });
      } else if (/^-(?!--)/.test(l)) {
        st.del++;
        if (/has_role|permission|authoriz|check_perm|verify|audit/i.test(l)) (st.removed ||= []).push(i + 1);
      }
    });
    if (st.removed) add({ kind: 'removed', sev: 3, dims: ['sec', 'cpl', 'acc'], file: f.name, line: st.removed[0], req: authReq?.id,
      msg: `提交删除了 ${st.removed.length} 行校验 / 审计代码（${trunc(f.lines[st.removed[0] - 1].slice(1).trim(), 22)}）`, short: '移除校验' });
  });

  const hasTests = files.some((f) => /test/i.test(f.name));
  if (!hasTests && code.length) {
    const r = testReq;
    add({ kind: 'notest', sev: 1, dims: ['cmp', 'cpl'], file: r ? r.file : code[0].name, line: r ? r.line : 1, req: r?.id,
      msg: r ? `未提供测试文件，无法验证「${trunc(r.text, 18)}」` : '货物中未包含任何测试', short: '缺少测试' });
  }
  const traced = reqs.filter((r) => code.concat(patches).some((f) => f.text.includes(r.id)));

  /* ---------- hypotheses ---------- */
  const fk = (k) => F.filter((x) => x.kind === k);
  const pk = (k) => P.filter((x) => x.kind === k);
  const cands = [];
  if (fk('auth').length || fk('removed').length) cands.push({ zh: '权限缺失', title: '删除路径缺少权限控制', ok: true, ev: [...fk('removed'), ...fk('auth')] });
  if (fk('unsafe').length || pk('bound').length) cands.push({ zh: '越界写入', title: '不安全调用导致越界', ok: fk('unsafe').length > 0, ev: fk('unsafe'), rej: pk('bound')[0]?.msg, rejEv: pk('bound')[0] });
  if (fk('sqli').length || pk('param-sql').length) cands.push({ zh: 'SQL 注入', title: 'SQL 注入', ok: fk('sqli').length > 0, ev: fk('sqli'), rej: 'SQL 均使用参数化占位符', rejEv: pk('param-sql')[0] });
  if (fk('secret').length) cands.push({ zh: '凭据泄露', title: '凭据泄露', ok: true, ev: fk('secret') });
  if (fk('timeout').length || pk('timeout-ok').length) cands.push({ zh: '请求阻塞', title: '外部请求阻塞', ok: fk('timeout').length > 0, ev: fk('timeout'), rej: '外部请求均设置了超时', rejEv: pk('timeout-ok')[0] });
  if (fk('mismatch').length) cands.push({ zh: '需求偏差', title: '实现偏离需求参数', ok: true, ev: fk('mismatch') });
  if (cands.length < 2) {
    cands.push({ zh: '需求偏差', title: '实现偏离需求', ok: false, ev: [], rej: reqs.length ? `抽查 ${reqs.length} 条需求未发现冲突` : '缺少需求文档，无法比对' });
    const used = new Set(cands.flatMap((c) => c.ev));
    const rest = F.filter((x) => !used.has(x) && x.sev >= 2);
    cands.push({ zh: '质量缺陷', title: '工程质量缺陷', ok: rest.length > 0, ev: rest.slice(0, 2), rej: '未发现其他中高风险质量问题', rejEv: null });
  }
  const conf = cands.filter((c) => c.ok), rejd = cands.filter((c) => !c.ok);
  const hyps = [...conf.slice(0, rejd.length ? 2 : 3), ...rejd.slice(0, 1)];
  for (const c of cands) { if (hyps.length >= 3) break; if (!hyps.includes(c)) hyps.push(c); }
  hyps.forEach((h, i) => { h.id = 'H' + (i + 1); });

  /* ---------- scores ---------- */
  // per dimension: penalties sorted desc with diminishing returns (0.6^k)
  const hits = [[], [], [], [], [], []];
  const top = [null, null, null, null, null, null];
  const W = { 3: 24, 2: 8, 1: 3 };
  F.forEach((x) => x.dims.forEach((d, j) => {
    const i = DIMI[d];
    hits[i].push(W[x.sev] * (j === 0 ? 1 : 0.4));
    const rank = x.sev + (j === 0 ? 1.5 : 0);   // prefer findings whose primary dimension this is
    if (!top[i] || rank > top[i].rank) top[i] = { ...x, rank };
  }));
  const pen = hits.map((a) => a.sort((p, q) => q - p).reduce((sum, v, k) => sum + v * Math.pow(0.6, k), 0));
  const ratio = code.length ? code.reduce((a, f) => a + f.commentRatio, 0) / code.length : 0.2;
  const bonus = [reqs.length ? 4 * traced.length / reqs.length : 0, hasTests ? 6 : 0, P.length ? 3 : 0, ratio > 0.1 ? 4 : 0, 2, traced.length ? 2 : 0];
  const scores = DIMS.map((d, i) => Math.round(Math.max(18, Math.min(97, 95 - Math.min(pen[i], 70) + bonus[i]))));
  const wsum = DIMS.reduce((a, d) => a + d.w, 0);
  const rawOverall = Math.round(DIMS.reduce((a, d, i) => a + scores[i] * d.w, 0) / wsum);
  const verdict = DIMS.map((d, i) => (top[i] ? top[i].short : d.ok));

  /* ---------- impact ---------- */
  const maxSev = F.reduce((a, x) => Math.max(a, x.sev + (x.dims[0] === 'sec' && x.sev === 3 ? 1 : 0)), 0);
  const S = Math.min(5, Math.max(1, maxSev + 1));
  let Lk = 1 + conf.length + (endpoints.length ? 1 : 0) - (/内网|internal only/.test(allText) ? 1 : 0) + (/计划.{0,12}开放|will be exposed/.test(allText) ? 1 : 0);
  Lk = Math.max(1, Math.min(5, Lk));
  const R = S * Lk;
  const risk = R >= 15 ? 'HIGH' : R >= 8 ? 'MEDIUM' : 'LOW';
  const cap = risk === 'HIGH' ? 76 : risk === 'MEDIUM' ? 86 : 100;
  const overall = Math.min(rawOverall, cap);
  const capped = overall < rawOverall;
  const grade = overall >= 90 ? 'A' : overall >= 84 ? 'A-' : overall >= 78 ? 'B+' : overall >= 68 ? 'B' : overall >= 58 ? 'C' : 'D';
  const riskZh = { HIGH: '高风险', MEDIUM: '中风险', LOW: '低风险' }[risk];
  const lead = [...F].sort((a, b) => b.sev - a.sev || (a.kind === 'auth' ? -1 : b.kind === 'auth' ? 1 : 0))[0];
  const CHAINS = {
    auth: () => ['删除接口未鉴权', '越权删除档案', '审计记录缺失', '数据不可追溯'],
    removed: () => ['提交移除校验', '删除接口未鉴权', '越权删除档案', '数据不可追溯'],
    unsafe: (x) => [`${x.call}() 未限长`, '缓冲区越界写入', '进程异常退出', '索引服务中断'],
    secret: () => ['凭据硬编码', '随仓库扩散', '凭据需轮换', '合规审计不通过'],
    sqli: () => ['SQL 字符串拼接', '查询语义被改变', '越权读取数据', '数据泄露'],
    timeout: () => ['请求无超时', '工作线程阻塞', '同步任务堆积', '服务响应变慢'],
    mismatch: () => ['参数偏离需求', '行为与预期不符', '验收不通过', '返工成本'],
  };
  const chain = lead && CHAINS[lead.kind] ? CHAINS[lead.kind](lead) : ['代码质量缺陷', '维护成本上升', '迭代速度下降', '交付风险'];
  const modules = new Set(F.filter((x) => x.sev >= 2).map((x) => x.file)).size;
  const scope = [
    { zh: '模块', n: Math.min(5, Math.max(1, modules)), hi: false, txt: `${modules} 个文件` },
    { zh: '系统', n: S >= 4 ? 4 : S >= 3 ? 3 : 1, hi: S >= 4, txt: S >= 4 ? '核心数据链路' : S >= 3 ? '服务内部' : '局部' },
    { zh: '外部接口', n: Math.min(5, endpoints.length), hi: false, txt: endpoints.length ? `${endpoints.length} 个 · ${[...new Set(endpoints.map((e) => e.method))].join('/')}` : '无' },
  ];

  /* ---------- recommendations ---------- */
  const RECS = {
    auth: (x) => [`为 ${x.fn}() 恢复权限校验${x.req ? `（${x.req}）` : ''}，无权限返回 403`, 0.5],
    removed: () => ['回滚提交中被删除的权限判断与审计调用', 0.3],
    audit: (x) => [`${x.fn}() 补写审计日志${x.req ? `（${x.req}）` : ''}`, 0.3],
    unsafe: (x) => [/str|sprintf|gets/.test(x.call || '') ? `用有界写入（snprintf）替换 ${x.call}()，超长输入拒绝` : '移除动态执行，改为白名单分发', 0.5],
    secret: () => ['凭据改为从环境变量读取，并轮换已提交的令牌', 0.5],
    sqli: () => ['改为参数化查询', 0.5],
    timeout: (x) => [`为外部请求设置 timeout ≤ 5s${x.req ? `（${x.req}）` : ''}`, 0.3],
    mismatch: () => ['将重试上限改为需求值，并加入指数退避', 0.3],
    except: () => ['用具体异常类型替换裸 except，记录失败原因', 0.3],
    quadratic: () => ['重复检测改为哈希分组，去掉 O(n²) 遍历', 1.0],
    nullchk: () => ['检查内存分配返回值并处理失败路径', 0.2],
    notest: () => ['补齐删除接口与重试路径的单元测试', 1.0],
    longfn: (x) => [`拆分 ${x.fn2}() 等过长函数`, 0.5],
    todo: () => ['清理遗留 TODO / FIXME 并建立跟踪单', 0.5],
  };
  const seen = new Set(), recs = [];
  [...F].sort((a, b) => b.sev - a.sev).forEach((x) => {
    if (seen.has(x.kind) || !RECS[x.kind]) return;
    seen.add(x.kind);
    const [tx, d] = RECS[x.kind](x);
    recs.push({ p: x.sev === 3 ? 'P0' : x.sev === 2 ? 'P1' : 'P2', tx, d, ref: { f: x.file, l: x.line } });
  });
  const cost = recs.reduce((a, r) => a + r.d, 0);

  const evidenceCount = F.length + P.length + reqs.length;
  const confidence = Math.max(0.35, Math.min(0.94, 0.5 + Math.min(0.34, evidenceCount * 0.012) + (docs.length && code.length ? 0.04 : 0) - (files.length < 2 ? 0.08 : 0)));
  const tokens = files.reduce((a, f) => a + estTokens(f.text), 0);

  /* ---------- trace log ---------- */
  const cite = (x) => (x ? { f: x.file, l: x.line } : null);
  const log = [];
  const push = (step, sub, segs, o = {}) => log.push({ step, sub, segs, tag: o.tag || 'step', dims: o.dims || [], cite: o.cite || null });
  const kindsZh = { doc: '份文档', code: '个源码文件', patch: '个补丁', text: '份上下文' };
  const cnt = {};
  files.forEach((f) => { cnt[f.kind] = (cnt[f.kind] || 0) + 1; });
  const parts = Object.entries(cnt).map(([k, n]) => {
    if (k === 'code') return `${n} ${kindsZh[k]}（${code.reduce((a, f) => a + f.lines.length, 0)} 行）`;
    if (k === 'patch') return `${n} ${kindsZh[k]}（+${patches.reduce((a, f) => a + f.stat.add, 0)} / −${patches.reduce((a, f) => a + f.stat.del, 0)}）`;
    return `${n} ${kindsZh[k] || '份资料'}`;
  });
  push(0, 0, [['t', `载入 ${files.length} 件货物：${parts.join(' · ')}`]]);
  push(0, 1, [['d', '└ '], ['t', `构建统一语料索引，共 ${tokens.toLocaleString('en-US')} tokens · 目标「${trunc(goal || '综合评估', 14)}」`]]);
  const ents = [...new Set([...F.filter((x) => x.fn).map((x) => x.fn + '()'), ...reqs.filter((r) => r === authReq || r === lenReq).map((r) => r.id), ...fnsAll.slice(0, 6).map((f) => f.name + '()'), ...reqs.slice(0, 4).map((r) => r.id)])];
  push(1, 0, [['t', `抽取关键实体 ${fnsAll.length + reqs.length + endpoints.length} 个：${ents.slice(0, 4).join(' · ') || '（无结构化实体）'}`]]);
  const keyReqs = [authReq, lenReq, timeoutReq, secretReq].filter(Boolean).filter((r, i, a) => a.indexOf(r) === i).slice(0, 2);
  keyReqs.forEach((r) => push(1, 1, [['d', '└ '], ['t', `${r.id} ${trunc(r.text, 28)}`], ['c', `${r.file}:L${r.line}`]], { tag: 'evidence', cite: cite(r), dims: ['acc', 'cpl'] }));
  if (endpoints.length) push(1, 1, [['d', '└ '], ['t', `识别 ${endpoints.length} 个对外接口：${endpoints.slice(0, 3).map((e) => `${e.method} ${e.path}`).join(' · ')}`]], { dims: ['sec'] });
  if (lead) {
    const ep = lead.fn ? endpoints.find((e) => e.hfn && new RegExp('\\b' + lead.fn + '\\s*\\(').test(code.find((f) => f.name === e.file).lines.slice(e.hfn.line - 1, e.hfn.end).join('\n'))) : null;
    push(2, 0, [['t', ep ? `定位关键路径 ${ep.method} ${ep.path} → ${ep.handler}() → ${lead.fn}()` : `定位关键路径 ${lead.fn ? lead.fn + '()' : lead.call ? lead.call + '()' : lead.file}`], ['c', `${lead.file}:L${lead.line}`]], { tag: 'evidence', cite: cite(lead), dims: lead.dims });
    push(2, 'code', null, { cite: cite(lead), dims: lead.dims, tag: 'evidence' });
    push(2, 1, [['d', '└ '], ['w', `⚠ ${lead.msg}`]], { tag: 'evidence', cite: cite(lead), dims: lead.dims });
  } else push(2, 0, [['t', code.length ? `遍历 ${fnsAll.length} 个函数，未发现高风险路径` : '未提供源码，仅基于文档进行推理']]);
  push(3, 0, [['t', `生成 ${hyps.length} 条假设：${hyps.map((h) => `${h.id} ${h.zh}`).join(' · ')}`]], { tag: 'hypothesis' });
  hyps.forEach((h, i) => {
    const e = h.ok ? h.ev[0] : h.rejEv;
    const segs = h.ok ? [['w', `${h.id} 成立`], ['t', ` — ${trunc(e?.msg || h.title, 32)}`]] : [['g', `${h.id} 否决`], ['t', ` — ${trunc(h.rej || '证据不足', 32)}`]];
    if (e) segs.push(['c', `${e.file}:L${e.line}`]);
    push(4, i ? 1 : 0, i ? [['d', '└ '], ...segs] : segs, { tag: 'hypothesis', cite: cite(e), dims: e?.dims || [] });
  });
  F.filter((x) => !hyps.some((h) => h.ok && h.ev.includes(x)) && x.sev >= 2).slice(0, 3).forEach((x) =>
    push(4, 1, [['d', '└ '], ['t', `附加证据：${trunc(x.msg, 30)}`], ['c', `${x.file}:L${x.line}`]], { tag: 'evidence', cite: cite(x), dims: x.dims }));
  push(5, 0, [['t', `${chain.slice(0, -1).join(' → ')} → `], ['w', chain[chain.length - 1]]], { dims: ['sec'] });
  push(5, 1, [['d', '└ '], ['t', `影响范围：${scope.map((s) => `${s.zh} ${s.txt}`).join(' · ')}`]]);
  push(6, 0, [['t', `合成 6 维评估 → 综合得分 ${overall} / 100 · 风险等级 `], [risk === 'LOW' ? 'g' : 'w', risk]]);
  if (capped) push(6, 1, [['d', '└ '], ['t', `加权均分 ${rawOverall}，存在 ${risk} 风险项，按规则封顶至 ${cap}`]], { dims: ['sec'] });

  /* ---------- graph satellites ---------- */
  const tag = (f) => (f.kind === 'code' ? 'SRC' : f.kind === 'patch' ? 'DIFF' : f.kind === 'doc' ? 'DOC' : 'TXT');
  const sats = [
    files.slice(0, 4).map((f) => ({ t: `${tag(f)}·${f.lines.length}L` })),
    ents.slice(0, 3).map((e) => ({ t: trunc(e, 15) })),
    lead ? [{ t: trunc(lead.fn ? lead.fn + '()' : (lead.call || '') + '()', 15) }, { t: trunc(`${lead.file.split('.')[0]} · L${lead.line}`, 18), tone: 'w' }] : [{ t: `${fnsAll.length} FN` }],
    hyps.map((h) => ({ t: `${h.id} ${h.zh}` })),
    hyps.map((h) => ({ t: `${h.id} ${h.ok ? '✓' : '✗'}`, tone: h.ok ? 'w' : 'g' })),
    chain.slice(1).map((c, i, a) => ({ t: trunc(c, 8), tone: i === a.length - 1 ? 'w' : '' })),
    [],
  ];

  return {
    files: files.map((f) => ({ name: f.name, kind: f.kind, lines: f.lines })),
    reqs, endpoints, findings: F, positives: P, hyps, scores, verdict, overall, grade,
    risk, riskZh, S, L: Lk, R, chain, scope, recs, cost, confidence, evidence: evidenceCount, tokens, log, sats,
    likes: Math.max(1, Math.min(5, Math.round(evidenceCount / 7))), traced: traced.length,
  };
}
