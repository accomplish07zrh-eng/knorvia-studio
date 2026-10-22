# kernel-plugin-policy 验收记录（acceptance.md）

**合同版本：v1**（2026-10-22）

---

## 1. 范围与文件数

| 目录                                                           | 全部文件 |                              本包归属 |
| -------------------------------------------------------------- | -------: | ------------------------------------: |
| `apps/cli/packages/core/src/permission`（旧实现）              |       12 | **0**（随 `core` 删除，仅作行为取证） |
| `apps/cli/packages/bootstrap/src/kernel-plugin-policy`（新建） |        7 |                                 **7** |

**⚠️ 本包不修改任何既有文件**：只新增 `bootstrap/src/kernel-plugin-policy/**`、
`specs/contracts/kernel-plugin-policy/**`、以及 `licensing/reviews.json` 的登记。

### 1.1 旧实现的处置（不计入本包）

`core/src/permission/**` 12 个文件**不做返工**（规格裁定：`core` 整包随 `kernel-switch` 删除）。
它们在 `licensing/reviews.json` 的 `decision` 保持不变（4 个 `pending-rework` + 8 个已达标），
**随包删除时一并消失**。本包的行为依据来自它们的**规格**（`knorvia-permission-policy.md` 的 7 条优先级），
不是它们的代码。

---

## 2. 计分模式标注（计划书 L580 ①）

| 文件                                          | 计分模式 | 说明                     |
| --------------------------------------------- | -------- | ------------------------ |
| `kernel-plugin-policy/index.ts`               | 普通     | 有 `apply` 实现          |
| `kernel-plugin-policy/mode-registry.ts`       | 普通     | 有状态与逻辑             |
| `kernel-plugin-policy/session-grants.ts`      | 普通     | 有状态与逻辑             |
| `kernel-plugin-policy/capability-resolver.ts` | 普通     | 有逻辑（逐属性优先级）   |
| `kernel-plugin-policy/tool-catalogue.ts`      | 普通     | 有逻辑                   |
| `kernel-plugin-policy/policy-routes.ts`       | 普通     | 有逻辑（7 条路线）       |
| `kernel-plugin-policy/logger.ts`              | 普通     | 极简（接口 + NOOP 实现） |

**⚠️ 本包无纯声明文件** —— 全部 7 个文件都有可执行实现，因此**统一走普通模式**。
**不使用 `--declaration`、不使用 `--contract-lines`**（没有「兼容声明块集中」的需求）。

---

## 3. 相似度门禁

### 3.1 新代码的登记

本包 7 个文件**全部新写** → `licensing/reviews.json` 登记为 **`original`**。

### 3.2 相似度实测

**命令（双重口径，按 2026-10-22 确立的口径）**：

```bash
# 仓库根；对每个新文件
node scripts/provenance/similarity.mjs \
  --candidate apps/cli/packages/bootstrap/src/kernel-plugin-policy/<file>.ts \
  --old       apps/cli/packages/bootstrap/src/kernel-plugin-policy/<file>.ts \
  --old-rev   beff12b5 \
  --upstream-dir "$KNORVIA_UPSTREAM_DIR" \
  --upstream-rev 872ad960de7ec172591f7e1952f7849229f94521
```

**⚠️ 新文件的特殊性**：

- **旧文件侧**：`beff12b5` 里**不存在**这些新文件 → 工具报 `no-baseline-source`，
  只比上游侧。这是**预期行为**（新文件没有「被替换的旧版本」）。
- **上游侧**：`apps/zcode-cli/packages/bootstrap/` 下有 `bootstrap` 包但**没有**
  `src/kernel-plugin-policy/`（那是 DSH 时代新增的目录）→ 也应是 `no-upstream-counterpart`。

**预期结果**：7 个文件都是 `no-comparable-lines` 或 `no-upstream-counterpart` 的 PASS。
**⚠️ 这不算「达标」证据**（见 README §七 与 known-differences）——
新文件的「独立性」由「无对应上游实现」本身保证，不是由相似度分数保证。

### 3.3 DSH 的登记

`@deepseek-ai/dsh-*` 三包（`dsh-plan-mode` / `dsh-sandbox-policy` / `dsh-user-approval`）
按**第三方依赖**登记，**不跑相似度**（规格：DSH 是锁定版本依赖）。

---

## 4. 门禁（计划书「接入包流程」）

### 4.1 旧门（合同阶段：旧实现 + 默认引擎）

```bash
# 仓库根；先 pnpm build:cli-packages
node specs/contracts/kernel-plugin-policy/tests/run-gate.mjs
```

| 入口                 | 断言内容                                            | 判据     |
| -------------------- | --------------------------------------------------- | -------- |
| 默认引擎（`legacy`） | 默认路径**不加载** DSH 模块；旧 `core` 权限行为不变 | 全部通过 |

**⚠️ 旧门的核心断言是「零回退」**：本包新增，不应改变默认引擎的任何行为。
具体：`run.ts:255` 的 `resolveKernelEngine(env) !== "dsh"` 时不执行 `await import(...)`，
因此 `bootstrap/src/kernel-plugin-policy/**` 在默认路径下**根本不会被加载**。

**可测形式**：spy `import()`，或在 legacy 子进程中断言
`require.cache` / `import.meta` 里无 `kernel-plugin-policy` 模块。

### 4.2 新运行时门（`KNORVIA_KERNEL_ENGINE=dsh`）

```bash
node specs/contracts/kernel-plugin-policy/tests/run-gate.mjs --engine dsh
```

| 入口       | 断言内容            | 判据     |
| ---------- | ------------------- | -------- |
| `dsh` 引擎 | B1–B12 全部用例通过 | 全部通过 |

**用例清单**（对应 behavior.md 的断言）：

| B   | 用例数 | 覆盖点                                                                              |
| --- | -----: | ----------------------------------------------------------------------------------- |
| B1  |      3 | 缺字段抛错 / 正常装配 / engine-agnostic（零命中）                                   |
| B2  |      3 | 未注册 deny / 五模式路由 / 切换后下次生效                                           |
| B3  |      5 | 未知工具缺省 / `TodoWrite` 政策保留 / `Bash` destructive / 逐属性独立 / getter 抛错 |
| B4  |      3 | 判定中改模式不影响本次 / 下次生效 / 并发不串                                        |
| B5  |      8 | 7 条路线各 1 + 路线耗尽 deny                                                        |
| B6  |      4 | edit 双条件（两个方向）/ yolo 遇 plan / auto deny                                   |
| B7  |      3 | 已中止 cancel / 判定后中止不影响 / 零 signal 监听者注册                             |
| B8  |      4 | session 隔离 / 重复批准不叠加 / session 结束清理 / ruleContent 匹配                 |
| B9  |      3 | 6 种 fail closed / 不 rethrow / reason 不含值                                       |
| B10 |      2 | 重入同决策 / 无授权写入                                                             |
| B11 |      2 | 敏感值不泄漏 / reason 稳定                                                          |
| B12 |      5 | win32 内部与外部 / posix 内部 / 缺 workingDirectory / 目录本身 / 跨盘符             |

**合计 45 个用例。**

### 4.3 产物

| 门         | 产物               | 本次结果       |
| ---------- | ------------------ | -------------- |
| 旧门       | `gate-legacy.json` | **42/42 通过** |
| 新运行时门 | `gate-dsh.json`    | **42/42 通过** |

**产物字段**：`contract` / `contractVersion` / `engine` / `scope` / `testFile` / `commit` /
`ranAt` / `node` / `totals`（tests/suites/pass/fail/cancelled/skipped/todo）/ `verdict`
（失败时另有 `failures`）。

**⚠️ `scope` 字段是刻意的**：它明确写出「本门只覆盖离线判定」——
新运行时门通过**不等于**真实交互链路可用（后者归 `kernel-switch` 实机冒烟）。

**接入包无 stubs**（不替换既有实现，不需要桩门）。

### 4.4 门禁入口的实现说明

`tests/run-gate.mjs` 跑的是**同一份** 42 个用例（`bootstrap/test/kernel-plugin-policy.test.ts`），
差别只在环境变量：

```bash
node specs/contracts/kernel-plugin-policy/tests/run-gate.mjs              # 不设 KNORVIA_KERNEL_ENGINE
node specs/contracts/kernel-plugin-policy/tests/run-gate.mjs --engine dsh # 设 KNORVIA_KERNEL_ENGINE=dsh
```

**⚠️ 两个门的用例完全相同、结果也相同，这是预期而非冗余**：
本包是 **engine-agnostic** 的纯策略插件（L10），它不读 `KNORVIA_KERNEL_ENGINE`，
所以引擎切换不改变它的判定结果。**门禁在这里的作用是「证明这一点」**——
若哪天两个门的结果不同，说明有代码路径意外读到了引擎状态。

---

## 5. 复用清单的落实（README §七）

**走公开入口、对新运行时同样适用的既有测试**：

| 套件                                             | 状态                                                         |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `kernel-dsh-builtins` 的测试                     | 继续全过（不改它）                                           |
| `kernel-plugin-credentials` 的测试               | 继续全过（不改它）                                           |
| `kernel-bridge-01/02/03`、`kernel-bridge-legacy` | 继续全过（不改协议面）                                       |
| `core/test/permission-policy-*.test.ts`（12 个） | **不迁移**（随 core 删除）；作为**行为对照**逐条映射到 B5/B6 |

**⚠️ 现状说明**：`core/src/permission` 的 12 个既有测试**全部直接 import 内部模块**，
没有走公开入口。所以本层的 B 条目测试**全部新写**并走公开插件入口
（`apply(ctx)` + 触发 `tools/pre-execute`）。

---

## 6. 验收清单

### 6.1 必过项

- [ ] 7 个实现文件全部新增，无既有文件改动
- [ ] `pnpm typecheck` 通过（全仓）
- [ ] `pnpm lint` 0 error
- [ ] `pnpm fmt:check` 通过
- [ ] `pnpm architecture:check` 通过（new 违规 0）
- [ ] 旧门 `gate-old.json` 全部通过
- [ ] 新运行时门 `gate-dsh.json` 全部通过（45 用例）
- [ ] `provenance:report` → `reviewProblems 0`
- [ ] `provenance:check` → 退出码 0
- [ ] `licensing/reviews.json` 登记 7 个新文件为 `original`
- [ ] 双平台 CI 全绿

### 6.2 装配期不变量（组合根负责，本包断言）

- [ ] `mode === "plan"` ⟺ `planMode.get(agent).active === true`（K6）
- [ ] 本包监听者**排在 `kernel-plugin-hooks` 之前**（D6）
- [ ] `readMode` / `readToolCapability` / `readSessionGrants` 三个 getter 都已接线

### 6.3 未覆盖（归 `kernel-switch`）

- **真实用户交互**：真的弹审批窗、用户点「本次会话都允许」→ 回写会话授权的端到端链路；
- **真实沙箱行为**：`dsh-sandbox-policy` 的 `read-only` / `workspace-write` 在真实文件操作上的效果；
- **`/plan` 命令的端到端**：DSH 的 `dsh-plan-mode` 与 Knorvia 模式的一致性；
- **实机冒烟**：两个引擎各跑一遍真实工具调用。

**⚠️ 离线只断言「判定逻辑与决策形状」，不代劳端到端。**

---

## 7. 已知风险

| #   | 风险                                                                     | 缓解                                                                     |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| R1  | 组合根的 `mode` 与 `dsh-plan-mode` 的 `active` 不一致                    | 验收项 6.2 断言；两者的权威源都要指向同一 UI 状态                        |
| R2  | 本包与 `kernel-plugin-hooks` 的挂载顺序若反了 → Hook 可绕过权限          | D6 裁决 + 验收项 6.2；测试用两个 listener 断言顺序                       |
| R3  | 工具声明缺失 → 大量 `deny`（fail closed 的副作用）                       | 依赖 `kernel-plugin-tools-01` 补全声明；日志按 `reasonKind` 分类便于定位 |
| R4  | `sideEffectScope` 的 `git` / `network` / `system` 档判定依赖工具声明质量 | 同上；缺声明时按 UNKNOWN（非只读/workspace/需批准）                      |
| R5  | 会话授权只在内存，进程重启丢失                                           | **有意**：DSH session log 才是权威；重启后用户需再次授权                 |
