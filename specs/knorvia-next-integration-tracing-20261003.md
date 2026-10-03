# Contracts tracing 完整替换候选

2026-10-03，基线 `91d5cd9dc70f7e801abe2cdecdb12e73d3491c56`。父任务要求整合者继续 tracing 的真正剩余实现；已读 tracer.ts、core runtime 的 turn/compact/rewind context 调用和 deps adapter。源码暴露，不能声称隔离作者或 clean room；新结构的表达独立性与贡献权利留待后续核验，保留原许可义务。

## 范围与单一状态所有者

替换 `apps/cli/packages/contracts/src/tracing/tracer.ts` 的完整 runtime owner，新增包内 span residence 与保留原协议声明的 tracer-types。原 tracer 导出的 TraceContext、ExecutionContext、Span、Tracer 及所有函数/参数、同步与 Promise 边界保持。contracts 公共 barrel、logging、shared identity、runtime、其他 lane 不改。

span 从私有 class 改为公开数据 record 和包内共享操作原型；同一 record 的 status/endTime/error/attributes 是唯一可见事实。结束回调用 WeakMap 关联 record，不新增第二份生命周期标志、事件队列、持久化或 exporter。操作方法保持 receiver，回调看到同一已更新 span。上下文仍只有一个 module AsyncLocalStorage；Tracer scopes 不自动安装新 ambient context。

```text
createTracer.startSpan / createSpan → 一个 span record → 同一 record 上的属性/结算操作
                                           └→ status 已更新后调用关联 hook(span)
runWithContext / runWithContextAsync → 唯一 AsyncLocalStorage → getCurrentTraceContext
root/child context → 原 identity 规则 → runtime / logger 的原公开入口
```

## 必须保留

- trace id 优先使用显式 parent/current context，缺失才调用 createTraceId；span id 保留 randomUUID 的前 16 个字符，不改格式。parent id 优先 spanId，再 parentSpanId。root/child 的 query/session/turn fallback、parentSpanId/parentId 字段与 attributes 引用/浅覆盖保持。
- span 的 public fields/defaults、mutable attributes/status/error、开始/结束 Date 保持。setAttribute 与 setAttributes 仍在当前 attributes 对象上写入；addEvent 仍无外部副作用，不补 exporter。
- end 仅在当前 public status===running 时结算，先写 endTime/status/error，再调用 hook；hook 的 this 仍为该 span，错误原样传播，重入看已结算状态。无 hidden closed flag，不修订 public status 被外部重设时的既有行为。
- Tracer 返回普通对象；withSpan/withSpanAsync 通过 this.startSpan，保留消费者覆盖 startSpan 和 detached method 的 receiver 边界。同步 scope 在 try 内执行 fn/end；失败转成 Error 供 span.end，但向调用方抛原错误，包括 string/object。hook 在成功 end 中抛错时保留既有 catch/end 再调用路径。
- withSpanAsync 保留 direct fn(span).then 的边界：fn 同步抛错仍同步逃逸、span 不自动结算；fulfilled 时 end 后返回原值，rejected 时 end 后抛原错误，end/hook 的异常照原 Promise 路径传播。不是 async/await 行为修复。
- runWithContext 同步返回原结果，async wrapper 保留原 Promise assimilation；不 clone context，不切换 logger，不自行生成 child span。log context 固定字段后覆盖 attributes，attributes 同名值的原优先级保持。
- 协议声明、standard ALS/UUID/Date/Object 操作与固定字段保留既有来源，不计为新原创，也不把类型搬家当成一个新完成模块。

## 验收状态

本阶段不执行测试、lint、类型检查、格式/架构检查、构建或完整审计。以后统一验收应覆盖 public identity/receiver、重入/idempotence、原错误及 hook 异常、sync throw 与 Promise rejection、context 嵌套/并行传播、root/child/log 的引用与覆盖、真实 runtime consumer。源码阅读不是通过证明；根 LICENSE/NOTICE、reviews/current-files 和旧来源决定不修改。
