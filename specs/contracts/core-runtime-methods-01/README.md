# core-runtime-methods-01 合同（v1）

`apps/cli/packages/core/src/runtime/methods/**` 的「模型调用与流式事件」切片——模型请求组装与
流式执行、流式工具协调、流恢复、事件持久化、用量观测（M2 · 21 个继承文件 / 2,945 行）。

> **版本 v1**：合同任何改动都要重跑旧门并升版本；旧门结果见 [`gate-old.json`](gate-old.json)，
> 覆盖与未覆盖项见 [`acceptance.md`](acceptance.md)。

## 范围

- **21 个继承文件**（继承口径 `licensing/current-files.json`）：`upstream-modified` 12、
  `unreviewed` 6、`upstream-unchanged` 3（见 `scope-files.json`）。切片内部依赖闭合，
  恰为 `core-runtime-helpers-01` B30–B33 事件序的上游。
- **不在范围的相邻文件**（本包不改，接口默认不可变）：
  - 同目录其余 113 个文件——`turn-model-step-*` 与 `turn-model.ts`（回合模型步编排，
    **methods-02 种子**）、`compact*`/`context*`/`message-persistence*`/`steering*`/
    `session-fork*`/`rewind*`/`subagent*`/`target*`/`turn-*`、`tools.ts`/`hooks.ts`/`mcp.ts`/
    `config.ts`/`resume.ts` 等（methods-02/03 与 runtime-01 后续分包）；
  - `index.ts`（21KB 桶，聚合全目录）**不入包**——等各子包完成后统一处理（对照 helpers-01
    「index.ts 桶暂不动」先例）；
  - `runtime/helpers/**`（已由 `core-runtime-helpers-01` 覆盖）、`runtime/` 其余装配文件与
    `agent/**`、`compact/**`、`permission/**`、`subagent/**`、`tool/**` 等属其他包；
  - core-01/02/03、试点 1（hooks）、adapters 与 tool 包同样不碰。

## 黑盒入口

- **模块路径入口**：`interface.md` 里的 21 个模块按相对路径直接导入（本包调用方与测试都这么用）。
- **无桶入口**：`methods/index.ts` 不在范围，测试与调用方都不经它。
- 两种运行方式都要过：**源码入口**（tsx 加载 `src/**/*.ts`）与 **dist 入口**
  （`pnpm --dir apps/cli/packages/core build` 后的 `dist/**/*.js`），由环境变量
  `KNORVIA_CORE_RUNTIME_METHODS_01_ENTRY=dist` 切换。

## 文件

| 文件                                   | 说明                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `behavior.md`                          | B1–B31 行为条目，每条九项（输入/输出/错误语义/时序与并发/幂等/资源释放/平台差异/状态所有者/日志级别） |
| `interface.md`                         | 21 个模块 × 49 个导出（48 个运行时值 + 1 个纯类型），导出面与签名机器生成，兼容声明块集中于此         |
| `callers.md`                           | `dep:refs` 同源静态分析：110 个引用点、27 个有范围外调用方的导出（含同目录后续分包文件）              |
| `tests/`                               | 契约测试（node:test，黑盒，只经公开入口；源码 + dist 双入口）                                         |
| `fixtures/`                            | 模型请求/响应投影往返金样与流事件序列夹具，脱敏虚构数据                                               |
| `known-differences.md`                 | 预登记差异与边界裁定，每条都有理由与对应测试                                                          |
| `acceptance.md`                        | 范围、旧门结果、覆盖与未覆盖项                                                                        |
| `stubs/`（21 个「import 即抛」最小桩） | 桩替换全失败的证据留存 `gate-old.json`；进入替换阶段后随合同桩目录退役                                |
| `gate-old.json`                        | 旧门证据：源码入口 / dist 入口 / 桩替换全失败                                                         |
| `scope-files.json`                     | 21 个继承文件与继承分类                                                                               |

## 运行

```powershell
# 源码 + dist + 桩替换（需先构建 core 包）
node scripts/contract-gate.mjs --contract specs/contracts/core-runtime-methods-01 `
  --dist-env KNORVIA_CORE_RUNTIME_METHODS_01_ENTRY=dist `
  --stub-root specs/contracts/core-runtime-methods-01/stubs `
  --stub-targets specs/contracts/core-runtime-methods-01/stubs/targets.txt

# 单跑一组入口
node --import tsx --test specs/contracts/core-runtime-methods-01/tests/*.test.ts
$env:KNORVIA_CORE_RUNTIME_METHODS_01_ENTRY = "dist"
node --import tsx --test specs/contracts/core-runtime-methods-01/tests/*.test.ts
```

契约测试同时被 `pnpm test:studio` 收录（M0-10 机制）。

## 时序与事件序列断言

运行时时序（流式 / 取消 / 并发 / 重试交错）一律用**事件序列断言**，**没有 sleep、没有固定超时**，
并发交错用 gate 握手（deferred promise 信号点）断言。五组序列与承载条目：

1. **流事件消费序列**（B2）：模型流事件 → 流式事件队列的映射与终止语义，消费顺序是契约；
2. **事件进入顺序**（B7/B16/B20）：队列进入序 = `enqueue` 序、恢复三事件 AnchorSelected →
   TailDiscarded → RetryStarted、单工具管线 账本/持久化交错序；
3. **完成顺序交错**（B19/B22）：流中工具并发完成、完成序与启动序解耦，`drain` 返回恒按
   工具调用表序；恢复事件与工具补执行的持久化交错序；
4. **持久化记录内容与顺序**（B13/B22/B23）：取消快照分部（reasoning → text）、丢弃标记
   （`STREAM_RECOVERY_DISCARDED_*`）、事件管线 append → durable → usage → sinks；
5. **日志序列**（B6/B23/B25）：生命周期事件 persistence started → completed/failed、
   会话持久化 started → persisted → completed、状态 sink 七类日志级别。

## 条目 → 测试对照表

| 条目   | 测试用例（`tests/` 下文件 · 用例名）                                   | 关键断言                                                                             |
| ------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| B1     | `model-request.test.ts` ·「B1 请求组装与三段投影…」                    | 请求只含 messages/tools/abortSignal；maxOutputTokens 条件附加；投影不动时保持原对象  |
| B2     | `model-request.test.ts` ·「B2 流式事件映射与终止语义」（事件序列）     | kind 映射全表；error 先冲刷再终止；catch drain 后重抛；toolCall 去重                 |
| B3     | `model-request.test.ts` ·「B3 会话类型与重试预算解析」                 | subagent_child/workflow_child/其余三分支；Unbounded 仅 workflow 系                   |
| B4     | `model-request.test.ts` ·「B4 max output token 两级限额」              | 32,000 默认、模型值原样、预留 1,000、≤0 回 baseline、log 字段全                      |
| B5     | `model-request.test.ts` ·「B5 请求头刷新钩子…」                        | 端口缺席/拒绝装钩子；headersApplied=false 抛固定文案；attempt 级参数                 |
| B6     | `model-request.test.ts` ·「B6 状态 sink 与七类状态日志」               | publish 五步顺序；7 个 type 的 level/label/event 字段逐个对                          |
| B7     | `model-request.test.ts` ·「B7 流式事件队列进入顺序」（事件序列）       | 进入序=enqueue 序；128 高水位背压；失败缓存后三出口都抛                              |
| B8     | `model-request.test.ts` ·「B8 流式事件落盘…」                          | ModelStreaming 事件先 append 后入数组                                                |
| B9     | `model-request.test.ts` ·「B9 推理块按需创建」                         | 默认 id 常量、同 id 复用、Map 与数组同登                                             |
| B10    | `model-request.test.ts` ·「B10 工具输入缓冲与冲刷」                    | 四种换行/转义触发、4,096 阈值、flush 清缓冲、flushAll 顺序                           |
| B11    | `model-request.test.ts` ·「B11 流结果体检…」                           | contextExceeded 与 suspicious_empty 两 warn；有工具调用不判超限                      |
| B12    | `model-request.test.ts` ·「B12 模型句柄与上下文合并」                  | 选择缺失抛 ConfigurationError；runtime 层压过调用层；bind 递归包                     |
| B13    | `streaming.test.ts` ·「B13 取消快照持久化」（事件序列 · 持久化记录序） | reasoning 块按序逐条 + text 收尾；空块跳过；time.start/end 口径                      |
| B14    | `streaming.test.ts` ·「B14 恢复预算与尝试记账」                        | 10/2 上限、计数递增、maxRetries 取值                                                 |
| B15    | `streaming.test.ts` ·「B15 Start Plan busy 判定/退避/耗尽错误」        | 3008/3009/3010、[1000,2000]、providerId 双值、耗尽错误全字段与默认 3010              |
| B16    | `streaming.test.ts` ·「B16 恢复事件组与锚点」（事件序列）              | 三事件进入序=完成序；anchor id 后缀与 previous-message-anchor 兜底；reason 串        |
| B17    | `streaming.test.ts` ·「B17 部分输出失败恢复」                          | 短路两条件、丢弃标记记录、abort 监听移除、no_tool_committed                          |
| B18    | `streaming.test.ts` ·「B18 流式工具准入…」                             | 准入七条件逐个否决；UTF-8 字节记账；执行失败降级 warn                                |
| B19    | `streaming.test.ts` ·「B19 取消与收尾交错」（事件序列 · 完成顺序交错） | gate 握手：先启动后完成、drain 恒按调用表序、abandon 状态串与 250ms 上限常量         |
| B20    | `streaming.test.ts` ·「B20 流中工具执行管线」（事件序列）              | pending 分部→tool_call_closed→调度→tool_queued→running→tool_started 序               |
| B21    | `streaming.test.ts` ·「B21 合成工具结果与错误事件」                    | 两段固定文案、stream_recovery_interrupted_tool、ledgerRecorded:false                 |
| B22    | `streaming.test.ts` ·「B22 模型失败恢复编排」（事件序列）              | 短路、合成结果等长同序、recoveredFromStreamFailure、latest_committed_tool_result     |
| B23    | `events-usage.test.ts` ·「B23 事件管线与日志序列」（事件序列）         | 四步管线序；生命周期 info/warn 序；汇总命中跳过 appended debug                       |
| B24    | `events-usage.test.ts` ·「B24 sink 通知…」                             | 串行通知；单 sink 失败 warn 后继续                                                   |
| B25    | `events-usage.test.ts` ·「B25 会话持久化」（事件序列 · 日志序列）      | 五 phase 顺序、sessionPersisted 置位点、标题事件载荷、started/persisted/completed 序 |
| B26    | `events-usage.test.ts` ·「B26 持久化事件分派…」                        | 八类事件分派；账本类失败 warn 吞掉、checkpoint/rewind 冒泡；promoted no-op           |
| B27    | `events-usage.test.ts` ·「B27 汇总节流…」                              | 四类汇总、键 `<turnId                                                                | session>:<type>`、100 计数阈值、payloadKinds `<missing>` |
| B28    | `events-usage.test.ts` ·「B28 模型用量事实」                           | id/两处 logical 兜底分隔符、token 映射（cacheWrite→cacheCreation）、retryCount       |
| B29    | `events-usage.test.ts` ·「B29 回合用量事实」                           | 请求/工具/错误去重计数、firstModelStartAt、汇总 token 口径                           |
| B30    | `events-usage.test.ts` ·「B30 工具用量事实」                           | 九类事件→upsert 形状、cancel 判定、usageCount 归一、unknown 兜底                     |
| B31    | `events-usage.test.ts` ·「B31 用量投影纯函数」                         | firstModelTokenAt delta.length>0、usageErrorInfo 四分支、usageCount 截断             |
| 接口面 | `surface.test.ts` 全部用例                                             | 49 导出逐名比对、21 模块路径存在、两入口一致、范围清单 21 文件                       |

## 门槛口径

- **旧门**：`node scripts/contract-gate.mjs` —— 源码入口与 dist 入口**全过**、**桩替换全失败**
  （21 个目标换成 import 即抛桩后 0 通过）。
- **相似度**：实现文件按普通模式；仅「导出声明占主体」的文件用 `--declaration --interface`；
  阈值不变（包含率 <0.20、最长相同段 <8、结构 <0.40）。
