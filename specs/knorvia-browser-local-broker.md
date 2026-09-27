# 浏览器本地 IPC 转发独立实现

替换 bootstrap 的 node-repl-browser-broker 正文，保留工厂、ready/socketPath/token/close 和 MCP 环境注入接口。唯一执行入口仍为 BrowserControlPort；本层只做本机字节帧、鉴权、严格结构校验和请求生命周期，不采信调用方工作区断言，也不运行浏览器。Windows 使用随机命名管道，POSIX 使用临时目录中的随机 socket。

## 分工与时序

- broker 工厂拥有 server、在途 socket 集和一次性的关闭 Promise。
- 每个 connection 拥有一个请求 AbortController；帧读取器只持有这个请求的有界字节缓存。
- 桥接 metadata 的浏览器分支只传 sessionId、turnId、runtimeScope 和 trace。workspacePath、workspaceIdentity、remoteSessionId 等仍供 Computer Use 分支使用；浏览器身份由 protocol server 的权威 session 派生，不能放宽 strict schema 来接受未受信身份。

```text
socket → 有界字节帧 → JSON → 保留合法 UUID → strict schema → token / main scope
                                                          → BrowserControlPort → 单行回执 → 断开
对端断开/关闭 broker → abort 请求 → 销毁 socket → 关闭 server → 清理 POSIX socket
```

每连接仅处理第一个换行结束的 JSON 帧，1 MiB 入站限制按原始字节计量（含换行），不是按解码后字符计量；先定位该帧末尾再累计，后续帧既不执行也不并入当前帧。UTF-8 必须在完整拼接后解码，不能逐 chunk 解码。相同请求中的中文、表情和 ASCII 均须保真。

随机 token 为 32 字节的 hex 表达；先严格校验请求结构，再用固定长度比较与 timingSafeEqual 校验 token，随后拒绝 subagent。任何失败不得触发 list/execute。合法 UUID 即使其余参数非法也在错误回执保留，以免真正的参数错误被 id mismatch 遮蔽；JSON 损坏或无合法 ID 使用新 UUID。错误回执不包含 token 或整份输入。

list/execute 保留 sessionId、turnId、trace、browserId/generation 和命令；收到结果后回同一个 id，执行错误按当前协议报告 ok:false。socket 的 error 监听覆盖读取和写回全过程，取消或客户端断开不能产生无人接收的 EPIPE。底层端口仍负责实际动作取消及副作用未知的语义。

close 幂等，立即关闭 admission，等待 listen 完成或失败后主动销毁全部空闲/在途 socket，再关闭 server；不等待不合作的客户端主动退出。只清理本工厂生成的 POSIX socket 路径，不涉及用户数据。重复 close 复用同一个 Promise；极早 close 不能漏掉稍后监听成功的 socket。

MCP 配置注入仅针对名为 node_repl 的 stdio 项，保持其他配置和原对象不变；无 broker、无该项或 HTTP 项直接返回原对象。沿用既有两个环境变量，不增加设置或用户页面。

## 验收

先以旧实现验证正常 list/execute、错误 ID、严格参数、token、subagent、单帧、配置注入、断连取消。新增测试须复现 UTF-8 分块损坏、空闲连接拖住 close 和浏览器工作区 metadata 被 strict schema 拒绝；Computer Use metadata 不得被本次修复删掉。测试只使用测试生成的本机 socket/管道与虚构身份，不连接生产或真实浏览器，不调用模型。执行根/CLI 类型和 lint、严格变更 lint、架构、构建、统一离线回归、格式、来源扫描和实际 bundle 检查；Windows 与 Linux 的真实平台差异由 CI 核对。

本批只把新的 bootstrap broker 实现列入独立实现复核。node-repl-host 的既有 IPC 模块仅修复 metadata 分支，不据这处修改就给整个文件新增独立实现结论。共享协议、其他桥接、模型内核、桌面和 UI 仍在迁移范围内。
