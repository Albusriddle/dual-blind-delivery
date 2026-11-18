# 门禁逐条清单

> 用法：每个门禁**全部勾上**才允许进入下一阶段。勾选处贴命令输出或文件路径，不要只写"已确认"。
>
> 命令约定：`SKILL=/path/to/dual-blind-delivery`，`WORK=你的工作区`。
> 逐阶段自检：`node $SKILL/scripts/gate.mjs $WORK --stage G1`（G2/G3/G4/G5 同理）。

---

## G0 合同门禁（Lead）

**目的**：证明"验收标准存在且真的在检查"。

- [ ] `contract/SPEC.md` 含五块：交付物清单 / 数据结构 / 内容规范 / 功能验收 / 禁则
- [ ] 条目清单：id 全集落盘，与源材料条目**一一对应**（数量对上、命名可对）
- [ ] `contract/gate.config.json` 的 `idsCoverage.expect` 与条目清单完全一致（注意不是顶层 `expect.ids`；写错键会被 gate 判为未知键并 warn）
- [ ] `contract/KEY_SPEC.md` 定义了复核员基线的最小字段
- [ ] **空跑证明**：校验器对空目录必须报错
      ```
      $ node contract/validate.mjs $(mktemp -d)
      FAIL 目标目录不存在 / 缺少文件 …
      1+ error(s)          # 退出码非 0
      ```
      gate 的 `projectValidator.emptyRun` 会自动重跑这一条，判定依据是退出码而不是你的复述。
- [ ] 校验器契约唯一：`node contract/validate.mjs <a|b|final>`，最后一行 `N error(s)`，有 error 退出 1
- [ ] 校验器**不含答案**（生产者能读到 contract/，写期望值等于泄题）
- [ ] 每条验收项可判真假（逐条自问："这条能写出断言吗？"）
- [ ] 禁则写了：不许外链 / 不许改源材料 / 不许读对方目录 / 不许引入新依赖

**红灯典型**：校验器永远返回 0；验收项写"质量高、可读性好"；条目清单只给数量不给 id；校验器里硬编码了正确答案。

---

## G1 双盲门禁（两生产者）

**目的**：两端都是**完整可交付**的成品，且确实互相没看过。

- [ ] A：`node contract/validate.mjs a` → `0 error`
- [ ] B：`node contract/validate.mjs b` → `0 error`
- [ ] `node $SKILL/scripts/gate.mjs $WORK --stage G1` → GATE PASS
- [ ] A/B 条目数与合同一致（不是"差不多"）
- [ ] A/B 各有 `NOTES.md`，含：构建命令、validate 输出、自测记录、**已知不足 ≥1 条**
- [ ] `node $SKILL/scripts/blindness.mjs <work>` → PASS
      - 产物中不含对方目录名
      - 不含对方独有措辞（抽 5 条对方高频短语做反向检索）
- [ ] id 覆盖用**词边界/精确模式**断言（`idsCoverage.idPattern`），不是子串包含
- [ ] 两侧构建均可一键重跑（`{{BUILD_CMD}}`），重跑后产物哈希不变
- [ ] 源材料与 `contract/` 的哈希未变（生产者没偷改）

**红灯典型**：一方只交了一半；一方把 `validate` 的 error 当成"已知问题"；两侧产物字符串高度雷同（说明共享了草稿）。

---

## G2 基线门禁（复核员）

**目的**：标尺先立好，且没被产出污染。

- [ ] `audit/KEY.md` 覆盖 100% 条目：`node $SKILL/scripts/gate.mjs $WORK --stage G2`（`structure.coverIdsFrom` 逐 id 断言）
- [ ] 每条含：id、核心条件（数字级）、关键中间量、最终结论、≥2 条易错点
- [ ] 有「源材料存疑项」一节（无则写"无"）
- [ ] 关键数值经过脚本/工具复算（不是纯手推）
- [ ] 独立性自证（三选一，写在文件开头）：时间戳 / 提交顺序 / 声明 + 抽查
- [ ] KEY 的格式与 `contract/KEY_SPEC.md` 一致，且 `structure` 的行数/字段断言通过

**红灯典型**：KEY 只有最终答案没有中间量（无法判"过程错但答案对"）；KEY 里出现 A 的原创措辞（污染证据）。

---

## G3 交叉复核门禁（复核员）

**目的**：把"哪套哪里对/错/该取谁"变成可执行指令。

- [ ] 逐项表：`条目数 × 2 侧` 每格都有判决（通过 / 不通过 + 证据）
- [ ] **没有"未检查""待定""看起来可以"**
- [ ] 问题分级齐全：blocker / major / minor，每条含 `{id, 侧, 问题, 证据, 修法}`
- [ ] blocker 的修法是**可执行动作**（"把 PFN 5 改成 4"），不是"建议核实"
- [ ] **逐项取谁表**覆盖 100% 条目，每行 A / B / 合并 + 一句话理由
- [ ] 骨架结论（终版用哪套 UI/结构）+ 理由
- [ ] 源材料存疑项逐条给出"A/B 是复述还是答错"的判定
- [ ] 逐项表能被脚本数出来：`structure.rowPattern` 命中行数 ≥ 条目数
- [ ] 有 `ERRATA.json`（推荐）或等价可机读清单

**红灯典型**：报告只有"整体不错，个别地方可以更好"；逐项表只覆盖抽样；blocker 与 major 混用（严重度失锚）。

---

## G4 合并门禁（Lead）

**目的**：终版字节与"关闭了全部 blocker 的那一版"是同一份。

- [ ] 每条 blocker 一行：`编号 | 修法 | 关闭证据`
- [ ] 关闭证据是**可复核的事实**（diff 片段、断言输出、截图路径），不是"已改"
- [ ] 偏离逐项取谁表的每一处都有理由
- [ ] 终版 `validate` → 0 error（gate 会执行 `node contract/validate.mjs final` 并检查退出码）
- [ ] `sha256(构建产物) == sha256(交付副本)`
- [ ] `MANIFEST.sha256` 生成，覆盖全部交付文件
- [ ] `MERGE_NOTES.md` 含：取谁统计（A x 条 / B y 条）、骨架选择、修复清单、哈希
- [ ] 归档本轮：`cp -r final/* _versions/R{n}/` 且 `cp MANIFEST.sha256 _versions/R{n}/`

**红灯典型**：改完重新构建但忘了更新交付副本；`MERGE_NOTES` 只写"完成合并"。

---

## G5 二审门禁（第二人）

**目的**：证明"当前交付字节"通过复核，而不是"某一版通过复核"。

- [ ] 每条 blocker 的关闭被**独立复现**（写"复现步骤 → 输出 → 结论"）
- [ ] Δ 复核覆盖审核后**全部**改动：`node $SKILL/scripts/manifest.mjs $WORK --diff _versions/R{n}/MANIFEST.sha256`，逐项断言 added/removed/changed
- [ ] 0 blocker
- [ ] 若有 major：明确写"是否可发布"及理由
- [ ] 结论三选一，无第四条路
- [ ] 报告开头写明**被复核对象的哈希**（否则无法证明审的是这一版）

**红灯典型**：结论写"整体通过，建议后续优化"；未写被审对象的哈希；Δ 只覆盖"我记得改了的地方"。

---

## 附：每轮 `ROUNDS.md` 行格式

```
| R3 | G3 | reviewer | vm2-9/PFN, vm3-5/judge 偏斜 | 改 PFN4、改写 8 条 judge | reviewer | 绿 | 2026-11-18T16:34+08 |
```

字段：轮次 | 门禁 | 提出者 | 问题 id | 修复摘要 | 复验者 | 结论 | 时间

**"绿"只由提出方或二审人填写。** Lead 不能给自己的改动判绿。
