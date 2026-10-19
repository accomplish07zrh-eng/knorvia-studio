// SPDX-License-Identifier: Apache-2.0

# node-repl-host-broker 合同（v1）

**合同版本：v1**（2026-10-19）。条目编号发布后不重用；改动合同必须重跑旧门并升版本。

单文件返工包：`apps/cli/packages/node-repl-host/src/broker-transaction.ts`（含同包内为保持公开入口不变的伴生导出文件 `src/ipc.ts`）。本包替代 M0 期间按 `specs/knorvia-repl-transport.md` 完成的 REPL 传输重写中“单次连接事务”这一实现；相似度工具防刷修复（#196）后该文件对上游的规范化行包含率为 0.205，超过 0.2 门槛，按 issue #197 返工。

- 分支：`contract/node-repl-host-broker`（基线 `origin/main` @ `1091e45e`）；替换分支 `replace/node-repl-host-broker`。
- 认领 issue：#197（父汇总 #124）。
- 依据：`specs/knorvia-repl-transport.md`「状态与所有者」「字节与响应契约」「验收」；`docs/knorvia-independent-replacement-plan.md`「每包流程」。
- 相似度工具：`node scripts/provenance/similarity.mjs --repo . --candidate <文件> --old <同路径> --old-rev <main 当前提交> --upstream-dir /workspace/ktools/zcode-upstream`。两道门槛：包含率 < 0.2、最长相同段 < 8、结构相似度 < 0.4。

## 一、范围

### 1. 在范围

| 文件                                                         | 现状                     | 本包动作                             |
| ------------------------------------------------------------ | ------------------------ | ------------------------------------ |
| `apps/cli/packages/node-repl-host/src/broker-transaction.ts` | 65 行，单次请求/响应事务 | 完全重写，保留公开接口与行为         |
| `apps/cli/packages/node-repl-host/src/ipc.ts`                | 4 行导出桶               | 仅在导出面需要时同步，不作为重写目标 |

`ipc.ts` 是 `brokerCall` 与 `readFrame` 的稳定宿主入口；`browser-bridge.ts`、`cua-bridge.ts` 通过它调用。帧解码（`json-line.ts`）不属于本包，本包只把它当作既有边界使用。

### 2. 不在范围

- `src/json-line.ts`（增量字节帧解码；其行为由 `specs/knorvia-repl-transport.md` 与既有 `test/ipc-frame.test.ts` 保护）。
- `src/request-context.ts`（身份投影）与 `src/browser-bridge.ts`、`src/cua-bridge.ts` 的业务投影。
- broker 服务端、真实 MCP / Browser / Computer Use 进程、环境变量读取与 socket 路径解析（调用方负责）。
- 不改协议字段、错误文案、32 MiB 上限、重试策略（本层不重试副作用）。

### 3. 与 issue #189 的边界

#189（`apps-cli-packages-02`）覆盖 `node-repl-host` 其余继承文件；本包只返工 `broker-transaction.ts`，不顺手改同包其他实现。

## 二、文件

| 文件                     | 内容                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `behavior.md`            | 行为规格 B1–B6（九项：输入/输出/错误/时序并发/幂等/资源释放/平台/状态所有者/日志） |
| `interface.md`           | 兼容面：模块路径、导出名与签名                                                     |
| `callers.md`             | 仓库内调用方清单                                                                   |
| `tests/`                 | 黑盒契约测试（node:test，只经 `src/ipc.ts` 公开入口调用 `brokerCall`）             |
| `tests/run-old-gate.mjs` | 旧门执行器：在旧实现上跑契约测试并生成 `gate-old.json`                             |
| `known-differences.md`   | 预登记差异（当前为空）                                                             |
| `acceptance.md`          | 旧门结果、门禁、未覆盖内容                                                         |
| `gate-old.json`          | 旧门记录：用例数、通过/失败、入口、主仓提交号                                      |
| `design.md`              | 替换实现的状态所有者、模块划分与事件顺序（替换阶段补写）                           |

## 三、入口说明

`@knorvia/node-repl-host` 的构建只在 `dist-types/` 产出声明，并用 esbuild 把 `src/server.ts` 打成单个 `dist/mcp/server.js`；`broker-transaction` 没有独立的 dist 模块，也不在 `package.json` 的 `exports` 中。兼容性由源码入口 `src/ipc.ts` 与全仓 `typecheck` 保证。因此本合同旧门只有源码入口；这与包含独立 dist 入口的包不同，记录在 `gate-old.json`。

## 四、运行契约测试

```sh
# 源码入口（契约测试经 src/ipc.ts 导入 brokerCall）
node --import tsx --test --test-concurrency=1 specs/contracts/node-repl-host-broker/tests/*.test.ts

# 旧门并生成 gate-old.json（当前实现上运行）
node specs/contracts/node-repl-host-broker/tests/run-old-gate.mjs
```

## 五、旧门结果（v1）

见 `gate-old.json` 与 `acceptance.md`。

## 六、条目 → 测试对照表

| 条目                    | 测试 · 用例                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 公开接口与状态所有权 | `broker-transaction.test.ts`「B1 公开入口只暴露 brokerCall / BrokerConnection，一次调用拥有自己的连接与 UUID」                                                    |
| B2 请求信封与预连接快照 | 同文件「B2 信封固定覆盖 id/token，序列化先于连接且载荷不被改写」「B2 请求是调用时的快照」「B2 不可序列化的载荷先拒绝且不连接」「B2 序列化期间的取消先于连接生效」 |
| B3 响应关联与错误语义   | 同文件「B3 响应必须是对象且 id 精确匹配，失败错误保持原文或固定文案」「B3 成功的多字节分片响应按帧关联并原样返回」                                                |
| B4 取消与连接生命周期   | 同文件「B4 调度后的取消销毁连接并保留 reason，不重试」「B4 对端断连与拒绝连接明确失败」「B4 序列化异常不会结束宿主进程」                                          |
| B5 帧边界与对端失败     | 同文件「B5 超过 32 MiB 的响应有界失败且不回显正文」；EOF 与非法 JSON 由「B4 对端断连…」与既有 `ipc-frame` 测试共同覆盖                                            |
| B6 并发隔离与平台边界   | 同文件「B6 并发事务隔离 UUID、载荷与取消状态」；路径形式由 `brokerFixture` 在 Windows 命名管道与 POSIX socket 上分别创建                                          |

每条 B 至少一个断言；表中没有空行。
