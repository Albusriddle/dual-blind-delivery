#!/usr/bin/env node
/**
 * blindness.mjs — 双盲隔离检查  v2
 *
 *   node blindness.mjs <work-dir> [--a a] [--b b] [--max-sim 0.05] [--allow-sim]
 *                                 [--sources <文件或目录>]...   # 与源材料逐字相同的句子不计入重合率
 *
 * 四类检查，任一命中即 FAIL（exit 1）：
 *   1. 交叉引用：A 产物里出现对方目录路径（兼容 / 与 \）
 *   2. 同名文件字节相同：两侧存在完全相同文件（说明复制而非独立产出）
 *   3. 整句重合率：按句切分（≥12 字）取 Jaccard，超过阈值判失败（--allow-sim 降级为 warn）
 *   4. 高频短语重合：只做提示（同主题天然重合，不作为判据）
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
if (!argv.length || argv[0].startsWith('--')) {
  console.error('用法: node blindness.mjs <work-dir> [--a a] [--b b] [--max-sim 0.05] [--allow-sim]');
  process.exit(2);
}
const WORK = path.resolve(argv[0]);
if (!fs.existsSync(WORK)) { console.error(`FATAL 工作区不存在: ${WORK}`); process.exit(2); }
const opt = (k, d) => {
  const i = argv.indexOf('--' + k);
  if (i < 0) return d;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) { console.error(`FATAL 参数 --${k} 缺少取值`); process.exit(2); }
  return v;
};
const flag = k => argv.includes('--' + k);
const DIR_A = opt('a', 'a'), DIR_B = opt('b', 'b');
const MAX_SIM = parseFloat(opt('max-sim', '0.05'));
const ALLOW_SIM = flag('allow-sim');
const SOURCES = [];
argv.forEach((a, i) => { if (a === '--sources' && argv[i + 1] && !argv[i + 1].startsWith('--')) SOURCES.push(path.resolve(argv[i + 1])); });

const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', x: '\x1b[0m', b: '\x1b[1m' };
const ERR = [], WARN = [], OK = [];
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const walk = (dir, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(md|txt|html|json|mjs|js|ts|css|py)$/i.test(e.name)) acc.push(p);
  }
  return acc;
};

const dirA = path.join(WORK, DIR_A), dirB = path.join(WORK, DIR_B);
const A = walk(dirA), B = walk(dirB);
if (!A.length || !B.length) {
  console.log(`${C.r}FAIL${C.x} 目录为空或不存在：${DIR_A}(${A.length}) / ${DIR_B}(${B.length})`);
  process.exit(1);
}

/* ---------- 1. 交叉引用 ---------- */
const refOf = name => new RegExp(`(^|[^\\w.-])(\\.{0,2}[\\\\/])?${escapeRe(name)}[\\\\/]`, 'i');
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
for (const [side, mine, other] of [['A', A, DIR_B], ['B', B, DIR_A]]) {
  const hits = mine.filter(p => refOf(other).test(fs.readFileSync(p, 'utf8')))
                   .map(p => path.relative(WORK, p));
  if (hits.length) ERR.push(`${side} 侧产物引用了对方目录 "${other}/"：${hits.join(', ')}`);
  else OK.push(`${side} 侧无对 "${other}/" 的路径引用（含 Windows 反斜杠）`);
}

/* ---------- 2. 同名文件字节相同 ---------- */
const relName = (list, dir) => new Map(list.map(p => [path.relative(dir, p).split(path.sep).join('/'), p]));
const ma = relName(A, dirA), mb = relName(B, dirB);
const identical = [];
for (const [k, p] of ma) {
  if (mb.has(k) && sha(p) === sha(mb.get(k))) identical.push(k);
}
if (identical.length) ERR.push(`A/B 存在逐字节相同的文件（疑似复制而非独立产出）：${identical.join(', ')}`);
else OK.push('A/B 无逐字节相同的文件');

/* ---------- 3. 整句重合率 ---------- */
/** 去掉标签/脚本，只留自然语言；避免 <!doctype html> 这类样板行算作"重合句" */
const plain = raw => raw
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ');
/** 是否像自然语言句子：≥4 个汉字，或 ≥20 个拉丁字母 */
const isNatural = z => (z.match(/[\u4e00-\u9fa5]/g) || []).length >= 4 || (z.match(/[A-Za-z]/g) || []).length >= 20;
const splitSentences = raw => {
  const set = new Set();
  for (const s of plain(raw).split(/[。！？；\r\n]+/)) {
    const z = s.replace(/\s+/g, ' ').trim();
    if (z.length >= 12 && isNatural(z)) set.add(z);
  }
  return set;
};
const sentences = files => {
  const set = new Set();
  for (const f of files) for (const s of splitSentences(fs.readFileSync(f, 'utf8'))) set.add(s);
  return set;
};
/** 源材料原文句集合：这些句子两侧逐字出现是正确行为，不算重合 */
const sourceSentences = files => {
  const set = new Set();
  for (const p of files) {
    const list = fs.statSync(p).isDirectory() ? walk(p) : [p];
    for (const f of list) for (const s of splitSentences(fs.readFileSync(f, 'utf8'))) set.add(s);
  }
  return set;
};
const srcSet = SOURCES.length ? sourceSentences(SOURCES) : new Set();
const strip = set => { const out = new Set(); for (const s of set) if (!srcSet.has(s)) out.add(s); return out; };
const sa = strip(sentences(A)), sb = strip(sentences(B));
let inter = 0;
for (const s of sa) if (sb.has(s)) inter++;
const jac = inter / Math.max(1, sa.size + sb.size - inter);
const pct = (jac * 100).toFixed(1);
if (!SOURCES.length) WARN.push('未提供 --sources：若两侧都逐字保留源材料题干，重合率会被抬高（建议传源材料路径）');
else OK.push(`已剔除源材料原文句 ${srcSet.size} 条（来自 ${SOURCES.length} 个路径）`);
if (jac > MAX_SIM) {
  const msg = `整句重合率 ${pct}% > ${(MAX_SIM * 100).toFixed(0)}%（${inter} 句完全相同）—— 可能共享草稿`;
  if (ALLOW_SIM) WARN.push(msg + '（--allow-sim 已降级）');
  else ERR.push(msg + '；如确认同主题自然重合，用 --allow-sim 显式放行');
} else OK.push(`整句重合率 ${pct}%（阈值 ${(MAX_SIM * 100).toFixed(0)}%）`);

/* ---------- 4. 高频短语（仅提示） ---------- */
const zh = s => (s.match(/[\u4e00-\u9fa5]{6,}/g) || []);
const freqTop = files => {
  const m = new Map();
  for (const f of files) for (const w of zh(fs.readFileSync(f, 'utf8'))) m.set(w, (m.get(w) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(x => x[0]);
};
const tA = freqTop(A), tB = freqTop(B);
const textA = A.map(p => fs.readFileSync(p, 'utf8')).join('\n');
const textB = B.map(p => fs.readFileSync(p, 'utf8')).join('\n');
const shareA = tA.filter(w => textB.includes(w)).length;
WARN.push(`高频短语自然重合：A ${shareA}/${tA.length}、B ${tB.filter(w => textA.includes(w)).length}/${tB.length}（仅提示，不作判据）`);

/* ---------- 输出 ---------- */
console.log(`${C.b}== blindness ${path.relative(process.cwd(), WORK) || '.'} ==${C.x}`);
OK.forEach(m => console.log(`${C.g}  ok${C.x} ${m}`));
WARN.forEach(m => console.log(`${C.y}warn${C.x} ${m}`));
ERR.forEach(m => console.log(`${C.r}FAIL${C.x} ${m}`));
console.log('');
if (ERR.length) { console.log(`${C.r}隔离检查未通过（${ERR.length} 项）${C.x}`); process.exit(1); }
console.log(`${C.g}BLINDNESS PASS${C.x}`);
