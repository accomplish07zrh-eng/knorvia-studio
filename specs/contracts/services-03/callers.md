# services-03 调用方清单（176 处外部引用）

实测 2026-10-21。**本文件由脚本生成后人工核对**；数字与 `dependencies.test.mjs` 的 B10 断言一致。

## 一、按引用方分层

| 引用方 | 处数 | 说明 |
| :--- | ---: | :--- |
| `packages/services/src/studio-runtime/app/`（45 文件） | **71** | 运行时编排层 |
| `packages/services/src/studio-runtime/adapters/`（60 文件） | **61** | I/O 适配层 |
| `packages/services/test/` | **35** | 测试夹具与断言 |
| `packages/services/src/`（根级，9 处） | **9** | 契约聚合与入口 |
| **合计** | **176** | |

## 二、按被引用模块（降序）

| 模块 | 总引用 | app | adapters | test | root |
| :--- | ---: | ---: | ---: | ---: | ---: |
| `kernelPolicy` | **33** | 3 | **26** | 4 | 0 |
| `validation` | **14** | 12 | 0 | 2 | 0 |
| `projectIdentity` | **13** | 8 | 1 | 4 | 0 |
| `remoteAgentIdentity` | **10** | 4 | 5 | 1 | 0 |
| `workflowGraph` | **10** | 4 | 0 | 4 | 2 |
| `outputRef` | **9** | 6 | 0 | 1 | 2 |
| `groupPolicy` | **8** | 4 | 0 | 4 | 0 |
| `agentToolPolicy` | **7** | 5 | 1 | 1 | 0 |
| `imageInput` | **7** | 3 | 2 | 1 | 1 |
| `workspaceImage` | **7** | 1 | 4 | 1 | 1 |
| `canonicalValue` | **6** | 5 | 0 | 1 | 0 |
| `kernelMedia` | **6** | 1 | 4 | 1 | 0 |
| `kernelPresentation` | **5** | 0 | 5 | 0 | 0 |
| `capabilityMatrix` | **4** | 0 | 2 | 1 | 1 |
| `workspaceRuntime` | **4** | 2 | 2 | 0 | 0 |
| `workspaceRuntimeEnvironment` | **4** | 0 | 2 | 2 | 0 |
| `acpPermission` | **3** | 0 | 2 | 1 | 0 |
| `condition` | **3** | 1 | 0 | 1 | 1 |
| `kernelIdentity` | **3** | 0 | 1 | 2 | 0 |
| `kernelUsage` | **3** | 1 | 1 | 1 | 0 |
| `reference` | **3** | 1 | 0 | 1 | 1 |
| `workspaceSecrets` | **3** | 0 | 3 | 0 | 0 |
| `groupPrompts` | **2** | 2 | 0 | 0 | 0 |
| `outputBuild` | **2** | 2 | 0 | 0 | 0 |
| `stepReference` | **2** | 2 | 0 | 0 | 0 |
| `workspaceReviewPolicy` | **2** | 1 | 0 | 1 | 0 |
| `attentionVersion` | **1** | 1 | 0 | 0 | 0 |
| `retiredKernels` | **1** | 1 | 0 | 0 | 0 |
| `workflowParams` | **1** | 1 | 0 | 0 | 0 |

**零外部引用（2 个）**：`referencePath`、`staticPng` —— **但都有层内使用者，不是死代码**（见 K3）。

## 三、最需要小心的 3 个模块

### 1. `kernelPolicy`（33 处，其中 adapters 26 处）
**本层被依赖最多**。`adapters/` 里有 26 个文件直接 import 它 —— 说明它承担了「内核策略的查询接口」职责。
**替换时若改签名，会同时打断 26 个 adapter。**

### 2. `projectIdentity`（13 处，但**仅 7 行**）
```ts
export function studioProjectKey(path: string): string   // 大致形态
```
**7 行代码被 13 处引用** —— 典型的「小而关键」工具。
**替换时容易觉得「这么简单，重写一下无所谓」→ 但签名一变就是 13 处编译失败。**

### 3. `remoteAgentIdentity`（10 处，但**仅 14 行**）
同 `projectIdentity`，是「小但被广泛依赖」的形态。

## 四、层内依赖（21 条边，不是外部引用）

**本文件只统计外部引用**；层内依赖边见 `scope.mjs` 的 `INTERNAL_EDGES`，
以及 `dependencies.test.mjs` 的 B9 断言（21 条，逐条冻结）。

**17 个叶子**（无层内依赖）：`acpPermission` / `agentToolPolicy` / `attentionVersion` /
`canonicalValue` / `capabilityMatrix` / `condition` / `kernelMedia` / `kernelUsage` /
`outputRef` / `projectIdentity` / `referencePath` / `remoteAgentIdentity` / `staticPng` /
`stepReference` / `workspaceRuntime` / `workspaceRuntimeEnvironment` / `workspaceSecrets`。

**6 个汇聚点**（被 ≥2 个层内模块依赖）：`kernelPolicy`(4) / `outputRef`(3) /
`kernelIdentity`(3) / `referencePath`(2) / `workflowParams`(2) / `workspaceSecrets`(2)。

## 五、口径说明（见 K2）

**早期侦察稿称「176 处外部引用」，与我实测一致** —— 这部分数据是正确的。
**但侦察稿对「层内依赖」的判断有误**（说 4 条 / 27 文件独立，实为 21 条 / 17 叶子），
因为侦察脚本只统计了「`studio-runtime` 之外的引用」，**漏了层内 import**。

**教训**：统计「被引用面」时，**外部引用**与**层内依赖**要分开算，
且两者都要扫 —— 只扫一个会得出错误结论。
