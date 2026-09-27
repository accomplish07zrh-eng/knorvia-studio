# 浏览器协议转发器独立实现

替换 CLI bootstrap 的 browser-control-broker 实现，保持 BrowserControlPort 及 interaction/browserList、interaction/browserExecute 协议。转发器不运行浏览器、不存储 tab 或业务会话，不新增协议、权限、环境变量和 UI。桌面连续流与 Web replayable 的 clientMode 仍来自权威 session record。

## 所有者和边界

请求通道在 admission 时读取 requireSession，生成一次请求的身份快照；会话记录仍由 protocol server 唯一持有。workspaceKey 优先取去空白的 workspaceIdentity，否则使用 workspacePath，remoteSessionId 同样去空白。显式 turnId 优先于 traceContext.turnId；沿用 traceId、spanId、parentId/parentSpanId 转换规则。每条正向、取消及生命周期请求都有不同 requestId。

连接账本只记录成功 admission 的 execute 使用过的 browserId 与 generation，按 session、browserId、generation 三层索引去重；list 不产生连接记录。它不是发现结果缓存，不持有浏览器状态。原函数入口仅组合请求通道与账本，调用者和 dependency injection 不变。

```text
list/execute → 检查取消 → 权威 session → 身份快照 → requestClient → schema 校验结果
execute admission ───────────────────→ 连接账本
execute abort → 原身份快照 + 新 requestId + cancelRequest(原 requestId) → 同一后端/代际
turnEnded → 账本快照 → 并发尽力通知
closeSession → 原子取出并移除旧账本 → 并发尽力通知
                       新 admission → 新账本，旧关闭不再删除它
```

## 保留的契约

- list 解包 browsers；execute 保留原 command、结果和 schema，转发 AbortSignal。执行失败不被伪装成成功。
- abort 取消原 requestClient，同时另发不携带已取消 signal 的 cancelRequest。后者失败不得替代原调用的结果或成为无人观察的 Promise 拒绝。已完成请求移除 abort listener。
- turnEnded 通知该 session 所有执行过的后端代际并保留账本；closeSession 通知并清除此批账本。生命周期失败逐条收敛，不影响其他连接；不扩散到其他 session。
- 生命周期通知继续不附带调用者 trace/signal，turnEnded 命令保留 turnId。普通请求的 trace 继续走 requestClient options，不混入浏览器协议正文。

## 明确修复的边界

已经取消的输入不再向后端发送 execute 或多余 cancel。原请求一旦 admission，取消只引用它的身份快照，即使 session 此后移除，也不会在 abort listener 中重新 requireSession 而抛出未捕获异常。生命周期通知的同步抛错与异步拒绝同样收敛。closeSession 在等待回执之前取出旧连接集，期间新 admission 的连接不得被旧 close 清空。

这些调整需要先在旧实现复现失败；其余正常结果、工作区隔离、trace、schema、去重及生命周期行为先做新旧共同契约测试。模拟 requestClient 和隔离子进程足以覆盖本边界，不操作真实浏览器或调用模型。必须运行根/CLI 类型和 lint、变更架构、定向回归、CLI 构建、统一离线测试、格式、来源和产物检查。共享协议、socket broker、MCP host 等依赖尚未因此成为全量独立实现。
