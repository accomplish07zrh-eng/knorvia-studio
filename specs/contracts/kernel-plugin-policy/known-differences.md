# kernel-plugin-policy 已知差异（known-differences.md）

**合同版本：v1**（2026-10-22）

本文件记录「新实现与旧实现（`core/src/permission/**`）的有意差异」。
**任何未列在此处的行为差异都视为缺陷。**

---

## K1 两个 broker 与 `PermissionPreparation` 不迁移

**旧实现**（`broker.ts` 137 行 + `prepared-request.ts` 135 行）：

- `DenyPermissionBroker` / `ManualPermissionBroker` 实现 `PermissionBrokerPort`；
- `PermissionPreparation` 管理「准备 → 激活 → 结算」的生命周期（含超时、取消、去重、重入保护）；
- 8 个可测不变量（prepare 不通知 / activate 才通知 / dispose 只清自己 / timeout 从 activate 起算 /
  父 signal 取消 / 已取消先拒 / 同步通知异常不留登记 / 一步入口共用生命周期）。

**新实现**：**完全不迁移**。

**理由**：

1. DSH 的 `dsh-user-approval` 已提供 `request(req)` 一次性审批 seam，**语义等价**于
   `ManualPermissionBroker` 的核心职责（B5/B6 的「一次性、fail-closed」）；
2. DSH tools pipeline 自己路由 `ask` 决策（README：「The tools pipeline and the sandboxed bash tool
   route their `ask` decisions through this seam」），**本包不需要自己实现 broker**；
3. 本包只负责**判定出一个 `PreToolDecision`**，审批的「谁来问、怎么问、怎么答」归 DSH。

**差异点（有意）**：
| 旧实现能力 | 新实现 |
| --------------------------------- | --------------------------------- |
| 同 ID 重复 prepare → 抛 `InvalidStateTransition` | 不适用（无 broker，DSH 自己管请求 ID） |
| timeout 从 activate 起算 | 不适用（DSH approval 有自己的超时） |
| 父 signal 取消 → reject | 本包在 `tools/pre-execute` 入口检查 `signal.aborted` → `cancel`（B7） |
| `resolvePermission(id)` 双键查找 | 不适用 |

**⚠️ 但有一个语义必须保留**：**审批只对那一次请求有效**（不跨请求复用）。
DSH 已保证这一点；本包的**会话授权**（B8）是**额外的**跨请求状态，两者不冲突。

---

## K2 `permissionPolicyProgram` 的 generator 惰性 → 顺序化实现

**旧实现**：`function* permissionPolicyProgram(facts): Generator<PolicyRule>` ——
用 `yield*` 分段，**只有被选中路线才求值**（惰性）。

**新实现**：`evaluateRoutes(facts): RouteDecision` —— 顺序化的 `if` 分支。

**差异点**：**惰性语义必须用「分支内才调用 getter」保持**。
具体地：

- 第 ④ 路线之后若 `activePlan` 为真 → **不进入 ⑥⑦**（不调 `readProjectRules`）；
- 第 ⑤ 路线内**不读项目 allow 规则**；
- 每个分支只在需要时才调用对应的 getter。

**⚠️ 测试要求**：用 spy 断言「未走到的路线其 getter 零调用」（对应旧测试
`custom rule policy keeps its receiver, scoped inputs, lazy order and original error`）。

---

## K3 路线耗尽的行为：`throw` → `deny`

**旧实现**（`policy-evaluation.ts`）：

```ts
throw new Error("Permission policy program ended without a decision");
```

**新实现**：**返回 `deny`**（`ruleId: "route.exhausted"`）。

**理由**：旧实现的 `throw` 是「编程错误」信号（因为每条路线都有终止规则，正常不会耗尽）。
但在 DSH 侧，**异常可能导致 pipeline 失败并走默认放行路径** —— 那会违反 fail closed（L5）。
**所以新实现必须 `deny`，并且仍然记录 `error` 级别日志**（保留「这是异常情形」的信号）。

**⚠️ 这是安全相关的有意差异**：宁可多一层 `deny`，也不让异常变成放行。

---

## K4 `PermissionConfig` 的四个字段由组合根持有，不在本包

**旧实现**：

```ts
export interface PermissionConfig {
  allowedTools: Set<string>;
  disallowedTools: Set<string>;
  autoApproveHighRisk: boolean;
  allowMediumRiskInAutoMode: boolean;
}
export const defaultPermissionConfig: PermissionConfig = { ... };
```

**新实现**：这四个字段作为 `PolicyFacts` 的输入由组合根提供（不在本包定义类型）。
`defaultPermissionConfig` **不保留**（默认值属组合根的装配决策，不是插件的事实）。

**⚠️ 但语义必须保留**：

- `allowedTools` → 第 ⑥ 路线的 `allowedTools` 豁免；
- `disallowedTools` → 第 ② ③ ④ 路线的 deny；
- `autoApproveHighRisk` → 第 ⑦ 路线的 high 档判定；
- `allowMediumRiskInAutoMode` → **保留未启用**（因为 `auto` 模式整体未实现，B6/L6）。

---

## K5 `NAME_DEFAULTS` 原样保留（含两个「看起来矛盾」的项）

**旧实现**的 11 个只读工具里包含 **`TodoWrite`** 与 **`AskUserQuestion`**：

- `TodoWrite` 名字像写操作，但既有政策把它当只读（`none` / `needsApproval: false` / `low`）；
- `AskUserQuestion` 虽然会弹 UI，但既有政策不把它当 `requiresUserInteraction`。

**新实现**：**原样保留**，不加「修正」。

**理由**：这是既有产品政策。改变它会改变用户可感知的确认频率 —— 属于产品决策，
不属于「接入包重写」的范围。**若要调整，须先改 `specs/knorvia-permission-policy.md`。**

---

## K6 计划模式的「限制」由本包实现，`dsh-plan-mode` 只是开关

**DSH 的 `dsh-plan-mode`**（README 原文）：

> "It does not restrict the agent: **every tool stays callable**."

**所以**：

- `dsh-plan-mode` 负责：`/plan` 命令、`plan:policy` 提示词段落、`exit_plan_mode` 工具、
  `active` 投影与持久化；
- **本包负责**：plan 模式下「只允许非破坏只读 / 非破坏 mcp / 显式 `allowedInPlanMode`」的限制（B5 ⑤）。

**⚠️ 两者的模式来源不同**：

- `dsh-plan-mode` 的 `active` 来自 DSH session log（持久化）；
- 本包的 `CollaborationMode` 来自组合根的 `readMode` getter（五模式）。
  **组合根必须保证二者一致**（`mode === "plan"` ⟺ `planMode.get(agent).active === true`）。

**⚠️ 这是一个装配期不变量，不是本包能强制的** —— 若不一致，本包的判定会与 DSH 的提示词不一致。
**所以组合根需要断言这一点**（验收项，见 acceptance.md）。

---

## K7 会话授权是「额外的跨请求状态」，DSH approval 不提供

**DSH `dsh-user-approval`**（README 原文）：

> "**an approval applies only to that request**."

**所以 Knorvia 的「本次会话都允许」（`allowSessionApproval` / `grantSessionPermission`）
必须由本包持有**（B8）。

**⚠️ 差异点**：
| 概念 | 旧实现 | 新实现 |
| -------------------------- | ------------------------------- | ----------------------------------- |
| 单次批准 | broker 的一次 resolve | DSH `dsh-user-approval`（一次性） |
| 会话授权 | `PermissionService.grantSessionPermission` | 本包 `SessionGrantStore`（内存） |
| 持久化 | 旧实现也不持久化 | **同样不持久化**（DSH session log 才是权威） |

---

## K8 `sideEffectScope` 的六档判定从 DSH 拿不到，需本包自建

**DSH `dsh-sandbox-policy`** 只有两档（`read-only` / `workspace-write`），且只管
bash / filesystem / terminal 的**沙箱模式**。

**Knorvia 的 `sideEffectScope`** 有六档（`none` / `workspace` / `session` / `git` / `network` /
`system` / `userInteraction`），**只有 `workspace` 一档与 DSH 有交集**。

**所以**：

- 本包的 `sideEffectScope` **不来自** `dsh-sandbox-policy`，而来自**工具声明 + 工具名缺省表**（B3）；
- `dsh-sandbox-policy` 的配置**仍生效**（它管的是进程级沙箱，与本包的工具级判定正交）。

**⚠️ 两者的关系不是「替代」而是「叠加」**：

```text
本包判定（工具级）：allow / deny / ask     ← 决定「能不能调这个工具」
dsh-sandbox-policy（进程级）：read-only / workspace-write ← 决定「调了之后能写哪里」
```

**两层都要过。** 本包不放宽沙箱，沙箱不放宽本包。

---

## 汇总表

| #   | 差异                                     | 性质         | 风险                              |
| --- | ---------------------------------------- | ------------ | --------------------------------- |
| K1  | broker 与 `PermissionPreparation` 不迁移 | 结构差异     | 低（DSH 已提供等价能力）          |
| K2  | generator 惰性 → 顺序化                  | 实现差异     | **中**（必须用 spy 测试保持惰性） |
| K3  | 路线耗尽 `throw` → `deny`                | **安全差异** | 低（更严格）                      |
| K4  | `PermissionConfig` 归组合根              | 结构差异     | 低                                |
| K5  | `NAME_DEFAULTS` 原样保留                 | 无差异       | 无                                |
| K6  | 计划模式限制由本包实现                   | 归属差异     | **中**（需组合根断言一致性）      |
| K7  | 会话授权是本包额外状态                   | 能力补充     | 低                                |
| K8  | `sideEffectScope` 六档自建               | 能力补充     | 低（与沙箱叠加）                  |
