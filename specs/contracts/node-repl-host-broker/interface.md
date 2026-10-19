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
