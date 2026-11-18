#!/usr/bin/env node
/**
 * gate.mjs — 项目级门禁（配置驱动）  v2
 *
 *   node gate.mjs <work-dir> [--config <path>] [--stage G0|G1|G2|G3|G4|G5]
 *
 * 检查分组（每组可被 --stage 过滤）：
 *   G1 requiredFiles / idsCoverage / selfContained / jsSyntax / mustMatch
 *   G2 structure（KEY）
 *   G3 structure（REVIEW）/ mustMatch
 *   G4 byteIdentical / projectValidator / structure（MERGE_NOTES）
 *   G0 empty-run 自检由 projectValidator.emptyRun 承担（任何 stage 都跑）
 *
 * 退出码：0 = 全绿；1 = 有 error；2 = 用法错误。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', x: '\x1b[0m', b: '\x1b[1m' };
const STAGES = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5'];

const argv = process.argv.slice(2);
if (!argv.length || argv[0].startsWith('--')) {
  console.error('用法: node gate.mjs <work-dir> [--config <path>] [--stage G0..G5]');
  process.exit(2);
}
const WORK = path.resolve(argv[0]);
if (!fs.existsSync(WORK) || !fs.statSync(WORK).isDirectory()) {
  console.error(`FATAL 工作区不存在或不是目录: ${WORK}`);
  process.exit(2);
}
const opt = (k, d) => { const i = argv.indexOf('--' + k); if (i < 0) return d; const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) { console.error(`FATAL 参数 --${k} 缺少取值`); process.exit(2); } return v; };
const CONFIG_PATH = path.resolve(opt('config', path.join(WORK, 'contract', 'gate.config.json')));
const STAGE = opt('stage', null);
if (STAGE && !STAGES.includes(STAGE)) { console.error(`FATAL 未知 stage: ${STAGE}（可选 ${STAGES.join('|')}）`); process.exit(2); }
const STAGE_IDX = STAGE ? STAGES.indexOf(STAGE) : STAGES.length - 1;

if (!fs.existsSync(CONFIG_PATH)) { console.error(`FATAL 找不到门禁配置: ${CONFIG_PATH}`); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const CONFIG_DIR = path.dirname(CONFIG_PATH);

const E = [], W = [], O = [];
const err = m => E.push(m), warn = m => W.push(m), ok = m => O.push(m);
const rel = p => path.relative(WORK, p) || p;
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read = p => fs.readFileSync(p, 'utf8');
const exists = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const workPath = p => path.isAbsolute(p) ? p : path.join(WORK, p);
/** 文件条目兼容字符串与 {path, stage}；未到阶段则跳过 */
const fileList = arr => (arr || []).map(e => typeof e === 'string' ? { path: e } : e);
const fileActive = e => active(e.stage || 'G1');
const filePaths = arr => fileList(arr).filter(fileActive).map(e => e.path);

/** 某 section 是否在本次 stage 内执行 */
const active = (stageName) => !stageName || STAGES.indexOf(stageName) <= STAGE_IDX;
const stageOf = (val, def) => val || def;

console.log(`${C.b}== gate ${rel(WORK) || '.'}${STAGE ? ' · 截至 ' + STAGE : ''} ==${C.x}`);
console.log(`${C.d}config: ${CONFIG_PATH}${C.x}`);

/* ---------- 未知键告警（防止"配了但没生效"） ---------- */
const KNOWN = new Set(['version', 'requiredFiles', 'idsCoverage', 'selfContained', 'jsSyntax', 'byteIdentical', 'structure', 'mustMatch', 'projectValidator', '_comment']);
Object.keys(cfg).forEach(k => { if (!KNOWN.has(k)) warn(`未知配置键 "${k}"（拼错了？该键未生效）`); });

/* ---------- 0. 空跑自检（门禁有效性证明） ---------- */
if (cfg.projectValidator && cfg.projectValidator.emptyRun !== false && active('G0')) {
  const v = workPath(cfg.projectValidator.path || 'contract/validate.mjs');
  if (exists(v)) {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-empty-'));
    const r = spawnSync(process.execPath, [v, emptyDir], { cwd: WORK, encoding: 'utf8', timeout: 60000 });
    fs.rmSync(emptyDir, { recursive: true, force: true });
    if (r.status === 0) err(`空跑自检失败：校验器对空目录返回 0（说明它什么都没检查）—— ${rel(v)}`);
    else ok(`空跑自检通过：校验器对空目录报错 (exit ${r.status})`);
  }
}

/* ---------- 1. 必需文件 ---------- */
for (const item of (cfg.requiredFiles || [])) {
  if (!active(stageOf(item.stage, 'G1'))) continue;
  const p = workPath(item.path);
  if (exists(p)) ok(`存在 ${item.path} (${(fs.statSync(p).size / 1024).toFixed(1)} KB)`);
  else if (item.optional) warn(`可选文件缺失 ${item.path}`);
  else err(`缺少必需文件 ${item.path}${item.hint ? ' — ' + item.hint : ''}`);
}

/* ---------- 2. id 覆盖（词边界/精确模式） ---------- */
if (cfg.idsCoverage && active(stageOf(cfg.idsCoverage.stage, 'G1'))) {
  const { expect = [], files = [], idPattern = null } = cfg.idsCoverage;
  if (!expect.length) err('idsCoverage.expect 为空（门禁退化为无检查）');
  for (const f of filePaths(files)) {
    const p = workPath(f);
    if (!exists(p)) { err(`id 覆盖检查找不到 ${f}`); continue; }
    const t = read(p);
    let miss;
    if (idPattern) {
      const re = new RegExp(idPattern, 'g');
      const got = new Set([...t.matchAll(re)].map(m => m[1]));
      miss = expect.filter(id => !got.has(id));
    } else {
      // 词边界：id 前后不能是字母数字下划线或连字符，杜绝 demo-1 命中 demo-10
      miss = expect.filter(id => !(new RegExp(`(?<![\\w-])${escRe(id)}(?![\\w-])`)).test(t));
    }
    if (miss.length) err(`${f} 缺少 ${miss.length}/${expect.length} 个 id: ${miss.slice(0, 8).join(', ')}${miss.length > 8 ? ' …' : ''}`);
    else ok(`${f} 覆盖全部 ${expect.length} 个 id${idPattern ? '（按 idPattern 精确提取）' : '（词边界匹配）'}`);
  }
}

/* ---------- 3. 自包含 ---------- */
if (cfg.selfContained && active(stageOf(cfg.selfContained.stage, 'G1'))) {
  const { files = [], forbid = [], mustHave = [] } = cfg.selfContained;
  for (const f of filePaths(files)) {
    const p = workPath(f);
    if (!exists(p)) { err(`自包含检查找不到 ${f}`); continue; }
    const t = read(p);
    const bad = forbid.filter(re => new RegExp(re, 'i').test(t));
    const lack = mustHave.filter(re => !new RegExp(re, 'i').test(t));
    if (bad.length) err(`${f} 含外部或相对引用: ${bad.join(' | ')}`);
    else if (lack.length) err(`${f} 缺少: ${lack.join(' | ')}`);
    else ok(`${f} 自包含`);
  }
}

/* ---------- 4. 内联 JS 语法 ---------- */
if (cfg.jsSyntax && active(stageOf(cfg.jsSyntax.stage, 'G1'))) {
  const NON_JS = /^(application\/(ld\+)?json|application\/importmap|text\/(template|html|plain)|importmap|speculationrules)$/i;
  for (const f of filePaths(cfg.jsSyntax.files)) {
    const p = workPath(f);
    if (!exists(p)) { err(`JS 语法检查找不到 ${f}`); continue; }
    const t = read(p);
    const blocks = [...t.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    if (!blocks.length) { warn(`${f} 没有内联 <script>`); continue; }
    let checked = 0, skipped = 0, bad = 0;
    blocks.forEach((m, i) => {
      const attrs = m[1];
      if (/\bsrc\s*=/i.test(attrs)) return;
      const tm = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
      const type = tm ? tm[1] : 'text/javascript';
      if (NON_JS.test(type)) { skipped++; return; }
      checked++;
      if (/^(module)$/i.test(type)) {
        // 模块语法无法用 vm.Script 校验：退化为括号/引号配平
        const bal = balance(m[2]);
        if (!bal.ok) { bad++; err(`${f} 内联 module#${i} 花括号/引号不配平: ${bal.why}`); }
        return;
      }
      try { new vm.Script(m[2], { filename: `${f}#script${i}` }); }
      catch (e) { bad++; err(`${f} 内联 script#${i} 语法错误: ${e.message}`); }
    });
    if (!bad) ok(`${f} 内联 JS：检查 ${checked} 段${skipped ? `，跳过非 JS ${skipped} 段` : ''} 通过`);
  }
}
function balance(src) {
  let i = 0, depth = 0, q = null, tpl = 0;
  while (i < src.length) {
    const c = src[i];
    if (q) {
      if (c === '\\') { i += 2; continue; }
      if (c === q) q = null;
      i++; continue;
    }
    if (c === '"' || c === "'") { q = c; i++; continue; }
    if (c === '`') { q = '`'; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { const n = src.indexOf('\n', i); i = n < 0 ? src.length : n; continue; }
    if (c === '/' && src[i + 1] === '*') { const n = src.indexOf('*/', i + 2); i = n < 0 ? src.length : n + 2; continue; }
    if (c === '{' || c === '(' || c === '[') depth++;
    if (c === '}' || c === ')' || c === ']') depth--;
    if (depth < 0) return { ok: false, why: `多余的右括号 @${i}` };
    i++;
  }
  if (depth !== 0) return { ok: false, why: `未闭合括号 depth=${depth}` };
  if (q) return { ok: false, why: `未闭合引号 ${q}` };
  return { ok: true };
}

/* ---------- 5. 字节一致（基准：config 目录 / work 目录可选） ---------- */
if (cfg.byteIdentical && active(stateOfByte())) {
  for (const pair of cfg.byteIdentical) {
    const base = pair.base === 'work' ? WORK : CONFIG_DIR;
    const L = path.isAbsolute(pair.left) ? pair.left : path.join(WORK, pair.left);
    const R = path.isAbsolute(pair.right) ? pair.right : path.join(base, pair.right);
    if (!exists(L) || !exists(R)) {
      err(`字节一致检查缺文件：left=${L}${exists(L) ? '' : '（不存在）'}  right=${R}${exists(R) ? '' : '（不存在）'}`);
      continue;
    }
    const a = sha(L), b = sha(R);
    if (a === b) ok(`字节一致 ${path.basename(L)} ↔ ${path.basename(R)} (${a.slice(0, 16)})`);
    else err(`字节不一致 ${L}(${a.slice(0, 12)}) ≠ ${R}(${b.slice(0, 12)})`);
  }
}
function stateOfByte() { return cfg.byteIdentical.stage || 'G4'; }

/* ---------- 6. 结构断言（KEY / REVIEW / MERGE_NOTES 不能是空壳） ---------- */
if (cfg.structure && active(null)) {
  for (const s of cfg.structure) {
    if (!active(stageOf(s.stage, 'G3'))) continue;
    const p = workPath(s.path);
    if (!exists(p)) { err(`结构检查找不到 ${s.path}`); continue; }
    const lines = read(p).split(/\r?\n/);
    if (s.rowPattern) {
      const re = new RegExp(s.rowPattern);
      const rows = lines.filter(l => re.test(l));
      if (s.minRows && rows.length < s.minRows) err(`${s.path} 表行不足：${rows.length} < ${s.minRows}（模板没填？）`);
      else ok(`${s.path} 表行 ${rows.length}${s.minRows ? '/' + s.minRows : ''}`);
      if (s.coverIdsFrom === 'idsCoverage') {
        const expect = (cfg.idsCoverage && cfg.idsCoverage.expect) || [];
        const miss = expect.filter(id => !lines.some(l => new RegExp(`^\\|\\s*\`?${escRe(id)}\`?\\s*\\|`).test(l)));
        if (miss.length) err(`${s.path} 未逐条覆盖 ${miss.length} 个 id: ${miss.slice(0, 6).join(', ')}`);
        else ok(`${s.path} 覆盖全部 ${expect.length} 个 id 行`);
      }
    }
    (s.forbid || []).forEach(re => { if (new RegExp(re).test(read(p))) err(`${s.path} 命中禁用表述: ${re}`); });
  }
}

/* ---------- 7. 证据问句 ---------- */
if (cfg.mustMatch && active(null)) {
  for (const item of cfg.mustMatch) {
    if (!active(stageOf(item.stage, 'G3'))) continue;
    const p = workPath(item.path);
    if (!exists(p)) { err(`证据文件缺失 ${item.path}`); continue; }
    const t = read(p);
    const lack = (item.patterns || []).filter(re => !new RegExp(re).test(t));
    const taboo = (item.forbid || []).filter(re => new RegExp(re).test(t));
    if (lack.length) err(`${item.path} 缺少必需表述: ${lack.join(' | ')}`);
    if (taboo.length) err(`${item.path} 命中禁用表述: ${taboo.join(' | ')}`);
    if (!lack.length && !taboo.length) ok(`${item.path} 证据表述合格`);
  }
}

/* ---------- 8. 项目校验器：真正执行 ---------- */
if (cfg.projectValidator && active(stageOf(cfg.projectValidator.stage, 'G4'))) {
  const v = workPath(cfg.projectValidator.path || 'contract/validate.mjs');
  if (!exists(v)) err(`项目校验器缺失 ${rel(v)}`);
  else {
    const target = path.isAbsolute(cfg.projectValidator.target || 'final')
      ? cfg.projectValidator.target
      : path.join(WORK, cfg.projectValidator.target || 'final');
    const r = spawnSync(process.execPath, [v, target], { cwd: WORK, encoding: 'utf8', timeout: 120000 });
    const out = ((r.stdout || '') + (r.stderr || '')).trim();
    if (r.error) err(`项目校验器无法执行: ${r.error.message}`);
    else if (r.status !== 0) {
      err(`项目校验器失败 (exit ${r.status})：${rel(v)} ${path.basename(target)}`);
      out.split('\n').slice(0, 12).forEach(l => l.trim() && err(`  │ ${l.trim()}`));
    } else ok(`项目校验器通过（exit 0）：${rel(v)} ${path.basename(target)}`);
  }
}

/* ---------- 输出 ---------- */
console.log('');
O.forEach(m => console.log(`${C.g}  ok${C.x} ${m}`));
W.forEach(m => console.log(`${C.y}warn${C.x} ${m}`));
E.forEach(m => console.log(`${C.r}FAIL${C.x} ${m}`));
console.log('');
if (E.length) { console.log(`${C.r}${E.length} error(s) ${W.length} warning(s) — 门禁未通过${C.x}`); process.exit(1); }
console.log(`${C.g}GATE PASS${C.x}${W.length ? ` （${W.length} warning）` : ''}`);
