# services-03 设计（替换阶段分工）

## 一、为什么按「功能簇」而非「文件」分工

本层 31 个文件里 **17 个是叶子**（无层内依赖），**21 条层内依赖边**很稀疏。
这意味着一簇内部可以一起改，而簇之间几乎不干扰。

8 个功能簇（`gen-interface.mjs` 的 `CLUSTERS` 常量）：

| 簇                       | 文件 |  行数 | 外部引用 | 层内依赖（出/入）          |
| :----------------------- | :--: | ----: | -------: | :------------------------- |
| **A 内核策略与能力**     |  5   |   690 |       50 | `kernelPolicy` 入 4 / 出 1 |
| **B 工作流与引用解析**   |  6   | 1,109 |       30 | `workflowGraph` 入 4       |
| **C 输出与产物**         |  2   |   489 |       11 | `outputRef` 入 3           |
| **D 群聊与工具策略**     |  3   |   529 |       17 | `groupPolicy` 入 1         |
| **E 工作区运行时与图像** |  5   |   630 |       23 | ——                         |
| **F 校验与规范化**       |  3   |   245 |       20 | `validation` 出 4          |
| **G 身份与权限**         |  6   |   122 |       30 | ——                         |
| **H 能力矩阵**           |  1   |   264 |        4 | 出 1                       |

## 二、推荐顺序（依赖优先）

```
第 1 批（叶子，无层内依赖）：
  F 的 canonicalValue / staticPng
  H 的 capabilityMatrix
  G 的 projectIdentity / remoteAgentIdentity / acpPermission / attentionVersion
  E 的 workspaceRuntime / workspaceRuntimeEnvironment / workspaceSecrets
  D 的 agentToolPolicy
  B 的 stepReference

第 2 批（依赖第 1 批）：
  F 的 validation（依赖 imageInput / kernelIdentity / kernelPolicy / workspaceReviewPolicy）
  E 的 workspaceImage（依赖 workspaceSecrets）/ workspaceReviewPolicy（依赖 workspaceSecrets）
  D 的 groupPolicy（依赖 kernelIdentity）

第 3 批（核心，依赖多）：
  A 的 kernelPolicy（依赖 capabilityMatrix）
  A 的 kernelPresentation / retiredKernels（依赖 kernelPolicy）
  A 的 kernelMedia / kernelUsage

第 4 批（最复杂）：
  B 的 workflowGraph（依赖 condition / kernelIdentity / outputRef / workflowParams）
  B 的 condition / workflowParams（依赖 kernelPolicy）
  B 的 reference（依赖 outputRef / referencePath）/ referencePath
  C 的 outputRef / outputBuild
  D 的 groupPrompts（依赖 groupPolicy）
```

**⚠️ 但 batch 划分不是硬约束** —— 因为 17 个叶子可以并行。
**真正需要小心的是「入度高的 6 个汇聚点」**：
`kernelPolicy`(4) / `outputRef`(3) / `kernelIdentity`(3) / `referencePath`(2) / `workflowParams`(2) / `workspaceSecrets`(2)
—— 改它们之前，先确认所有依赖它的模块已稳定。

## 三、替换时必须保住的三类「隐式契约」

### 3.1 导出名的**运行时 vs 纯类型**属性（161 / 31）

若把一个 `export type` 改成 `export const`（或反过来），
`interface.md` 的 B3 断言会失败，且下游 `import type` 会变成运行期依赖。

### 3.2 `referencePath` 与 `reference` 的职责分离（K4）

- `referencePath` 是**纯规则叶子**（无层内依赖）；
- `reference` 是**完整解析流程**。
  **不得合并**（B15 断言）。

### 3.3 `staticPng` / `referencePath` 不能因「零外部引用」被删（K3）

两者的使用者都在层内（B14 断言）。

## 四、允许的实现层差异（见 `known-differences.md` §1）

| 面       | 允许差异                                   |
| :------- | :----------------------------------------- |
| 文件组织 | 可按功能簇重组内部结构，但**模块路径不变** |
| 内部实现 | 全量自写，与旧代码完全不同                 |
| 辅助函数 | 集中在簇内组织，去除冗余                   |

## 五、验收

见 `acceptance.md`。**核心判据**：

```
源码 25/25 + dist 25/25 + 桩替换 25/25 全部失败（allFail=true）
```

## 六、与 `services-02` 的边界

`services-02` 的 `contract.ts` 用 `export *` 聚合本层 3 个模块
（`imageInput` / `outputRef` / `reference`）——
**那是契约层的聚合职责，不在本包**（K5）。
本包只保证这 3 个模块自身的导出面完整。
