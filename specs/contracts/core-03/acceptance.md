# core-03 合同验收记录（v1）

## 一、范围与口径

- 计划书分包总表：`apps/cli/packages/core/src` · `.`, `workflow`, `workflow/expert`, `workflow/expert/parsers`, `workflow/scheduler` —— **35 文件 / 4,940 行 / 风险中**。
- 实测（`lead/scope-report.mjs` + `licensing/current-files.json`，继承文件口径）：**35 个继承文件** ✓（`. 1`、`telemetry 1`、`workflow 5`、`workflow/expert 13`、`workflow/expert/parsers 5`、`workflow/scheduler 10`）。
- 排除：`environment.ts` / `output.ts` / `runtime.ts`（后续包）；3 个 `original`（`scheduler/{graph,node-runner-outcome,ready-order}.ts`）。
- 黑盒入口：**包根** `src/index.ts`（190 具名导出；两处类型导出已修）。

## 二、行为覆盖

`behavior.md` 的 B1–B19 全部落在契约测试里（每条至少一个用例），其中：

- 调度循环：完成 / 恢复修复 / 并发上限 / 错误阈值 / 死锁 / 前沿事件去重 / 取消（B1–B7）；
- 事件日志与集合规划（B8–B9）；
- 节点执行与专家命令（B10–B11）；
- 专家阶段、批评回路、重试与失败归类（B12）；
- 子会话事件、解析器、内置定义、只读派生、遥测（B13–B17）；
- 导出面与模块边界（B18–B19）。

## 三、旧门（`gate-old.json`）

| 项            | 结果                                             |
| ------------- | ------------------------------------------------ |
| 源码入口      | 见 `gate-old.json`（运行后填写）                 |
| dist 入口     | 见 `gate-old.json`（运行后填写）                 |
| 桩替换        | 见 `gate-old.json`（运行后填写；要求**全失败**） |
| commit / node | `f777bd58…` / `v24.14.0`                         |

## 四、本包内完成的修复与发现

1. **包根类型当值再导出（两处）**：`ToolExecutor`、`ToolRegistry` → 改为 `export type`；修复后源码入口可加载（190 导出）。详见 `known-differences.md` §1。
2. **死代码候选**：`workflow/scheduler/collection-planner-admission.ts`（`Admission`/`admitCollection`）→ 替换阶段删除并重生成相关哈希基线（`known-differences.md` §4）。

## 五、未覆盖 / 存疑项

- 本包不含 `src/environment.ts` / `src/output.ts` / `src/runtime.ts` 与 `subagent` / `system-reminder` 等区域（别的包负责）；
- `src/index.ts` 中指向别包区域的 `export *` 不改其实现（仅保证再导出的**种类**正确）；
- 哈希基线类测试工件（`apps/cli/packages/core/test/*.json`）不在本包改写范围，删除死代码文件时需同步重生成（已记入 `known-differences.md`）。

旧门脚本：`node specs/contracts/core-03/tests/run-old-gate.mjs`（自动替换桩 → 重跑 → 还原，证据写入 `gate-old.json`）。
