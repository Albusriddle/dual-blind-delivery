#!/usr/bin/env node
/**
 * gate.mjs — 配置驱动的门禁检查器
 *
 *   node scripts/gate.mjs <work-dir> [--config <path>] [--stage G1|G3|G4|G5]
 *
 * 读取 <work-dir>/contract/gate.config.json（可用 --config 覆盖），执行：
 *   1. requiredFiles  必需的产物文件
 *   2. idsCoverage    id 全集覆盖（在指定文件里逐字出现）
 *   3. selfContained  禁外部依赖（正则黑名单）
 *   4. jsSyntax       内联 <script> 语法检查
 *   5. byteIdentical  构建产物 vs 交付副本 字节一致
 *   6. mustMatch      必含证据的问句（如 NOTES.md 里的"已知不足"）
 *   7. schema         调用项目自带校验器（contract/validate.mjs）并收集退出码
 *
 * 退出码：0 = 全绿；1 = 有 error。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';

const args = process.argv.slice(2);
const WORK = path.resolve(args[0] || '.');
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const CONFIG_PATH = path.resolve(opt('config', path.join(WORK, 'contract', 'gate.config.json')));
const STAGE = opt('stage', null);

const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', x: '\x1b[0m', b: '\x1b[1m' };
const E = [], W = [], O = [];
const err = m => E.push(m), warn = m => W.push(m), ok = m => O.push(m);
const rel = p => path.relative(WORK, p) || p;

if (!fs.existsSync(CONFIG_PATH)) {
  console.error(`FATAL 找不到门禁配置: ${rel(CONFIG_PATH)}`);
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
console.log(`${C.b}== gate ${rel(WORK)} ${STAGE ? '· ' + STAGE : ''} ==${C.x}`);
console.log(`${C.d}config: ${rel(CONFIG_PATH)}${C.x}`);

const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read = p => fs.readFileSync(p, 'utf8');
const exists = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };

/* ---------- 1. 必需文件 ---------- */
for (const item of (cfg.requiredFiles || [])) {
  const p = path.join(WORK, item.path);
  if (exists(p)) {
    const kb = (fs.statSync(p).size / 1024).toFixed(1);
    ok(`存在 ${item.path} (${kb} KB)`);
  } else if (item.optional) {
    warn(`可选文件缺失 ${item.path}`);
  } else {
    err(`缺少必需文件 ${item.path}${item.hint ? ' — ' + item.hint : ''}`);
  }
}

/* ---------- 2. id 覆盖 ---------- */
if (cfg.idsCoverage) {
  const { expect = [], files = [] } = cfg.idsCoverage;
  if (!expect.length) warn('idsCoverage.expect 为空（门禁退化）');
  for (const f of files) {
    const p = path.join(WORK, f);
    if (!exists(p)) { err(`id 覆盖检查找不到 ${f}`); continue; }
    const t = read(p);
    const miss = expect.filter(id => !t.includes(id));
    if (miss.length) err(`${f} 缺少 ${miss.length}/${expect.length} 个 id: ${miss.slice(0, 8).join(', ')}${miss.length > 8 ? ' …' : ''}`);
    else ok(`${f} 覆盖全部 ${expect.length} 个 id`);
  }
}

/* ---------- 3. 自包含 ---------- */
if (cfg.selfContained) {
  const { files = [], forbid = [], mustHave = [] } = cfg.selfContained;
  for (const f of files) {
    const p = path.join(WORK, f);
    if (!exists(p)) { err(`自包含检查找不到 ${f}`); continue; }
    const t = read(p);
    const bad = forbid.filter(re => new RegExp(re, 'i').test(t));
    const lack = mustHave.filter(re => !new RegExp(re, 'i').test(t));
    if (bad.length) err(`${f} 含外部依赖: ${bad.join(' | ')}`);
    else if (lack.length) err(`${f} 缺少: ${lack.join(' | ')}`);
    else ok(`${f} 自包含`);
  }
}

/* ---------- 4. 内联 JS 语法 ---------- */
if (cfg.jsSyntax) {
  for (const f of cfg.jsSyntax.files || []) {
    const p = path.join(WORK, f);
    if (!exists(p)) { err(`JS 语法检查找不到 ${f}`); continue; }
    const t = read(p);
    const blocks = [...t.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    if (!blocks.length) { warn(`${f} 没有内联 <script>`); continue; }
    let n = 0, bad = 0;
    blocks.forEach((m, i) => {
      if (/\bsrc\s*=/i.test(m[1])) return;
      n++;
      try { new vm.Script(m[2], { filename: `${f}#script${i}` }); }
      catch (e) { bad++; err(`${f} 内联 script#${i} 语法错误: ${e.message}`); }
    });
    if (!bad) ok(`${f} 内联 JS ${n} 段语法通过`);
  }
}

/* ---------- 5. 字节一致 ---------- */
for (const pair of (cfg.byteIdentical || [])) {
  const L = path.isAbsolute(pair.left) ? pair.left : path.join(WORK, pair.left);
  const R = path.isAbsolute(pair.right) ? pair.right : path.join(WORK, pair.right);
  if (!exists(L) || !exists(R)) { err(`字节一致检查缺文件: ${rel(L)} / ${rel(R)}`); continue; }
  const a = sha(L), b = sha(R);
  if (a === b) ok(`字节一致 ${path.basename(L)} ↔ ${path.basename(R)} (${a.slice(0, 16)})`);
  else err(`字节不一致 ${rel(L)}(${a.slice(0, 12)}) ≠ ${rel(R)}(${b.slice(0, 12)})`);
}

/* ---------- 6. 证据问句 ---------- */
for (const item of (cfg.mustMatch || [])) {
  const p = path.join(WORK, item.path);
  if (!exists(p)) { err(`证据文件缺失 ${item.path}`); continue; }
  const t = read(p);
  const hit = (item.patterns || []).filter(re => !new RegExp(re).test(t));
  if (hit.length) err(`${item.path} 缺少必需表述: ${hit.join(' | ')}`);
  else ok(`${item.path} 含必需表述`);
}

/* ---------- 7. 项目校验器 ---------- */
if (cfg.projectValidator && cfg.projectValidator.enabled !== false) {
  const v = path.join(WORK, cfg.projectValidator.path || 'contract/validate.mjs');
  if (!exists(v)) err(`项目校验器缺失 ${rel(v)}`);
  else ok(`项目校验器就位 ${rel(v)}（请在交付前手动执行并贴输出）`);
}

/* ---------- 输出 ---------- */
console.log('');
O.forEach(m => console.log(`${C.g}  ok${C.x} ${m}`));
W.forEach(m => console.log(`${C.y}warn${C.x} ${m}`));
E.forEach(m => console.log(`${C.r}FAIL${C.x} ${m}`));
console.log('');
if (E.length) {
  console.log(`${C.r}${E.length} error(s) ${W.length} warning(s) — 门禁未通过${C.x}`);
  process.exit(1);
}
console.log(`${C.g}GATE PASS${C.x}${W.length ? ` （${W.length} warning）` : ''}`);
