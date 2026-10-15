# core-runtime-methods-02

一句话：`apps/cli/packages/core/src/runtime/methods/` 下 **24 个继承文件**（回合模型步编排 +
工具批执行 + 停止引导 + compact/context 侧）的独立替换合同。黑盒面 = 24 个模块路径 + 98 个导出
（86 运行时值 + 12 类型）；实现重写为自己的内核不改本合同。

## 关系

- 上游合同：[`core-runtime-methods-01`](../core-runtime-methods-01/README.md)（模型调用与流式事件，
  已替换；本包行为多处通过其门面落账/记账/建模型句柄）；
- 兄弟合同：`core-runtime-methods-03`（剩余 89 件，后续分包）、`core-runtime-helpers-01`（helpers 面）；
- 相邻共享合同：`shared-02`/`shared-03`。

## 负责范围

兼容导出面（[`interface.md`](interface.md)）；24 个模块的行为契约（[`behavior.md`](behavior.md)
B32–B52 + 事件序列五组 S1–S5）；语义常量（behavior 常量对照表）；实现重写；**不改**：相邻文件、
`methods/index.ts` 桶、helpers 与 methods-01 已覆盖面。

## 文件

| 文件 | 作用 |
| --- | --- |
| `README.md` | 本文件：入口、分工、case 对照 |
| `behavior.md` | B32–B52 行为契约 + 事件序列五组 + 语义常量对照 |
| `interface.md` | 24 模块 × 98 导出兼容面（机器提取） |
| `callers.md` | 静态引用分析 |
| `known-differences.md` | 预登记差异（KD-2 收口 + KD-1 尾巴） |
| `acceptance.md` | 范围、旧门结果、覆盖与未覆盖项 |
| `fixtures/` | 金样（模型步往返 / rewind 成功载荷），旧实现录制 |
| `tests/` | 契约测试三文件 + `entry.mjs` |
| `stubs/`（24 桩） | 「import 即抛」桩：桩替换全失败的证据留存 `gate-old.json` |
| `gate-old.json` | 旧门证据：源码入口 / dist 入口 / 桩替换全失败 |
| `scope-files.json` | 24 个继承文件与分类（9/6/9） |

## 对照表（B/S/金样 ↔ 测试用例名；case 名发布后不改）

测试三文件（经 `tests/entry.mjs` 的 `KNORVIA_CORE_RUNTIME_METHODS_02_ENTRY` 双入口加载）：

| 用例（`test()` 名，逐字） | 条目 | 文件 |
| --- | --- | --- |
| `B32 回合模型步入口与遥测收尾` | B32 | tests/turn-model-step.test.ts |
| `B33 模型步执行主流程（六路错误序）` | B33 | tests/turn-model-step.test.ts |
| `B34 诊断与失败记录（KD-2 观察面）` | B34 | tests/turn-model-step.test.ts |
| `B35 请求/分部/收尾字段构造` | B35 | tests/turn-model-step.test.ts |
| `B36 主回合用量记账` | B36 | tests/turn-model-step.test.ts |
| `B37 反应式上下文恢复` | B37 | tests/turn-model-step.test.ts |
| `S1 模型步请求持久化序列` | S1 | tests/turn-model-step.test.ts |
| `S2 模型步成功收尾序列` | S2 | tests/turn-model-step.test.ts |
| `S5 紧凑恢复序列` | S5 | tests/turn-model-step.test.ts |
| `B39 回合循环状态与紧凑计数` | B39 | tests/turn-tools.test.ts |
| `B42 工具批执行主流程` | B42 | tests/turn-tools.test.ts |
| `B43 工具分部状态构造` | B43 | tests/turn-tools.test.ts |
| `B44 工具结果跟进输入` | B44 | tests/turn-tools.test.ts |
| `B45 结果路径工具用量记账` | B45 | tests/turn-tools.test.ts |
| `B46 工具调用异常告警` | B46 | tests/turn-tools.test.ts |
| `B47 工具分部元数据` | B47 | tests/turn-tools.test.ts |
| `B48 待决工具分部持久化与名称边界` | B48 | tests/turn-tools.test.ts |
| `S3 工具批执行序列` | S3 | tests/turn-tools.test.ts |
| `B38 回合模型句柄与提交侧模型选择` | B38 | tests/turn-finish-compact.test.ts |
| `B40 输出 token 续写` | B40 | tests/turn-finish-compact.test.ts |
| `B41 工具步收尾持久化` | B41 | tests/turn-finish-compact.test.ts |
| `B49 停止收尾与助手持久化` | B49 | tests/turn-finish-compact.test.ts |
| `B50 步边界 guide 排空` | B50 | tests/turn-finish-compact.test.ts |
| `B51 嵌套模型用量事件` | B51 | tests/turn-finish-compact.test.ts |
| `B52 compact 编排组` | B52 | tests/turn-finish-compact.test.ts |
| `S4 停止收尾序列` | S4 | tests/turn-finish-compact.test.ts |
| `模型步往返金样` | 金样 | tests/turn-finish-compact.test.ts |
| `KD-1 rewind 成功落账载荷金样` | KD-1 | tests/turn-finish-compact.test.ts |
| `KD-2 providerMetadata.recoveredFromStreamFailure 观察面` | KD-2 | tests/turn-finish-compact.test.ts |
| `interface.md × 运行时导出：24 模块 / 98 导出逐名一致` | surface | tests/surface.test.ts |
| `24 个模块路径均可按公开路径导入，且入口取值受控` | surface | tests/surface.test.ts |

## 事件序列五组（gate 握手、无 sleep/固定超时）

S1 模型步请求持久化序、S2 成功收尾序、S3 工具批执行序、S4 停止收尾序、S5 紧凑恢复序——
序列定义与断言样式见 [`behavior.md`](behavior.md)「事件序列五组」表；用例用 `gateNextAppend`/
`gateNextEmit` 类握手逐拍推进，不计时。

## 运行

```powershell
# 源码 + dist + 桩替换（需先构建 core 包）
node scripts/contract-gate.mjs --contract specs/contracts/core-runtime-methods-02 `
  --dist-env KNORVIA_CORE_RUNTIME_METHODS_02_ENTRY=dist `
  --stub-root specs/contracts/core-runtime-methods-02/stubs `
  --stub-targets specs/contracts/core-runtime-methods-02/stubs/targets.txt

# 单跑一组入口
node --import tsx --test specs/contracts/core-runtime-methods-02/tests/*.test.ts
$env:KNORVIA_CORE_RUNTIME_METHODS_02_ENTRY = "dist"
node --import tsx --test specs/contracts/core-runtime-methods-02/tests/*.test.ts
```

## 语义常量清单（见 behavior 常量对照表两段，逐字）

快速入口：`RAPID_REFILL_TOOL_TURN_THRESHOLD`/`MAX_CONSECUTIVE_RAPID_REFILLS` = 3/3；
自动化与闲时工具组与双前缀；续写提示词与 `MAX_OUTPUT_TOKEN_CONTINUATIONS` = 3；
`OUTPUT_LIMIT_RAW_REASONS` 三值；querySource 三值映射；模型选择条目 id；compact 11 事件名；
空名投影 `empty_tool_name`；工具用量 id 前缀；`DEFAULT_COMPACT_CONTEXT_WINDOW`（deps）等。
