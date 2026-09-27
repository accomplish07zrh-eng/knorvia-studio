# REPL Computer Use 本地请求服务独立实现

替换 node-repl-host 的 Computer Use broker 服务端，继续使用现有 `ComputerUseRuntime` 公共接口和 worker 连接描述。此服务只把已验证的请求交给注入 runtime，不选择桌面、不实施权限批准、不持有第二份业务会话，也不直接操作系统输入设备。

## 所有者与边界

本地监听器拥有地址、活动 socket、逐连接取消信号和关闭屏障；Computer Use 适配器拥有随机令牌与线协议认证、上下文校验和响应关联。实际设备、权限和会话资源仍由 runtime 的调用者负责释放，broker.close 不擅自调用 runtime.dispose 或 closeSession。

```text
连接 → 单帧读取（1 MiB / 120 秒） → 令牌认证 → 请求关联 / 上下文校验
                                                        ↓
                                     注入 runtime.execute（断线信号）
                                                        ↓
                               成功 / 错误 JSON 帧 → 结束连接
close → 停止接受连接 → 中断活动 socket → 监听器关闭 → 释放自有地址
```

- Windows 使用独立的随机命名管道，其他平台使用系统临时目录中的独立 Unix socket；不新增 TCP 端口、配置或环境变量。空闲监听器不阻止进程退出。
- 一条连接只处理第一条 LF 分隔的 JSON 请求；上限、UTF-8、CRLF 和畸形 JSON 处理复用已经独立实现的帧读取器。完整请求到达后，读取超时不变成额外的设备执行时限。
- 令牌为每个服务实例生成的 32 字节随机值，恒定时间比较等长字节。必须先认证，再读取关联 ID；未认证错误的 ID 为 null，不能把请求内容写入日志或解析诊断。
- id 与 method 必须为字符串，sessionId 必须是非空字符串；拒绝 runtimeScope=subagent。workspaceKey 按显式 key、workspaceIdentity、workspacePath 的次序 trim 并选择，缺失则拒绝。
- 保持原兼容范围：不擅自增加方法白名单、不删除上下文扩展字段、不修改 sessionId 的原始字面值。保留 workspaceIdentity、remoteSessionId、trace、clientMode 和 deliveryKind；设备方法及其参数继续由下游 runtime 校验。
- 成功响应包含相同 ID、ok=true 及 runtime 原结果；失败响应保持现有诊断和 ok=false。可序列化结果照常保留。非法结果序列化产生错误响应，不能从网络事件逸出导致宿主终止。不能转换为字符串的抛出值使用固定诊断，不再次抛出。
- 断线和关闭必须取消该连接的执行信号；关闭开始后新连接不得送入 runtime。重复 close 共用同一屏障，覆盖 listen 尚未完成的情形，并释放本实例真正取得的 Unix 地址。
- close 等待监听器与连接资源关闭，不承诺强制终止忽略取消的第三方 runtime。迟到完成或失败不能向已关闭连接写入，也不能成为未处理的 Promise 拒绝。实际 runtime 的生命周期由上层宿主统一管理。

## 验收与许可范围

先在旧实现上运行真实本地管道的认证、字段、错误、分片、并发、取消和关闭用例，再替换实现；新暴露的失败单独记录。所有 runtime 使用离线替身，不操作真实桌面或模型。验证真实构建 MCP 的完整调用链，执行根/CLI 类型与 lint、严格变更 lint、架构、格式、CLI 构建及完整离线回归。

本设计与来源记录只覆盖上述服务边界。旧源码访问如实披露，不声明无源码接触的 clean-room，不把不同摘要或功能相同本身当作原创证据；其他宿主、内核、UI 和第三方驱动维持各自待迁移或既有许可状态。
