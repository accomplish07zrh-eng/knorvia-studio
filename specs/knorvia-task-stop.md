# TaskStop 单次停止命令与结果投影

2026-10-01，行为基线 `a0c79ae8017ed07daa0226ed4d887aaa2b349caf`。本批独立实现 TaskStop 执行路径，保留入口声明、权限、别名和模型输出格式；不改变运行时任务所有权、取消策略、数据格式或 UI。

## 所有权和顺序

```text
schema admission → task ID selection → control port admission
                                      → owner.stopBackgroundTask once
                                      → pure result projection → output/error
```

背景任务运行时是唯一状态所有者。工具只发送一次严格停止命令，initiator 为 model，透传原 traceContext；不保存任务状态、不重试、不增设队列、不把工具动作记成用户动作。端口承诺的异步结果完成前不输出终态；端口抛错保持原始对象。

## 兼容合同

- schema 严格验证先于任务 ID 和端口检查；拒绝多余字段、null、非字符串。task_id 以 nullish 优先于旧 shell_id；空 task_id 不回退到 shell_id，空 ID 抛原缺参数错误；空白字符串不擅自 trim。
- 缺端口为不可恢复 ConfigurationError，含 toolCallId/TaskStop；合法调用的 initiator、strict、traceContext 均保留。既有 handler 没有额外的 abortSignal 检查；取消仍由现有 executor/owner 负责，不在这里新增取消入口。
- 成功用端口返回 taskId；type 缺省为 background_task，但空 type 保留。message 以 nullish command/type 选择说明，command 输出属性仍只在 truthy 时出现。因此空 command 的消息括号为空，但输出没有 command 字段。
- not_running 错误 code 3，保留 status/taskId/taskType/toolCallId，消息 status 缺省 unknown，空 status 不改写。cancel_not_supported 错误 code 1，保留 reason/status/taskId/taskType/toolCallId。其他拒绝均 code 1/not-found 消息，仅含 reason/taskId/taskType/toolCallId。错误均保留 ToolExecutionFailed、recoverable true、TaskStop。
- 失败使用请求 ID，成功使用返回 ID；不以错误文本判断分支。没有重复请求去重：每次工具调用都交给同一 owner 判断。
- 入口 aliases、metadata、permission、预算、timeout/cancellation/trace 声明与 JSON formatter 保持不变。

## 验收

在切换前先对旧入口执行冻结合同，覆盖入参优先级、拒绝顺序、完整错误形态及 undefined 属性、成功空值、trace 对象身份、单次端口调用、this 接收者、异步等待、同步/异步抛错、独立重复调用及取消边界。切换后同一合同覆盖 source 和 emitted 入口，另以确定性生成案例对照旧入口的调用和结果。完整类型/lint/格式/架构/来源新鲜度、CLI 构建和全量离线回归仍必需；本批不证明原生 UI 或最终 MIT 迁移完成。
