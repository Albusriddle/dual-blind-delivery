# dual-blind-delivery

**双盲产出 · 独立复核 · 二审定稿**——一套带硬门禁和返工追溯的交付流程，打包成可复用的 agent skill。

> 三句话：同一份合同两个人独立做；第三个人先立标尺再判对错；门禁不绿不许前进，审核之后的任何改动都要 Δ 复核。

---

## 它解决什么问题

一个人写完就交，最大的风险不是"不够努力"，而是**作者盲区**：他注意不到自己反复犯的同一个系统性问题。
"多找个人看看"也不够——没有判据的复核会退化成互相点赞。

这套流程把三件事制度化：

1. **双盲** → 差异变成信号。两套独立实现之间的差别，暴露的是各自的盲区，而不是审美偏好。
2. **独立基线** → 判据先于判断。复核员在看产物之前，先从源材料独立写出"标准答案"。
3. **硬门禁 + 返工** → 质量可判定。每个阶段有可脚本化的放行条件；红灯就回炉，绿灯才前进；审核后改动必须 Δ 复核。

---

## 30 秒理解流程

```
P0 合同 ──G0──▶ P1 盲产 A ┃ 盲产 B ──G1──▶ P2 独立基线 ──G2──▶
P3 交叉复核 ──G3──▶ P4 合并修复 ──G4──▶ P5 二审(复跑+Δ) ──G5──▶ 发布
```

- 角色：1 Lead + 2 盲生产者 + 1 复核员（+ 可选二审人）
- 发布判据：G0–G5 全绿，且**二审对象 == 当前交付字节**

---

## 安装

### 作为 DSH skill

```bash
git clone https://github.com/Albusriddle/dual-blind-delivery.git \
  ~/.dsh/skills/dual-blind-delivery
```

```powershell
# Windows PowerShell
git clone https://github.com/Albusriddle/dual-blind-delivery.git "$env:USERPROFILE\.dsh\skills\dual-blind-delivery"
```

（Windows: `%USERPROFILE%\.dsh\skills\dual-blind-delivery`）

重启会话后，skill 会出现在可用列表里；说「双盲产出」「第三人复核」「两套独立做再比对」即可触发。

### 作为纯文档使用

不装也行，直接读 `SKILL.md` + `references/`。

---

## 快速上手

```bash
SKILL=/path/to/dual-blind-delivery
mkdir -p work/{contract,a,b,audit,final}
cp $SKILL/templates/SPEC.template.md      work/contract/SPEC.md
cp $SKILL/templates/KEY_SPEC.template.md  work/contract/KEY_SPEC.md
cp $SKILL/templates/validate.template.mjs work/contract/validate.mjs
cp $SKILL/examples/gate.config.json       work/contract/gate.config.json

node $SKILL/tests/run.mjs                       # 先确认门禁本身有效：22 passed
node work/contract/validate.mjs $(mktemp -d)    # 空跑必须报错
node $SKILL/scripts/gate.mjs work --stage G1    # 逐阶段放行
node $SKILL/scripts/blindness.mjs work          # 双盲隔离
node $SKILL/scripts/manifest.mjs work --extra "<交付副本>"   # 发布哈希
```

派工提示词直接用 `references/prompts.md` 里的模板（两个生产者的提示词**必须逐字相同**）。

---

## 仓库结构

```
SKILL.md                      # 主文件：何时用、角色、阶段、门禁、返工、反模式
README.md                     # 本文件
LICENSE
references/
  roles.md                    # 角色边界与隔离规则
  prompts.md                  # 可直接复制的四类提示词模板
  gate-checklist.md           # G0–G5 逐条勾选清单
  artifact-layout.md          # 目录/命名/轮次/哈希规范
  failure-modes.md            # 12 个真实失败模式 + 机械检测
  rubric.md                   # 评分卡与严重度定义
templates/
  SPEC.template.md            # 合同模板
  REVIEW.template.md          # 交叉复核报告模板
  FINAL_REVIEW.template.md    # 二审报告模板
scripts/
  gate.mjs                    # 配置驱动门禁（7 类检查）
  blindness.mjs               # 双盲隔离检查（交叉引用/独有措辞/相似度）
  manifest.mjs                # sha256 清单 + 校验
examples/
  gate.config.json            # 门禁配置样例（v2：stage / structure / validator）
  minimal-work/               # 能让三个脚本全绿的最小工作区（照抄的锚点）
tests/
  run.mjs                     # 22 个回归用例：每个"应该红"的场景都必须真的红
```

---

## 它能抓到什么（真实战绩）

这套流程诞生于一次真实交付：5 份课堂练习 PDF → 34 题交互刷题页，双盲两套、四轮复核。抓到的**全部**问题里，人眼最容易漏的是这些：

| 问题 | 数量 | 靠什么发现 |
|---|---|---|
| 所有选择题正确项都在第一个位置 | 73/73 | 统计下标分布 |
| 判断题 86% 为假，一律答"错"可白拿分 | 24/28 | 统计真值比例 |
| 解析用字母/序号指代选项，重排后全部指错 | 30 处 + 12 处 | 重排前后"所指文本"断言 |
| 一位作者把 PFN 4 写成 PFN 5 | 1 处 | 双盲对照 |
| 交付副本还是上一版字节 | 1 次 | sha256 比对 |
| 修复引入回归（只验失败项漏掉两层连带错误） | 3 轮 | 整门禁复跑 |

> 没有一个问题是通过"再读一遍稿子"发现的。

---

## 适用与不适用

**适用**：题库/答案/考纲、数据抽取、翻译、文档、单文件交付物、代码迁移。
**不适用**：需要实时交互决策的任务；没有可判真假验收项的任务；成本远大于风险的小改。

规模选择见 `SKILL.md` §「规模与成本」：小任务降级为"单生产者 + 单复核"，但保留 G3/G5。

---

## 设计原则

1. **判据先于判断**：先写校验器，再开工。
2. **门禁机械化**：能写成断言的不靠人看。
3. **提出方复验**：修没修好，由发现问题的人说了算。
4. **整门禁复跑**：修复会引入回归，只验失败项等于没验。
5. **字节可追溯**：发布 = 二审通过的那一版字节，一字不差（`_versions/` + `sha256`）。
6. **门禁可自证**：`tests/run.mjs` 构造 22 个对抗场景，证明校验器不是永远绿。
6. **返工留痕**：`ROUNDS.md` 让每一轮红绿灯都能复盘。

---

## License

MIT © Albus Riddle
