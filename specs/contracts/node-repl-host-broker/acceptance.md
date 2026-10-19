// SPDX-License-Identifier: Apache-2.0

# node-repl-host-broker 合同验收记录（v1）

## 一、范围与口径

- 目标文件：`apps/cli/packages/node-repl-host/src/broker-transaction.ts`（65 行）。
- 伴生入口：`apps/cli/packages/node-repl-host/src/ipc.ts`（导出桶，仅在必要时同步）。
- 依据：`specs/knorvia-repl-transport.md`、issue #197、`docs/knorvia-independent-replacement-plan.md`「每包流程」。
- 与 `apps-cli-packages-02`（#189）边界：本包只返工上述事务文件，其他 `node-repl-host` 文件不在范围。

## 二、旧门结果（v1，`gate-old.json`）

| 项目                     | 结果                                          |
| ------------------------ | --------------------------------------------- |
| 用例数                   | 19                                            |
| 源码入口（`src/ipc.ts`） | 19 通过 / 0 失败                              |
| dist 入口                | 不适用（见下）                                |
| 跳过                     | 0                                             |
| 预登记差异               | 0（`known-differences.md` 为空）              |
| 主仓提交号               | `1091e45e…`（见 `gate-old.json` 的 `commit`） |
| Node                     | `v24.14.0`（`mise.toml` 固定版本）            |

命令：

```sh
node specs/contracts/node-repl-host-broker/tests/run-old-gate.mjs
```

**dist 入口说明**：`@knorvia/node-repl-host` 的构建只在 `dist-types/` 产出声明，并用 esbuild 把 `src/server.ts` 打成单个 `dist/mcp/server.js`；`broker-transaction` 与 `ipc` 不在 `package.json` 的 `exports` 中，也没有独立 dist 模块。兼容面由源码入口与全仓 `typecheck` 保证。`gate-old.json` 将该入口记为 `null` 并附原因。

## 三、合同门禁（合同 PR 本机）

合同 PR 只新增 `specs/contracts/node-repl-host-broker/**`，不触碰产品源码；执行：

- `node --import tsx --test --test-concurrency=1 specs/contracts/node-repl-host-broker/tests/*.test.ts` → 19/19。
- `pnpm fmt:check`、`pnpm lint`、`pnpm typecheck`、`pnpm provenance:check`。
- 具体输出与本包最终门禁一并记录在替换验收文档。

## 四、覆盖与未覆盖

已覆盖：信封身份覆盖、预连接快照、序列化失败（含宿主存活）、取消的三个时点、响应关联与全部失败分支、分片多字节响应、对端断连/拒绝连接、32 MiB 上限、并发隔离、每调用一条连接且不重试。

未覆盖：

1. 真实 MCP / Browser / Computer Use 服务端与真实桌面操作；契约测试只用本地 socket 与合成夹具，不含真实用户数据、凭据或内部地址。
2. Windows 命名管道行为由 CI 双平台运行 `test:studio` 验证；本机为 Linux。
3. `json-line.ts` 的帧解码细节（同包 `ipc-frame.test.ts` 与其规格保护），本合同只固化 `brokerCall` 可观察的边界错误。
4. dist 入口不适用，理由见第二节。
