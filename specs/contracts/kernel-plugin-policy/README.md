# kernel-plugin-policy 合同（五种权限模式插件）

**合同版本：v1**（2026-10-22）

本目录是 M2 接入包 `kernel-plugin-policy` 的合同。它冻结三件事：**Knorvia 五种协作模式 →
DSH 权限管线的映射**、**7 条路线的判定顺序（安全语义）**、**会话授权与模式快照的时序约束**。

- 分支：`contract/kernel-plugin-policy`（基线 `origin/main` `ac151e0a`，含
  `kernel-dsh-builtins` #228、`kernel-bridge-01` #218、`kernel-bridge-02` #236、
  `kernel-bridge-03` #249、`kernel-bridge-legacy` #230、`kernel-plugin-credentials` #254）
- 认领 issue：**#286**
- 前置合同：[`kernel-dsh-builtins`](../kernel-dsh-builtins/README.md) v1（组合与工具管线）、
  [`kernel-plugin-credentials`](../kernel-plugin-credentials/README.md) v1（同形态的接入包模板）
- 依据：`specs/knorvia-builtin-kernel-dsh.md`（能力映射「权限模式 plan/build/edit/yolo/auto」行）、
  `specs/knorvia-internal-plugins.md` 内核层、计划书「内核方案调整」「接入包流程」
- 行为依据（**权威**）：`specs/knorvia-permission-policy.md` 的「必须保留的优先级」7 条 +
  `specs/knorvia-permission-grants.md`、`specs/knorvia-permission-rule-matching.md`、
  `specs/knorvia-project-permission-atomicity.md`、`specs/knorvia-tool-permission-flow.md`
- 事实来源：`@deepseek-ai/dsh@0.2.0-rc.2` 的**公开类型与 README**（`dsh-tools`、
  `dsh-plan-mode`、`dsh-sandbox-policy`、`dsh-user-approval`、`dsh-agent`）、
  旧实现（`apps/cli/packages/core/src/permission/**`，**仅作行为取证**）。
  **不读 DSH 源码仓库、不改 DSH。**

---

## 一、范围

### 1. 本包做什么

1. **模式注册表**：维护 `sessionId → CollaborationMode`（`plan` / `build` / `edit` / `yolo` / `auto`）。
   DSH 只提供「是否 plan」布尔，**没有五种模式概念**，因此本包必须自己持有该状态（§二 a）。
2. **权限判定插件**：挂载 `tools/pre-execute` 瀑布，把**7 条路线的判定顺序**翻译成
   `PreToolDecision`（`allow` / `deny` / `ask` / `cancel`）。顺序本身是安全语义（§三 L1）。
3. **会话授权**：维护 `sessionId → 已授权规则集`，对应 Knorvia 的 `grantSessionPermission`。
   DSH 的 approval 是**一次性**的（§二 c），所以跨请求的会话授权由本包持有。
4. **能力解析**：把「工具名 + 工具声明 + 会话事实」解析成判定所需的字段
   （`readOnly` / `destructive` / `sideEffectScope` / `riskLevel` / `needsApproval` /
   `requiresUserInteraction` / `alwaysAsk` / `allowedInPlanMode` / `allowSessionApproval`）。
5. **模式快照**：在 `tools/pre-execute` 入口处一次性捕获本次执行要用的模式，
   之后所有判定只用该快照（§三 L2）。
6. 合同测试全部走**公开插件入口**（装配 `ctx` + 触发 `tools/pre-execute`），
   同一套用例在可离线的范围内断言判定结果与顺序。

### 2. 本包不做什么

| 不做的事                                                                    | 归属                                    | 依据                                                     |
| --------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------- |
| 处理用户 Hook 脚本（PreToolUse 等）                                         | `kernel-plugin-hooks`（exec-cli）       | issue #286 协调：**policy 先判，hooks 后判**             |
| 改 `core/src/permission/**`（旧实现）                                       | 随 `kernel-switch` 删除                 | 规格「现有包的去向」：`core` 整包删除                    |
| 改 `core/src/hooks/workspace-hook-*`（Hook 信任策略）                       | `kernel-plugin-hooks`                   | 规格：**工作区 Hook 信任存储随 Knorvia Hook 插件保留**   |
| 改 `adapters/src/storage/workspace-hook-trust-*`（信任存储）                | 保留（不删）                            | 同上                                                     |
| 改 DSH 三包（`dsh-plan-mode` / `dsh-sandbox-policy` / `dsh-user-approval`） | —                                       | 规格「不做」：不 fork / 不 vendor / 不改 DSH 源码        |
| 改 `bootstrap/src/kernel/**`（组合行、引擎分流）                            | `kernel-dsh-builtins` / `kernel-switch` | 冻结面                                                   |
| 改 `bootstrap/src/kernel-bridge/**`                                         | `kernel-bridge-01/02/03`                | 冻结面                                                   |
| 引擎选择（`KNORVIA_KERNEL_ENGINE` 判断）                                    | `cli/src/run.ts:255` 进程入口           | 见 §二 f：**分流在进程级入口，插件保持 engine-agnostic** |
| v4 协议字段、旧协议方法、`KNORVIA_*` 变量、数据目录                         | 冻结面                                  | 计划书选择 8                                             |
| 计划模式的提示词与 `/plan` 命令                                             | `dsh-plan-mode`                         | 只消费其 `active` 事实，不改其行为                       |

### 3. 与 `kernel-plugin-hooks` 的挂载顺序（已协调）

两个包都挂 `tools/pre-execute`。**顺序即优先级**，约定：

```text
第一个监听者：kernel-plugin-policy   （产品级硬约束：五种模式 + 项目规则 + 会话授权）
第二个监听者：kernel-plugin-hooks    （用户自定义 Hook 脚本扩展）
```

**本包必须在第一位**：Hook 脚本不得绕过产品级权限判定；且本包返回 `deny` 时直接短路，
Hook 不会看到该调用。**本包不实现、不调用任何 Hook 脚本管理能力。**

---

## 二、现状与缺口（实测）

### 1. DSH 侧的关键事实（读 `node_modules` 的公开产物与 README 得到）

**a) `tools/pre-execute` 拿不到「协作模式」**

```ts
// @deepseek-ai/dsh-tools lib/types/index.d.ts L216-242
export interface ToolExecutionInput {
  readonly callId: ToolCallId;
  readonly rootCallId?: ToolCallId;
  readonly name: string;
  readonly schema?: ToolSchema;
  readonly arguments: unknown;
  readonly agent?: Agent; // ← Agent = { readonly id: SessionId }，只有 id
  readonly parent?: ToolExecutionToken;
  readonly signal: AbortSignal;
}
```

`Agent` 的全部内容（`@deepseek-ai/dsh-agent` L11-14）只有 `id: SessionId`。
**没有任何 mode / plan 字段。** 因此五模式必须由本包自己持有（§三 L3）。

**b) `dsh-plan-mode` 只是开关，不限制工具**

README 原文：

> "It does not restrict the agent: **every tool stays callable**, so use sandbox mode and
> approval prompts when you need enforced limits."

它暴露的 API 只有：

```ts
class PlanModeController extends Service {
  get(agent: Agent): { active: boolean; pending?: boolean };
  set(agent: Agent, active: boolean): "committed" | "queued" | "cancelled" | "noop";
}
```

**只有布尔，没有五种模式。** Knorvia 的 plan 模式限制（只允许非破坏只读等）**必须由本包实现**。

**c) `dsh-user-approval` 的 approval 是一次性的**

README 原文：

> "Missing or failed answerers return `unavailable`, so the action **fails closed**, and
> **an approval applies only to that request**."

**所以跨请求的会话授权（Knorvia `grantSessionPermission`）必须由本包持有**（§三 L4）。
同时「fails closed」与 Knorvia「迭代器耗尽即抛错」的语义一致 —— 本包的缺省也必须 fail closed。

**d) `dsh-sandbox-policy` 只覆盖文件效果，不等价于 `sideEffectScope`**

```yaml
mode: read-only | workspace-write # 默认 read-only
workspaceRoot: <绝对路径>
```

它管的是 **bash / filesystem / terminal 的沙箱模式**（只两档）。
Knorvia 的 `sideEffectScope` 有六档（`none` / `workspace` / `session` / `git` / `network` / `system`），
**只有 `workspace` 一档由 DSH 覆盖**；其余四档需本包基于「工具声明 + arguments」自行判定。

**e) `PreToolDecision` 四档，与 Knorvia 三档对齐并多一个 `cancel`**

```ts
export type PreToolDecision =
  | { kind: "allow" }
  | { kind: "deny"; reason: string; info?: ToolErrorInfo }
  | { kind: "cancel" }
  | {
      kind: "ask";
      reason?: string;
      displayReason?: { readonly en: string; readonly [locale: string]: string };
    };
```

`allow` / `deny` / `ask` **与 `PermissionBehavior` 一一对应**；
`cancel` 是 DSH 额外能力（本包只在「父 signal 已中止」时使用，语义见 B7）。
`ask` 由 tools pipeline 自己路由到 `dsh-user-approval` —— **本包不直接调用 approval 服务**。

**f) 引擎分流已在进程级入口接好，插件保持 engine-agnostic**

```ts
// apps/cli/packages/cli/src/run.ts:254-266（已合并）
// 引擎选择必须先于 @knorvia/bootstrap 的加载；legacy 路径不触碰任何 DSH 模块。
if (resolveKernelEngine(inheritedEnv) === "dsh" && !prepareStorageOnly) {
  const { runKernelProcess } = await import("@knorvia/bootstrap/kernel");
  return await runKernelProcess({ ... });
}
```

`resolveKernelEngine` 是纯函数（`bootstrap/src/kernel/engine.ts`），
**`await import(...)` 保证 legacy 路径零加载 DSH 模块**。
**本包不判断 `KNORVIA_KERNEL_ENGINE`**（与 `kernel-plugin-credentials` 一致，实测其目录内零命中）。

**g) `tools/pre-execute` 每个 execution 只走一次，不可重入**

```js
// @deepseek-ai/dsh-tools lib/types/invariant.js L88-98
if (eventName === "tools/pre-execute") {
  // tools/pre-execute repeated for one execution  → fail
  // tools/execute must follow tools/pre-execute  → fail
}
```

**所以「7 条路线」必须在单个监听者内部完成**，不能拆成多次 hook 调用。

**h) waterfall 语义：不调 `next()` 即短路，顺序即优先级**

```ts
'tools/pre-execute'(this: Scoped<ToolRuntime>, exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision>;
```

本包**在每条路线得出终局决策后都不调 `next()`**（短路），
只有「本包无权判定、应交给下游」时才 `next()` —— 但按 B1，本包对每个 execution **必须给出终局决策**，
不存在委托给下游的情形（见 B1）。

### 2. 本包要补的缺口

| #   | 缺口                                                     | 本包做法                                           |
| --- | -------------------------------------------------------- | -------------------------------------------------- |
| G1  | DSH 没有五模式概念（只有 `plan` 布尔）                   | 本包维护 `sessionId → mode` 注册表（B2 / L3）      |
| G2  | `dsh-plan-mode` 不限制工具                               | plan 模式的四类白名单由本包在第 5 条路线实现（B5） |
| G3  | `dsh-user-approval` 的 approval 一次性，无跨请求会话授权 | 本包维护 `sessionId → 已授权规则集`（B8 / L4）     |
| G4  | `sideEffectScope` 六档只有 `workspace` 被沙箱覆盖        | 本包按「工具声明 + arguments」自行判定（B3）       |
| G5  | 判定依赖「模式」而钩子拿不到，且模式可能在判定期间被切换 | 入口快照 `modeAtEntry`，全程只用快照（B4 / L2）    |

**红线**：以上缺口一律在本包内适配，**不改 DSH**、**不改 core**（随删除）、**不改 bootstrap/src/kernel**。

---

## 三、锁定的不变量

实现阶段以下任何一条变化即视为破坏合同，必须升版本并重录旧门。

| #   | 不变量               | 内容                                                                                                    | 断言   |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------- | ------ |
| L1  | **路线顺序**         | 7 条路线的短路顺序固定：control → interaction → mandatory → ordinary → plan → exemptions → build        | B1/B5  |
| L2  | **模式快照**         | 入口处捕获 `modeAtEntry`，本次 execution 全程只用它；下游 listener 改注册表不影响本次判定               | B4     |
| L3  | **模式缺失即拒绝**   | 注册表查不到 session 的模式 → `deny`（**不默认 `build`**）                                              | B2     |
| L4  | **会话授权语义**     | 会话授权仅对同一 session 生效；不跨 session、不跨 workspace；不持久化到磁盘以外的任何缓存               | B8     |
| L5  | **fail closed**      | 任何「无法判定」的情形（缺声明、缺输入、内部错误）都必须 `deny`，**不得** `allow` 或抛出让 DSH 默认放行 | B9     |
| L6  | **无静默降级**       | `auto` 模式未实现 → `deny`（保留 `mode.auto.unimplemented` 语义），不得静默当作 `build`                 | B6     |
| L7  | **不变量：并发安全** | 同一 session 的并发 execution 各自独立快照模式；注册表读写不得产生「半更新」状态                        | B4/B10 |
| L8  | **纯判定无副作用**   | `tools/pre-execute` 监听者不写磁盘、不发网络、不改全局状态（除会话授权的显式登记）                      | B9     |
| L9  | **不泄漏**           | 判定理由（`reason`）不含工具 arguments 的敏感内容；`displayReason` 只放本地化文案                       | B11    |
| L10 | **engine-agnostic**  | 本包不读 `KNORVIA_KERNEL_ENGINE`；只在被组合根挂载时工作                                                | §二 f  |

---

## 四、行为条目（摘要；完整版见 behavior.md）

| 编号 | 主题           | 一句话                                                                           |
| ---- | -------------- | -------------------------------------------------------------------------------- |
| B1   | 插件形态与挂载 | 导出 `apply(ctx, config)`，挂 `tools/pre-execute`，对每个 execution 给出终局决策 |
| B2   | 模式注册表     | `sessionId → mode`；接线用 getter；缺失即 `deny`                                 |
| B3   | 能力解析       | 工具名 + 声明 → 9 个判定字段；`sideEffectScope` 六档自行判定                     |
| B4   | 模式快照与并发 | 入口快照，全程只读快照；并发 execution 互不影响                                  |
| B5   | 7 条路线顺序   | control → interaction → mandatory → ordinary → plan → exemptions → build         |
| B6   | 五模式语义     | plan 四类白名单 / build 六步 / edit 双条件 / yolo 保留 / auto 直接 deny          |
| B7   | 取消与中止     | 父 `signal` 已中止 → `cancel`；判定完成后中止 → 不影响已定决策                   |
| B8   | 会话授权       | `sessionId → 规则集`；批准后按「本次会话都允许」写入                             |
| B9   | fail closed    | 无法判定 → `deny`；内部异常 → `deny` + 日志，不抛给 DSH 默认放行                 |
| B10  | 幂等与重入     | 同一 `callId` 重复进入 → 返回同一决策（不重复记账）                              |
| B11  | 日志与理由     | `reason` 稳定不含敏感值；`displayReason` 供本地化 UI                             |
| B12  | 平台差异       | Windows / POSIX 路径语义；无真实 `~/.dsh` 读写                                   |

---

## 五、接口

见 [interface.md](interface.md)：插件模块导出面、`apply(ctx, config)` 的接线约定、
模式注册表与会话授权的 API、能力解析函数签名、以及本包与相邻包的依赖方向。

**依赖方向（冻结）**：

```text
kernel-dsh-builtins   ──(提供组合行位置)──>  kernel-plugin-policy
kernel-plugin-policy  ──(排在第一位)─────>  kernel-plugin-hooks（同挂 tools/pre-execute）
```

本包**不**被上述两者 import。对 `dsh-plan-mode` / `dsh-sandbox-policy` / `dsh-user-approval`
是**只读消费**（读配置与事实，不改其行为）。

---

## 六、调用方

见 [callers.md](callers.md)：旧实现 `core/src/permission/**` 的 15+ 个包外调用点，
按「新实现由组合根装配、经 DSH tools 管线生效」重新归类。

---

## 七、复用清单（接入包流程第 2 条）

**已有契约测试中，走公开入口、对新运行时同样适用的**：

| 套件                                                                                | 入口                           | 对新运行时的要求                                                                |
| ----------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| `specs/contracts/kernel-dsh-builtins`                                               | 公开组合/插件入口              | **继续全过**；本包不改其组合                                                    |
| `specs/contracts/kernel-plugin-credentials`                                         | 公开插件入口                   | 继续通过；本包不改凭据链                                                        |
| `specs/contracts/kernel-bridge-01/02/03`、`kernel-bridge-legacy`                    | v4 / 旧协议公开入口            | 继续全过；本包不改协议面                                                        |
| `apps/cli/packages/core/test/permission-policy-{priority,modes,capability}.test.ts` | **直接 import `permission/*`** | **不迁移**（随 `core` 删除）；**作为行为对照**，逐条映射到 behavior.md 的 B5/B6 |

**⚠️ 现状**：`core/src/permission/**` 的 12 个既有测试**全部直接 import 内部模块**，
**没有走公开入口**。所以「走公开入口的既有测试」在本层是 **0 个**；
本包的 B 条目测试**必须新写并走公开插件入口**（`apply(ctx)` + 触发 `tools/pre-execute`）。

**只测旧内部端口、不迁移**：`specs/contracts/core-*`（直接 import `core/src/**`），随 `core` 删除。

---

## 八、门禁

```bash
# 仓库根目录；先 pnpm build:cli-packages
node specs/contracts/kernel-plugin-policy/tests/run-gate.mjs              # 旧门（默认引擎）
node specs/contracts/kernel-plugin-policy/tests/run-gate.mjs --engine dsh # 新运行时门
```

| 门               | 入口                                   | 判据         | 产物            |
| ---------------- | -------------------------------------- | ------------ | --------------- |
| 旧门（合同阶段） | 旧实现 + 默认引擎                      | 全部用例通过 | `gate-old.json` |
| 新运行时门       | 同套用例 + `KNORVIA_KERNEL_ENGINE=dsh` | 全部用例通过 | `gate-dsh.json` |

- 接入包**无 stubs**（不替换既有实现，因此不需要桩门）。
- 离线可测：配置映射、模式注册表、7 条路线判定、会话授权、fail closed。
  **真实用户交互**（真的弹审批窗）归 `kernel-switch` 实机冒烟。
- 夹具**不得**含真实用户数据；一律用形如 `"fixture-tool-name"` 的假值。

---

## 九、与相邻包的接缝

1. **`kernel-dsh-builtins`（已合并 #228）**：提供组合行位置与工具管线。
   本包提供被该行 `moduleId` 指向的插件模块。**不改其 `bootstrap/src/kernel/**`\*\*。
2. **`kernel-plugin-hooks`（exec-cli，并行在途）**：同挂 `tools/pre-execute`。
   **本包排在第一位**（§一 3）；两包的「本包不做什么」各自写清边界。
3. **`kernel-plugin-tools-01`（exec-kernel，并行在途）**：工具声明（`readOnly` / `destructive` /
   `sideEffectScope` / `riskLevel`）是本包 B3 的输入。若某工具缺声明，本包按 L5 fail closed。
4. **`kernel-switch`**：默认引擎切换到 `dsh`、删除 `core`、真实交互冒烟归它。本包只交付判定能力。

---

## 十、Lead 裁决记录（2026-10-22）

| #   | 裁决                                                                  | 理由                                                                     |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| D1  | 缺口 G1（拿不到 mode）走「本包自己维护 `session → mode` 映射」        | 规格要求「五种模式行为与现规则一致」，DSH 无法提供                       |
| D2  | 缺口 G3（会话授权）由本包维护 `session → 已授权规则集`                | DSH approval 一次性；规格要求会话授权保留                                |
| D3  | 接线用 **getter 形态**（组合根持权威读取器 + 本包内部 registry 缓存） | 与 #254 的 `sessionContext` getter 一致；不自己发明状态源                |
| D4  | 模式快照 `modeAtEntry` 在入口捕获，全程只用快照                       | 精确对应 Knorvia「`activePlan` 提前捕获」约束                            |
| D5  | 模式缺失 → **fail closed（deny）**，不默认 `build`                    | 与 `dsh-user-approval`「fails closed」及 Knorvia「迭代器耗尽即抛错」一致 |
| D6  | 挂载顺序：**policy 先判 → hooks 后判**                                | 产品级硬约束不得被用户 Hook 绕过                                         |
| D7  | `tool-catalogue.ts` 独立成文件                                        | 「工具元数据从 DSH 拿还是自维护表」是实质设计决策                        |
