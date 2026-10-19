// SPDX-License-Identifier: Apache-2.0

# node-repl-host-broker 调用方清单（v1）

扫描范围：仓库内 `apps/cli` 与 `packages` 下的 TypeScript / MJS 源码与测试（排除 `node_modules` 与构建产物）。`dep:refs --list-exports` 确认该文件对外只有两个导出。

## 生产调用方

| 调用方                                                   | 使用方式                                               | 说明                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| `apps/cli/packages/node-repl-host/src/ipc.ts`            | `export { brokerCall } from "./broker-transaction.js"` | 稳定宿主入口；同时导出帧读取与身份投影                                |
| `apps/cli/packages/node-repl-host/src/browser-bridge.ts` | `import { brokerCall, callContext } from "./ipc.js"`   | 浏览器桥：`list` / `execute`，把身份投影合并进 payload 后执行单次调用 |
| `apps/cli/packages/node-repl-host/src/cua-bridge.ts`     | `import { brokerCall, callContext } from "./ipc.js"`   | Computer Use 桥：`method` / `input` / `context` 单次调用              |

两个桥都通过 `ExecutionBinding` 在 I/O 边界检查调用代际、子 Agent 限制与取消信号；本模块不重复这些业务判断。

## 测试调用方

| 调用方                                                   | 说明                                        |
| -------------------------------------------------------- | ------------------------------------------- |
| `apps/cli/packages/node-repl-host/test/ipc-call.test.ts` | 既有事务测试（17 例，覆盖旧实现的行为边界） |
| `specs/contracts/node-repl-host-broker/tests/*.test.ts`  | 本合同的永久契约测试（旧门与新实现共用）    |

`ipc-frame.test.ts` 与 `ipc-context.test.ts` 通过 `ipc.ts` 使用同入口的 `readFrame` / `callContext`，不直接调用 `brokerCall`。

## 非调用方

`packages/rpc/src/ipc.ts` 是另一套 RPC 框架的同名模块，与本包无关。
