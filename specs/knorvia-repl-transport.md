# REPL 宿主本地通信独立实现

本边界替换 `node-repl-host/src/ipc.ts` 的实现，保留它的公开函数及 Browser / Computer Use 调用者。新设计分为字节帧解码、一次性连接事务与元数据投影三个模块；兼容入口只作导出，不保留旧正文或运行时 fallback。Node 的 socket、UTF-8 解码及密码学 API 仍是第三方运行时能力。

## 状态与所有者

```text
调用者的 AbortSignal ─────────────────────────────┐
元数据 → 明确字段投影 → 业务请求 → 序列化快照       │
                                   ↓             │
一次调用拥有一条连接 → connect → 写一行 → 读取一行 ←┘
                                          ↓
字节解码器 → 有界 UTF-8 / JSON → 校验 id、ok → 结果或错误
                                          ↓
                              解绑监听、销毁本次连接
```

- `readFrame` 只拥有读取监听与解码状态，不销毁调用者提供的 socket；调用者仍可在收到请求后写回响应。结果、解析错误、断连、流结束或取消中第一个终态生效；其余事件不改变结果。所有路径释放监听与帧缓冲。
- `brokerCall` 拥有本次连接与请求 UUID，先序列化完整请求，再建立连接。序列化失败应拒绝本次 Promise，不能从 connect 事件抛出异常而结束宿主；此时不能触发远端动作。发送失败、取消或响应完成后均释放连接，不重试副作用。
- 调用者提供取消和截止时间。本层不增加重试、业务队列、会话缓存或新的环境变量；相互并发的调用不能共享响应、token、UUID 或取消状态。

## 字节与响应契约

- 保留换行结尾的单帧 JSON，允许 CRLF；UTF-8 多字节字符可跨任意 chunk。兼容既有无效 UTF-8 的替代字符行为，不静默去除 BOM。接收 JSON 的任意值，响应对象验证由事务层负责。
- 大小按首帧的实际字节（包括结尾 LF）计算；已经找到 LF 后，同一 chunk 的后续数据不计入首帧上限，也不作为第二个请求执行。超过上限立即失败，不能继续累积。宿主响应上限仍为 32 MiB，Computer Use 请求上限仍为 1 MiB。
- 输入流已关闭、在 LF 前结束或取消时必须及时拒绝，不等待一个已经发生过的 close 事件。中止监听不得被其他消费者的 stopImmediatePropagation 阻止。
- JSON 解析失败使用固定 SyntaxError 文案，不把原始帧或其中的 token 带进公开错误。网络错误和调用者的取消 reason 保持可识别；服务器主动返回的业务错误仍按既有协议传递。
- 事务强制覆盖 payload 的 id/token，匹配响应 id 后只接受 `ok === true`；无效对象、id 错配与 broker 拒绝仍为显式失败。不使用业务 payload 来改变身份或审批。

## 身份投影

- `textField` 只接受非空字符串并 trim，不把数字、对象等转成文本。
- Browser 上下文只包含 sessionId、runtimeScope=main、可选 turnId 和 trace。必须有 session_id；trace_id 存在时才建立 trace，并保留可选 spanId / parentSpanId。客户端工作区字段不能进入 Browser 的 strict wire schema；宿主会话负责派生真实身份。
- Computer Use 另外保留 workspacePath、workspaceIdentity、remoteSessionId。workspaceKey 依次取 workspace_key、workspaceIdentity、workspacePath，均缺失时失败；clientMode 缺省 desktop-continuous，deliveryKind 缺省 clientMode。已经提供的非空值不被本层改成别的模式。
- subagent 禁用、代际校验、可信截图和应用身份仍由现有桥及会话负责，本层不据 runtime_scope 字符串自行授予新权限。

## 验收

先用旧实现验证分片/边界、响应关联、错误、取消、并发与身份字段；已知异常另行复现，不声称旧版通过新增失败路径。新实现应通过同一组契约及串联的真实本地管道测试，覆盖完整 MCP / Browser / Computer Use 模拟调用；不操作真实桌面或模型。

执行根及 CLI 类型/lint、变更架构、格式、CLI 构建、完整离线回归和 Linux / Windows CI。构建产物必须包含新模块，不通过旧 bundle 或缓存回退。记录逐文件来源和行为证据，已接触旧源码不称为无源码接触的 clean-room；未迁移的其他宿主模块和产品继续保留适用许可。
