#!/usr/bin/env node
/**
 * tests/run.mjs — 门禁自测套件（回归用例）
 *
 *   node tests/run.mjs
 *
 * 在临时目录里复制 examples/minimal-work，施加变异，断言脚本退出码。
 * 每个用例都对应 references/failure-modes.md 里的一个失败模式。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCRIPTS = path.join(ROOT, 'scripts');
const FIXTURE = path.join(ROOT, 'examples', 'minimal-work');

const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', x: '\x1b[0m', b: '\x1b[1m' };
let pass = 0, fail = 0;

function mktemp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dbd-'));
  fs.cpSync(FIXTURE, d, { recursive: true });
  return d;
}
const P = (d, ...p) => path.join(d, ...p);
const read = f => fs.readFileSync(f, 'utf8');
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

function run(script, args, cwd = ROOT) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { cwd, encoding: 'utf8', timeout: 60000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

function check(name, fn) {
  const tmp = mktemp();
  let res;
  try { res = fn(tmp); } finally { /* 保留 tmp 便于排错？统一清理 */ fs.rmSync(tmp, { recursive: true, force: true }); }
  const ok = res.ok;
  if (ok) { pass++; console.log(`${C.g}  PASS${C.x} ${name}`); }
  else { fail++; console.log(`${C.r}  FAIL${C.x} ${name}\n        ${String(res.why || '').split('\n').slice(0, 6).join('\n        ')}`); }
}
const expect = (code, want) => ({ ok: code === want, why: `exit ${code} ≠ 期望 ${want}` });

/* ---------------- 基线 ---------------- */
check('基线：gate 全绿', d => { const r = run('gate.mjs', [d]); return { ok: r.code === 0, why: r.out }; });
check('基线：blindness 全绿', d => { const r = run('blindness.mjs', [d]); return { ok: r.code === 0, why: r.out }; });
check('基线：manifest 写入 + 校验', d => {
  const w = run('manifest.mjs', [d]); if (w.code !== 0) return { ok: false, why: w.out };
  const c = run('manifest.mjs', [d, '--check']); return { ok: c.code === 0, why: c.out };
});

/* ---------------- B1 项目校验器必须真正执行 ---------------- */
check('B1a：校验器恒失败 → gate 必须红', d => {
  write(P(d, 'contract/validate.mjs'), "process.exit(1);\n");
  const r = run('gate.mjs', [d]);
  return { ok: r.code === 1 && /项目校验器失败/.test(r.out), why: r.out };
});
check('B1b：校验器恒通过（空跑也绿）→ gate 必须红', d => {
  write(P(d, 'contract/validate.mjs'), "console.log('0 error(s)');process.exit(0);\n");
  const r = run('gate.mjs', [d]);
  return { ok: r.code === 1 && /空跑自检失败/.test(r.out), why: r.out };
});

/* ---------------- B2 id 覆盖必须精确 ---------------- */
check('B2：demo-1 命中 demo-10 → gate 必须红', d => {
  const html = read(P(d, 'a/index.html')).replace(/id="demo-1"/, 'id="demo-10"').replace(/id="demo-2"/, 'id="demo-20"').replace(/id="demo-3"/, 'id="demo-30"');
  write(P(d, 'a/index.html'), html);
  const r = run('gate.mjs', [d]);
  return { ok: r.code === 1 && /缺少 3\/3 个 id/.test(r.out), why: r.out };
});

/* ---------------- B3 双盲隔离必须真红 ---------------- */
check('B3a：A/B 产物逐字节相同 → blindness 必须红', d => {
  fs.cpSync(P(d, 'a/index.html'), P(d, 'b/index.html'));
  const r = run('blindness.mjs', [d]);
  return { ok: r.code === 1 && /逐字节相同/.test(r.out), why: r.out };
});
check('B3b：Windows 反斜杠引用 ..\\b\\index.html → blindness 必须红', d => {
  write(P(d, 'a/NOTES.md'), read(P(d, 'a/NOTES.md')) + '\n参考: ..\\b\\index.html\n');
  const r = run('blindness.mjs', [d]);
  return { ok: r.code === 1 && /指向对方目录的文件引用/.test(r.out), why: r.out };
});
check('B3d：仅提及目录名（"未读取 b/"）→ 只 warn，不阻断', d => {
  write(P(d, 'a/NOTES.md'), read(P(d, 'a/NOTES.md')) + '\n隔离声明：未读取 b/ 目录。\n');
  const r = run('blindness.mjs', [d]);
  return { ok: r.code === 0 && /仅提及目录名/.test(r.out), why: r.out };
});
check('B3e：数学式 a/b 不应被误判为交叉引用', d => {
  write(P(d, 'b/README.md'), '# 推导\n占比 = a/b，其中 b>0；交换相邻两作业后减少 a−b。\n');
  const r = run('blindness.mjs', [d]);
  return { ok: r.code === 0 && !/指向对方目录的文件引用/.test(r.out), why: r.out };
});
check('B3c：整句重合率超阈值 → blindness 必须红', d => {
  const copy = read(P(d, 'a/index.html')).replace(/A 方案/g, 'B 方案').replace(/__A_BUILD/g, '__B_BUILD');
  write(P(d, 'b/index.html'), copy);
  const r = run('blindness.mjs', [d]);
  return { ok: r.code === 1, why: r.out };
});

/* ---------------- B4 空壳产物必须红 ---------------- */
check('B4a：KEY 只有标题 → gate 必须红', d => {
  write(P(d, 'audit/KEY.md'), '# KEY\n');
  const r = run('gate.mjs', [d]);
  return { ok: r.code === 1 && /表行不足/.test(r.out), why: r.out };
});
check('B4b：REVIEW 只有两行 → gate 必须红', d => {
  write(P(d, 'audit/REVIEW.md'), 'blocker 无\n取谁：全部取 A\n');
  const r = run('gate.mjs', [d]);
  return { ok: r.code === 1 && /表行不足/.test(r.out), why: r.out };
});
check('B4c：ROUNDS 为空 → gate 必须红', d => {
  write(P(d, 'ROUNDS.md'), '');
  const r = run('gate.mjs', [d]);
  return { ok: r.code === 1, why: r.out };
});
check('B4d：NOTES 写「已知不足：无」→ gate 必须红', d => {
  write(P(d, 'a/NOTES.md'), '# A\n- validate: 没跑\n- 已知不足：无\n');
  const r = run('gate.mjs', [d]);
  return { ok: r.code === 1 && /禁用表述/.test(r.out), why: r.out };
});

/* ---------------- M2/M3 自包含与语法 ---------------- */
check('M2：JSON 数据岛 + module 脚本 → gate 仍绿', d => {
  const html = read(P(d, 'final/index.html'))
    .replace('<script>window.__FINAL = "merged";</script>',
      '<script type="application/json" id="payload">{"items":[{"id":"demo-1"}]}</script>\n<script type="module">const a = { b: [1,2] }; a.b.map(x => x * 2);</script>');
  write(P(d, 'final/index.html'), html);
  fs.cpSync(P(d, 'final/index.html'), P(d, 'delivery/demo.html'));
  const r = run('gate.mjs', [d]);
  return { ok: r.code === 0, why: r.out };
});
check('M3：相对路径外链（style.css / pic.png）→ gate 必须红', d => {
  const html = read(P(d, 'final/index.html')).replace('</head>',
    '<link rel="stylesheet" href="style.css"><img src="pic.png"></head>');
  write(P(d, 'final/index.html'), html);
  fs.cpSync(P(d, 'final/index.html'), P(d, 'delivery/demo.html'));
  const r = run('gate.mjs', [d]);
  return { ok: r.code === 1 && /含外部或相对引用/.test(r.out), why: r.out };
});

/* ---------------- M1 字节一致基准 ---------------- */
check('M1：交付副本字节不同 → gate 必须红', d => {
  write(P(d, 'delivery/demo.html'), read(P(d, 'final/index.html')) + '<!-- drift -->');
  const r = run('gate.mjs', [d]);
  return { ok: r.code === 1 && /字节不一致/.test(r.out), why: r.out };
});

/* ---------------- M5 stage 过滤 ---------------- */
check('M5：--stage G1 时未到阶段的文件不参与 → 绿', d => {
  fs.rmSync(P(d, 'final'), { recursive: true, force: true });
  fs.rmSync(P(d, 'audit/REVIEW.md'));
  const r = run('gate.mjs', [d, '--stage', 'G1']);
  return { ok: r.code === 0, why: r.out };
});
check('M5b：同一工作区不带 --stage → 红', d => {
  fs.rmSync(P(d, 'final'), { recursive: true, force: true });
  const r = run('gate.mjs', [d]);
  return { ok: r.code === 1, why: r.out };
});

/* ---------------- M7 清单必须发现新增文件 ---------------- */
check('M7：final/ 新增文件后 --check 必须红', d => {
  run('manifest.mjs', [d]);
  write(P(d, 'final/extra.html'), '<!doctype html><title>x</title>');
  const r = run('manifest.mjs', [d, '--check']);
  return { ok: r.code === 1 && /ADDED/.test(r.out), why: r.out };
});
check('M7b：--diff 能列出变更', d => {
  run('manifest.mjs', [d]);
  const old = P(d, 'MANIFEST.sha256');
  fs.copyFileSync(old, P(d, 'old.sha256'));
  write(P(d, 'final/index.html'), read(P(d, 'final/index.html')) + '\n<!-- v2 -->');
  const r = run('manifest.mjs', [d, '--diff', P(d, 'old.sha256')]);
  return { ok: r.code === 1 && /changed 1/.test(r.out), why: r.out };
});

/* ---------------- 用法错误必须 exit 2 ---------------- */
check('用法：--config 缺值 → exit 2', d => {
  const r = run('gate.mjs', [d, '--config']);
  return { ok: r.code === 2 && /缺少取值/.test(r.out), why: r.out };
});
check('用法：工作区不存在 → exit 2', () => {
  const r = run('gate.mjs', [path.join(os.tmpdir(), 'dbd-does-not-exist-' + Date.now())]);
  return { ok: r.code === 2 && /工作区不存在/.test(r.out), why: r.out };
});

/* ---------------- R2 复验提出的 4 条 ---------------- */
check('R2-1a：两侧逐字保留源材料题干 → 传 --sources 后应绿', d => {
  const shared = '某系统采用虚拟内存，内存命中耗时一百纳秒，缺页时需要磁盘调页。';
  const src = P(d, 'source.txt');
  write(src, shared + '\n');
  for (const side of ['a', 'b']) {
    const f = P(d, side, 'index.html');
    write(f, read(f).replace('</body>', '<p>' + shared + '</p></body>'));
  }
  const r = run('blindness.mjs', [d, '--sources', src]);
  return { ok: r.code === 0 && /已剔除源材料原文句/.test(r.out), why: r.out };
});
check('R2-1b：同样的共享句，不传 --sources → 应红（阈值生效）', d => {
  const shared = '某系统采用虚拟内存，内存命中耗时一百纳秒，缺页时需要磁盘调页。';
  for (const side of ['a', 'b']) {
    const f = P(d, side, 'index.html');
    write(f, read(f).replace('</body>', '<p>' + shared + '</p></body>'));
  }
  const r = run('blindness.mjs', [d]);
  return { ok: r.code === 1 && /整句重合率/.test(r.out), why: r.out };
});
check('R2-2：byteIdentical 逐项 stage 生效（G5 项在 G4 不检查）', d => {
  const cf = P(d, 'contract/gate.config.json');
  const c = JSON.parse(read(cf));
  c.byteIdentical[0].stage = 'G5';
  write(cf, JSON.stringify(c, null, 2));
  fs.rmSync(P(d, 'delivery/demo.html'));
  const r = run('gate.mjs', [d, '--stage', 'G4']);
  return { ok: r.code === 0, why: r.out };
});
check('R2-3：manifest --extra 指向不存在文件 → exit 2 且信息清晰', d => {
  const r = run('manifest.mjs', [d, '--extra', P(d, 'nope.html')]);
  return { ok: r.code === 2 && /不存在/.test(r.out) && !/at Object/.test(r.out), why: r.out };
});
check('R2-4：英文交付按行切句（不再退化为整文件比较）', d => {
  const line = 'The scheduler picks the shortest remaining time job first every time.';
  write(P(d, 'a/README.md'), line + '\n' + 'Alpha build only.\n');
  write(P(d, 'b/README.md'), line + '\n' + 'Bravo build only.\n');
  const r = run('blindness.mjs', [d]);
  return { ok: r.code === 1 && /整句重合率/.test(r.out), why: r.out };
});

/* ---------------- 汇总 ---------------- */
console.log(`\n${fail ? C.r : C.g}${pass} passed, ${fail} failed${C.x}`);
process.exit(fail ? 1 : 0);
