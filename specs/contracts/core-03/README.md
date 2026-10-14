# core-03 合同（v1）

`apps/cli/packages/core/src` 的 **. （包根文件）+ workflow + workflow/expert + workflow/expert/parsers + workflow/scheduler** 区域。

## 范围

- **35 个继承文件**（与计划书分包总表一致）：
  - `src/index.ts`（1）——包根导出面；
  - `src/telemetry/**`（1）；
  - `src/workflow/**`（33）：`workflow/` 5、`workflow/expert/` 13、`workflow/expert/parsers/` 5、`workflow/scheduler/` 10。
- **不属本包**：`src/environment.ts`、`src/output.ts`、`src/runtime.ts`（后续包，本包不改）；`workflow/scheduler/{graph,node-runner-outcome,ready-order}.ts` 为 `original`（本包不改）。
- 同样不碰：core-01（agent/compact/context/embedded-search/mcp）、core-02（memory/model/permission/plugin-reference/runtime-task/session\*）、试点 1（hooks）、subagent/system-reminder 等。

## 黑盒入口

- 主入口：**包根** `src/index.ts`（tsx 源码入口下可加载，190 个具名导出；两处「类型当值再导出」已修，见 `known-differences.md`）。
- 区域桶（分块测试）：`workflow/expert.ts`、`workflow/scheduler.ts`、`workflow/lifecycle.ts`、`workflow/definition.ts`；`telemetry/runtime-telemetry.ts` 为单模块。

## 文件

| 文件                   | 说明                                                             |
| ---------------------- | ---------------------------------------------------------------- |
| `interface.md`         | 模块路径 × 导出名（取自构建后 `dist/*.d.ts`；`export *` 已展开） |
| `behavior.md`          | B1–B19 行为条目 + 19 条验收场景                                  |
| `callers.md`           | 调用方清单与跨包边界                                             |
| `known-differences.md` | 类型导出修复、边界裁定、死代码候选、不可变兼容面                 |
| `acceptance.md`        | 范围/旧门/覆盖与未覆盖项                                         |
| `design.md`            | 替换实现的设计口径（阶段 A 的拆分方案）                          |
| `gate-old.json`        | 旧门证据（源码 + dist + 桩替换）                                 |

## 门槛口径

- 相似度：运行时/实现文件按**普通模式**；仅「导出声明占主体」的文件用 `--declaration --interface`；阈值不变（包含率 <0.20、最长相同段 <8、结构 <0.40）。
- 旧门：`node tests/run-old-gate.mjs` —— 源码入口与 dist 入口**全过**、**桩替换全失败**。
