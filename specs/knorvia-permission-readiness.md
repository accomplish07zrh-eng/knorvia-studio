<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 审批先登记、再显示

2026-09-28。依据用户“保留基线并追求更好”的更新目标，修复异步审批准备期间的可见/可答不一致，并替换其协调实现。接续 `knorvia-tool-permission-flow.md` 的明确待办。已访问旧源码，不作无接触声明；许可按实际文件和摘要分别记录，不因新增接口或修复就把仍继承的整个文件认定为原创。

## 问题和范围

现有 core 先发布 PermissionRequested，随后调用 broker。真实 V4 投影会从该事件呈现可回答交互；AskUserQuestion broker 则可能仍在等待 sessionEntries 恢复。此时第一次 resolveInteraction 未命中，按迟到应答幂等成功处理而丢失。该缺口已在真实端口加异步存储的离线组合中复现；默认 SQLite 同步查询与 V4 批帧下的普通桌面点击尚未复现，不把接口反例扩大为实机事实。

同时修复 registry 恢复已过期问题的微任务只按 ID 寻址：旧条目注销、同 ID 新条目登记后，旧微任务可误答新请求。延期回调必须验证产生它的 entry/token，不能只查同名 ID。

覆盖 Protocol、Manual、Deny、CLI headless、CLI TUI 转发、TUI requester、子代理转发，及 core 初始审批和 Hook 修改输入复核。保留普通许可、AskUserQuestion、ExitPlanMode、会话/项目规则、fullAccess 提交重试、子代理 origin、legacy RPC、Desktop continuous 与 mobile replay。界面布局、模型与用户数据不变；不增加早答缓存、备用队列或超时补丁。

## 强制两阶段端口

`PermissionBrokerPort.preparePermission(request, options)` 返回完成登记的 handle。它不是最终答案 Promise；Promise 完成即表示该请求的唯一答复通道已绑定、但任何主动通知均未启动。

- `result`：同一请求的唯一结果 Promise，可在发布 Requested 的订阅回调中接到答案。准备期间的内部 rejection 必须有观察者，不能制造未处理拒绝；调用者仍获得原结果或错误。
- `activate()`：最多执行一次，启动客户端通知、RPC 重播、响应超时及自动继续；返回是否接纳本次激活。若激活前已经作答或释放则无副作用并返回 false，core 不再启动 Hook；若激活本身同步给出默认拒绝、CLI 确认例外或输入校验结果，首次仍返回 true，以保留原先 PermissionRequest Hook 的启动合同；不得另建答案通道或通过猜测微任务次数判断是否已经回答。
- `dispose()`：幂等释放本次登记、监听、timer 与仍属本次的 UI 项；待答结果必须结束，不能等待不合作的外部请求。旧 handle 不能移除同 ID 的更新登记。

所有生产实现和转发器同批实现 preparePermission，core 不提供旧 requestPermission 回退。保留 requestPermission 作为 prepare→activate→await result→finally dispose 的一步便利入口，以便原直接调用者复用同一生命周期；它不持有第二份 pending。不得只添加可选 ready callback 后假定尚未适配的 broker 已满足合同。公共类型和导出同步更新，接口示例展示先登记再发布和 finally 释放。

## 所有者和事件顺序

```text
core 单次计划：请求身份、评估和执行输入
  → broker.preparePermission（恢复必要持久状态）
  → 唯一 handle / 原 registry entry 已可接答，保持静默
  → core 发布 PermissionRequested，并等待发布完成
  → 打开本次发布屏障
  → handle.activate + PermissionRequest Hook 参与原仲裁
  → 原先到者/claim 规则 → PermissionResolved → 原规则授权与执行
  → finally dispose；败者取消，不等待其结束
```

broker/registry 拥有接答登记和释放；core 只拥有 handle 引用。单一发布屏障只记录本次发布结果与等待起点，不记录答案或创建新的权限状态。Hook 在屏障前不得运行，legacy RPC 在屏障前不得通知；V4 用户从 Requested 订阅回调立即回答时已能命中原登记。发布成功之后才开始统计用户等待，准备/事件传递时间不计入 permissionWaitMs。

- 发布失败：取消并释放已准备请求，停止尚未启动的通知/Hook，原发布异常上抛，不把它包装为用户拒绝，也不发布虚构的 resolved。此前已真正提交的用户授权仍由原事务/事件事实负责，不能在错误路径伪造回滚。
- 准备失败：不发布可回答的 Requested；以原权限请求错误类别返回失败，保持 cause 和遥测，无 handler 调用，也不为未呈现请求补虚构的 resolved。
- 父取消：涵盖存储准备、静默登记、发布、等待、fullAccess 提交各阶段；迟到准备完成必须立即释放，不能重新通知。已有端口定义的取消错误类别保留，不能通过超时模拟取消。
- 发布回调已经回答时，后续 activation 不再重复打开对话框。Hook 不能覆盖已接受的用户应答，重复/迟到回答继续幂等。
- Hook 修改输入复核仍复用 requestId；上次 handle 已释放后才能登记复核通道。复核使用同一准备/激活合同，保持当前不再发第二个 Requested 的行为，不能遗留旧请求占用。

## registry 静默登记与自动继续

登记时以原 map entry/token 和会话队列记录路由，分离“已登记”和“已激活”。冷条目能够接收合法回答，但不发 autoResolution 更新、不设倒计时、不自动回答。计时资格仍在登记时捕获；全局关闭永久取消该条目资格，重新开启不追溯旧问题。

激活后沿原会话顺序开始/恢复 AskUserQuestion 自动继续；恢复期限已过的回答也必须发生在 Requested 发布之后。全局设置、snooze、前一条结束和重登记不得绕过冷条目的激活边界。未激活时的本地资格/暂停变化只由原 entry 保存，激活后按其最终事实通知。

恢复微任务、visible/deadline timer、注销和异步 fullAccess 的完成都以 entry/token 验证归属。相同 ID 的新条目绝不能被旧生命周期移除、自动回答或改变计时。fullAccess 继续在副作用前 claim，失败保留本次登记供重试；成功并提交之后才按原规则接受回答，legacy 结果不得抢过正在提交的用户授权。

## 先行验收

先用旧代码证明两条失败：异步恢复时可见 Requested 的首次回复丢失；过期恢复的旧微任务自动回答同 ID 新登记。测试均使用原 core / Protocol broker / registry 和可控端口，不连接设备、真实数据库、浏览器或模型。

随后覆盖：准备阶段无可答 UI、发布订阅立即回答只一次；发布失败与各阶段取消均释放；不合作 RPC 不阻碍取消；Deny/Manual/TUI/headless/子代理均遵守两阶段；无效输入、Hook 改写复核、legacy 与 V4 竞速、自动继续事件次序、冷队首、snooze/global off、同 ID 重新登记、fullAccess 失败重试与取消。既有 Invocation/CUA 和新权限主流程测试同步保留或明确更新有意行为差异，不能删除失败场景让检查通过。

根/CLI 类型与 lint、严格变更检查、架构、编译产物、完整离线测试和两平台 CI 实跑；来源清单、规格、验证与许可范围同步更新。整体独立实现、根 MIT、安装/便携与官网稳定发行仍为后续完成门槛，本次不能宣称整个项目已经独立。

## 客户端适配范围

TUI 的请求函数保留可调用入口，并提供必需的 preparePermission。显示队列只保存当前审批控件；取消和完成按控件身份清理，不使用 requestId 删除可能属于下一次的控件。cleanup 仅移除显示项，不能在键盘提交前先拒绝答案。TUI 通过公开的 core 生命周期帮助类共享结束/取消所有者，包依赖显式登记；不再实现另一套 settled 与 abort 状态。CLI 转发器在准备时绑定当时的 TUI handler，后续回合不能偷换已准备请求的接答对象。

headless 的 CreateWorkflow / AmendWorkflow 确认例外保留，普通工具仍委托默认拒绝 broker。例外同样等待激活，不能生成永久规则；冷请求取消后不得再放行。协议映射和持久状态读取帮助函数的机械拆分保留原来源与适用许可，不计作独立实现。

同 ID 重新准备时，registry 在替换路由后结束旧 owner，旧 RPC 立即取消；旧句柄后续激活必须返回 false。已排队的恢复微任务除归属外，还需重新核对暂停状态与计时资格，确保同一事件循环中的 snooze/global off 不会被自动回答越过。跨 session 替换或移除旧 session 归属时同步迁移原队列项，不能把无效 ID 留在旧队首。

发布等待可被父取消结束，不等待失去响应的事件端口；优先保留准备句柄已有的取消错误。若用户已经先答而发布尚未结束，取消仍阻止工具继续。迟到发布完成只被观察，不再激活客户端或 Hook，也不补发尚未成功发布请求的 resolved。事件端口本身的已发生写入不能在此撤回，其终止投影仍由原工具/回合取消事实负责。
