# shared-01 接口（兼容面）

只列兼容所需的模块路径、导出名与类型；实现内部怎么拆文件由替换 Agent 定。
导出清单由 `scripts/dep-refs.mjs --list-exports --json` 生成（`wt/tool-deprefs`，PR #117 的修好版本）。

## 公开入口（package.json exports）

| 子路径                        | 源文件                                     |
| ----------------------------- | ------------------------------------------ |
| `@knorvia/shared/node`        | `packages/shared/src/node.ts`              |
| `@knorvia/shared/protocol-v4` | `packages/shared/src/protocol-v4/index.ts` |

`node.ts` 与 `protocol-v4/index.ts` 是 **re-export 桶**：替换时内部文件可任意重组，但这两个入口的导出名、类型与运行时值必须一一对应。

## `@knorvia/shared/node`（13 个导出）

| 导出                                    | 种类      | 声明位置      |
| --------------------------------------- | --------- | ------------- |
| `resolveKnorviaDataRoot`                | function  | `src/node.ts` |
| `scanOfficialPluginCacheRoots`          | function  | `src/node.ts` |
| `NODE_SELF_RESOURCE_SAMPLE_INTERVAL_MS` | const     | `src/node.ts` |
| `SharedFileLockOptions`                 | interface | `src/node.ts` |
| `NodeSelfResourceSamplerOptions`        | interface | `src/node.ts` |
| `NodeSelfResourceSampler`               | interface | `src/node.ts` |
| `createNodeSelfResourceSampler`         | function  | `src/node.ts` |
| `migrateSubagentStateFile`              | function  | `src/node.ts` |
| `withFileLock`                          | function  | `src/node.ts` |
| `migrateUserSubagentMarkdown`           | function  | `src/node.ts` |
| `atomicWritePrivateTextFile`            | function  | `src/node.ts` |
| `backupCorruptFile`                     | function  | `src/node.ts` |
| `acquireFileLock`                       | function  | `src/node.ts` |

## `@knorvia/shared/protocol-v4`（571 个导出）

完整清单见 [`interface-appendix-protocol-v4.md`](interface-appendix-protocol-v4.md)（机器生成，不手改）。
其中运行时值（schema、常量、函数）与纯类型必须分别核对：纯类型按 `interface.md` 剔除兼容名后再做相似度比较（计划书「纯声明文件」规则）。
