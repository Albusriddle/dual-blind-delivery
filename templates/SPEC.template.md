# 交付合同（SPEC）

> 本文件是唯一施工依据。两个生产者与复核员都以它为准。**不含任何答案内容。**

## 0. 背景与目标

- 交付物：{{DELIVERABLE}}（例如"单文件离线 HTML 刷题页"）
- 用户场景：{{USE_CASE}}
- 源材料：{{SOURCE_FILES}}（只读，不许修改）
- 规模：{{N_ITEMS}} 条 / {{N_PARTS}} 部分
- 非目标（明确不做的事）：{{NON_GOALS}}

## 1. 交付物清单

| 路径 | 说明 | 必需 |
|---|---|---|
| `{{DIR}}/{{MAIN_FILE}}` | 主交付物 | 是 |
| `{{DIR}}/{{DATA_FILE}}` | 中间数据（可复现） | 是 |
| `{{DIR}}/build.mjs` | 一键重产出 | 是 |
| `{{DIR}}/NOTES.md` | 自检证据 + 已知不足 | 是 |

硬性要求：
- {{SELF_CONTAINED_RULES}}（如：单文件、无外链、file:// 可用、无 fetch）
- 构建命令固定为 `{{BUILD_CMD}}`，重跑两次产物哈希必须相同
- 校验命令固定为 `node contract/validate.mjs <a|b|final>`，最后一行 `N error(s)`，有 error 退出 1
- 体积区间：{{SIZE_RANGE}}
- 运行环境：{{RUNTIME}}

## 2. 数据结构（schema）

```json
{{SCHEMA_EXAMPLE}}
```

字段规则：
- `id` 命名：{{ID_RULE}}；**全集见 §5，一字不许改**
- 必填字段：{{REQUIRED_FIELDS}}
- 枚举取值：{{ENUMS}}
- 文本格式：{{TEXT_FORMAT_RULES}}（Markdown-lite 支持哪些语法）

## 3. 内容规范

- 事实来源只能来自 §0 的源材料；**不许引入外部资料、不许编造**
- 题干必须保留全部条件：数字、单位、位数、配额、时间片、初始状态、忽略项、独立性声明
- 答案以源材料的参考解答为准；**若源材料有误，按你的正确推导写，并在 NOTES.md 记录**
- {{EXTRA_CONTENT_RULES}}（干扰项必须是真实易错点 / 填空必须穷举等价写法 / 表格列数对齐 …）

## 4. 功能验收

必须是**可判真假**的项：

- [ ] {{ACCEPT_1}}（如：34 条全部存在，id 逐字一致）
- [ ] {{ACCEPT_2}}（如：每条 ≥2 个小问，≥1 个可自动判分）
- [ ] {{ACCEPT_3}}（如：每条含 ≥1 个表格化推演步骤）
- [ ] {{ACCEPT_4}}（如：`node contract/validate.mjs <dir>` → 0 error）
- [ ] {{ACCEPT_5}}（如：刷新后进度恢复、360px 无横向滚动）

## 5. 条目清单（id 全集）

| id | 名称 | 源材料位置 |
|---|---|---|
| `{{ID_1}}` | {{TITLE_1}} | {{SRC_LOC_1}} |
| … | | |

> 共 {{N_ITEMS}} 条。数量与 id 都不许变。

## 6. 禁则

- 不许读另一生产者的目录（`{{OTHER_DIR}}`）
- 不许读 `audit/`（复核员基线）
- 不许修改 `contract/` 与源材料
- 不许引入外部依赖 / 不许 `npm install`
- 不许在交付物里留 `http(s)://` 引用
- 不许为了好看删条件、不许把参考答案原样贴进"解析"字段
- **不许在 `contract/validate.mjs` 里写答案/期望值**（生产者能读到 contract/，写了等于泄题）；
  统计性断言（正确项位置分布、真假比例）放 `audit/checks.mjs`，只给复核员

## 7. 自检义务

```bash
node contract/validate.mjs <你的目录>   # 必须 0 error
{{BUILD_CMD}}                          # 必须可重复产出同样结果（两次哈希一致）
node $SKILL/scripts/gate.mjs <work> --stage G1   # GATE PASS
```

`NOTES.md` 必须包含：
1. 上面两条命令的**实际输出**
2. 人工自测清单（逐项勾选）
3. **已知不足 ≥1 条**（不写视为未自检）
4. 你修正过的源材料问题

## 8. 变更流程

合同一旦下发，任何字段/条目变更都记入 `ROUNDS.md` 并通知两方；**变更 = 双方返工**，能不迁就不迁。
