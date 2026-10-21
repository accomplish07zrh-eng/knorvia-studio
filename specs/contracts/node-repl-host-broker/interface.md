// SPDX-License-Identifier: Apache-2.0

# node-repl-host-broker 接口清单（v1）

只列兼容所需的模块路径、导出名、参数与返回类型。类型为名义兼容面，字段取值与错误语义见 `behavior.md`。

## 模块路径

| 模块路径                                                     | 兼容要求                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `apps/cli/packages/node-repl-host/src/broker-transaction.ts` | **必须保留**；实现可以重组内部结构，但 `BrokerConnection` 与 `brokerCall` 必须从此导出  |
| `apps/cli/packages/node-repl-host/src/ipc.ts`                | **必须保留** `export { brokerCall } from "./broker-transaction.js"`；两个桥接文件依赖它 |

`@knorvia/node-repl-host` 的 `package.json` 不把 `broker-transaction` 或 `ipc` 列为公开子路径；跨包调用方不应直接依赖它们。

## 导出

```ts
export interface BrokerConnection {
  socketPath: string;
  token: string;
}

export function brokerCall(
  connection: BrokerConnection,
  payload: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Record<string, unknown>>;
```

## 内部依赖（不作为兼容面）

- `node:crypto` 的 `randomUUID`：生成每次调用的请求 id。
- `node:net` 的 `createConnection`：建立单次本地连接。
- `./json-line.js` 的 `readFrame(socket, limit, signal)`：读取一帧并返回解析后的任意 JSON 值；本包不重写其实现。

## 常量

- 响应上限 `32 * 1024 * 1024` 字节。该值不是公开导出，但行为（B5）与错误文案属于兼容面。

## 返工兼容面（M6 重扫，2026-10-21）

> 本节登记「历史继承文件里必须逐字保留的公开契约名」，供 `--contract-lines` 剔除使用。
> **本节不宣称该文件属于本包范围** —— 本包原「在范围」仍只有 `broker-transaction.ts` 与 `ipc.ts`。
>
> 表格内**只放文件名与契约名**：`--contract-lines` 会提取整份 `interface.md` 表格行里的全部标识符，
> 混入实现细节会让剔除范围失真（实测：说明列里的实现名会被误剔，多剔 3 行）。

| 文件                           | 兼容名                                                                                                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtime-bridge.ts`            | `NodeReplBrowserRuntimeBridge` `documentationRoot` `assertAvailable` `readNodeReplBrowserRuntimeBridge` `NODE_REPL_BROWSER_BRIDGE_SYMBOL` `BROWSER_UNAVAILABLE_IN_SUBAGENT_MESSAGE`                         |
| `browser-broker-connection.ts` | `sessionId` `turnId` `browserId` `browserGeneration` `command` `id` `ok`                                                                                                                                    |
| `browser-control-broker.ts`    | `createProtocolBrowserControlBroker` `BrowserControlPort`                                                                                                                                                   |
| `executor.ts`                  | `NodeReplExecuteInput` `NodeReplExecutor` `WORKER_KIND` `createInProcessNodeReplExecutor` `NodeReplRunResult` `NodeReplRequestMeta` `NodeReplCuaBrokerConnection` `requestMeta` `syncTimeoutMs` `cuaBroker` |
| `mcp-runtime.ts`               | `NodeReplMcpRuntime` `NodeReplRuntimeOptions` `createMcpRuntime` `executeJs` `cuaRuntime` `windowsRuntime`                                                                                                  |

### 为什么这些名字不能改名（证据，不属于剔除依据）

6 个名字全部有跨文件引用，其中 `readNodeReplBrowserRuntimeBridge` 与
`NodeReplBrowserRuntimeBridge` 被跨包直接 import
（`apps/cli/packages/browser-use-plugin/src/browser-client.ts`）；
`NODE_REPL_BROWSER_BRIDGE_SYMBOL` 的字符串是两个执行单元之间的交接键；
`BROWSER_UNAVAILABLE_IN_SUBAGENT_MESSAGE` 的文案会被 UI 显示；
`documentationRoot` 与 `assertAvailable` 是 `BrowserClientTransport` 的实现面。

### 实现部分已真重写

该文件的实现部分已重写（不是靠剔除蒙过），重写前后的实测值与逐条改动说明见
`docs/knorvia-kernel-m6-rework-acceptance.md` 第四节。
