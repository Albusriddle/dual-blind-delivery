# 目录 / 命名 / 轮次规范

## 1. 工作区布局

```
<work>/
├── contract/
│   ├── SPEC.md            # 合同（唯一施工依据）
│   ├── gate.config.json   # 门禁脚本的配置（可选但推荐）
│   ├── validate.mjs       # 项目专属校验器（Lead 写）
│   └── KEY_SPEC.md        # 复核员基线的字段规范
├── a/                     # 生产者 A（盲区 1）
│   ├── <deliverables>
│   ├── build.mjs          # 可一键重产出
│   ├── NOTES.md           # 自检证据 + 已知不足
│   └── _parts/            # 中间产物，允许存在，不必清理
├── b/                     # 生产者 B（盲区 2），同上
├── audit/
│   ├── KEY.md             # 独立基线（写它时不许看 a/ b/）
│   ├── REVIEW.md          # 交叉复核
│   ├── ERRATA.json        # 机读问题清单
│   └── FINAL_REVIEW.md    # 二审（含 Δ 复核）
├── final/
│   ├── <deliverables>
│   ├── data.json          # 中间数据（若适用）
│   ├── build.mjs
│   └── MERGE_NOTES.md     # 取谁、修了什么、哈希
├── _versions/R{n}/        # 每轮通过门禁的版本归档（Δ 复核依据）
├── _sealed/               # 写 KEY 期间把 a/ b/ 移到这里
├── ROUNDS.md              # 只追加：每轮门禁记录
└── MANIFEST.sha256        # 交付物哈希清单
```

**为什么 `a/` `b/` 是两个顶层目录**：目录即隔离。用同一目录的 `a/`、`b/` 子目录也可以，但要有脚本能证明没有交叉引用（见 `scripts/blindness.mjs`）。

---

## 2. 命名约定

| 对象 | 约定 | 例 |
|---|---|---|
| 条目 id | `<组>-<序号>`，全小写，稳定不复用 | `cpu2-5`、`vm3-7` |
| 问题编号 | `B1`/`M1`/`m1`（blocker/major/minor） | `B3`、`M4` |
| 轮次 | `R1..Rn` | `R2` |
| 门禁 | `G0..G5` | `G4` |
| 交付副本 | `<中文名>.html` 放用户目录 | `操作系统_…_交互刷题.html` |
| 备份/预览 | 一律放 `_lead/preview/`，不进交付 | — |

**id 稳定性**：一旦发给生产者就不能改。改了 = 合同变更 = 双方返工。

---

## 3. 轮次记录（ROUNDS.md）

只追加，不修改历史行。表头一次写死：

```markdown
# 交接与门禁记录

| 轮次 | 门禁 | 提出者 | 问题 id | 修复摘要 | 复验者 | 结论 | 时间(UTC+8) |
|---|---|---|---|---|---|---|---|
| R1 | G1 | lead | - | A/B 首次交付，两端 validate 0 error | lead | 绿 | 2026-11-18T15:14 |
| R2 | G3 | reviewer | B1,B2,B3 | 选项重排/judge 改写/字母重映射 | reviewer | 绿 | 2026-11-18T16:34 |
```

- **结论只能是"绿"或"红"**；红的时候必须写下一步动作
- 每轮必须有**复验者**，且复验者 ≠ 修改者
- 时间用绝对时间 + 时区（相对时间在跨会话时无意义）

---

## 4. 哈希清单（MANIFEST.sha256）

```bash
node scripts/manifest.mjs <work>          # 生成
sha256sum -c MANIFEST.sha256              # 校验（Git Bash 可用）
```

内容形如：

```
<sha256>  final/index.html
<sha256>  final/data.json
<sha256>  <交付副本绝对路径映射记录>
```

**交付副本也要进清单**——这是"审的是不是这一版"的唯一硬证据。

`--extra` 传入的路径按 <work> 相对记录（在 work 之外会记成 `../xxx`）：

```bash
node scripts/manifest.mjs work --extra "D:/交付/成品.html"
node scripts/manifest.mjs work --check          # 缺失/变更/**新增**都算失败
node scripts/manifest.mjs work --diff _versions/R2/MANIFEST.sha256   # Δ 复核用
```

---

## 5. 交付副本的落地

| 步骤 | 命令 | 校验 |
|---|---|---|
| 构建 | `node final/build.mjs` | `validate` 0 error |
| 复制 | `cp final/index.html "<用户目录>/<中文名>.html"` | — |
| 一致性 | `sha256sum` 两个文件 | 必须相同 |
| 路径写法 | `gate.config.json` 里 `byteIdentical.right` 默认**相对配置文件目录**解析（`"base": "config"`），写 `"base": "work"` 才相对工作区 | 二者差一层目录，写错必红 |
| 记录 | 两个哈希写进 `MERGE_NOTES.md` | — |

> 实战教训：曾经出现"改了 `final/` 但交付副本还是上一版"，只靠人眼完全看不出来。字节校验是唯一可靠手段。

---

## 6. 版本归档与 Δ 复核

每轮 G4 绿后立刻归档，否则"上一轮通过的是哪一版"就无从谈起：

```bash
mkdir -p _versions/R2 && cp -r final/* _versions/R2/
cp MANIFEST.sha256 _versions/R2/
```

Δ 范围 = `manifest.mjs <work> --diff _versions/R<n>/MANIFEST.sha256` 的 added/removed/changed。

## 7. 隔离的工程手段

```bash
# G1 绿、叫复核员之前
mkdir -p _sealed && mv a b _sealed/
stat -c '%n %y' _sealed/a _sealed/b > _sealed/SEALED.mtime
# KEY 落盘并记录哈希后
mv _sealed/a _sealed/b .
sha256sum _sealed/SEALED.mtime >> ROUNDS.md
```

做不到移目录时：给复核员的提示词里不出现 `a/`、`b/` 的路径，等 KEY 提交后再开放。

## 8. 临时文件与清理

- 允许保留：`_parts/`、`_test/`、`_lead/preview/`
- 必须在发布前删除：任何会**修改用户数据**的调试页（例如清空 localStorage 的 `clear.html`）
- 禁止：把 token、密钥、浏览器 cookie 写进工作区
