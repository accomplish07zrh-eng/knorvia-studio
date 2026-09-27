# REPL 单次执行与进程生命周期独立实现

替换 node-repl-host 的执行器和进程事件适配层，保留公开导出、worker 标识与调用数据。MCP 的同会话队列、Windows 插件加载和整机权限保持原所有者，本层不新增业务队列或执行许可。

## 执行所有者

```text
宿主 admission → 单次 executor → 新 Session / 新 Worker → 第一个终态
                                              ↓                ↓
                                         本次桥绑定     撤销绑定 / 清理资源
取消 → 执行信号 → 停止 Worker 或 Session → 传播原取消原因
```

- In-process executor 每次创建并最终销毁一个 Session，启用受限 process；浏览器和 Computer Use 桥都只持有本次执行身份与信号。结束后撤销桥绑定，即使其对象被外部保留也不能继续调用。
- 代码、requestMeta、同步预算及可选 CUA 连接照原接口传递。插件文档根每次调用按现有环境值和 cwd 的 nullish fallback 解析，不擅自 trim 或改写配置。
- 每调用新 Session 保证 VM 全局隔离；默认 MCP Worker 进一步提供 Node 模块缓存隔离。In-process API 本身不承诺清空 Node 的公共模块缓存。
- Worker 数据不携带 AbortSignal，只携带调用数据和固定 kind。父进程拥有其完成与取消；第一条消息、错误、退出或取消确定唯一结果，不重试。成功/失败均发起终止并移除本次取消订阅；终止是资源清理，不重写已经确定的调用结果，也不保证阻止外部进程的副作用。
- 已取消输入在创建 Worker 前拒绝。执行中的取消必须传播原 reason（缺失时用 AbortError），不能被其他信号观察者的 stopImmediatePropagation 阻断。没有结果的退出保持明确诊断，迟到消息不能覆盖已确定的结果。
- 本层沿用已有 Worker 结果合同，不把 VM 或独立 Worker 描述为操作系统权限沙箱；真实桌面权限仍由对应工具和 runtime 执行。

## 进程事件

- 每个 process 对象只安装一个错误观察器，第一次提供的 stderr 与关闭回调为所有者。uncaughtException / unhandledRejection 的普通错误写入 stderr，不污染 MCP stdout。
- EPIPE、EIO、ENXIO、EBADF、ERR_STREAM_DESTROYED 或写 stderr 失败，触发一次关闭回调；关闭后忽略后续事件。保留错误对象及既有诊断前缀。
- 非 Error 的原因可转成诊断；不能转成字符串的值使用固定错误，不能让错误处理本身再次逸出。对 stderr 抛出的同类值也适用。
- 每次 shutdown trigger 安装分别监听 SIGINT、SIGTERM、stdin end/close，共用本次一次性触发器。监听不等于直接退出进程，实际关闭流程仍由上层提供。
- 直接入口判断比较 module URL 与 argv 入口的真实文件路径，支持相对路径及系统符号链接解析；缺失、无效 URL 或不存在的路径均为 false。导入模块不会因此启动 stdio 服务。

## 验收

先对旧实现运行真实离线 Worker、Session 和模拟进程事件契约，分别记录兼容通过和新复现失败。新实现把调用资源与 Worker 完成控制分开，执行同一组测试，核验最终 MCP bundle 的隔离、超时与后续可用性。

根/CLI 类型、lint、严格变更 lint、测试类型、架构、格式、CLI 构建和完整离线回归均须实跑；多平台 CI 分别记录。文件来源记录只覆盖复核的替换范围，披露旧源码访问；不把框架依赖、整个宿主或产品提前称为全部自研 MIT。
