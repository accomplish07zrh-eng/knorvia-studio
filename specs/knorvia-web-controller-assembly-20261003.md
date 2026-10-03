# Web HTTP Controller 装配修复

2026-10-03。基线 `345a5a8698efec4f216e4118275214f25fdbd96b`。
PR22 的确切输入 `cfe79b3c71dffd8c55ff6d8c1d51abb40da9e7d8` 在真实源码 Web
观察到 `window-controller` 通道超时。本规格先于装配修改。

## 原因与边界

`RemoteServiceAccess` 已提供 `IWindowControllerService`，UI 通过它读取全局任务投影。
Desktop Host 在暴露 RPC 前登记 controller，并为 attachment 创建独立订阅实例。
HTTP 入口只暴露 `createLocalServices` 的集合，没有执行对应 controller 装配。
本次只修复 HTTP/服务入口，保留 UI、公开协议、业务方法、SQLite 与 renderer 存储。

## 唯一 owner 与装配

```text
现有 task/agent services → 一个 HTTP Host controller runtime → 派生列表投影
浏览器 WebSocket → 一个 controller attachment → V4 snapshot/delta 与 ACK
                └→ socket close → 释放本连接订阅与 agent connection scope
HTTP server close → 释放 controller runtime 的 source observer 与投影
```

- 将原 Desktop 的 controller runtime、projection、sessions-index observer 移至
  services 的专用 Node 入口 `@knorvia/services/window-controller`。原 Desktop 文件
  保留公开入口转发，所有功能函数体沿用同一实现；这是位置与装配调整，不是新原创替换。
- HTTP server 对已有 task service 创建一个 runtime；source 使用请求的完整
  `workspacePath` / `workspaceIdentity`，业务数据与事件仍由 task/agent services 所有。
  列表的既有 existing-only observer 不启动 Agent；缺少运行产物不伪造运行态。
- 每个 WebSocket 暴露独立 attachment，订阅 id、事件及释放只作用于本连接；
  runtime 的派生投影和 source observer 共用，不给浏览器另建持久状态或第二个索引。
- 已有外部提供的 controller service 继续沿原服务集合暴露；缺少 task service 的
  file-only remote 集合不注册假 controller、不扩大远程业务能力。
- 仍使用原 `IWindowControllerService` descriptor 和 V4 帧。Desktop 的连续链路与
  Web replayable agent connection scope 不变，不修改授权、能力 token 或 relay 路由。
- 保留 pin/archive/unread/delete 的业务委托、完整 source 身份校验、离线投影、
  single-flight 刷新和 per-source generation 规则。socket close 清理保持幂等。
  source refresh/search 的失败进入现有 HTTP 日志，保留原可信投影，不静默宣称成功。

## 验收场景与当前状态

集中验收时，用真实 HTTP/WebSocket/RPC 链路与合成 task source 检查：controller
订阅和 pinned 读取可用；两连接订阅独立、source observer 共用；mutation 与事件
更新沿原 task owner；关闭连接不终止另一个连接；错误 remote 地址不写本地 task；
HTTP close 后 source observer 释放。原 Desktop controller 回归与真实 GUI pinned/
grouped 场景也需运行，保留真实 Windows GUI/安装环境缺口。

本批按父任务要求等待四路输入后集中验证，未在实现期间运行测试、lint、类型检查、
构建或完整审计。阅读 PR22 的历史 GUI 证据不等于本修复已通过。原来源、版权、
LICENSE、NOTICE 与历史记录保留；迁移代码不因换目录获得原创或全量 Apache 结论。
