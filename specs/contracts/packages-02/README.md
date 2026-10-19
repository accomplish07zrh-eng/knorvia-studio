# packages-02 合同（`packages/rpc` · `packages/provider-node/src`）

**合同版本：v1**（2026-10-19，分支 `contract/packages-02`，issue #191）
本目录是 M3 替换包 `packages-02` 的**兼容合同**：先冻结公开行为与签名，再按合同独立实现。
第一阶段只写合同，不改 `packages/rpc`、`packages/provider-node` 的产品源码。

- 工作树：`/workspace/wt-pk02`
- 分支：`contract/packages-02` → 替换阶段 PR 标题 `contract: packages-02 v1`
- 依据：《Knorvia 独立替换任务计划书》「每包流程」一～三、分包总表 `packages-02` 行；
  `specs/knorvia-independent-implementation.md`；`specs/knorvia-internal-plugins.md`
- 第三方核实结论：`docs/knorvia-third-party-verification-20261011.md` 的「VS Code IPC 派生代码」小节
  （M0-6）：VS Code 固定版本 `44825207bf4389c3bd17c92d3ec28cf784c324cc`，范围 21 个文件，
  **一致 0、ZCode 改过 13、无上游 8**。本包取其中 `packages/rpc/src` 与 `packages/rpc/examples`
  的 20 个文件重写；`packages/shared/src/protocol-v4/wire-codec.ts` 属 `shared-01`，不在本包。

## 一、范围与边界

范围 = issue #191 登记的 `packages/rpc/**`（22 个继承文件）与
`packages/provider-node/src/**`（11 个继承文件）中的继承代码。

| 位置                         | 继承文件 | 本包处置                                                                                      |
| ---------------------------- | -------: | --------------------------------------------------------------------------------------------- |
| `packages/rpc`               |       22 | 16 个 `src/*.ts` + 4 个 `examples/*.ts` 按合同重写；`package.json`/`tsconfig.json` 只保持配置 |
| `packages/provider-node/src` |       11 | 9 个继承模块按合同重写；`package.json`/`tsconfig.json` 只保持配置                             |
| **需重写合计**               |   **29** | 20 rpc + 9 provider-node；逐文件清单见 [`scope-files.json`](scope-files.json)                 |

**不在本包重写范围**（但仍在冻结导出面内，替换时不得改变行为）：

- `packages/provider-node/src` 的 7 个 builtin 模块（`builtin-cache-paths`、`builtin-download`、
  `builtin-provider-config-materializer`、`builtin-provider-config-source`、`builtin-release`、
  `builtin-remote-synchronizer`、`endpoint-scoped-builtin-source`）：已由
  `packages/provider-node/docs/BUILTIN-*` 系列证据登记为独立实现。
- `packages/provider-node/src/index.ts`：re-export 桶，licensing 记为 original；其导出面由
  [`interface.md`](interface.md) 冻结。
- `packages/rpc/test/**`、`packages/provider-node/test/**`：测试资产，不在产品代码重写范围。
- `packages/provider`（`@knorvia/provider`）与 `packages/shared`：其它包，只按公开入口消费。

本包**不改变**：RPC 帧格式与协议字段、`KNORVIA_` 环境变量、provider 配置文件格式与数据目录、
`provider_config.json` 文件名、`builtin.json` 布局、模型选择/推理档位映射。

## 二、VS Code 派生逐文件结论与登记

M0-6 结论（逐文件表见 `docs/knorvia-third-party-verification-20261011.md`）：

| 文件                                      | 上游路径（固定版本）                                       | 结论       | 本包处置                    |
| ----------------------------------------- | ---------------------------------------------------------- | ---------- | --------------------------- |
| `rpc/src/buffer.ts`                       | `src/vs/base/common/buffer.ts`                             | ZCode 改过 | 按合同重写                  |
| `rpc/src/channelClient.ts`                | `src/vs/base/parts/ipc/common/ipc.ts`                      | ZCode 改过 | 按合同重写                  |
| `rpc/src/channels.shared.ts`              | `src/vs/base/parts/ipc/common/ipc.ts`                      | ZCode 改过 | 按合同重写                  |
| `rpc/src/channelServer.ts`                | `src/vs/base/parts/ipc/common/ipc.ts`                      | ZCode 改过 | 按合同重写                  |
| `rpc/src/delayedChannel.ts`               | `src/vs/base/parts/ipc/common/ipc.ts`                      | ZCode 改过 | 按合同重写                  |
| `rpc/src/foundation.ts`                   | `src/vs/base/common/event.ts`                              | ZCode 改过 | 按合同重写                  |
| `rpc/src/index.ts`                        | `src/vs/base/parts/ipc/common/ipc.ts`                      | ZCode 改过 | 按合同重写（导出面冻结）    |
| `rpc/src/ipc.ts`                          | `src/vs/base/parts/ipc/common/ipc.ts`                      | ZCode 改过 | 按合同重写                  |
| `rpc/src/persistent-protocol.ts`          | `src/vs/base/parts/ipc/common/ipc.net.ts`                  | ZCode 改过 | 按合同重写                  |
| `rpc/src/protocol.ts`                     | `src/vs/base/parts/ipc/common/ipc.net.ts`                  | ZCode 改过 | 按合同重写                  |
| `rpc/src/proxy-channel.ts`                | `src/vs/base/parts/ipc/common/ipc.ts`                      | ZCode 改过 | 按合同重写                  |
| `rpc/src/remote.ts`                       | `src/vs/platform/remote/common/remoteAuthorityResolver.ts` | ZCode 改过 | 按合同重写                  |
| `rpc/src/serialization.ts`                | `src/vs/base/parts/ipc/common/ipc.ts`                      | ZCode 改过 | 按合同重写                  |
| `rpc/src/channels.ts`                     | —                                                          | 无上游     | 视同 ZCode 代码重写         |
| `rpc/src/logging-middleware.ts`           | —                                                          | 无上游     | 视同 ZCode 代码重写         |
| `rpc/src/network-telemetry-middleware.ts` | —                                                          | 无上游     | 视同 ZCode 代码重写         |
| `rpc/examples/01-basic-ipc.ts`            | —                                                          | 无上游     | 视同 ZCode 代码重写         |
| `rpc/examples/02-proxy-channel.ts`        | —                                                          | 无上游     | 视同 ZCode 代码重写         |
| `rpc/examples/03-ipc-server-client.ts`    | —                                                          | 无上游     | 视同 ZCode 代码重写         |
| `rpc/examples/04-remote-connection.ts`    | —                                                          | 无上游     | 视同 ZCode 代码重写         |
| `shared/src/protocol-v4/wire-codec.ts`    | —                                                          | 无上游     | **不在本包**（`shared-01`） |

**没有任何 rpc 文件与上游逐字节一致**，因此不存在「登记为 third-party 且原样保留」的文件。
上游 MIT 许可的范围说明（`third-party/inventory.json` 与 licensing 的
`Visual Studio Code IPC and common utilities`）继续保留；替换阶段若保留上游逐字段结构，
只作为协议兼容事实登记，不把重写代码声称为 Microsoft 作品。

`licensing/current-files.json` 与 M0-6 在 `channels.shared.ts`、`channels.ts`、
`delayedChannel.ts`、`index.ts` 四个文件上的分类不一致；按任务书默认裁决
「不确定 → 按 ZCode 改过处理」，本包一律重写，见 [`known-differences.md`](known-differences.md) §1。

## 三、兼容面（公开入口）

| 包                       | 源入口                                | dist 入口（`tsc -p <包>` 产物）        | 导出项                                   |
| ------------------------ | ------------------------------------- | -------------------------------------- | ---------------------------------------- |
| `@knorvia/rpc`           | `packages/rpc/src/index.ts`           | `packages/rpc/dist/index.js`           | 70 条导出 / 70 个唯一名（39 个运行时值） |
| `@knorvia/provider-node` | `packages/provider-node/src/index.ts` | `packages/provider-node/dist/index.js` | 49 条导出（31 个运行时值 + 18 个纯类型） |

- 两个入口都是 **re-export 桶**：内部文件如何拆分由替换 Agent 决定，导出名、类型、运行时值
  必须一一对应；`packages/rpc/examples/**` 不是包入口但属于合同行为（B19）。
- `RequestType` / `ResponseType` / `HEADER_SIZE` 不在一级导出面（旧实现事实），替换时不得新增
  或删除一级导出；内部模块路径兼容面按 B20/B29 断言。
- 逐项清单见 [`interface.md`](interface.md)。

## 四、调用方

[`callers.md`](callers.md)：`@knorvia/rpc` 被 **121 个源文件** import（services 79、desktop 15、
server 12、ui 9、server-cli 3、client 3）；`@knorvia/provider-node` 被 **7 个源文件** import
（apps/cli bootstrap/cli、services、desktop 打包配置）。替换后这些 import 必须继续可解析。

## 五、计划书对本包的额外要求（已落实）

1. **VS Code 派生核实**：§二逐文件表；未重写的登记文件为零。
2. **协议字段与帧格式不变**：B5–B7 用录制帧断言 13 字节头、消息类型编号、VQL 标签与
   MessagePort 控制标记。
3. **存储/配置往返**：B22/B23/B30 覆盖 provider 配置文件
   「旧写 → 新读 → 新写 → 旧读」；夹具由旧实现录制并冻结在 `fixtures/`。
4. **src + dist 双入口**：`tests/entry.mjs` 用 `KNORVIA_PACKAGES_02_ENTRY=dist` 切换；
   rpc 的示例是源文件入口（`examples/*.ts` 固定 import `../src/index.js`），B19 只在源码入口跑。

## 六、合同文件

| 文件                   | 内容                                                                    |
| ---------------------- | ----------------------------------------------------------------------- |
| `README.md`            | 本文件：范围、第三方结论、条目 → 测试对照表、旧门结论                   |
| `scope-files.json`     | 29 个重写文件的路径、行数、sha256、licensing/M0 分类                    |
| `behavior.md`          | B1–B30：输入/输出/错误/时序/并发/幂等/资源释放/平台/状态所有者/日志级别 |
| `interface.md`         | 两个入口的冻结导出面（逐名、逐类型）                                    |
| `callers.md`           | 全仓调用方清单与分组计数                                                |
| `tests/`               | 13 个黑盒契约测试文件（`entry.mjs` 支持源码/dist 两入口）               |
| `fixtures/`            | 旧实现录制的 wire、配置往返与错误样例                                   |
| `stubs/`               | 29 个重写目标的最小桩（import 即抛）+ `targets.txt`                     |
| `known-differences.md` | 分类差异、必须逐字保留的部分、旧行为特征                                |
| `acceptance.md`        | 验收记录：范围、旧门两入口、桩替换、门禁、未覆盖项                      |
| `gate-old.json`        | 旧门报告（`scripts/contract-gate.mjs` 生成）                            |

## 七、条目 → 测试对照表

| 条目                               | 测试（`tests/` 下，只走公开入口）        |
| ---------------------------------- | ---------------------------------------- |
| B1 Foundation 原语                 | `rpc-foundation.test.mjs`「B1 …」        |
| B2 CancellationTokenSource         | 同上「B2 …」                             |
| B3 VSBuffer                        | 同上「B3 …」                             |
| B4 VQL 序列化                      | 同上「B4 …」                             |
| B5 ChunkStream 与帧头              | `rpc-wire.test.mjs`「B5 …」              |
| B6 SocketProtocol 分帧             | 同上「B6 …」                             |
| B7 MessagePortProtocol             | 同上「B7 …」                             |
| B8 ChannelClient                   | `rpc-channels.test.mjs`「B8 …」          |
| B9 ChannelServer                   | 同上「B9 …」                             |
| B10 getDelayedChannel              | 同上「B10 …」                            |
| B11 ProxyChannel.fromService       | `rpc-proxy.test.mjs`「B11 …」            |
| B12 ProxyChannel.toService         | 同上「B12 …」                            |
| B13 IPCServer/IPCClient            | `rpc-ipc-remote.test.mjs`「B13 …」       |
| B14 StaticRouter                   | 同上「B14 …」                            |
| B15 远程解析/工厂/URI              | 同上「B15 …」                            |
| B16 RemoteAgentConnection          | 同上「B16 …」                            |
| B17 日志中间件                     | `rpc-middleware.test.mjs`「B17 …」       |
| B18 网络遥测中间件                 | 同上「B18 …」                            |
| B19 示例程序                       | `rpc-examples.test.mjs`「B19 …」         |
| B20 rpc 导出面与模块路径           | `rpc-surface.test.mjs`「B20 …」          |
| B21 运行时路径与环境变量           | `provider-paths-codec.test.mjs`「B21 …」 |
| B22 Provider Config 编解码         | 同上「B22 …」＋`B30 …`                   |
| B23 Personal Provider Config 仓储  | `provider-repository.test.mjs`「B23 …」  |
| B24 轮询与 dispose                 | 同上「B24 …」                            |
| B25 Model Selection Config 仓储    | 同上「B25 …」                            |
| B26 模型选择门面与旧档位映射       | `provider-facade.test.mjs`「B26 …」      |
| B27 Provider Config Runtime        | `provider-runtime.test.mjs`「B27 …」     |
| B28 Provider Registry Runtime      | 同上「B28 …」                            |
| B29 provider-node 导出面与模块路径 | `provider-surface.test.mjs`「B29 …」     |
| B30 配置往返                       | `provider-paths-codec.test.mjs`「B30 …」 |

## 八、旧门（旧实现上的结论）

```bash
# 仓库根目录；dist 需先手动构建（--build 走 Windows 专用 pwsh，Linux 不可用）
npx tsc -p packages/rpc
npx tsc -p packages/provider-node
node scripts/contract-gate.mjs --contract specs/contracts/packages-02 \
  --tests "*.test.mjs" --dist-env KNORVIA_PACKAGES_02_ENTRY=dist \
  --stub-root specs/contracts/packages-02/stubs \
  --stub-targets specs/contracts/packages-02/stubs/targets.txt
```

- 源码入口与 dist 入口的实际数字、桩替换结果见 [`gate-old.json`](gate-old.json) 与
  [`acceptance.md`](acceptance.md)。
- 预登记差异：0；跳过：0；断言未放宽。

## 九、运行契约测试（两个入口）

```bash
# 源码入口
node --import tsx --test "specs/contracts/packages-02/tests/*.test.mjs"

# dist 入口（先构建两个包）
KNORVIA_PACKAGES_02_ENTRY=dist node --import tsx --test "specs/contracts/packages-02/tests/*.test.mjs"
```

## 十、计分口径（替换阶段）

- 实现文件：相似度工具**普通模式**（行 + 结构两道门槛）。
- 纯声明与桶文件：`--declaration --interface specs/contracts/packages-02/interface.md`。
- provider-node 的 7 个已登记独立实现不参与本包重写计分；配置文件不计分。
