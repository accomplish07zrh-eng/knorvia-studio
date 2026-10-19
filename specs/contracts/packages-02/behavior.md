# packages-02 行为规格（v1）

范围：`packages/rpc` 的 20 个继承代码文件与 `packages/provider-node/src` 的 9 个继承模块
（清单见 `scope-files.json`）。编号发布后不重用；每条行为在 README 的「条目 → 测试」对照表里
至少有一个断言。

黑盒入口：

| 入口                     | 源文件                                | dist 文件（`tsc -p <包>` 产物）        |
| ------------------------ | ------------------------------------- | -------------------------------------- |
| `@knorvia/rpc`           | `packages/rpc/src/index.ts`           | `packages/rpc/dist/index.js`           |
| `@knorvia/provider-node` | `packages/provider-node/src/index.ts` | `packages/provider-node/dist/index.js` |

rpc 的 4 个示例是独立进程入口（固定 import `../src/index.js`），按 B19 以源码方式跑。

通用约定（适用于所有条目）：

- **时序与并发**：rpc 的协议对象有定时器（PersistentProtocol 5s keepalive / 20s ack check），
  由 `dispose()` 释放；provider 仓储的轮询定时器 `unref`。除此之外没有后台任务。
- **幂等**：dispose / 释放函数 / 取消一律可重复调用且第二次安静；其余条目单独写明。
- **资源释放**：协议监听、事件订阅、定时器、文件锁与临时文件在对应条目里写明。
- **日志级别**：rpc 只通过注入的 logger 输出（B17/B18），唯一例外是 ChannelServer 未知 channel
  使用 `console.error`；provider-node 不写日志，错误以返回值、回调或抛错交给调用方。
- **平台差异**：所有文件 IO、路径与换行按 Node 跨平台语义；POSIX 权限位由
  `@knorvia/shared/node` 的原子写负责，本包不另做平台分支。
- **状态所有者**：rpc 的协议对象拥有连接/重连/饱和状态；provider-node 的 Repository/Runtime
  拥有缓存与生命周期，`@knorvia/provider` 拥有配置合并与选择解析。调用方拥有 channel 服务。

---

## 一、rpc：基础值与序列化（B1–B4）

**B1 Foundation 原语**（`foundation.ts`）
输入：`toDisposable(fn)`、`DisposableStore`、`Event`/`Event.None`/`once`/`toPromise`/`filter`/`map`、
`Emitter`、`Relay`、`EventMultiplexer`。
输出：`toDisposable` 只调用一次 `fn`；`DisposableStore.add` 返回原对象，dispose 按加入顺序逐个
dispose 并清空；dispose 后再 `add` 会 `console.warn("Adding to a disposed DisposableStore")`
并立即 dispose 新对象；`Event.once` 至多触发一次且在回调前释放订阅；`Emitter.event` 的
first/last listener 钩子分别在 0→1、1→0 时触发，`fire` 对监听器数组做快照（回调内增删监听器
不影响本轮），dispose 后订阅得到空 disposable、fire 无效；`Relay.set input` 先释放旧订阅；
`EventMultiplexer.dispose` 释放全部输入。
错误语义：不主动抛错。
时序与并发：同步通知；快照语义见上。
幂等：释放函数与 `dispose` 幂等。
资源释放：见各对象 dispose。
平台差异：无。
状态所有者：监听器集合归 Emitter；调用方拥有订阅生命周期。
日志级别：唯一日志是上述 `console.warn`。

**B2 CancellationTokenSource**（`foundation.ts`）
输入：`token`、`cancel()`、`dispose()`。
输出：token 首次读取后缓存；`onCancellationRequested` 在 `cancel` 时触发一次，第二次 `cancel`
不再触发。`CancellationToken.None` 是 `foundation.ts` 模块内部值，一级入口只有
`CancellationToken` 类型；本条目只冻结入口可见的 `CancellationTokenSource` 行为。
错误语义：无。
时序与并发：同步触发；`cancel` 前已订阅的监听器都收到。
幂等：`cancel` 幂等。
资源释放：`dispose` 释放 emitter，之后订阅得到空 disposable。
平台差异：无。
状态所有者：source 拥有取消状态。
日志级别：无。
**旧行为特征（必须保留）**：`token.isCancellationRequested` 恒为 `false`，包括 `cancel()` 之后；
不要「修复」为 true（现有调用方依赖「订阅事件」而非该标志）。

**B3 VSBuffer**（`buffer.ts`）
输入：`alloc(n)`、`wrap(u8)`、`fromString(s)`、`concat(buffers, totalLength?)`、实例
`toString/slice/set/readUInt8/writeUInt8/readUInt32BE/writeUInt32BE`。
输出：`alloc` 零填充；`wrap` 保持底层 `Uint8Array` 同一性；`fromString` 使用 UTF-8；
`concat` 按顺序复制到新缓冲区（显式 `totalLength` 会作为结果长度，溢出由 `Uint8Array.set` 抛
`RangeError`）；`slice` 复制（不是视图）；`readUInt32BE` 返回无符号数；写读对称。
错误语义：越界读写沿用 `Uint8Array` 语义（读取越界为 `undefined`，写入越界静默丢弃）。
时序与并发：纯同步、无共享状态。
幂等：读写为纯操作；`set/write*` 由调用方决定。
资源释放：无。
平台差异：无（`TextEncoder`/`TextDecoder`）。
状态所有者：字节数组归实例。
日志级别：无。

**B4 VQL 序列化**（`serialization.ts`）
输入：`serialize(writer, value)` / `deserialize(reader)`；`BufferReader.read(n)`、`BufferWriter.write`。
输出：标签字节固定为 Undefined=0、String=1、Buffer=2、VSBuffer=3、Array=4、Object=5、Int=6。

- Undefined：`0x00`；String：`0x01` + VQL 字节长 + UTF-8；`Uint8Array`/`Buffer`：`0x02` +
  VQL 长度 + 原始字节，反序列化返回 `Uint8Array`；`VSBuffer`：`0x03`；Array：`0x04` + VQL
  元素数 + 逐元素；Object：`0x05` + VQL JSON 长度 + JSON UTF-8；Int：`0x06` + VQL。
- VQL 为 7 位一组、低位在前、最高位为续位；0 编码为单字节 `0x00`。
- 只有满足 `(value | 0) === value` 的 number 走 Int；VQL 用有符号 32 位位运算回读，
  `-1`、`-2147483648` 等整数按原值往返；非整数走 JSON Object。
- JSON 路径中的 `Uint8Array` 用标记对象 `{"__knorvia_rpc_nested_uint8array_v1":true,"base64":...}`
  编码；反序列化同时接受旧标记 `__zcode_rpc_nested_uint8array_v1`，且标记对象必须**恰好两个键**，
  否则按普通对象保留。
- `BufferReader.read` 返回 `slice`（复制）并前进实际读到的字节数（不足时按可用字节前进）；
  `BufferWriter.buffer` 每次 getter 重新 `concat`。
  错误语义：非法标签返回 `undefined`；JSON 解析错误原样抛出；VQL 无上限保护。
  时序与并发：纯同步。
  幂等：序列化结果确定；反序列化不修改输入。
  资源释放：无。
  平台差异：无（UTF-8）；base64 优先用 `Buffer`，否则用 `btoa/atob`。
  状态所有者：读写位置归 Reader；Writer 拥有片段数组。
  日志级别：无。

---

## 二、rpc：传输与协议（B5–B7）

**B5 ChunkStream 与帧头**（`protocol.ts`）
输入：`ChunkStream.acceptChunk/peek/read/skip`；`ProtocolMessage`；`ProtocolMessageType`。
输出：`peek(n)`/`read(n)` 在累计字节不足时返回 `null`，否则返回连续 n 字节（跨 chunk 自动拼接）；
`read` 消耗字节并压缩 chunk 列表；`skip(n)` 等价 `read` 后丢弃，不足时抛
`ChunkStream.skip(<n>) 超出可读范围`。`ProtocolMessageType`：None=0、Regular=1、Control=2、
Ack=3、Disconnect=5、ReplayRequest=6、Pause=7、Resume=8、KeepAlive=9（4 缺省跳过）。
帧头固定 13 字节：`type:u8 | id:u32BE | ack:u32BE | length:u32BE`，body 紧随其后；
`ProtocolMessage.byteLength = 13 + data.byteLength`。
错误语义：见 skip；其余不抛。
时序与并发：纯同步。
幂等：peek 不消费；read 消费一次。
资源释放：无。
平台差异：无。
状态所有者：ChunkStream 拥有字节队列。
日志级别：无。

**B6 SocketProtocol 分帧**（`protocol.ts`）
输入：实现 `ISocket`（`onData/onClose/onEnd/write/end/drain`）的 socket；`send`、`dispose`。
输出：接收侧按 13 字节头解析，支持一帧跨多个 chunk、一个 chunk 含多帧；只有 Regular 帧通过
`onMessage` 发出；零长度 Regular 帧发出 0 字节 `VSBuffer`；Control/Ack/Disconnect/Replay 等
非 Regular 帧被消费但不发消息；发送侧把任意 buffer 包成 `Regular(id=0, ack=0)`。
错误语义：不向调用方抛协议错误；`onClose`/`onEnd` 不转发。
时序与并发：数据到达即同步分发。
幂等：`dispose` 幂等（释放订阅与 emitter）。
资源释放：dispose 只移除 socket 数据订阅，**不调用** `socket.dispose()`（socket 归调用方）。
平台差异：无。
状态所有者：协议拥有 chunk 缓冲；socket 归调用方。
日志级别：无。

**B7 MessagePortProtocol**（`protocol.ts`）
输入：`MessagePortLike`；`send/sendFlowState/disconnect`。
输出：构造时 `addEventListener("message", handler)` 并 `start()`；payload 为**恰好两个键**且
`__knorviaRpcControl === "connection-flow-v1"`、`state` 为 `saturated|drained` 的对象时触发
`onFlowState`，不触发 `onMessage`；`Uint8Array` payload 以 `VSBuffer.wrap` 保持同一性后触发
`onMessage`；其他 payload 忽略。`send` 以 `buffer.buffer` 作为二进制消息投递；
`sendFlowState` 投递上述控制对象。
错误语义：无。
时序与并发：同步分发。
幂等：`disconnect` 移除监听、`close()`、dispose 两个 emitter；调用方只调用一次。
资源释放：见 disconnect。
平台差异：浏览器/Node worker 的 MessagePort 语义一致。
状态所有者：port 归调用方。
日志级别：无。

---

## 三、rpc：channel 层（B8–B10）

**B8 ChannelClient**（`channelClient.ts`）
输入：`IMessagePassingProtocol`；`getChannel(name).call/listen`、`dispose(reason?)`。
输出：请求 id 从 0 递增；收到 `Initialize` 前发起的请求排队，收到后按序发送；`onDidInitialize`
在每次 Initialize 时触发。`call` 成功后按服务端 payload 重建 `Error`：`name`、`stack`
（服务端按 `\n` 切分的数组在客户端重新 join）、`message` 原样，并复制
`code/kind/status/retryAfterMs/data/detail/details/taskId/traceId` 中存在（`!== undefined`）的键。
`listen` 在首个监听器加入时发送 EventListen，在最后一个监听器移除时发送 EventDispose 并删除
handler；新监听器加入后事件继续分发。
错误语义：token 已取消时 `call` 立即以 `Error("Cancelled")` 拒绝且不发包；运行中取消发送
`PromiseCancel` 后以 `Error("Cancelled")` 拒绝；transport `send` 抛错被吞掉，本地结算照旧。
`dispose()` 无参时以 message `ChannelClient disposed`、name `ConnectionClosed` 拒绝所有未决请求；
带 reason 时原样使用该 Error。dispose 后 `call` 以 `Error("ChannelClient is disposed")` 拒绝，
`listen` 返回 `Event.None`。
时序与并发：发送在初始化完成后异步继续（microtask）；取消与响应竞态时先到者胜。
幂等：dispose 幂等；取消监听在请求结算后自动释放。
资源释放：dispose 移除 protocol 监听、释放 initialize emitter、拒绝未决请求、释放取消订阅。
平台差异：无。
状态所有者：client 拥有请求表与状态机。
日志级别：无。

**B9 ChannelServer**（`channelServer.ts`）
输入：`IMessagePassingProtocol`、`ctx`、`timeoutDelay = 1000`、`deferInit = false`；
`registerChannel`、`ready()`、`dispose()`。
输出：构造时订阅 protocol；未 defer 时立即发送 Initialize；`ready()` 再次发送 Initialize；
`registerChannel` 覆盖同名 channel，并在下一个宏任务 flush 同名 pending 请求。
Promise 请求：调用 `channel.call(ctx, name, arg, token)`，同步抛错转为拒绝；成功发 PromiseSuccess；
`Error` 拒绝发 PromiseError（`message/name/stack` 数组与 9 个可选元数据键），非 `Error` 拒绝发
PromiseErrorObj 原值。EventListen：订阅 `channel.listen` 并把值作为 EventFire 发回。
未知 channel：请求进入 pending 队列；`timeoutDelay` 后 `console.error("Unknown channel: <name>")`；
Promise 请求额外回 PromiseError，data 为
`{name:"Unknown channel", message:"Channel name '<name>' timed out after <delay>ms", stack: undefined}`；
EventListen 只记日志、不回包。
错误语义：transport `send` 抛错被吞掉；`PromiseCancel`/`EventDispose` 触发对应取消订阅；
未知请求 id 静默忽略。
时序与并发：每个请求独立 `CancellationTokenSource`；成功后自动释放；`dispose` 取消所有活动请求
并清表，但不清理尚未到点的 pending 定时器（旧行为，见 known-differences）。
幂等：dispose 幂等。
资源释放：dispose 移除 protocol 监听与活动请求；调用方负责 channel 自身资源。
平台差异：无。
状态所有者：server 拥有 channel 映射、活动请求与 pending 队列。
日志级别：未知 channel 用 `console.error`（唯一直接日志）。

**B10 getDelayedChannel**（`delayedChannel.ts`）
输入：`Promise<IChannel>`；返回对象的 `call/listen`。
输出：`call` 等待 promise 后转发（含取消 token）；`listen` 立即返回 Relay 的事件，promise
resolve 后订阅源事件，resolve 前的值不补发。
错误语义：promise 拒绝时 `call` 以同一错误拒绝；`listen` 的事件永不触发且不暴露错误。
时序与并发：每个 `call` 独立等待。
幂等：只读转发。
资源释放：Relay 由调用方事件订阅生命周期管理；源订阅在 Relay dispose 时释放。
平台差异：无。
状态所有者：promise 的解析结果由调用方拥有。
日志级别：无。

---

## 四、rpc：ProxyChannel（B11–B12）

**B11 ProxyChannel.fromService**（`proxy-channel.ts`）
输入：service 对象；返回 `IServerChannel` 的 `call/listen`。
输出：`for..in` 枚举所有可枚举字符串键；匹配 `on` + 大写字母（长度 ≥3）且非
`onDynamic` + 大写（长度 ≥10）的成员作为事件，并用 bufferEvent 包装：首个监听器出现前的值缓存，
首个监听器加入时按序同步补发，最后一个监听器移除时释放上游并清空缓存。`listen(name)`：
缓存命中直接返回；否则函数成员且是 dynamic 事件时 `member.call(handler, arg)` 并返回其结果；
函数成员且是普通事件时缓存后返回；其余抛 `Error("Event not found: <name>")`。
`call(command, args)`：成员不是函数时抛 `Error("Method not found: <command>")`；
`member.apply(handler, args || [])`；非 Promise 结果包成 `Promise.resolve`。
错误语义：方法同步抛错会**同步**从 `call` 抛出（不转成 rejected promise）；listen 的错误同上。
时序与并发：事件缓存见上。
幂等：同一事件名只包装一次（缓存）。
资源释放：bufferEvent 在最后一个监听器移除时释放源订阅；`_disposables` 参数被忽略。
平台差异：无。
状态所有者：channel 拥有事件缓存；service 归调用方。
日志级别：无。

**B12 ProxyChannel.toService**（`proxy-channel.ts`）
输入：`IChannel`、`{context?}`；返回 Proxy。
输出：非字符串 key 直接 `Reflect.get`；字符串 key `then` 返回 `undefined`（避免被 await 当成
thenable）；`onDynamic` + 大写返回 `(arg) => channel.listen(key, arg)`；`on` + 大写返回
`channel.listen(key)`；其余字符串 key 返回 `async (...args) => channel.call(key, methodArgs)`，
当 `options.context !== undefined` 时 `methodArgs = [context, ...args]`（在调用时读取）。
错误语义：call 的拒绝原样透传。
时序与并发：每次属性访问返回新的函数/事件。
幂等：只读代理。
资源释放：事件订阅由调用方释放。
平台差异：无。
状态所有者：底层 channel 归调用方。
日志级别：无。

---

## 五、rpc：IPC、路由与远程（B13–B16）

**B13 IPCServer / IPCClient**（`ipc.ts`）
输入：`IPCServer(onDidClientConnect: Event<ClientConnectionEvent>)`；`IPCClient(protocol, ctx)`。
输出：每条连接的第一条 protocol 消息被反序列化为 ctx；服务器随即创建 `ChannelServer(protocol, ctx)`
与 `ChannelClient(protocol)`，把已注册 channel 注册到新连接，加入 connection 集并触发
`onDidAddConnection`；断开事件触发时 dispose 两个端点、移除连接并触发 `onDidRemoveConnection`。
`getChannel(name, filter)`：已有匹配连接立即使用，否则等待首个匹配的 add；`call` 走 delayedChannel；
`listen` 对当前与未来所有匹配连接做多播，最后一个监听器移除时释放全部订阅。
`getChannel(name, router)`：`routeCall/routeEvent` 决定连接后转成 channel。
`registerChannel` 记录并传播到所有现有连接。`dispose` 释放连接事件订阅、所有连接、channel 映射、
两个 emitter。
`IPCClient` 构造时先发送序列化 ctx，再创建 ChannelClient 与 ChannelServer；`registerChannel`
只注册到自身 server；`dispose` 依次 dispose client、server。
错误语义：ctx 反序列化错误在服务器连接回调内抛出（无额外包装）；发送失败沿用底层。
时序与并发：连接以首条消息为建立点；多播事件顺序按连接加入顺序与各连接事件到达顺序。
幂等：dispose 幂等。
资源释放：见上；protocol/socket 由调用方释放。
平台差异：无。
状态所有者：IPCServer 拥有连接集与 channel 注册表。
日志级别：无。

**B14 StaticRouter**（`ipc.ts`）
输入：`(ctx) => boolean | Promise<boolean>`。
输出：`routeCall/routeEvent` 都按当前 `hub.connections` 顺序逐个 await 谓词，返回第一个真值连接；
没有匹配时等待 `hub.onDidAddConnection` 后递归重扫。
错误语义：谓词拒绝原样向上抛。
时序与并发：每次路由重新扫描；连接在等待期间加入即可被看到。
幂等：只读。
资源释放：等待一次的订阅由 `Event.toPromise`/`once` 自动释放。
平台差异：无。
状态所有者：hub 拥有连接集。
日志级别：无。

**B15 远程解析、socket 工厂与 URI 变换**（`remote.ts`）
输入：`RemoteAuthorityResolverService.registerResolver/resolveAuthority`；
`RemoteSocketFactoryService.register/connect`；`createURITransformer(authority)`。
输出：authority 的 type 为第一个 `+` 之前的前缀，没有 `+` 时取整个字符串；未注册时抛
`No resolver registered for remote type: <type>`；解析器收到完整 authority。工厂按
`connectTo.type` 分桶，取第一个 `supports(connectTo)` 为真的工厂；没有时抛
`No socket factory found for <connection.toString()>`；register 返回只移除本次注册的 disposable。
URI 变换：incoming 对 `scheme=vscode-remote && authority===remoteAuthority` 返回
`{scheme:"file",authority:"",path}`；incoming 的 `file` 返回 `vscode-local`；其余原样返回同一对象。
outgoing 的 `file` 返回 `{scheme:"vscode-remote",authority:remoteAuthority,path}`；`vscode-local`
返回 `file`；其余原样返回同一对象。
`WebSocketRemoteConnection`/`ManagedRemoteConnection` 的 `type` 分别为 0/1，`toString` 为
`WebSocket(host:port)` / `Managed(id)`。
错误语义：见上；resolve/connect 的拒绝原样透传。
时序与并发：解析与连接均为异步；注册表无锁。
幂等：重复注册追加多个工厂/覆盖同 type 解析器（Map.set）；dispose 移除。
资源释放：两个 register 返回的 disposable。
平台差异：无。
状态所有者：服务实例拥有注册表。
日志级别：无。

**B16 RemoteAgentConnection**（`remote.ts`）
输入：authority、resolver service、socket factory；`connect()`、`onDidStateChange`、`dispose()`。
输出：`connect` 解析 authority，`connectionToken` 存在时 query 为 `token=<token>`，否则空串；
连接 socket 后创建 PersistentProtocol 与 IPCClient，订阅 `onSocketClose`，触发
`{type:"connected"}` 并返回 client。socketClose 先触发 `{type:"reconnecting"}`，再按
`RECONNECT_DELAYS = [0,5,5,10,10,10,10,10,30]` 秒逐次重连；第 n 次失败递归 n+1；尝试序号
达到数组长度时触发 `{type:"disconnected"}`；成功时 `replaceSocket(newSocket)` 并再次触发
`connected`。
错误语义：初次 resolve/connect 的拒绝从 `connect()` 抛出；重连失败被吞掉并继续下一次。
时序与并发：每次 socketClose 启动独立重连循环（旧行为：可能重叠）。
幂等：dispose 幂等；dispose 不发状态事件。
资源释放：dispose client、protocol（含定时器）、state emitter。
平台差异：无。
状态所有者：连接对象拥有协议与状态机。
日志级别：无。

---

## 六、rpc：中间件与示例（B17–B19）

**B17 日志中间件**（`logging-middleware.ts`）
输入：`LoggingChannelServer(inner, logger)`、`LoggingChannelClient(inner, logger)`。
输出：服务端注册输出 `[rpc:register] channel "<name>"`；调用成功输出
`[rpc:call] <channel>.<command> OK (<x.x>ms)`，失败输出
`[rpc:call] <channel>.<command> FAIL (<x.x>ms)` 并把错误作为第二个参数；订阅成功输出
`[rpc:listen] <channel>.<event> subscribed`，抛错输出 `[rpc:listen] <channel>.<event> FAIL`
并带错误参数。客户端成功/失败分别输出
`[rpc:call] <channel>.<command> → OK (<x.x>ms)` / `→ FAIL ...`；订阅输出
`[rpc:listen] <channel>.<event> → subscribed`。耗时来自 `performance.now()`，保留一位小数。
错误语义：inner 的错误原样向外抛；logger 在注册/订阅**之前**调用，logger 抛错会阻止内部注册/订阅。
时序与并发：每个调用独立计时。
幂等：无状态包装。
资源释放：无（不拥有 inner）。
平台差异：无。
状态所有者：inner 拥有状态；logger 由调用方提供。
日志级别：由调用方 logger 决定；文本格式是合同。

**B18 网络遥测中间件**（`network-telemetry-middleware.ts`）
输入：模块级 `setNetworkTelemetrySink(sink|null)`、`emitNetworkTelemetryObservation`；
`NetworkTelemetryChannelServer/Client`。
输出：每次 channel 调用成功/失败发出一条
`{transport:"rpc", interface:"<channel>.<command>", durationMs: max(0, round(elapsed)),
ok, errorKind: ok ? undefined : kind, attempt: 1}`；`errorKind` 分类顺序：
message 含 `timeout`/`timed out` → `timeout`；含 `dns`/`getaddrinfo`/`enotfound` → `dns_failure`；
含 `econnreset`/`connection reset`/`econnrefused` → `connection_reset`；否则 `other`（大小写不敏感）。
sink 在**发出时**读取模块变量（后设置的 sink 对已构造的中间件生效）；`listen` 不产生观测。
错误语义：inner 的错误在发观测后原样抛出；sink 抛错会向外传播（调用因此拒绝）。
时序与并发：同步观测。
幂等：无状态；`setNetworkTelemetrySink(null)` 关闭。
资源释放：无。
平台差异：无。
状态所有者：模块拥有 sink；channel 归 inner。
日志级别：无日志，只有观测回调。

**B19 示例程序**（`examples/*.ts`）
输入：`node --import tsx packages/rpc/examples/<name>.ts`。
输出（每个示例退出码 0，stdout 包含以下稳定行）：

- `01-basic-ipc.ts`：`--- Basic IPC Demo ---`、`add(10, 20) = 30`、`multiply(6, 7) = 42`、
  `divide(100, 3) = 33.333`（前缀）、`divide(1, 0) → Error: Division by zero`、`Done!`。
- `02-proxy-channel.ts`：`--- ProxyChannel Demo ---`、`readFile('/src/main.ts') = "console.log("hello world")"`、
  `listFiles('/src')`、`readFile('/nonexistent') → Error: File not found: /nonexistent`、`Done!`。
- `03-ipc-server-client.ts`：`--- IPCServer + IPCClient Demo ---`、`[1] Client "window-1" connecting...`、
  `client1: set theme = "dark"`、`client2: get theme = "dark"`、`server → window-1: title = "Window window-1"`、
  `Active connections: 2`、`Active connections after disconnect: 1`、`Done!`。
- `04-remote-connection.ts`：`=== Remote connection Demo ===`、
  `[SSH Resolver] Resolving "ssh+myserver" → 192.168.1.100:8080`、`readFile → "console.log("Hello from remote!")"`、
  `stat → size:`、`readFile after write → "console.log("Updated from local VS Code!")"`、
  `Done!`。
  错误语义：任一示例非零退出或缺少上述行为即失败（输出按「包含」断言，允许示例内部日志顺序稳定）。
  时序与并发：示例内的 QueuePair 使用宏任务投递；测试等待子进程退出。
  幂等：示例可重复运行。
  资源释放：示例自行 dispose。
  平台差异：示例只依赖 Node 与内存 socket，两平台一致。
  状态所有者：示例进程。
  日志级别：示例输出到 stdout（即合同的一部分）。
  **边界**：示例固定 import `../src/index.js`，所以只在源码入口验证；dist 入口不重跑示例
  （见 known-differences §4）。

---

## 七、rpc：导出面与模块路径（B20）

**B20 rpc 冻结导出面**（`index.ts`）
输入：加载 `@knorvia/rpc` 源码或 dist 入口。
输出：运行时导出名集合**恰好**是 `interface.md` §1.1 的 39 个值（顺序无关）；一级导出面
不包含 `RequestType`/`ResponseType`/`HEADER_SIZE`/`ClientState`；`interface.md` §1.2 的类型
可被 `import type` 使用。`packages/rpc/src` 下 16 个模块路径均存在且可独立加载（dist 入口时
`packages/rpc/dist/<module>.js` 存在）；`examples/01..04` 存在。
错误语义：缺失或多出任何导出即失败。
时序与并发：不适用。
幂等：只读。
资源释放：不适用。
平台差异：不适用。
状态所有者：不适用。
日志级别：无。

---

## 八、provider-node：运行时路径与配置编解码（B21–B22）

**B21 运行时路径与环境变量**（`runtime-paths.ts`）
输入：`createNodeProviderRuntimePathEnv({knorviaBuiltinFilePath, personalFilePath})`；
`resolveNodeProviderRuntimePaths(env)`。
输出：环境变量名固定为 `KNORVIA_BUILTIN_PROVIDER_CONFIG_FILE`、
`KNORVIA_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE`、`KNORVIA_PERSONAL_PROVIDER_CONFIG_FILE`，
文件名为 `provider_config.json`；`createNodeProviderRuntimePathEnv` 只写前两者中的
`KNORVIA_BUILTIN_PROVIDER_CONFIG_FILE` 与 `KNORVIA_PERSONAL_PROVIDER_CONFIG_FILE` 两个键。
`resolveNodeProviderRuntimePaths` 对两个值 `trim()`：都缺失（含空白）返回 `null`；只给一个时抛
`Knorvia Studio Built-in 与 Personal Provider Config 路径必须同时提供`；成功返回冻结的
`{knorviaBuiltinFilePath, personalFilePath}`。
错误语义：见上。
时序与并发：纯同步。
幂等：纯函数。
资源释放：无。
平台差异：只做字符串 trim，不做路径规范化。
状态所有者：env 归调用方。
日志级别：无。

**B22 Provider Config 文件编解码**（`provider-config-file-codec.ts`）
输入：`decodeProviderConfigFile(input)`、`encodeProviderConfigFile(update)`。
输出：当前 `schemaVersion = 1`。存储文档严格为
`{schemaVersion:1, config:{providerOrder?, providerConfigRules, modelConfigRules,
defaultModelSelection?}}`（未知键在顶层与 `config` 层都拒绝）。`decode` 返回冻结的
`{providers, models, providerOrder, defaultModelSelection?}`；`providerConfigRules` 由
`parsePersonalProviderConfigMap` 解析，`modelConfigRules` 由 `parsePersonalModelConfigRules`
解析。对 `modelConfigRules.manualProviderModelRules[*].config`，如果不符合当前 manual schema，
依次尝试旧 complete/editable schema 并用 `extractManualModelConfig` 归一；仍不符合则原样交给
解析器决定报错。`encode` 输出
`{schemaVersion:1, config:{providerOrder?, providerConfigRules:{providerRules: providers.toJSON()},
modelConfigRules: models.toPersonalJSON(), defaultModelSelection?}}`；`providerOrder` 与
`defaultModelSelection` 仅在 `!== undefined` 时出现。
错误语义：非对象/缺 `schemaVersion` → `UnsupportedProviderConfigVersionError`
（message `Provider Config 缺少 schemaVersion`，version `null`）；`schemaVersion` 非非负整数 →
message `Provider Config schemaVersion 必须是非负整数`（version `null`）；高于当前 →
`Provider Config schemaVersion <v> 高于当前支持的 1`（version=v）；低于当前且无迁移器 →
`缺少 Provider Config schemaVersion <v> 到 <v+1> 的迁移器`（version=v）；迁移器返回非版本化文档
或跳号时抛普通 `Error`。错误类 `name` 固定为 `UnsupportedProviderConfigVersionError`。
时序与并发：纯同步。
幂等：`decode(encode(update))` 语义相等；`encode(decode(document))` 对规范文档字节稳定。
资源释放：无。
平台差异：无。
状态所有者：文档归调用方。
日志级别：无。

---

## 九、provider-node：Personal Provider Config 仓储（B23–B25）

**B23 仓储读取、写入、恢复与事件**（`personal-provider-config-repository.ts`）
输入：`new NodePersonalProviderConfigRepository({filePath, importLegacy?, onRecovery?,
onPollingError?, pollingIntervalMs?})`；`read/update/onDidChange/dispose`。
输出：构造时空 `filePath` 抛 `Personal Provider Config filePath 不能为空`；
`pollingIntervalMs` 不是 `false` 且 ≤0 抛 `Personal Provider Config pollingIntervalMs 必须大于 0`。
`read`：文件存在且规范时直接返回快照；非规范时在文件锁内重写为规范格式；文件不存在时若有
`importLegacy`，在锁内导入并写入，否则返回空快照。任何读取/解析错误：调用一次 `onRecovery`
（参数冻结的 `{error}`，回调自身抛错被吞掉），返回空快照。
`update(transform)`：在 `withFileLock(filePath)` 内读取当前快照、调用 transform、规范化并原子写入
（2 空格缩进 JSON，无尾随换行），更新 observed revision，返回新快照；锁外触发一次 `"updated"` 事件。
快照 revision = `sha256(JSON.stringify(encodeProviderConfigFile(update)))`（hex）；字段
`revision/providers/models/providerOrder/defaultModelSelection`，对象冻结。
`onDidChange` 返回取消订阅函数。
错误语义：文件系统/解析错误按上述恢复；transform 抛错原样抛出且不写文件；dispose 后
`read/update/onDidChange` 抛 `NodePersonalProviderConfigRepository 已 dispose`。
时序与并发：同文件路径的 read/update 通过进程内 `withFileLock` 串行；写后 observed 与返回值
一致。
幂等：重复读同一规范文件返回同一 revision；dispose 幂等。
资源释放：dispose 清定时器与监听器；原子写不残留临时文件。
平台差异：路径与换行按 Node 默认；原子写权限由 `@knorvia/shared/node` 保证。
状态所有者：仓储拥有 observed revision、监听器、轮询定时器；文件归用户。
日志级别：无。

**B24 轮询**（`personal-provider-config-repository.ts`）
输入：构造选项 `pollingIntervalMs`（默认 1000，`false` 关闭）。
输出：每次 `read`/`update` 结束后若未在轮询且未 dispose，则 `setTimeout(interval)` 一次并
`unref()`；到点读取文件并计算 revision：若期间发生过写入（generation 的 `#writes` 变化）则丢弃本轮；
revision 与 observed 相同则静默；不同则更新 observed 并触发 `"poll-changed"`。
读/解码错误：同一错误期（episode）只回调一次 `onPollingError`（回调抛错被吞）并触发一次
`"poll-error"`；成功一轮后重置 episode。轮询尾部重新安排下一轮。
错误语义：轮询错误不改变 `read()` 返回值；dispose 后不再触发任何事件。
时序与并发：同一时刻最多一个 in-flight 轮询；定时器不阻止进程退出。
幂等：同一 revision 不重复通知。
资源释放：dispose 清定时器（含已排队的）；定时器单次安排。
平台差异：无。
状态所有者：仓储。
日志级别：无。

**B25 Model Selection Config 仓储**（`model-selection-config-repository.ts`）
输入：`NodeModelSelectionConfigRepository({personalRepository})`；`read/saveConfiguredDefault/
onDidChange/dispose`。
输出：`read` 返回个人配置快照的 `defaultModelSelection`（可能 `undefined`）；
`saveConfiguredDefault(selection)` 用 `{...current, defaultModelSelection: selection}` 更新个人仓储，
返回更新后的 `defaultModelSelection`；`onDidChange` 订阅共享仓储并登记，返回同时移除本地登记与
共享订阅的函数。
错误语义：dispose 后三个入口抛 `NodeModelSelectionConfigRepository 已 dispose`。
时序与并发：直接委托共享仓储（锁/轮询语义同 B23/B24）。
幂等：dispose 幂等；重复取消订阅安全。
资源释放：dispose 只取消自己的订阅，**不 dispose** 共享 Personal Repository。
平台差异：无。
状态所有者：共享仓储拥有数据；本类只拥有订阅集合。
日志级别：无。

---

## 十、provider-node：门面与运行时（B26–B28）

**B26 模型选择门面与旧档位映射**（`model-selection-facade.ts`、`legacy-reasoning-level.ts`）
输入：`createNodeModelSelectionFacade(ProviderRegistryFacadeSource)`；门面的
`getView(configuredDefault?, revision?, {selection})`。
输出：分类器：Start Plan 的真实 Provider ID → `"ordinary"`；其余内置账号 Provider ID
（`account:*` 且非 Start Plan）→ `"account-plan"`；`OFF_PEAK_PROVIDER_IDS` 的值 →
`"account-offpeak"`；其他 → `"ordinary"`。门面把 `resolveLegacyReasoningLevel` 作为旧档位解析器
传入 `ModelSelectionFacade`。
旧档位解析：仅当 `selection.options.reasoningLevel` 为 `"off"` 或 `"nothink"` 时继续；
个人精确规则是 `manual-provider-model`，或显式定义了 `optionSpecs.reasoningLevel.values/map` 时
返回 `undefined`；selection 的 provider 不在 effectiveProviders 时返回 `undefined`；否则把
Built-in 规则中「`type === "model"` 且 `modelMatch` 与 25 条 rename 表逐字相等」的规则里
`reasoningLevel.values` 的 `"disabled"` 替换为对应旧档位（WeakMap 按 Built-in 规则对象缓存），
再用 `ModelConfigRules.resolve({providerId, modelId, templateId, apiType, baseUrl})` 解析；
最终当值的集合包含旧档位时返回 `"disabled"`，否则 `undefined`。
错误语义：解析过程不抛错；无效选择交由 `@knorvia/provider` 的门面给出 issue。
时序与并发：同步；缓存是 WeakMap，不阻止旧规则被回收。
幂等：同一输入结果稳定。
资源释放：无。
平台差异：无。
状态所有者：Built-in/Personal 规则归 `@knorvia/provider`；本模块只读。
日志级别：无。

**B27 Provider Config Runtime**（`provider-config-runtime.ts`）
输入：`NodeProviderConfigRuntimeOptions`；`start/refreshKnorviaBuiltin/onDidCheckKnorviaBuiltin/
resolveKnorviaBuiltinActiveFilePath/personalRepository/dispose`。
输出：构造时创建 Built-in source（有 `knorviaBuiltinEnvironment` 时用
`EndpointScopedKnorviaBuiltinSource`，否则用 `NodeKnorviaBuiltinProviderConfigSource`）；只有在
Node source 且有 `knorviaBuiltinRemote` 时创建远端同步器；Personal Repository 的 `importLegacy`
先读取 Built-in 快照；`ProviderConfigService` 由两者组成。
`start()`：dispose 后抛 `NodeProviderConfigRuntime 已 dispose`；重复调用返回同一 promise；
先 `configService.read()`，成功后异步触发一次 built-in 检查；若存在远端同步器/端点 source/
检查监听器，则启动 60s `unref` 定时检查。失败时清空缓存的 promise，允许重试。
`refreshKnorviaBuiltin()`：dispose 后返回 `"disposed"`；端点 source 调用其 `refresh`；否则
有远端同步器时调用远端 `refresh`；都没有时返回 `"skipped"`。
`onDidCheckKnorviaBuiltin(listener)` 加入/移除监听器，返回取消函数。
`#checkKnorviaBuiltin`：同一时刻只跑一个；快照监听器后 `Promise.allSettled([refresh, ...listeners])`，
每个 rejected 结果调用 `onKnorviaBuiltinRefreshError`（dispose 后不回调）。
`resolveKnorviaBuiltinActiveFilePath`：Node source 直接返回 `activeFilePath`，端点 source 调用
`resolveActiveFilePath()`。
`dispose()`：幂等；顺序为清定时器→清监听器→dispose 远端→dispose configService→
dispose personal→dispose built-in source。
错误语义：见上；构造参数错误由底层 source/repository 抛出。
时序与并发：start 缓存；检查去重；60s 定时器不阻止退出。
幂等：start 缓存、dispose 幂等。
资源释放：见 dispose 顺序。
平台差异：无。
状态所有者：runtime 拥有 source/repository/service/定时器生命周期。
日志级别：无（错误交给回调）。

**B28 Provider Registry Runtime**（`provider-registry-runtime.ts`）
输入：`NodeProviderRegistryRuntimeOptions`（在 config 选项上增加 `accountSource?`、
`createAccountSource?`）；`start/dispose` 与透传 getter。
输出：构造时先建 config runtime，暴露 `configService`；account source 优先级为
`createAccountSource(configService)` → `accountSource` → 新建 `MutableAccountProviderConfigSource`；
`ProviderRegistryService` 由 configService 与 account source 组成。
`start()`：dispose 后抛 `NodeProviderRegistryRuntime 已 dispose`；先 await config runtime start；
若 account source 是 `MutableAccountProviderConfigSource` 且其快照
`basedOnKnorviaBuiltinRevision === "uninitialized"`，用 `configService.read()` 生成 fail-closed 快照并
`replace(..., "initial-fail-closed")`；最后 `registryService.start()`。
`personalRepository`/`onDidCheckKnorviaBuiltin` 透传 config runtime。
`dispose()`：幂等；先 registryService 再 configRuntime。
错误语义：见上；底层错误原样透传。
时序与并发：start 期间 arrive 的 account source 读取发生在 config start 之后。
幂等：dispose 幂等；自定义 account source 不做 fail-closed 替换。
资源释放：见 dispose。
平台差异：无。
状态所有者：registry runtime 拥有两个 service 的生命周期。
日志级别：无。

---

## 十一、provider-node：导出面、模块路径与往返（B29–B30）

**B29 provider-node 冻结导出面**（`index.ts`）
输入：加载源码或 dist 入口。
输出：运行时导出名集合恰好为 `interface.md` §2.1 的 31 个值；一级导出面不包含
`legacyReasoningLevelRenames`/`resolveLegacyReasoningLevel`；§2.2 的类型可 `import type`；
`index.ts` 的 14 个 `export *` 源模块路径存在（dist 入口时 `dist/<module>.js` 存在）。
错误语义：缺失或多出即失败。
时序与并发：不适用。
幂等：只读。
资源释放：不适用。
平台差异：不适用。
状态所有者：不适用。
日志级别：无。

**B30 Provider Config 往返**（`provider-config-file-codec.ts` + 仓储）
输入：`fixtures/provider-config/old-write.json`（旧实现写出的规范文档）与旧版手工配置样例。
输出：四步全部成立：

1. **旧写 → 新读**：`decodeProviderConfigFile` 接受夹具并得到等价快照；
2. **新读 → 新写**：`encodeProviderConfigFile(decoded)` 与夹具逐字节一致（含键序）；
3. **新写 → 旧读**：新写字节可被旧的 `stored` 模式解析（用同一公开 decoder 回归）；
4. **仓储规范化**：把旧写文件交给 `NodePersonalProviderConfigRepository.read()`，文件被原地
   规范化为同一字节，revision 与 `sha256(JSON.stringify(encoded))` 一致。
   手工旧配置：`manualProviderModelRules[*].config` 的旧 complete/editable 形态被
   `extractManualModelConfig` 归一后再编码，输出符合当前 manual schema。
   错误语义：夹具解析失败即失败；不得在重写阶段重新录制夹具。
   时序与并发：不涉及定时器。
   幂等：再次 decode/encode/repository read 字节不变。
   资源释放：测试自建临时目录并清理。
   平台差异：换行固定为 `\n`（夹具为 UTF-8 LF）。
   状态所有者：夹具文件是旧实现真值。
   日志级别：无。
