#!/usr/bin/env node
/**
 * manifest.mjs — 哈希清单  v2
 *
 *   node manifest.mjs <work-dir> [--out <file>] [--extra <file>]... [--check] [--diff <old.sha256>]
 *
 * 清单路径一律写成「相对 <work-dir>」的形式（--extra 若在 work 之外，写相对 work 的 ../ 形式）。
 *   --check        校验当前文件集与清单一致：缺失 / 变更 / **新增** 都算失败
 *   --diff <old>   与旧清单对比，输出 added / removed / changed（Δ 复核用）
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
if (!argv.length || argv[0].startsWith('--')) {
  console.error('用法: node manifest.mjs <work-dir> [--out f] [--extra f]... [--check] [--diff old]');
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
const extraFiles = [];
argv.forEach((a, i) => { if (a === '--extra' && argv[i + 1] && !argv[i + 1].startsWith('--')) extraFiles.push(path.resolve(argv[i + 1])); });

const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const walk = (dir, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc); else acc.push(p);
  }
  return acc;
};
const relOf = p => path.relative(WORK, p).split(path.sep).join('/');
const absOf = r => path.resolve(WORK, r);

function collect() {
  const files = [...walk(path.join(WORK, 'final')), ...extraFiles];
  const map = new Map();
  for (const f of files) map.set(relOf(f), sha(f));
  return map;
}

const OUT = opt('out', path.join(WORK, 'MANIFEST.sha256'));

/* ---------- diff ---------- */
if (flag('diff')) {
  const oldPath = path.resolve(opt('diff'));
  if (!fs.existsSync(oldPath)) { console.error(`FATAL 旧清单不存在: ${oldPath}`); process.exit(2); }
  const parse = p => new Map(fs.readFileSync(p, 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('  '); return [l.slice(i + 2).trim(), l.slice(0, i).trim()]; }));
  const oldM = parse(oldPath), nowM = collect();
  const added = [...nowM.keys()].filter(k => !oldM.has(k));
  const removed = [...oldM.keys()].filter(k => !nowM.has(k));
  const changed = [...nowM.keys()].filter(k => oldM.has(k) && oldM.get(k) !== nowM.get(k));
  console.log(`added ${added.length}: ${added.join(', ') || '—'}`);
  console.log(`removed ${removed.length}: ${removed.join(', ') || '—'}`);
  console.log(`changed ${changed.length}: ${changed.join(', ') || '—'}`);
  if (added.length || removed.length || changed.length) process.exit(1);
  process.exit(0);
}

/* ---------- check ---------- */
if (flag('check')) {
  if (!fs.existsSync(OUT)) { console.error(`FATAL 清单不存在: ${OUT}`); process.exit(2); }
  const listed = new Map(fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('  '); return [l.slice(i + 2).trim(), l.slice(0, i).trim()]; }));
  const now = collect();
  let bad = 0;
  for (const [r, h] of listed) {
    const p = absOf(r);
    if (!fs.existsSync(p)) { console.log(`MISSING ${r}`); bad++; continue; }
    if (sha(p) !== h) { console.log(`CHANGED ${r}`); bad++; }
  }
  for (const r of now.keys()) if (!listed.has(r)) { console.log(`ADDED   ${r}`); bad++; }
  if (bad) { console.log(`\n清单校验失败：${bad} 处不一致`); process.exit(1); }
  console.log(`清单校验通过（${listed.size} 个文件，无新增/变更/缺失）`);
  process.exit(0);
}

/* ---------- write ---------- */
const map = collect();
if (!map.size) { console.error('FATAL 没有可入清单的文件（final/ 为空，且未给 --extra）'); process.exit(2); }
const lines = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([r, h]) => `${h}  ${r}`);
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
console.log(`已写入 ${OUT}（${lines.length} 个文件）`);
lines.forEach(l => console.log('  ' + l));
