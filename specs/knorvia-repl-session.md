# Knorvia REPL 会话宿主独立实现

本规格落实独立实现迁移的会话边界，保持 `@knorvia/core/repl` 公开契约；由声明文件、调用者和替换前黑盒行为建立验收，不以旧源码正文作为逐行重写模板。编译仍由 `cell-compiler.ts` 承担，浏览器协议、权限、MCP worker 和业务队列的状态所有者保持不变。

## 状态及事件顺序

```text
调用者串行 admission → Session.run → 本次输出收集器（异步上下文）
                               ↓
                       现存 VM 上下文 → 独立单元格编译/执行
                               ↓
                      返回结果 / 错误 → 关闭本次收集器
                               ↓ 取消或同步超时
                    清理该上下文计时器 → 重建 VM 与注入桥
Session.dispose → 关闭收集器、取消执行、清理计时器，不再接受执行
```

- Session 唯一拥有 VM、计时器和每次执行的收集器。上下文成功调用后保留，普通语法/执行错误不清空；已生效的声明保留。
- 内置工具持久 Session 与 MCP 每调用新 Session 是调用者选择；本层不另起业务队列或修改它们的生命周期。
- 取消（包括已经取消的输入）与同步 VM 超时重置全部上下文绑定，重新创建注入桥；结果错误附带既有 kernel reset 提示。Node 的模块缓存不清空。VM 不是权限或安全沙箱。
- 每次 run 结束后，其异步后续仍可在 Node 自身语义下完成，但不得再向其他 run 写日志、图像、结构化结果或可信桥元数据。异步输出归属以执行上下文识别，不能只查“当前 sink”。取消或 dispose 清理受控 timeout/interval。
- 依照调用者的串行契约，重叠 run 返回明确 BusyError，不悄悄覆盖活动输出；dispose 幂等，后续调用返回 DisposedError。

信号取消与 cell 错误同时发生时，保留得到的结构化错误，并清掉该代上下文，防止重用已撤销执行的绑定。dispose 只释放，不声称已重建可继续使用的内核。同步预算传入时截取整数并至少为 1 毫秒；省略时不另增默认同步预算，生产调用者继续传递各自预算。

受控计时器仅指注入全局的句柄；通过 Node 模块直接创建的计时器仍遵循 Node 生命周期。本层不是隔离任意第三方副作用的安全沙箱。已关闭 run 的输出调用直接丢弃，也不再校验或抛出新的输出参数错误。宿主记录必须在对应 run 的异步上下文中发生，没有归属的记录不会附到恰好活动的调用。

## 公开结果与能力

- 末值沿既有字符串化规则：字符串原样、对象/数组 JSON 两空格缩进、undefined 不设置 result、不可 JSON 序列化的值转为字符串。日志按调用顺序换行拼接，console 五种级别写同一收集器，不污染 MCP stdout。
- 保留 Buffer、URL、URLSearchParams、TextEncoder/Decoder、structuredClone、queueMicrotask、require、动态 import、process、受控 timeout/interval，以及注入的字符串和 symbol 全局。
- `nodeRepl` 提供 cwd/homeDir/tmpDir、每次 requestMeta、write、emitImage、emitStructuredResult、setResponseMeta。
- 图片支持 Uint8Array/Buffer/数字数组，以及 `{ bytes, mimeType }`、`{ base64, mimeType }`、`{ dataUrl }`；默认 PNG。非法输入报告 TypeError。裸 data URL 在旧宿主不受支持，文档不得将它描述为已经支持的形式。
- structured result 要求 content 数组及带 type 的块，保留 isError、structuredContent、\_meta；不把普通 console 输出冒充该通道。
- 模型 setResponseMeta 保持普通顶层合并；宿主 mergeResponseMeta 对 `knorvia/toolSurface` 的字段保留合并。可信 CUA 身份和截图记录方法只暴露给宿主，不进入 VM globals。
- 截图来源以本次真实 screenshot 记录的 mimeType+base64 多重集匹配输出图像下标，同字节重复 emit 不得超过实际记录次数；CUA 身份取最后一次宿主记录。没有宿主记录时不生成可信身份。
- `restrictProcess` 保留只读状态、cwd/计时/资源统计和 nextTick；不暴露 exit、kill、stdio 写入或修改环境。require/import 的 process 特例使用同一受限 facade；这不隔离第三方模块中的主机能力。
- require 保持以调用 cwd 为解析基准，import 保持模块解析语义且传递 import attributes。修正宿主遗漏第二参数的缺口，不改变编译契约。

结果边界的补充约束：TypedArray/Buffer 等二进制视图保留 Node 的有界 inspect 预览，避免把截图的每个字节展开成 JSON。VM 内置的 globalThis.JSON/Promise 必须仍可见；不承诺 Node 未注入的 Web API。特殊抛出值（空原型对象或带抛错 getter/Proxy）也须被归一成结构化错误，不能在错误处理时再次调用不安全的属性访问而逃出结果边界。

structured result 和 responseMeta 在记录时使用独立快照，后续 cell 对原对象的修改不能改写已发出的结果。不可跨 worker 传输的值在记录入口报告 TypeError；两种宿主共用这一约束，避免等到 postMessage 才丢失本轮输出。

## 浏览器回合提示

`browser-turn-state.ts` 只保存特定 session/turn 的候选浏览器提示，不保存实际浏览器状态或审批。仅接受 `js` 和 `mcp__node_repl__js` 的输出；先读取 `_meta`，不存在时读取 `responseMeta`，再提取 `knorvia/browserTurnScreenshot` 中整数 browserGeneration 和字符串 browserId。新有效提示覆盖该回合旧提示；无关输出或格式错误不能清掉已有有效提示。consume 读后删除，clear 只删除指定回合。

两个标识必须分别作为键，不能拼接成有歧义的字符串；例如 session=`one:two` / turn=`three` 不能与 session=`one` / turn=`two:three` 混淆。提示本身不是图片来源或可信执行证明，实际截图仍由具备权限和代际核验的浏览器调用者取得。本轮不扩展可以记录提示的工具名或后台权限。

## 验收

先在原宿主执行持久状态、结果/日志、图片和可信来源、元数据、动态 import/require、错误重置、计时器与 dispose 的黑盒测试。再独立实现会话、输出收集、资源管理和辅助函数，删除旧实现入口。对取消后续写、import attributes 和重叠执行增加隔离测试；已知旧缺陷单独记录，不声称旧版本通过这些测试。

相关 REPL/MCP 测试、根及 CLI 类型/lint、变更架构、CLI 构建、离线回归均须实跑；调用入口及最终 bundle 不得引用已删除的旧宿主。界面与模型推理不在此边界中改动。
