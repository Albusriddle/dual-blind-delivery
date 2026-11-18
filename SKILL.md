---
name: dual-blind-delivery
description: "Use this skill when a deliverable must be produced and independently verified — quiz banks, study pages, technical docs, data extraction, translations, code migrations, exam/answer keys, or any artifact where one author's blind spots are the main risk. Triggers include: '双盲产出', '双盲', '两个人独立做再比对', '第三人复核', '独立复核', '交叉复核', '二审', '定稿前找人审一遍', 'dual-blind', 'independent second opinion', 'cross-review', 'two independent producers'. Also trigger when the user says '不要一个人写完就交', '每轮审出问题都要返工', or asks for a quality gate that must be clean before moving on."
license: MIT
---

# 双盲产出 · 独立复核 · 二审定稿

一套**有硬门禁、可返工追溯**的交付流程。核心思想只有三条：

1. **同一个合同，两套独立实现**——盲性能把"作者个人盲区"变成可观测的差异。
2. **先立标尺，再判对错**——复核员在看不到任何产出的情况下，独立从源材料建立基线。
3. **门禁不绿不许前进**——每轮审出的问题必须返工并复验，直到门禁**零 blocker**；审核之后发生的任何改动都要 Δ 复核。

> 这套流程不是"多找个人看看"，而是把**验收标准机械化**（脚本）、把**判断权交给没写这份东西的人**、把**每次返工留痕**。没有机械化门禁的双盲，最后会退化成互相点赞。

---

## 何时使用

| 场景 | 适用度 |
|---|---|
| 题库/答案/考纲类内容（对错有唯一答案） | ★★★ 首选 |
| 数据抽取、表格重建、翻译、术语统一 | ★★★ |
| 单文件交付物（HTML 页面、报告、demo、PPT） | ★★★ |
| 代码迁移/重构（同规格两套实现再择优） | ★★☆ |
| 开放式创作（文案、设计） | ★★☆ 需要改写评分口径 |
| 一次性小改、纯机械任务 | ★☆☆ 降级为单生产者 + 单复核（见 §6） |

**不适用**：需要实时交互决策的任务、没有可验证判据的任务（如"做得好看点"）、成本远大于风险的任务。

---

## 一分钟总览

```
        ┌────────────────────────── P0 合同（1 人）──────────────────────────┐
        │  SPEC.md + gate.config.json + validate.mjs + 条目清单             │
        └───────────────┬───────────────────────────────────┬──────────────┘
                        │ 门禁 G0：校验器能对空输入报错        │
        ┌───────────────▼──────────────┐   ┌────────────────▼───────────────┐
        │ P1 生产者 A（盲）             │   │ P1 生产者 B（盲）              │
        │ 独立目录 / 不读对方 / 同 SPEC │   │ 独立目录 / 不读对方 / 同 SPEC  │
        └───────────────┬──────────────┘   └────────────────┬───────────────┘
                        │ 门禁 G1：两端各自 validate 全绿 + 隔离检查          │
        ┌───────────────▼───────────────────────────────────▼──────────────┐
        │ P2 复核员：**先**独立写基线 KEY（此期间不许看 A/B 产物）          │
        │ 门禁 G2：KEY 覆盖 100% 条目 + 源材料存疑项一节                    │
        └───────────────┬───────────────────────────────────────────────────┘
        ┌───────────────▼──────────────┐
        │ P3 交叉复核：A/B × KEY       │  门禁 G3：逐项有判决、0 个"未检查"、
        │ REVIEW.md + ERRATA.json      │          每个 blocker 带可执行修法
        └───────────────┬──────────────┘
        ┌───────────────▼──────────────┐
        │ P4 合并/修复（Lead）         │  门禁 G4：blocker 逐条关闭有证据、
        │ final/ + MERGE_NOTES.md      │          交付副本与构建产物字节一致
        └───────────────┬──────────────┘
        ┌───────────────▼──────────────┐
        │ P5 二审：复跑断言 + Δ 复核   │  门禁 G5：0 blocker；改动逐项验证
        │ FINAL_REVIEW.md              │          结论只有 通过/有条件通过/打回
        └──────────────────────────────┘
```

角色最小集：**1 个 Lead（合并+拍板）+ 2 个盲生产者 + 1 个复核员**。二审可由复核员的新一轮担任，也可另请第四人（大任务建议另请）。

---

## 角色与隔离规则（不可协商）

| 角色 | 能看 | 不能看 | 产物 |
|---|---|---|---|
| **Lead** | 全部 | — | 合同、门禁脚本、合并、`MERGE_NOTES.md`、`ROUNDS.md` |
| **生产者 A** | 源材料、合同 | `b/`、`audit/`、Lead 的答案草稿 | `a/` 全套 |
| **生产者 B** | 源材料、合同 | `a/`、`audit/`、Lead 的答案草稿 | `b/` 全套 |
| **复核员** | 源材料、合同、A、B | — （写 KEY 阶段：不许看 A/B） | `audit/KEY.md`、`audit/REVIEW.md`、`audit/FINAL_REVIEW.md` |

四条硬规则：

1. **盲 = 目录隔离 + 互不引用**。两个生产者的提示词必须**逐字相同**（只换目录名与任务 id），否则差异来自提示词而不是作者。
2. **复核员先建标尺后看货**：写 KEY 期间一旦看了 A/B，标尺就被污染，G2 失效。用时间戳或"先提交 KEY 再开放目录"流程保证。
3. **Lead 不得替生产者写答案**。Lead 只写合同与门禁；答案来自源材料与两位作者。
4. **提出问题的角色负责验证关闭**。修完由发现方复验，不采信"已修复"的口头声明。

> 提示词模板见 [references/prompts.md](references/prompts.md)。

---

## 阶段详解

### P0 合同（Lead）

产出四件，缺一不可：

| 文件 | 作用 | 要点 |
|---|---|---|
| `contract/SPEC.md` | 唯一施工依据 | 交付物清单、数据结构、内容规范、功能验收、禁则、条目清单（id 必须逐字可对） |
| `contract/gate.config.json` | 门禁参数 | 必需文件、条目 id 全集、自包含规则、字节一致性目标 |
| `contract/validate.mjs` | 项目专属校验器 | 先写校验器，再开工 |
| `contract/KEY_SPEC.md` | 基线格式 | 复核员的 KEY 必须长成什么样（字段级） |

**门禁 G0**
- [ ] `validate.mjs` 对**空目录**跑一次会报错（证明它在检查，不是永远绿）
- [ ] 每条验收项可判真假（"覆盖 34 条"可以；"质量高"不行）
- [ ] 条目 id 全集落盘，且与源材料条目一一对应
- [ ] 禁则明确：不许外链/不许改源材料/不许读对方目录

模板：[templates/SPEC.template.md](templates/SPEC.template.md)

### P1 双盲生产（A / B）

两个子智能体，同一合同，各自在 `a/`、`b/` 内独立完成**可交付的完整版本**（不是半成品、不是局部）。

交付要求（写进提示词）：
- 各自的 `NOTES.md`：跑了哪些命令、通过什么、**主动列出自己已知的不足 ≥1 条**
- 各自的构建脚本可一键重跑（`build.mjs` / `make` / 你项目里的等价物）
- 产物必须能通过 `validate.mjs`

> 真实经验：**主动要求作者自陈不足**，回报率极高。本次任务里"所有选择题正确项都在 A"就是生产者自己在 NOTES 里交代的——它比任何抽查都早暴露了这个系统性缺陷。

**门禁 G1**
- [ ] A `validate` 0 error；B `validate` 0 error（两份输出贴进 `ROUNDS.md`）
- [ ] 条目数与合同一致，两端都**完整**
- [ ] `node scripts/blindness.mjs <work>` 通过（产物无对方路径引用、无对方独有措辞）
- [ ] 两份 NOTES.md 都含自检证据 + 已知不足

**不过门禁就不许叫复核员看。** 半成品进审 = 浪费复核预算。

### P2 独立基线（复核员）

复核员**只读源材料与合同**，逐条独立推导，写 `audit/KEY.md`：

- 每条：id、核心条件（数字）、关键中间量、最终结论、≥2 条易错点
- 单独的「源材料存疑项」一节（哪怕写"无"）——这是最容易被漏掉的产出
- 关键数值要**脚本复算**，不要只靠心算（本次复核员用离散事件模拟复算了调度题，才发现参考答案里两处表述含混）

**门禁 G2**
- [ ] KEY 覆盖 100% 条目（脚本统计覆盖数）
- [ ] 每条含"关键中间量"而不只是最终答案（否则无法判"过程对答案错"）
- [ ] 有「源材料存疑项」一节
- [ ] 有独立性的自证（时间戳 / 提交顺序 / 未读声明）

### P3 交叉复核（复核员）

对 **A × KEY、B × KEY** 逐条判：

```json
// audit/ERRATA.json（推荐，机器可读，便于合并时逐条销账）
[{ "id": "vm2-9", "side": "B", "severity": "major",
   "field": "asks[1].opts[0]",
   "problem": "把物理 64/65 归到 PFN 5，实际 64//16 = 4",
   "evidence": "A 同题写 PFN 4",
   "fix": "PFN 5 → PFN 4" }]
```

`REVIEW.md` 必须包含：
1. **评分卡**（先定口径再打分，别用"感觉"）
2. **blocker / major / minor** 三级清单，每条 `{id, 侧, 问题, 证据, 修法}`
3. **逐项取谁**表：34 行 = 34 条 id，每行"A / B / 合并"，可机械执行
4. **骨架结论**：UI/结构/模板用哪一套，附理由
5. **源材料存疑项的处理**：A/B 是"复述了含混答案"还是"答错了"——两者严重度差一级

**门禁 G3**
- [ ] 每个 id × 每侧都有判决，**没有"未检查"**
- [ ] 每个 blocker 有可执行修法（不是"建议改进"）
- [ ] 有逐项取谁表，且覆盖 100% 条目
- [ ] 有骨架结论

### P4 合并与修复（Lead）

- 按取谁表机械合并；每处偏离取谁表都要在 `MERGE_NOTES.md` 写理由
- 逐条关闭 blocker，**每条附关闭证据**（diff 片段 / 断言输出 / 截图）
- 交付副本与构建产物做 **sha256 字节一致**校验（防止"改的是 final/，交的是旧副本"）

**门禁 G4**
- [ ] 每条 blocker 有关闭证据（表格：编号｜修法｜证据）
- [ ] `validate` 0 error
- [ ] `sha256(final/index.html) == sha256(交付副本)`
- [ ] `MERGE_NOTES.md` 记录取用决策与偏离理由

### P5 二审（第二人或复核员新轮）

二审**不是复述一审**，是**复跑断言**：

1. 对照 G3/G4 的每条 blocker，**重新执行验证**（脚本、点击、比对），不接受"报告说已修"
2. 对审核后发生的每处改动做 **Δ 复核**：列出改动清单 → 逐项断言
3. 结论只能是：**通过 / 有条件通过（列出非阻塞项）/ 打回（有 blocker）**

**门禁 G5**
- [ ] 每条 blocker 的关闭被独立复现
- [ ] Δ 复核覆盖审核后的**全部**改动（用 sha256 与上一版对比找出差异面）
- [ ] 0 blocker；有 major 必须写明"是否可发布"
- [ ] 结论三选一，不许写"基本没问题"

模板：[templates/FINAL_REVIEW.template.md](templates/FINAL_REVIEW.template.md)

---

## 返工循环（本流程的灵魂）

```
门禁红 → 回到该阶段 → 修复 → **复跑整个门禁** → 记录一轮 → 仍红则继续
```

五条细则：

1. **硬门禁**：G0 红不进 P1，G1 红不叫复核，G3 红不合并，G4 红不二审。禁止"边审边改边发布"。
2. **提出方复验**：谁提出的问题谁验证关闭；Lead 不能自证。
3. **整门禁复跑**：修完不是只跑失败项——修复常常引入新问题（本次"改选项顺序"就带出了"解析里字母指代错位"，再由"字母"带出"第 N 项序号指代错位"）。
4. **每轮留痕**：`ROUNDS.md` 追加一行：
   `R{n} | 门禁 Gx | 提出者 | 问题 id 列表 | 修复摘要 | 复验者 | 结论(绿/红) | 时间`
5. **审核后改动 → Δ 复核**：哪怕只改一个文案，也要走一轮 Δ（可轻量），否则"二审通过"这句话是假的——它验的不是最终字节。

> 判断"能不能发布"的唯一标准：**当前字节 ≡ 最后一轮通过二审的字节**。不一致就重审。

---

## 机械化门禁：让脚本抓，别让人眼盯

人工复审的漏检率远高于预期。把可判真假的东西全部脚本化。以下是本次实战中被证明有效的检测器清单，按缺陷类型分类：

| 缺陷类型 | 机械检测 | 本次实例 |
|---|---|---|
| **选项位置偏置** | 统计正确项下标分布；单一位置占比 >60% 报警 | 两套所有选择题正确项 100% 在下标 0 |
| **真值偏斜** | 判断题 true/false 比例；偏离 1:1 超过 3:1 报警 | 4:24（一律答"错"可得 86%） |
| **引用漂移** | 重排/重编号后，解析里的"选项 X""第 N 项"是否仍指向同一内容 | 30 处字母指代 + 12 处序号指代 |
| **计数不一致** | 占位符 `____` 数 ≡ 答案数组长度 | 填空题空位与答案数对齐 |
| **自包含性** | 扫 `src=http`、`<link href>`、`fetch(`、`@import` | 单文件交付 |
| **副本一致性** | `sha256(构建产物) vs sha256(交付副本)` | 防止交旧版 |
| **状态污染** | 多产物共享同一存储键（如 `file://` 的 localStorage） | A/B 互相看得到对方进度 |
| **隔离性** | 扫产物是否出现对方目录名/对方独有措辞 | 双盲有效性 |
| **结构完整性** | id 全集覆盖、必填字段、表格列数、枚举值 | 合同 schema |

脚本：[scripts/gate.mjs](scripts/gate.mjs)（配置驱动）、[scripts/blindness.mjs](scripts/blindness.mjs)、[scripts/manifest.mjs](scripts/manifest.mjs)。

配置样例见 [examples/gate.config.json](examples/gate.config.json)。

---

## 规模与成本

| 任务规模 | 姿态 | 说明 |
|---|---|---|
| ≤ 30 分钟、单一小产物 | 单生产者 + 单复核 | 跳过 P1 双盲，保留 G3/G5 |
| 1–4 小时、中等产物（本次：34 题 5 讲单页） | **默认：2 盲 + 1 复核 + 1 合并 + Δ 二审** | 复核成本 ≈ 生产 40–60% |
| > 4 小时 / 多模块 | 分片双盲（每片 2 生产者）+ 1 复核 + 1 二审 | 片间用同一合同，合并前先做跨片一致性检查 |
| > 8 小时 / 高风险 | 3 生产者取二 + 独立二审 | 成本高，仅用于不可回滚的交付 |

**别把流程用在错的地方**：如果任务没有可判真假的验收项，先回去把验收项写出来，再谈双盲。

---

## 反模式（都是真实的）

1. **让两个生产者互相参考** → 差异消失，双盲退化为复述。
2. **复核员先看产物再写 KEY** → 标尺被污染，报告变成"给两套都打分"而不是"对不对"。
3. **门禁靠人读报告判断** → 必然放过系统性问题（所有人都盯着细节，没人统计分布）。
4. **修完只验修的那一处** → 修复引入的回归无人发现。
5. **"基本没问题"式结论** → 没有可执行的放行判据。
6. **只看内容不看副本** → 交付的是旧字节。
7. **把"复核通过"当终点** → 通过的是那一版字节，之后任何改动都要 Δ。

更多失败模式（含触发条件与对策）见 [references/failure-modes.md](references/failure-modes.md)。

---

## 交付清单（Definition of Done）

```
<work>/
├── contract/{SPEC.md, gate.config.json, validate.mjs, KEY_SPEC.md}
├── a/{交付物..., NOTES.md}
├── b/{交付物..., NOTES.md}
├── audit/{KEY.md, REVIEW.md, ERRATA.json, FINAL_REVIEW.md}
├── final/{交付物..., MERGE_NOTES.md}
├── ROUNDS.md              # 只追加，每轮一行
└── MANIFEST.sha256        # 最终哈希清单
```

发布判据（全部满足）：

- [ ] G0–G5 全部为绿，且 `ROUNDS.md` 可完整复盘
- [ ] 二审结论为"通过"，且二审对象 == 当前交付字节
- [ ] `MANIFEST.sha256` 与交付文件一致
- [ ] 已知非阻塞项已在 `FINAL_REVIEW.md` 列出
- [ ] 源材料未被修改（`git status` / 哈希对照）

---

## 快速启动

```bash
# 1. 建工作区
mkdir -p work/{contract,a,b,audit,final}

# 2. 写合同（照 templates/SPEC.template.md），写校验器，然后空跑确认它会报错
node work/contract/validate.mjs work          # 预期：FAIL（证明检查有效）

# 3. 起两个盲生产者（提示词见 references/prompts.md，两份逐字相同，只换目录）
#    → 各自通过 validate 后回来

# 4. 门禁 G1
node scripts/blindness.mjs work

# 5. 复核员写 KEY（此时不给它看 a/ b/），再交叉复核

# 6. 合并 → G4 → 二审 → G5
node scripts/gate.mjs work          # 全部绿再发
node scripts/manifest.mjs work      # 出哈希清单
```

---

## 文件索引

| 想看什么 | 去这里 |
|---|---|
| 角色边界与提示词 | [references/roles.md](references/roles.md) · [references/prompts.md](references/prompts.md) |
| 门禁逐条清单 | [references/gate-checklist.md](references/gate-checklist.md) |
| 目录/命名/轮次规范 | [references/artifact-layout.md](references/artifact-layout.md) |
| 评分卡与严重度定义 | [references/rubric.md](references/rubric.md) |
| 失败模式库 | [references/failure-modes.md](references/failure-modes.md) |
| 合同模板 | [templates/SPEC.template.md](templates/SPEC.template.md) |
| 复核报告模板 | [templates/REVIEW.template.md](templates/REVIEW.template.md) |
| 二审报告模板 | [templates/FINAL_REVIEW.template.md](templates/FINAL_REVIEW.template.md) |
| 门禁脚本 | [scripts/gate.mjs](scripts/gate.mjs) · [scripts/blindness.mjs](scripts/blindness.mjs) · [scripts/manifest.mjs](scripts/manifest.mjs) |
