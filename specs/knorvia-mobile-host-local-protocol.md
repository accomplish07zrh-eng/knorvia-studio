# Web / 手机端 Host 协议本地验收

2026-09-25。T3.4 只在本机运行协议夹具，不连接手机、远程 Host、模型服务或生产服务器。

## 所有权与路径

- 原生会话和 workspace 列表仍由同一个 Host / CLI V4 状态源拥有。Desktop continuous 与 Web/mobile replayable 各有独立的连接 ID 和订阅 ID，不复制一套已接受状态。
- UI 连接先接收 Host `hello`，再发送 `clientHello`。连接模式和能力只由 Host attachment 确定；客户端参数中的同名字段不能提权。普通 `/ws` 固定为 terminal replayable；`/ws/host` 的一次性 Host capability 属于单独的可信 relay 入口。
- 订阅 RPC 先返回 ACK；初始快照以该订阅的 owned notification 送达。早于 ACK 抵达的帧只暂存到对应连接，ACK 后按原序释放。两个客户端使用同一 topic、同一状态源，但帧的订阅 ID 各自独立。

## 恢复与权限不变量

- 状态帧含 `logEpoch` 和单调序号。客户端只在持有一致状态时提交 `base`；发现缺口时对当前 owned subscription 请求 `resync`，必要时强制完整快照。断线后旧订阅清理；新连接重新握手、重新订阅，旧 epoch 不得当作可续传水位。
- 跨连接的 `resync` 或伪造的订阅所有权必须拒绝。Web/mobile 不接收本地 CUA 权限观察、live TTFT / telemetry、终端或原生对话框能力，也不能调用可信 relay 的流控入口。
- 测试使用协议 schema 校验的 sessions-index 快照和增量帧，模拟桌面与手机并行订阅、状态变化、漏帧修复、断线重连、提权尝试和清理。夹具不证明实际网络握手、跨设备延迟、手机浏览器适配或远程认证；这些均记录为未验证。
