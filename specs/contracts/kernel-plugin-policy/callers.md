# kernel-plugin-policy 调用方（callers.md）

**合同版本：v1**（2026-10-22）

本文件列出**旧实现**（`apps/cli/packages/core/src/permission/**`）的包外调用点，
并说明它们在新运行时下的归宿。

**迁移性质**：这些调用点**不直接迁移**（`core` 随 `kernel-switch` 删除）。
它们的**行为**由本包的 B 条目承接；它们的**装配**由组合根（`bootstrap/src/kernel/composition.ts`）接管。

---

## 一、旧实现的调用点（`pnpm dep:refs` + 文本搜索）

```bash
# 检索命令（仓库根）
git grep -ln 'core/src/permission/\|permission/index.js\|permission/broker.js\|permission/service.js' \
  -- apps packages
```

**结果（15 个文件）**：

| #   | 调用方                                                   | 用到的旧导出                  | 新归宿                                        |
| --- | -------------------------------------------------------- | ----------------------------- | --------------------------------------------- |
| 1   | `bootstrap/test/permission-hook-recheck.test.ts`         | `PermissionService`（测试）   | 行为由 B5 承接；测试不迁移                    |
| 2   | `core/src/index.ts`                                      | 包级 re-export                | 随 `core` 删除                                |
| 3   | `core/src/runtime/deps.ts`                               | `PermissionService` 实例化    | 组合根装配（本包 `apply`）                    |
| 4   | `core/src/tool/executor/events.ts`                       | `PermissionDecisionResult`    | 本包 `RouteDecision`（DSH `PreToolDecision`） |
| 5   | `core/src/tool/executor/hook-decisions.ts`               | `PermissionBehavior`          | 本包 `RouteDecision.kind`                     |
| 6   | `core/src/tool/executor/hook-envelope.ts`                | 判定结果封装                  | DSH `tools/pre-execute` 的返回值              |
| 7   | `core/src/tool/executor/hook-flow.ts`                    | 判定编排                      | **归 `kernel-plugin-hooks`**（Hook 流程）     |
| 8   | `core/src/tool/executor/internal/tool-executor.ts`       | `checkPermission` 调用        | DSH tools 管线（本包在钩子里判定）            |
| 9   | `core/src/tool/executor/memory-file-permission.ts`       | 文件类权限判定                | 本包第 ⑦ 路线（build 判定）                   |
| 10  | `core/src/tool/executor/permission-capability.ts`        | `resolvePermissionCapability` | 本包 `resolveCapability`                      |
| 11  | `core/src/tool/executor/permission-flow/assessment.ts`   | 判定评估                      | 本包 `evaluateRoutes`                         |
| 12  | `core/src/tool/executor/permission-flow/observations.ts` | 观测                          | 本包日志（B11）                               |
| 13  | `core/src/tool/executor/permission-flow/refusals.ts`     | 拒绝路径                      | 本包 `deny` + `reason`                        |
| 14  | `core/src/tool/executor/permission-flow/responders.ts`   | 应答                          | **归 `dsh-user-approval`**（审批应答）        |
| 15  | `core/src/tool/executor/permission-input-recheck.ts`     | 输入复检                      | 本包 B3（`arguments` 解析）                   |

---

## 二、按「新运行时的生效路径」重新归类

旧实现的调用链是**直接方法调用**：

```text
tool-executor.ts ──> PermissionService.checkPermission(...) ──> evaluatePermissionPolicy(...)
```

新运行时是**事件钩子**：

```text
DSH tools pipeline ──> tools/pre-execute waterfall
                        ├─ ① kernel-plugin-policy  （本包：终局权限判定）
                        └─ ② kernel-plugin-hooks   （用户 Hook 扩展）
                     ──> PreToolDecision ──> DSH 执行或经 dsh-user-approval 弹审批
```

**所以「调用方」这个概念在新运行时下变了**：

- 旧实现：`tool-executor` 显式调用 `PermissionService`；
- 新实现：**没有任何代码显式调用本包** —— 本包由 DSH 的 pipeline 在每次工具调用前触发。

**这意味着本包没有「包外 import 调用方」**，只有：

1. **组合根**（`composition.ts`）—— 装配本包并发配置；
2. **DSH pipeline** —— 触发 `tools/pre-execute`；
3. **测试** —— 直接调用 `evaluateRoutes` / `apply`。

---

## 三、`dep:refs` 抽样（旧导出的实际使用密度）

```bash
pnpm dep:refs --list-exports apps/cli/packages/core/src/permission/service.ts
pnpm dep:refs --list-exports apps/cli/packages/core/src/permission/capability.ts
```

**抽样结论**（基于 `git grep` 计数，仓库根）：

| 旧导出                             | 包外引用文件数 | 说明                                      |
| ---------------------------------- | -------------: | ----------------------------------------- |
| `PermissionService`                |              3 | `deps.ts` / `index.ts` / 1 个测试         |
| `PermissionDecisionResult`（类型） |              4 | 主要在 `tool/executor/**`                 |
| `PermissionBehavior`（类型）       |              2 | `hook-decisions.ts` / `hook-envelope.ts`  |
| `resolvePermissionCapability`      |              2 | `permission-capability.ts` / `service.ts` |
| `evaluatePermissionPolicy`         |              1 | `service.ts`                              |
| `defaultPermissionConfig`          |              2 | `deps.ts` / `index.ts`                    |

**⚠️ 工具假阴性说明**：`pnpm dep:refs` 基于静态 import 分析，
**不覆盖**动态 `import()` 与类型位置的引用。上述数字已用 `git grep` 交叉核对；
两者不一致处以 `git grep` 为准（更保守）。

---

## 四、与相邻包的实际接缝（不是 import，而是运行时协作）

| 接缝对象                 | 协作方式                                               | 方向                |
| ------------------------ | ------------------------------------------------------ | ------------------- |
| `kernel-plugin-hooks`    | 同挂 `tools/pre-execute`；本包在前，返回终局决策       | 本包 → 后者（顺序） |
| `kernel-dsh-builtins`    | 提供组合行位置；本包被其 `moduleId` 指向               | 后者 → 本包（挂载） |
| `kernel-plugin-tools-01` | 工具声明是本包 B3 的输入                               | 后者 → 本包（数据） |
| `dsh-user-approval`      | 本包返回 `ask` 后由 DSH 路由到它；批准结果回写会话授权 | 双向（DSH 中介）    |
| `dsh-plan-mode`          | 本包只读其 `active` 事实（plan 模式开关）              | 本包 → 后者（只读） |

**⚠️ 本包不被任何包 `import`**（除测试与组合根），这是接入包与普通库包的区别。
