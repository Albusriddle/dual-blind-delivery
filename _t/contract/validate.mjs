#!/usr/bin/env node
// 由 templates/validate.template.mjs 派生（示例项目）
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const EXPECT = {
  files: ['index.html', 'data.json'],
  ids: ["demo-1","demo-2","demo-3"],
  idFiles: ['index.html', 'data.json'],
  forbid: ['<script[^>]+src\\s*=', '<(?:img|video|audio|iframe|source)[^>]+src\\s*=', '\\bfetch\\s*\\('],
  mustHave: ['<!doctype html>', '<meta[^>]+charset=["\']?utf-8'],
  jsSyntax: ['index.html']
};

const errs = [], oks = [];
const target = process.argv[2];
if (!target) { console.error('用法: node validate.mjs <target-dir>'); process.exit(2); }
const DIR = path.resolve(target);
if (!fs.existsSync(DIR) || !fs.statSync(DIR).isDirectory()) { console.error('FAIL 目标目录不存在'); console.error('1 error(s)'); process.exit(1); }
const readIf = f => { try { return fs.readFileSync(path.join(DIR, f), 'utf8'); } catch { return null; } };

for (const f of EXPECT.files) readIf(f) === null ? errs.push('缺少文件 ' + f) : oks.push(f);
for (const f of EXPECT.idFiles) {
  const t = readIf(f); if (t === null) { errs.push('id 检查缺文件 ' + f); continue; }
  const miss = EXPECT.ids.filter(id => !(new RegExp('(?<![\\w-])' + id + '(?![\\w-])')).test(t));
  if (miss.length) errs.push(f + ' 缺少 id: ' + miss.join(',')); else oks.push(f + ' id 齐全');
}
for (const f of EXPECT.files.filter(x => /\.html$/.test(x))) {
  const t = readIf(f); if (t === null) continue;
  const bad = EXPECT.forbid.filter(re => new RegExp(re, 'i').test(t));
  const lack = EXPECT.mustHave.filter(re => !new RegExp(re, 'i').test(t));
  if (bad.length) errs.push(f + ' 含外部引用'); else if (lack.length) errs.push(f + ' 缺少必需标记'); else oks.push(f + ' 自包含');
}
for (const f of EXPECT.jsSyntax) {
  const t = readIf(f); if (t === null) continue;
  let n = 0;
  for (const m of t.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    const tm = m[1].match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
    if (tm && /json|module|template|importmap/i.test(tm[1])) continue;
    n++;
    try { new vm.Script(m[2]); } catch (e) { errs.push(f + ' script 语法错误: ' + e.message); }
  }
  oks.push(f + ' 内联 JS ' + n + ' 段');
}
oks.forEach(m => console.log('  ok ' + m));
errs.forEach(m => console.log('FAIL ' + m));
console.log('\n' + errs.length + ' error(s)');
process.exit(errs.length ? 1 : 0);
