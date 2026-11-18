#!/usr/bin/env node
/**
 * blindness.mjs — 双盲隔离检查
 *
 *   node scripts/blindness.mjs <work-dir> [--a a] [--b b] [--max-sim 0.55]
 *
 * 检查三件事：
 *   1. 交叉引用：A 的产物里是否出现 B 的目录名/路径（反之亦然）
 *   2. 独有措辞：抽 A 的高频短语，看 B 是否命中（说明抄了同一份草稿）
 *   3. 文本相似度：8-gram shingle 的 Jaccard；超过阈值报警（不阻断，交人判断）
 *
 * 退出码：0 = 无交叉引用；1 = 发现交叉引用（阻断）。
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const WORK = path.resolve(args[0] || '.');
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const DIR_A = opt('a', 'a');
const DIR_B = opt('b', 'b');
const MAX_SIM = parseFloat(opt('max-sim', '0.55'));

const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', x: '\x1b[0m', b: '\x1b[1m' };
const ERR = [], WARN = [], OK = [];

const walk = (dir, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(md|txt|html|json|mjs|js|ts|css)$/i.test(e.name)) acc.push(p);
  }
  return acc;
};
const readAll = dir => walk(dir).map(p => ({ p, t: fs.readFileSync(p, 'utf8') }));

const A = readAll(path.join(WORK, DIR_A));
const B = readAll(path.join(WORK, DIR_B));
if (!A.length || !B.length) {
  console.log(`${C.r}FAIL${C.x} 目录为空或不存在：${DIR_A}(${A.length}) / ${DIR_B}(${B.length})`);
  process.exit(1);
}

/* ---------- 1. 交叉引用 ---------- */
const refRe = (dirName) => new RegExp(
  `(^|[^\\w/.-])(\\.{0,2}/)?${dirName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`, 'i'
);
for (const [side, mine, other] of [['A', A, DIR_B], ['B', B, DIR_A]]) {
  const hits = [];
  for (const f of mine) {
    if (refRe(other).test(f.t)) hits.push(path.relative(WORK, f.p));
  }
  if (hits.length) ERR.push(`${side} 侧产物引用了对方目录 "${other}/"：${hits.join(', ')}`);
  else OK.push(`${side} 侧无对 "${other}/" 的路径引用`);
}

/* ---------- 2. 独有措辞抽样 ---------- */
const zhWords = s => (s.match(/[\u4e00-\u9fa5]{4,}/g) || []);
const freq = arr => { const m = new Map(); for (const w of arr) m.set(w, (m.get(w) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
const topA = freq(zhWords(A.map(f => f.t).join('\n'))).slice(0, 40).map(x => x[0]);
const topB = freq(zhWords(B.map(f => f.t).join('\n'))).slice(0, 40).map(x => x[0]);
const textB = B.map(f => f.t).join('\n');
const textA = A.map(f => f.t).join('\n');
const aInB = topA.filter(w => textB.includes(w));
const bInA = topB.filter(w => textA.includes(w));
OK.push(`A 高频短语 ${topA.length} 条，其中 ${aInB.length} 条也出现在 B（自然重合，仅供参考）`);
OK.push(`B 高频短语 ${topB.length} 条，其中 ${bInA.length} 条也出现在 A`);

/* ---------- 3. 相似度（8-gram） ---------- */
const norm = s => s.replace(/\s+/g, '').replace(/[<>{}()\[\];,."'`]/g, '');
const shingles = (s, k = 8) => { const t = norm(s), set = new Set(); for (let i = 0; i + k <= t.length; i++) set.add(t.slice(i, i + k)); return set; };
const sa = shingles(A.map(f => f.t).join('\n'));
const sb = shingles(B.map(f => f.t).join('\n'));
let inter = 0;
for (const s of sa) if (sb.has(s)) inter++;
const jac = inter / Math.max(1, (sa.size + sb.size - inter));
if (jac > MAX_SIM) WARN.push(`文本相似度 ${(jac * 100).toFixed(1)}% > ${(MAX_SIM * 100).toFixed(0)}% —— 可能共享草稿，请人工判断`);
else OK.push(`文本相似度 ${(jac * 100).toFixed(1)}%（阈值 ${(MAX_SIM * 100).toFixed(0)}%）`);

/* ---------- 输出 ---------- */
console.log(`${C.b}== blindness ${path.relative(process.cwd(), WORK) || '.'} ==${C.x}`);
OK.forEach(m => console.log(`${C.g}  ok${C.x} ${m}`));
WARN.forEach(m => console.log(`${C.y}warn${C.x} ${m}`));
ERR.forEach(m => console.log(`${C.r}FAIL${C.x} ${m}`));
console.log('');
if (ERR.length) { console.log(`${C.r}隔离检查未通过（${ERR.length}）${C.x}`); process.exit(1); }
console.log(`${C.g}BLINDNESS PASS${C.x}`);
