# TaskOutput 读取与完成交付确认

2026-10-01。基线 `4ebb4ff211292bce031038fdd78d103518580787`。仅独立实现 TaskOutput 的验证、等待、单次投影和完成交付确认路径。格式化、输出文件读取、各类任务投影、注册表实现及工具声明不在本批替换范围。

## 所有权与顺序

RuntimeTaskRegistry 是唯一任务事实与 notified 所有者。工具不维护副本或新队列，也不订阅另一套终态事件。

```text
schema → ID/存在性验证 → owner 二次快照
    非阻塞 ───────────────────────────┐
    阻塞 → 等待进度 → 100ms 轮询快照 ──┤
                                      → 选定状态 → projectTask
        终态：投影成功 → 再检查取消 → owner 更新 notified → success
        活跃：不写 notified → not_ready / timeout
        等待后消失：timeout + null
```

- 输入保持严格 schema、语义布尔及 timeout 默认/范围。空 task_id 返回 code 1 的 handler failure；注册表存在但任务不存在返回 code 2。schema 错误优先；合法 ID 缺注册表才抛不可恢复 ConfigurationError。
- 保留验证的一次 get 和执行时的二次 get；两次之间消失仍返回 code 2，不缓存已验证快照。
- running/pending 是活跃状态；其余状态按原语义视作终态。非阻塞不发等待进度；活跃返回 not_ready，终态返回 success。每次调用都允许读取，不按 notified 去重或吞掉后续结果。
- 阻塞模式即使初始终态也先等待 emitEvent 完成，然后重新轮询。进度字段、UUID/Date 类型、trace/session/turn、序号 0 和 elapsedMs 0 保持。进度失败原样传播，不抢先投影或通知。
- 轮询保持 Date.now 起始和期限判断、100ms 延迟、每次读取前的取消检查。达到期限后最后再 get 一次，零 timeout 也会最后 get；不额外增设最终快照的取消检查。通过 context 的当前 registry 读取和写入，允许既有动态 owner 引用行为。
- timeout 返回活跃快照投影或 null；期限最后一读发现终态仍返回 success。投影完成后终态必须再次检查 signal，然后才 update；投影抛错或取消不写 notified。already-notified 的 patcher 返回原对象；未通知的只合并 notified=true，保留 owner 当前其他字段。update 抛错原样传播。
- 不接触用户数据、不改变任务取消/权限/生命周期、不新增配置、不修订文本预算或文件 IO。现有 poll 行为保留，不以固定轮次停止等待。

## 验收

切换前冻结 source 和 emitted 合同，覆盖输入、两次读取、状态矩阵、重复读取、投影与取消竞态、延迟进度、最后读取、100ms 轮询、任务消失、owner 替换、通知失败和真实内存 registry 消费者。切换后相同合同执行新 source/emitted，确定性案例比对旧入口的外部调用与结果。必须跑类型/lint/格式/架构、CLI 构建、来源清单和完整离线回归；远端双平台 CI 单独核验。不据此宣称整个 TaskOutput、原生 UI 或最终 MIT 完成。
