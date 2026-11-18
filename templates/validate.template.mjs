#!/usr/bin/env node
/**
 * 项目校验器模板  →  复制到 <work>/contract/validate.mjs 后改常量。
 *
 * 契约（整个 skill 只认这一种调用方式）：
 *   node contract/validate.mjs <target-dir>      # <target-dir> = a | b | final
 * 输出：逐条 PASS/FAIL，最后一行 `N error(s)`；有 error 时 exit 1。
 * **必须对空目录报错**（G0 的"空跑自检"靠它证明门禁真在检查）。
 *
 * 允许包含：结构性断言（文件、id、字段、计数、枚举、正则、自包含、语法）。
 * 禁止包含：答案、正确选项下标、期望数值 —— 生产者能读到本文件，答案会污染双盲。
 * 分布类断言（正确项位置分布、真值比例）请放 audit/checks.mjs，不共享给生产者。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/* ============ 按项目修改 ============ */
const EXPECT = {
  files: ['index.html', 'data.json'],          // 目标目录内必需文件
  // 条目 id 全集（从合同的条目清单抄过来）
  ids: ['demo-1', 'demo-2', 'demo-3'],
  // 每个条目在 HTML/JSON 里至少出现一次；若产物有结构化数据文件，优先查它
  idFiles: ['index.html', 'data.json'],
  // 自包含禁则（相对路径外链也算）
  forbid: [
    '<script[^>]+src\\s*=',
    '<link[^>]+href\\s*=\\s*(?!["\']?(?:data:|#))',
    '<(?:img|video|audio|iframe|source)[^>]+src\\s*=',
    '(?:src|href)\\s*=\\s*["\']https?://',
    'url\\(\\s*["\']?https?://',
    '\\bfetch\\s*\\(',
    '@import\\s+url'
  ],
  mustHave: ['<!doctype html>', '<meta[^>]+charset=["\']?utf-8'],
  // 内联 JS 语法检查的文件
  jsSyntax: ['index.html'],
  // 占位符与答案数组数量对齐（模板类项目用；不需要就留空数组）
  pairs: [{ file: 'data.json', blankPattern: '____', answerKey: 'acc' }]
};
/* ==================================== */

const errs = [], oks = [];
const err = m => errs.push(m), ok = m => oks.push(m);
const target = process.argv[2];
if (!target) { console.error('用法: node validate.mjs <target-dir>'); process.exit(2); }
const DIR = path.resolve(target);
if (!fs.existsSync(DIR) || !fs.statSync(DIR).isDirectory()) {
  console.error(`FAIL 目标目录不存在: ${DIR}`); console.error('1 error(s)'); process.exit(1);
}
const readIf = f => { try { return fs.readFileSync(path.join(DIR, f), 'utf8'); } catch { return null; } };

/* 1. 必需文件 */
for (const f of EXPECT.files) {
  const t = readIf(f);
  if (t === null) err(`缺少文件 ${f}`);
  else ok(`${f} ${(Buffer.byteLength(t) / 1024).toFixed(1)} KB`);
}

/* 2. id 覆盖（词边界，防止 demo-1 命中 demo-10） */
for (const f of EXPECT.idFiles) {
  const t = readIf(f);
  if (t === null) { err(`id 检查缺文件 ${f}`); continue; }
  const miss = EXPECT.ids.filter(id =>
    !(new RegExp(`(?<![\\w-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`)).test(t));
  if (miss.length) err(`${f} 缺少 id: ${miss.join(', ')}`);
  else ok(`${f} 覆盖 ${EXPECT.ids.length} 个 id`);
}

/* 3. 自包含 */
for (const f of EXPECT.files.filter(x => /\.(html|htm)$/i.test(x))) {
  const t = readIf(f);
  if (t === null) continue;
  const bad = EXPECT.forbid.filter(re => new RegExp(re, 'i').test(t));
  const lack = EXPECT.mustHave.filter(re => !new RegExp(re, 'i').test(t));
  if (bad.length) err(`${f} 含外部/相对引用: ${bad.length} 条`);
  if (lack.length) err(`${f} 缺少: ${lack.length} 条`);
  if (!bad.length && !lack.length) ok(`${f} 自包含`);
}

/* 4. 内联 JS 语法 */
for (const f of EXPECT.jsSyntax) {
  const t = readIf(f);
  if (t === null) continue;
  const blocks = [...t.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  let n = 0, bad = 0;
  blocks.forEach((m, i) => {
    if (/\bsrc\s*=/i.test(m[1])) return;
    const tm = m[1].match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
    const type = tm ? tm[1] : 'text/javascript';
    if (/json|template|importmap/i.test(type)) return;      // 数据岛不是 JS
    if (/module/i.test(type)) return;                        // module 由 gate.mjs 做配平检查
    n++;
    try { new vm.Script(m[2]); } catch (e) { bad++; err(`${f} 内联 script#${i} 语法错误: ${e.message}`); }
  });
  if (!bad) ok(`${f} 内联 JS ${n} 段语法通过`);
}

/* 5. 占位符 / 答案数组对齐（可选） */
for (const pair of EXPECT.pairs) {
  const t = readIf(pair.file);
  if (t === null) continue;
  let data;
  try { data = JSON.parse(t); } catch (e) { err(`${pair.file} 不是合法 JSON: ${e.message}`); continue; }
  let blanks = 0, accs = 0;
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string') blanks += (v.split(pair.blankPattern).length - 1);
      if (k === pair.answerKey && Array.isArray(v)) accs += v.length;
      else walk(v);
    }
  };
  walk(data);
  if (blanks !== accs) err(`${pair.file} 空位数 ${blanks} ≠ 答案组数 ${accs}`);
  else ok(`${pair.file} 空位/答案对齐 ${blanks}`);
}

/* 输出 */
oks.forEach(m => console.log(`  ok ${m}`));
errs.forEach(m => console.log(`FAIL ${m}`));
console.log('');
console.log(`${errs.length} error(s)`);
process.exit(errs.length ? 1 : 0);
