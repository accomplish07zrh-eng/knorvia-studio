# kernel-plugin-policy 接口（interface.md）

**合同版本：v1**（2026-10-22）

本包导出面：**DSH 插件模块入口** + 装配期配置 + 供组合根与测试使用的
模式注册表 / 会话授权 / 能力解析 / 判定函数。

**声明模式计分说明**：本文件按 `--declaration` 的块剔除规则组织——
**每个 `const` / `interface` / `type` / `function` 的容器名都单独登记**，
成员名随容器一并登记。表格只含「模块路径 + 导出名」两列。

---

## 一、插件模块导出面（`bootstrap/src/kernel-plugin-policy/index.ts`）

| 模块                                                        | 导出名                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `bootstrap/src/kernel-plugin-policy/index.ts`               | `apply` `assertWired` `KnorviaPolicyConfig` `DEFAULT_POLICY_ROW_ID`                  |
| `bootstrap/src/kernel-plugin-policy/mode-registry.ts`       | `ModeRegistry` `createModeRegistry` `CollaborationMode` `ModeSource`                 |
| `bootstrap/src/kernel-plugin-policy/session-grants.ts`      | `SessionGrantStore` `createSessionGrantStore` `SessionGrant` `GrantMatchInput`       |
| `bootstrap/src/kernel-plugin-policy/capability-resolver.ts` | `resolveCapability` `ResolvedCapability` `ToolCapabilityDeclaration` `NAME_DEFAULTS` |
| `bootstrap/src/kernel-plugin-policy/tool-catalogue.ts`      | `ToolCatalogue` `createToolCatalogue` `ToolMetadata` `MetadataSource`                |
| `bootstrap/src/kernel-plugin-policy/policy-routes.ts`       | `evaluateRoutes` `PolicyFacts` `RouteDecision` `POLICY_ROUTE_ORDER`                  |
| `bootstrap/src/kernel-plugin-policy/logger.ts`              | `KnorviaLogger` `NOOP_LOGGER`                                                        |

### 1.1 组合行 id

```ts
export const DEFAULT_POLICY_ROW_ID = "knorvia-policy";
```

**与 `kernel-dsh-builtins` 的约定**：组合行由组合根（`bootstrap/src/kernel/composition.ts`）
写入，行 id 用上面的常量；本包提供被该行 `moduleId` 指向的模块。

### 1.2 装配期配置

```ts
export interface KnorviaPolicyConfig {
  /** 读当前 session 的协作模式。**必需**。缺失 → apply 抛错。 */
  readonly readMode: (sessionId: string) => CollaborationMode | undefined;
  /** 读工具能力声明。**必需**。返回 undefined 表示该工具无声明（按缺省表）。 */
  readonly readToolCapability: (toolName: string) => ToolCapabilityDeclaration | undefined;
  /** 读当前 session 的已授权规则集。**必需**。返回 undefined 等同于空集。 */
  readonly readSessionGrants: (sessionId: string) => readonly SessionGrant[] | undefined;
  /** 读项目权限规则集（可选）。缺席时第 ⑥ 路线的项目规则判定按「无规则」处理。 */
  readonly readProjectRules?: (cwd: string) => unknown;
  /** 读工作目录（可选）。用于 workflow-drafts 免确认的路径判定（B12）。 */
  readonly readWorkingDirectory?: (sessionId: string) => string | undefined;
  /** 注入 path 实现（测试用；缺省 `node:path`）。 */
  readonly pathModule?: PathModule;
  readonly logger?: KnorviaLogger;
}
```

**接线约定（照 #254 的 `assertWired` 精神）**：

- `readMode` / `readToolCapability` / `readSessionGrants` 三个必需字段缺席 → **立即抛错**；
- **不补默认值** —— 凭空造 mode 等于伪造状态（B2）；
- 错误消息必须指出**缺哪个字段**。

### 1.3 `apply` 签名

```ts
export function apply(ctx: Context, config: KnorviaPolicyConfig): void;
```

挂载后在 `ctx` 上注册一个 `tools/pre-execute` 监听者：

```ts
ctx.on(
  "tools/pre-execute",
  async (exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> => {
    // 本包对每个 execution 给出**终局决策**，不调用 next()（B1 / §二 h）
  },
);
```

**⚠️ 不调用 `next()`**：本包是第一位监听者，职责是给出终局判定（B1）；
调用 `next()` 会把决策权交给下游 Hook，违反「产品级硬约束不得被 Hook 绕过」（D6）。

---

## 二、模式注册表（`mode-registry.ts`）

```ts
export type CollaborationMode = "plan" | "build" | "edit" | "yolo" | "auto";

/** 模式事实的来源标记，仅用于日志与装配期诊断（不参与判定）。 */
export type ModeSource = "composition-root" | "session-event" | "test";

export interface ModeRegistry {
  /** 读当前模式；未注册返回 undefined（调用方必须按 L3 deny）。 */
  resolve(sessionId: string): CollaborationMode | undefined;
  /** 组合根在模式变更时调用；同时更新 cache 与事实来源。 */
  record(sessionId: string, mode: CollaborationMode, source: ModeSource): void;
  /** session 结束时清理（避免内存增长）。 */
  forget(sessionId: string): void;
}

export function createModeRegistry(config: {
  readonly readMode: (sessionId: string) => CollaborationMode | undefined;
}): ModeRegistry;
```

**语义**：

- `resolve` 先读 cache；miss 时调 `config.readMode`（组合根的权威读取器）并回填 cache；
- `record` 由组合根在收到模式变更时调用（UI 切模式 / `/plan` 命令 / 测试）；
- **`resolve` 返回 `undefined` 时必须 `deny`**（L3），本包不默认任何模式。

**⚠️ cache 与权威的关系**：本包 cache 是**加速层**，权威始终是 `config.readMode`。
若两者不一致，以 `readMode` 为准（下次 miss 时校正）。

---

## 三、会话授权（`session-grants.ts`）

```ts
export interface SessionGrant {
  readonly toolName: string;
  /** 规则内容（可选）。语义同项目规则的 `ruleContent`（通配 / 命令前缀 / URL）。 */
  readonly ruleContent?: string;
}

export interface GrantMatchInput {
  readonly toolName: string;
  readonly arguments: unknown;
}

export interface SessionGrantStore {
  /** 该 session 是否有任一 grant 命中本次调用。 */
  matches(sessionId: string, input: GrantMatchInput): boolean;
  /** 追加一条 grant（集合语义，重复不叠加）。 */
  add(sessionId: string, grant: SessionGrant): void;
  /** session 结束时清理。 */
  clear(sessionId: string): void;
  /** 只读快照（测试与诊断用）。 */
  snapshot(sessionId: string): readonly SessionGrant[];
}

export function createSessionGrantStore(config: {
  readonly readSessionGrants: (sessionId: string) => readonly SessionGrant[] | undefined;
}): SessionGrantStore;
```

**语义**：

- 仅对同一 `sessionId` 生效（L4）；
- **不持久化到磁盘**（DSH session log 才是权威；本包只保内存）；
- `add` 的时机由组合根决定（在 `approval/request` 结果处），**不在 `tools/pre-execute` 内**（L8）。

---

## 四、能力解析（`capability-resolver.ts`）

```ts
export interface ToolCapabilityDeclaration {
  readonly readOnly?: boolean;
  readonly destructive?: boolean;
  readonly sideEffectScope?: SideEffectScope;
  readonly riskLevel?: RiskLevel;
  readonly needsApproval?: boolean;
  readonly requiresUserInteraction?: boolean;
  readonly allowedInPlanMode?: boolean;
  readonly alwaysAsk?: boolean;
  readonly permission?: {
    readonly permission?: string;
    readonly sideEffectScope?: SideEffectScope;
    readonly riskLevel?: RiskLevel;
    readonly needsApproval?: boolean;
    readonly alwaysAsk?: boolean;
    readonly askOptions?: { readonly allowAlways?: boolean };
  };
  readonly permissionCapabilityGroup?: string;
}

export type SideEffectScope =
  | "none"
  | "workspace"
  | "session"
  | "git"
  | "network"
  | "system"
  | "userInteraction";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ResolvedCapability {
  readonly allowedInPlanMode: boolean;
  readonly alwaysAsk: boolean;
  readonly allowSessionApproval: boolean;
  readonly readOnly: boolean;
  readonly destructive: boolean;
  readonly requiresUserInteraction: boolean;
  readonly sideEffectScope: SideEffectScope;
  readonly riskLevel: RiskLevel;
  readonly needsApproval: boolean;
  readonly permissionCapabilityGroup?: string;
  readonly permissionName?: string;
}

export const NAME_DEFAULTS: ReadonlyMap<
  string,
  {
    readonly readOnly: boolean;
    readonly destructive: boolean;
    readonly sideEffectScope: SideEffectScope;
    readonly needsApproval: boolean;
    readonly riskLevel: RiskLevel;
  }
>;

export function resolveCapability(
  toolName: string,
  declaration: ToolCapabilityDeclaration | undefined,
): ResolvedCapability;
```

**逐属性优先级**（B3）：每个字段独立取「声明 → 工具名缺省表 → 硬编码缺省」，
**一条覆写只影响它自己那个属性**。

---

## 五、工具元数据来源（`tool-catalogue.ts`）

```ts
export type MetadataSource = "declaration" | "name-default" | "unknown-default";

export interface ToolMetadata {
  readonly toolName: string;
  readonly source: MetadataSource;
  readonly declaration?: ToolCapabilityDeclaration;
}

export interface ToolCatalogue {
  lookup(toolName: string): ToolMetadata;
}

export function createToolCatalogue(config: {
  readonly readToolCapability: (toolName: string) => ToolCapabilityDeclaration | undefined;
}): ToolCatalogue;
```

**为什么独立成文件**（D7）：这是「工具元数据从 DSH 拿还是自维护表」的实质决策点。

**当前决策**：**以声明为准，缺省表兜底**。

- 有声明 → `source: "declaration"`；
- 无声明但在 `NAME_DEFAULTS` → `source: "name-default"`；
- 都无 → `source: "unknown-default"`（按 UNKNOWN 档：非只读 / workspace / 需批准 / medium）。

**⚠️ 不从 DSH 的工具注册表读**：DSH 的 `ToolSchema` 描述 JSON Schema，
**不含** `readOnly` / `destructive` / `sideEffectScope` 语义 —— 那些是 Knorvia 的产品概念。
DSH 侧的 Schema 只用于参数校验，不参与权限判定。

---

## 六、判定（`policy-routes.ts`）

```ts
export interface PolicyFacts {
  readonly mode: CollaborationMode;
  readonly toolName: string;
  readonly arguments: unknown;
  readonly capability: ResolvedCapability;
  readonly sessionId: string;
  readonly readSessionGrants: () => readonly SessionGrant[];
  readonly readProjectRules: () => unknown;
  readonly workingDirectory?: string;
  readonly pathModule?: PathModule;
}

export type RouteDecision =
  | { readonly kind: "allow"; readonly ruleId: string; readonly reason: string }
  | { readonly kind: "deny"; readonly ruleId: string; readonly reason: string }
  | {
      readonly kind: "ask";
      readonly ruleId: string;
      readonly reason: string;
      readonly displayReason?: LocalizedText;
    }
  | { readonly kind: "cancel"; readonly ruleId: string; readonly reason: string };

export const POLICY_ROUTE_ORDER: readonly string[];

export function evaluateRoutes(facts: PolicyFacts): RouteDecision;
```

**`POLICY_ROUTE_ORDER`** 固定为 7 条（L1，不可调整）：

```ts
["control", "interaction", "mandatory", "ordinary", "plan", "exemptions", "build"] as const;
```

**⚠️ `evaluateRoutes` 永不抛错**：内部异常 catch 后返回 `deny`（B9 / L5）。

---

## 七、日志（`logger.ts`）

```ts
export interface KnorviaLogger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export const NOOP_LOGGER: KnorviaLogger;
```

---

## 八、依赖方向（冻结）

```text
kernel-dsh-builtins  ──(组合行 id / 工具管线)──>  kernel-plugin-policy
kernel-plugin-policy ──(排在 waterfall 第一位)──>  kernel-plugin-hooks
kernel-plugin-tools-01 ──(工具声明)──>            kernel-plugin-policy（只读消费）
```

**本包对外只读消费**：`dsh-plan-mode`（读 `active`）、`dsh-sandbox-policy`（读配置，不改）、
`dsh-user-approval`（`ask` 决策由 DSH 路由，本包不直接调）。

**本包不 import**：`core/src/permission/**`（随删除）、`core/src/hooks/**`（归 hooks 包）。

---

## 九、与旧实现的导出面映射（行为对照，不迁移代码）

| 旧实现（`core/src/permission/`）                                  | 本包对应                                          |
| ----------------------------------------------------------------- | ------------------------------------------------- |
| `PermissionService`                                               | `apply` + 组合根装配（不保留该类）                |
| `checkPermission`                                                 | `evaluateRoutes`                                  |
| `grantSessionPermission`                                          | `SessionGrantStore.add`                           |
| `requiresApproval`                                                | `evaluateRoutes` 的 `kind === "ask"`              |
| `getRiskLevel`                                                    | `resolveCapability().riskLevel`                   |
| `defaultPermissionConfig`                                         | 组合根配置（不保留该常量）                        |
| `resolvePermissionCapability`                                     | `resolveCapability`                               |
| `evaluatePermissionPolicy`                                        | `evaluateRoutes`                                  |
| `permissionPolicyProgram`（generator）                            | `evaluateRoutes`（顺序化实现）                    |
| `ManualPermissionBroker` / `DenyPermissionBroker`                 | **不迁移**：DSH 的 `dsh-user-approval` 接管审批流 |
| `PermissionPreparation`                                           | **不迁移**：同上                                  |
| `wildcardToRegExp` / `compileRuleContent` / `evaluateRuleContent` | 本包内重新实现（规则内容匹配，B12）               |
| `matchesProjectRules`                                             | `evaluateRoutes` 的第 ⑥ 路线内                    |
| `isPreapprovedWorkflowDraftWrite`                                 | 第 ⑥ 路线内（B12 路径判定）                       |

**⚠️ 两个 broker 与 `PermissionPreparation` 不迁移**：DSH 的三包已提供审批流与生命周期，
本包只负责「判定出一个 `PreToolDecision`」。这是本包与旧实现**最大的结构差异**。
