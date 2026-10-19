# packages-02 与旧实现的已知差异（合同阶段）

合同阶段**不改任何产品源码**，只新增合同产物。本文件记录「新旧实现之间被允许的差异」、
「必须逐字保留的部分」以及本包观察到的旧行为特征，供替换阶段自查与审查复核。

## 1. 第三方分类口径差异（如实登记）

`licensing/current-files.json` 与 M0-6 逐文件核实（`docs/knorvia-third-party-verification-20261011.md`）
在下列 rpc 文件上的分类不一致：

| 文件                                  | licensing 记录       | M0-6 结论  | 本合同处置                    |
| ------------------------------------- | -------------------- | ---------- | ----------------------------- |
| `packages/rpc/src/channels.shared.ts` | `upstream-unchanged` | ZCode 改过 | 按 ZCode 改过重写             |
| `packages/rpc/src/channels.ts`        | `upstream-unchanged` | 无上游     | 视同 ZCode 代码重写           |
| `packages/rpc/src/delayedChannel.ts`  | `upstream-unchanged` | ZCode 改过 | 按 ZCode 改过重写             |
| `packages/rpc/src/index.ts`           | `upstream-unchanged` | ZCode 改过 | 按 ZCode 改过重写，导出面冻结 |
| `packages/rpc/examples/01..03`        | `upstream-unchanged` | 无上游     | 视同 ZCode 代码重写           |

依据：任务书默认裁决「不确定文件是否第三方原样 → 按 ZCode 改过处理」与计划书「rpc 属 VS Code
派生，核实登记，ZCode 改动部分重写」。**没有任何 rpc 文件与 VS Code 上游逐字节相同**，因此本包
不存在「登记为 third-party 且原样不重写」的文件；licensing 的上游 MIT 来源说明保留。

`packages/provider-node/src` 的 9 个继承模块在 M0-6 中没有 VS Code 上游对应；它们继承自 ZCode，
licensing 分类为 `upstream-unchanged`/`upstream-modified`，本包一律按合同重写。

## 2. 不在本包重写范围的文件

| 位置                                                                                                 | 归属              | 说明                                                                         |
| ---------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------- |
| `packages/provider-node/src/builtin-*.ts`、`endpoint-scoped-builtin-source.ts`（7 个）               | 已独立实现        | 由 `packages/provider-node/docs/BUILTIN-*` 证据登记；行为经 B27/B28 间接覆盖 |
| `packages/provider-node/src/index.ts`                                                                | original（M0-14） | 14 行 re-export 桶；导出面由 B29 冻结                                        |
| `packages/provider-node/test/**`                                                                     | 测试资产          | 不重写                                                                       |
| `packages/rpc/test/**`                                                                               | 测试资产          | 不重写；其中 2 个文件 licensing 记为 `unreviewed`                            |
| `packages/rpc/package.json`、`tsconfig.json`、`packages/provider-node/package.json`、`tsconfig.json` | 配置              | 保持 scripts/exports/编译目标不变                                            |
| `packages/shared/src/protocol-v4/wire-codec.ts`                                                      | `shared-01`       | M0-6 的 8 个「无上游」中属于本包的只有 7 个                                  |

## 3. 替换阶段允许改变的部分

- 模块内部组织：文件拆分、私有辅助函数、常量表组织、算法实现。
- 注释与内部命名；日志只有 B17 注入 logger、B18 观测回调和 ChannelServer 的 `console.error`，
  文本格式不可变。
- 内部类/枚举的实现方式，但对外行为、错误 message/name、协议字节必须一致。

## 4. 必须逐字保留的部分（金样与断言以此为准）

1. **RPC 帧格式**：13 字节头 `type:u8 | id:u32BE | ack:u32BE | length:u32BE`；
   `ProtocolMessageType` 数值；VQL 标签与 7 位 varint（B4–B6）。
2. **MessagePort 控制对象**：`{__knorviaRpcControl:"connection-flow-v1", state:"saturated"|"drained"}`，
   恰好两个键；`send` 投递 `buffer.buffer`（B7）。
3. **协议常量**：PersistentProtocol 默认高水位 1 MiB、低水位高/4、replay 上限 8 MiB、grace 45 s、
   keepalive 5 s、ack 检查 20 s；`RECONNECT_DELAYS = [0,5,5,10,10,10,10,10,30]` 秒（B16）。
4. **错误文本**：`ChunkStream.skip(<n>) 超出可读范围`、`Cancelled`、`ChannelClient is disposed`、
   `ChannelClient disposed` + name `ConnectionClosed`、`Unknown channel: <name>` 与
   `Channel name '<name>' timed out after <delay>ms`、`Event not found: <name>`、
   `Method not found: <name>`、`No resolver registered for remote type: <type>`、
   `No socket factory found for <connection>`、provider 仓储与 runtime 的中文错误（B21–B28）。
5. **日志格式**：B17 的 `[rpc:register]`/`[rpc:call]`/`[rpc:listen]` 文案与一位小数耗时；
   B18 的观测字段与 `errorKind` 词表。
6. **环境变量与数据格式**：`KNORVIA_BUILTIN_PROVIDER_CONFIG_FILE`、
   `KNORVIA_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE`、`KNORVIA_PERSONAL_PROVIDER_CONFIG_FILE`、
   `provider_config.json`、`schemaVersion: 1` 的 provider 配置形状与键序（B21/B22/B30）。
7. **模型选择词表**：Start Plan / 内置账号 / off-peak 的 Provider ID 分类；25 条旧档位 rename
   的 `modelMatch` 与 `oldLevel`；只映射 `off`/`nothink`（B26）。
8. **示例输出**：B19 列出的稳定行是演示契约。

## 5. 观察到的旧行为特征（看起来奇怪，但按默认裁决「保持原样」）

| 行为                                                          | 旧实现事实（断言为准）                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `CancellationTokenSource.token.isCancellationRequested`（B2） | 恒为 `false`，包括 `cancel()` 之后；只有事件有效                                           |
| VQL 负数（B4）                                                | `-1` 编码为 5 字节 varint（`ffffffff0f`），按有符号 32 位回读仍为 `-1`；`-2147483648` 同理 |
| 嵌套 `Uint8Array` 标记（B4）                                  | 同时接受 `__zcode_rpc_nested_uint8array_v1`；标记对象必须恰好两个键，否则按普通对象保留    |
| `BufferReader.read(n)` 不足 n（B4）                           | 不抛错，返回可用字节并只前进可用长度                                                       |
| `Emitter.fire` 重入（B1）                                     | 对监听器快照迭代；本轮新增监听器不收到当前值                                               |
| `ProxyChannel.fromService.call` 同步抛错（B11）               | 方法本身同步抛出时从 `call` 同步抛出，而不是 rejected promise                              |
| `getDelayedChannel.listen` 的 promise 拒绝（B10）             | 事件永不触发且不暴露错误                                                                   |
| ChannelServer 未知 channel 的 EventListen（B9）               | 到点只 `console.error`，不回错误响应                                                       |
| ChannelServer.dispose 的 pending 定时器（B9）                 | 不清理尚未到点的 pending 定时器；到点仍会打印未知 channel                                  |
| RemoteAgentConnection 重连（B16）                             | 每次 socketClose 启动独立重连循环，可能重叠；dispose 不发 `disconnected`                   |
| 遥测 sink 抛错（B18）                                         | 错误向外传播，使 channel 调用拒绝（观测失败影响主流程）                                    |
| 遥测 `listen`（B18）                                          | 不产生观测                                                                                 |
| 日志中间件 logger 抛错（B17）                                 | 在内部注册/订阅之前调用，会阻止内部动作                                                    |
| Personal Repository 读取错误（B23）                           | 返回空快照而不是抛出；`onRecovery` 回调抛错被吞                                            |
| Model Selection 仓储 dispose（B25）                           | 不 dispose 共享 Personal Repository                                                        |

以上均不作为缺陷登记；替换阶段若「顺手修复」，会改变调用方可观察行为并违反合同。

## 6. src / dist 覆盖差异

- rpc 的 4 个示例固定 import `../src/index.js`，**只在源码入口**运行（B19）；dist 入口测试
  不重复启动示例。这是示例作为「源文件入口」的固有限制，不是跳过断言：示例的源码入口断言
  在两种跑法下都存在。
- `packages/rpc/dist` 与 `packages/provider-node/dist` 由 `npx tsc -p <包>` 生成；
  `scripts/contract-gate.mjs --build` 依赖 Windows 专用 pwsh 路径，本包在 Linux 上手动构建。
- 其余 B 条目在两个入口执行同一份测试，`entry.mjs` 只切换被加载的入口文件。

## 7. 与计划书红线的对照

- 不改协议字段、帧格式、环境变量、数据目录。
- 不放宽测试：B1–B30 在旧实现两个入口全部通过；桩替换必须 0 通过（见 `gate-old.json`）。
- 不复制旧代码：合同测试只通过公开入口观察行为；夹具是公开输出/文件的录制，不含实现代码。
- 不凑注释：本包合同文档只登记可执行行为与冻结面，不生成装饰性注释。
- 夹具只含合成数据（`fixtures/` 中无凭据、无真实用户数据、无内部地址）。

## 8. 预登记差异

合同定稿时预期为 **0**：所有 B 条目都在旧实现上通过，未跳过、未放宽。若旧门出现失败，
必须先按计划书「合同写错就改测试」通道修正合同并升版本，而不是就地放宽断言。
