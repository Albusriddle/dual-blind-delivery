// 生成 examples/minimal-work/：一个能让 gate / blindness / manifest 全绿的最小工作区
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || 'examples/minimal-work';
const W = (p, s) => { const f = path.join(ROOT, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

const IDS = ['demo-1', 'demo-2', 'demo-3'];

/* ---------- contract ---------- */
W('contract/SPEC.md', `# 示例合同（minimal-work）

- 交付物：单文件 HTML 题库页（3 条示例题）
- 条目：${IDS.join(' / ')}（共 3 条）
- 验收：id 齐全、自包含、内联 JS 语法通过、\`node contract/validate.mjs <dir>\` 0 error
- 禁则：不许外链、不许读另一侧目录、不许改 contract/
`);

W('contract/gate.config.json', JSON.stringify({
  version: 2,
  requiredFiles: [
    { path: 'contract/SPEC.md', stage: 'G1' },
    { path: 'contract/KEY_SPEC.md', stage: 'G1' },
    { path: 'a/index.html', stage: 'G1' },
    { path: 'a/data.json', stage: 'G1' },
    { path: 'a/NOTES.md', stage: 'G1' },
    { path: 'b/index.html', stage: 'G1' },
    { path: 'b/data.json', stage: 'G1' },
    { path: 'b/NOTES.md', stage: 'G1' },
    { path: 'audit/KEY.md', stage: 'G2' },
    { path: 'audit/REVIEW.md', stage: 'G3' },
    { path: 'final/index.html', stage: 'G4' },
    { path: 'final/data.json', stage: 'G4' },
    { path: 'final/MERGE_NOTES.md', stage: 'G4' },
    { path: 'ROUNDS.md', stage: 'G4' }
  ],
  idsCoverage: {
    expect: IDS,
    files: ['a/index.html', 'b/index.html', { path: 'final/index.html', stage: 'G4' }],
    idPattern: 'id="(demo-[0-9]+)"',
    stage: 'G1'
  },
  selfContained: {
    files: ['a/index.html', 'b/index.html', { path: 'final/index.html', stage: 'G4' }],
    forbid: [
      '<script[^>]+src\\s*=',
      '<link[^>]+href\\s*=\\s*(?!["\\\']?(?:data:|#))',
      '<(?:img|video|audio|iframe|source)[^>]+src\\s*=',
      '(?:src|href)\\s*=\\s*["\\\']https?://',
      'url\\(\\s*["\\\']?https?://',
      '\\bfetch\\s*\\(',
      '@import\\s+url'
    ],
    mustHave: ['<!doctype html>', '<meta[^>]+charset=["\\\']?utf-8'],
    stage: 'G1'
  },
  jsSyntax: { files: ['a/index.html', 'b/index.html', { path: 'final/index.html', stage: 'G4' }], stage: 'G1' },
  structure: [
    { path: 'audit/KEY.md', stage: 'G2', rowPattern: '^\\|\\s*demo-[0-9]+\\s*\\|', minRows: 3, coverIdsFrom: 'idsCoverage', forbid: ['存疑项[：:]\\s*无', '待补'] },
    { path: 'audit/REVIEW.md', stage: 'G3', rowPattern: '^\\|\\s*demo-[0-9]+\\s*\\|', minRows: 3, coverIdsFrom: 'idsCoverage' },
    { path: 'ROUNDS.md', stage: 'G4', rowPattern: '^\\|\\s*R[0-9]+\\s*\\|', minRows: 1 }
  ],
  mustMatch: [
    { path: 'a/NOTES.md', stage: 'G1', patterns: ['不足'], forbid: ['不足[：:]\\s*无'] },
    { path: 'b/NOTES.md', stage: 'G1', patterns: ['不足'], forbid: ['不足[：:]\\s*无'] },
    { path: 'audit/REVIEW.md', stage: 'G3', patterns: ['blocker', '取谁'] },
    { path: 'final/MERGE_NOTES.md', stage: 'G4', patterns: ['sha256', '取'] }
  ],
  byteIdentical: [{ left: 'final/index.html', right: '../delivery/demo.html', stage: 'G4' }],
  projectValidator: { path: 'contract/validate.mjs', target: 'final', emptyRun: true, stage: 'G4' }
}, null, 2) + '\n');

W('contract/validate.mjs', `#!/usr/bin/env node
// 由 templates/validate.template.mjs 派生（示例项目）
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const EXPECT = {
  files: ['index.html', 'data.json'],
  ids: ${JSON.stringify(IDS)},
  idFiles: ['index.html', 'data.json'],
  forbid: ['<script[^>]+src\\\\s*=', '<(?:img|video|audio|iframe|source)[^>]+src\\\\s*=', '\\\\bfetch\\\\s*\\\\('],
  mustHave: ['<!doctype html>', '<meta[^>]+charset=["\\']?utf-8'],
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
  const miss = EXPECT.ids.filter(id => !(new RegExp('(?<![\\\\w-])' + id + '(?![\\\\w-])')).test(t));
  if (miss.length) errs.push(f + ' 缺少 id: ' + miss.join(',')); else oks.push(f + ' id 齐全');
}
for (const f of EXPECT.files.filter(x => /\\.html$/.test(x))) {
  const t = readIf(f); if (t === null) continue;
  const bad = EXPECT.forbid.filter(re => new RegExp(re, 'i').test(t));
  const lack = EXPECT.mustHave.filter(re => !new RegExp(re, 'i').test(t));
  if (bad.length) errs.push(f + ' 含外部引用'); else if (lack.length) errs.push(f + ' 缺少必需标记'); else oks.push(f + ' 自包含');
}
for (const f of EXPECT.jsSyntax) {
  const t = readIf(f); if (t === null) continue;
  let n = 0;
  for (const m of t.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)) {
    if (/\\bsrc\\s*=/i.test(m[1])) continue;
    const tm = m[1].match(/\\btype\\s*=\\s*["']?([^"'\\s>]+)/i);
    if (tm && /json|module|template|importmap/i.test(tm[1])) continue;
    n++;
    try { new vm.Script(m[2]); } catch (e) { errs.push(f + ' script 语法错误: ' + e.message); }
  }
  oks.push(f + ' 内联 JS ' + n + ' 段');
}
oks.forEach(m => console.log('  ok ' + m));
errs.forEach(m => console.log('FAIL ' + m));
console.log('\\n' + errs.length + ' error(s)');
process.exit(errs.length ? 1 : 0);
`);

W('contract/KEY_SPEC.md', `# 基线规范（示例）

| 字段 | 必需 |
|---|---|
| 核心条件 | 是 |
| 关键中间量 | 是 |
| 最终结论 | 是 |
| 易错点 ≥2 条 | 是 |

文件头必须有独立性声明与覆盖条目数；末尾必须有「源材料存疑项」一节。
表格行格式固定为 \`| <id> | … |\`，便于 gate 的 structure 断言。
`);

/* ---------- a / b ---------- */
const pageA = (extra) => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>A 方案示例页</title></head>
<body>
<h1>示例题库 · A 实现</h1>
<p>本页由 A 生产者独立完成，采用"逐题卡片 + 折叠解析"的信息结构。</p>
<section id="demo-1"><h2>题 1</h2><p>两数相加时最多产生几次进位？</p></section>
<section id="demo-2"><h2>题 2</h2><p>16 位地址空间、页大小 4 KiB，共能划分多少页？</p></section>
<section id="demo-3"><h2>题 3</h2><p>时钟算法中，使用位为 0 是否等价于最久未使用？</p></section>
${extra}
<script>window.__A_BUILD = "a-1";</script>
</body></html>
`;
const pageB = (extra) => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>B 方案示例页</title></head>
<body>
<h1>示例题库（B 版）</h1>
<p>B 版把三题排成单列时间轴，解析默认收起；实现细节与 A 版无关。</p>
<article id="demo-1"><b>一、</b> 进位次数上界是几？</article>
<article id="demo-2"><b>二、</b> 页表项数量为多少？</article>
<article id="demo-3"><b>三、</b> 使用位能否代替精确的访问时间？</article>
${extra}
<script>const READY_B = true;</script>
</body></html>
`;

W('a/index.html', pageA(''));
W('b/index.html', pageB(''));
W('a/data.json', JSON.stringify({ items: IDS.map((id, i) => ({ id, title: ['进位次数', '页数', '时钟近似'][i] })) }, null, 2) + '\n');
W('b/data.json', JSON.stringify({ questions: IDS.map((id, i) => ({ id, stem: ['最多几次进位？', '一共多少页？', '使用位等价吗？'][i] })) }, null, 2) + '\n');
W('a/NOTES.md', `# A 自检记录

- 构建：无（静态页）
- \`node contract/validate.mjs a\` → 0 error
- 自测：3 条 id 均在页内出现
- 已知不足：示例内容极短，未做移动端适配
`);
W('b/NOTES.md', `# B 自检记录

- 构建：无（静态页）
- \`node contract/validate.mjs b\` → 0 error
- 自测：三题均渲染，脚本无报错
- 已知不足：解析文本过于简略
`);

/* ---------- audit ---------- */
W('audit/KEY.md', `# 独立基线 KEY

- 生成时间：2026-01-01T10:00+08:00
- 独立性声明：本文件在读取 \`a/\`、\`b/\` 之前完成（提交顺序证明）
- 覆盖条目：3 / 3
- 源材料：示例源（3 条）

| id | 核心条件 | 关键中间量 | 最终结论 | 易错点 |
|---|---|---|---|---|
| demo-1 | 两个 n 位数相加 | 单次加法最多 1 次进位 | 最多 1 次进位 | ① 误以为逐位进位可累加 ② 忽略最高位溢出 |
| demo-2 | 16 位地址、页 4 KiB | 2^16 / 2^12 = 2^4 = 16 | 共 16 页 | ① 忘除页大小 ② 把位数当字节数 |
| demo-3 | Clock 使用位 | 使用位仅表示"自上次清零后被访问过" | 不等价于 LRU | ① 混淆使用位与访问时间 ② 认为指针扫描等于全序 |

## 源材料存疑项

| # | 位置 | 疑点 | 判定 |
|---|---|---|---|
| P1 | 示例源第 2 条 | 未说明页对齐 | 不影响结论，按页对齐处理 |
`);

W('audit/REVIEW.md', `# 交叉复核（示例）

| 项 | 结论 |
|---|---|
| 骨架 | **A**（结构更利于扩展） |
| blocker | 0 条 |
| major / minor | 0 / 1 |

## 逐项取谁

| id | 取谁 | 理由 |
|---|---|---|
| demo-1 | A | 小问更细 |
| demo-2 | A | 中间量齐全 |
| demo-3 | A | 与基线一致 |

## 结论

两套均与基线一致；B 的排版更紧凑但小问偏少。取 A 合并。
`);

/* ---------- final ---------- */
const finalPage = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>示例题库（终版）</title></head>
<body>
<h1>示例题库 · 终版</h1>
<section id="demo-1"><h2>1. 进位次数</h2><p>最多 1 次。</p></section>
<section id="demo-2"><h2>2. 页数</h2><p>16 页。</p></section>
<section id="demo-3"><h2>3. 使用位</h2><p>不等价于 LRU。</p></section>
<script>window.__FINAL = "merged";</script>
</body></html>
`;
W('final/index.html', finalPage);
W('final/data.json', JSON.stringify({ meta: { title: '示例题库' }, items: IDS.map(id => ({ id })) }, null, 2) + '\n');
W('final/MERGE_NOTES.md', `# 合并说明（示例）

- 取谁：全取 A（3 条）
- 偏离：无
- 字节一致：sha256(final/index.html) == sha256(delivery/demo.html)，值见 MANIFEST
`);
W('ROUNDS.md', `# 交接与门禁记录

| 轮次 | 门禁 | 提出者 | 问题 | 修复 | 复验 | 结论 | 时间 |
|---|---|---|---|---|---|---|---|
| R1 | G1 | lead | - | A/B 首次交付 | lead | 绿 | 2026-01-01T11:00+08:00 |
| R2 | G3 | reviewer | - | 交叉复核 0 blocker | reviewer | 绿 | 2026-01-01T11:30+08:00 |
`);
W('delivery/demo.html', finalPage);

console.log('minimal-work 生成完毕：', ROOT);
