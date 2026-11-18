#!/usr/bin/env node
/**
 * manifest.mjs — 哈希清单
 *
 *   node scripts/manifest.mjs <work-dir> [--out MANIFEST.sha256] [--check] [--extra <file> ...]
 *
 * 默认把 <work>/final/ 下所有文件 + --extra 指定的交付副本写成 sha256 清单。
 * --check 时校验现有清单是否仍然一致（发布前必跑）。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const WORK = path.resolve(args[0] || '.');
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const flag = k => args.includes('--' + k);
const OUT = path.resolve(opt('out', path.join(WORK, 'MANIFEST.sha256')));
const CHECK = flag('check');
const extras = [];
args.forEach((a, i) => { if (a === '--extra') extras.push(path.resolve(args[i + 1])); });

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

const finalDir = path.join(WORK, 'final');
const files = [...walk(finalDir), ...extras];
if (!files.length) { console.error('FATAL 没有可入清单的文件（final/ 为空？）'); process.exit(1); }

if (CHECK) {
  if (!fs.existsSync(OUT)) { console.error(`FATAL 清单不存在: ${OUT}`); process.exit(1); }
  const lines = fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean);
  let bad = 0;
  for (const line of lines) {
    const [h, ...rest] = line.trim().split(/\s+/);
    const p = path.resolve(path.dirname(OUT), rest.join(' '));
    if (!fs.existsSync(p)) { console.log(`MISSING ${p}`); bad++; continue; }
    const now = sha(p);
    if (now !== h) { console.log(`CHANGED ${path.relative(WORK, p)}`); bad++; }
  }
  if (bad) { console.log(`\n清单校验失败：${bad} 处不一致`); process.exit(1); }
  console.log(`清单校验通过（${lines.length} 个文件）`);
  process.exit(0);
}

const lines = files.map(p => `${sha(p)}  ${path.relative(WORK, p).split(path.sep).join('/')}`);
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
console.log(`已写入 ${path.relative(process.cwd(), OUT) || OUT}`);
lines.forEach(l => console.log('  ' + l));
