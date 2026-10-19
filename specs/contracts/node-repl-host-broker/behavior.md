// SPDX-License-Identifier: Apache-2.0

# node-repl-host-broker 行为规格（v1）

本规格只覆盖 `brokerCall` 与 `BrokerConnection`。行为用本仓库自己的话描述；编号发布后不重用。时间断言只看事件顺序与终态，不用 sleep 或固定超时凑结果。

## B1 公开接口与状态所有权

- 模块路径：`apps/cli/packages/node-repl-host/src/broker-transaction.ts`。
- 导出：`interface BrokerConnection { socketPath: string; token: string }` 与
  `function brokerCall(connection: BrokerConnection, payload: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>>`。
- 稳定入口 `src/ipc.ts` 必须继续导出同名函数；`browser-bridge.ts` 与 `cua-bridge.ts` 的导入路径不变。
- 状态所有者：每次调用独占自己的 UUID、socket、错误转发状态与取消订阅；模块内不得持有跨调用的连接、响应或取消状态。
- 日志：本模块不读取环境变量、不写日志、不做遥测；失败原因只经 Promise 返回。
- 平台：`socketPath` 交给 Node `net.createConnection`，POSIX 使用文件系统 socket，Windows 使用命名管道；模块不拼接路径、不区分平台。

## B2 请求信封与预连接快照

- 输入：连接信息、业务载荷对象、调用方 `AbortSignal`。
- 输出：完整响应对象（见 B3）。
- 信封：先取一份载荷顶层快照，再以 `token` 与 `id` 覆盖同名字段；`id` 每次调用新生成 UUID，`token` 来自 `BrokerConnection`。业务载荷不能改变身份或审批字段。
- 序列化：连接建立前完成 JSON 序列化并追加一个换行。序列化必须产生字符串；`JSON.stringify` 结果为 `undefined` 时抛 `TypeError("Broker request is not JSON serializable")`，不得发送空请求、不得建立连接。
- 快照：调用返回的 Promise 进入等待前即已固定请求文本；调用方之后修改传入对象不改变已发出的请求。
- 取消：进入函数时与序列化完成后各检查一次调用方信号。序列化期间（例如 `toJSON` 内）触发的取消必须在建连前以同一 reason 拒绝。
- 副作用：序列化失败与预连接取消都不产生远端动作；本层不读取连接参数以外的状态。

## B3 响应关联与错误语义

- 读取：从 socket 读取一帧以换行结尾的 JSON（帧解码细节由 `json-line.ts` 与既有帧测试承担）。
- 关联：响应必须是对象（非 `null`）；其 `id` 必须与本次生成的 UUID 严格相等；`ok` 必须严格为 `true` 才视为成功。
- 成功：返回整个响应对象，保留 `id`、`ok` 与其余字段，不裁剪、不改写。
- 失败（终态，不重试可能的副作用）：
  - 非对象响应 → `Error("Invalid broker response")`；
  - `id` 不匹配 → `Error("Broker response id mismatch")`；
  - `ok === false` 且 `error` 为任意字符串（包括空串）→ 使用该字符串作为 `Error` 消息；
  - 其余非成功响应 → `Error("Broker rejected request")`。
- 非法 JSON 与帧边界错误由帧解码层抛出固定文案，本层不包装、不回显原始正文。

## B4 取消与连接生命周期

- 取消：调用方 `AbortSignal` 是唯一取消源。预连接取消见 B2；调度后的取消必须尽快让 Promise 以同一 reason 拒绝，并销毁本次连接。
- 写失败：连接建立后的写入异常或 socket 错误必须成为本次 Promise 的拒绝原因，不能变成未处理的 `error` 事件。
- 资源释放：成功、对端失败、取消或写入失败后都移除本次监听并销毁 socket；错误监听必须保留到 `close`，避免响应结束后的异步错误成为未处理事件。
- 对端失败：在换行前结束/关闭 → `Error("Broker closed before returning a response")`；连接被拒绝或路径不存在 → 保留 Node 的原始错误码（如 `ENOENT`、`ECONNREFUSED`）。
- 幂等：一次调用至多建立一条连接、至多发送一次请求；任何结果都不自动重试。Promise 只结算一次，后续事件不改变结果。
- 并发：多个调用互不共享 UUID、token、载荷、取消状态或响应。
- 日志：无。

## B5 帧边界与对端失败

- 宿主响应上限为 32 MiB（`32 * 1024 * 1024` 字节）。超限必须立即失败，消息为
  `Broker frame exceeded 33554432 bytes`，不保留完整正文，也不把正文回显到错误。
- 上限按首帧实际字节计算；换行后的同 chunk 数据不属于首帧（帧层行为，由既有测试保护）。
- 帧在换行前小于上限的部分被逐步解码；非法 UTF-8 按既有替代字符行为处理，不由本层重写。
- 本层不新增超时、重试、队列或缓存；截止时间由调用方信号提供。

## B6 并发隔离与平台边界

- 同一连接参数上的并发调用各自建立连接、生成 UUID、读取自己的响应；一个调用取消或失败不影响其他调用。
- 响应可能按任意字节边界分片，包括 UTF-8 多字节字符跨 chunk；按字节预算解码后仍得到同一 JSON 值。
- Windows 命名管道与 POSIX socket 使用同一入口；测试夹具按平台选择路径形式，不写死分隔符或绝对路径。
