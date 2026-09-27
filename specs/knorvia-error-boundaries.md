<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 公共错误、原因投影与工具失败结果

2026-09-28。独立替换 contracts/errors 入口、core/errors/error-payload 与 tool/executor/errors。已访问原源码，不作无源码接触声明；公开名称、错误枚举、文案和字段均是兼容协议，不作为原创证明。本批不更改 provider、重试调度、权限审批、工具主循环或错误展示 UI。

## 设计与状态所有者

公共入口负责普通 Error 的附加协议与命名错误策略；每次投影独占原因链、候选选择和细节去重状态。原因采集、文本规整、上下文属性规则与选择/投影分离。工具结果仅将投影装入既有 envelope，并应用原始用户反馈和首次模型错误的显式策略。没有缓存、持久状态、异步操作、网络或设备调用。

```text
公共类型/命名策略 → 每次调用的新 Error → 现有调用方
错误/原因链 → 有界帧采集 → 消息与代码选择 → 上下文/细节投影
                                                ↓
工具失败 + 原始反馈策略 + 首次模型错误 → 原有结果 envelope → 现有 UI/模型
```

## 公共 CoreError 协议

- 保持全部 27 个 CoreErrorType 名称、值、顺序及类型；运行时对象不新增冻结。保留 CoreError 接口与所有导出工厂/谓词。
- createCoreError 返回本 realm 的普通 Error，保留其原型、name/message/stack 和可变性；按 type、code、cause、context、recoverable、retryable、timestamp 顺序附加可枚举、可写字段。code 为 type 大写；cause/context 保留引用且缺省也有 own 字段，两个标记只以 nullish 回退 false，timestamp 每次新建 Date。
- isCoreError 继续使用 Error 实例与 type/code 存在性，不额外验证枚举或字段类型，不把普通对象或其他 realm 的 Error 接纳为已验证错误。此谓词是兼容识别，不能当作外部安全校验。isRetryable/isRecoverable 原样读取字段。
- 五种命名工厂保留消息、context 键及参数引用：sessionNotFound 和 invalidTurnPhase 可恢复；toolNotFound 不可恢复；toolExecutionFailed 可恢复且可重试；permissionDenied 可恢复且不可重试。cause、expected 数组及 reason 的缺省字段不能丢失。

## 原因链与消息投影

- 仅采集非 null、非数组对象，最多 12 个不同身份的节点；使用 cause ?? lastError ?? error 选择下一项。选中的 false/0/空字符串结束链，不改用后备原因；重复、自引用与非对象结束，不抛递归栈错误。
- 上下文仅接纳上述对象。角色取节点有效 errorPayloadRole，再取 context 中有效角色；只有显式 wrapper 算包装层，不按错误名称或文案猜测。
- 原消息需是非空白字符串，保留原文供 selectExecutionErrorMessage。投影消息/细节压缩空白并限制 500 个 UTF-16 单元，超长采用前 497 加三个点。fallback 同样处理；无法得到规整文本时保留调用方 fallback 原值。
- 主消息取第一个有消息的非 wrapper，随后才取第一个有消息的任意帧。节点 code 优先 providerCode、context.providerCode、节点 code；非空白字符串或有限非零数字可用。contextCode 独立取 context.code。
- 主帧非 wrapper 时优先自己的 code 再 contextCode，wrapper 时反过来；再依次尝试所有非 wrapper 的 code、所有 contextCode、所有 code，保持原因链顺序。
- detail 按每帧 message、detail、context detail 的顺序去重，再移除与最终主消息完全一致的行，以换行连接。context detail 的字段顺序为 provider、provider_code、model、request、code、reason、status、retryable；别名按 nullish 选择，值接受 trim 后非空字符串、有限数字（含 0）及布尔值，不额外压缩其内部空白或截断。
- underlying 取最深的非 wrapper 帧，没有时取最后一帧；即使该帧无消息也不能改取前面有消息的帧。只在存在对应规整文本时输出 underlyingErrorMessage/Detail。
- 结果字段顺序为 attribution、code、message、detail、underlyingErrorMessage、underlyingErrorDetail，缺省项省略；原对象、上下文和原因链不被修改。

## 上下文归因

- 文本按外层到内层、同层别名顺序选择首个 trim 后非空字符串，并截取 160 个 UTF-16 单元。providerId/provider、modelId/model 是别名。source、errorPhase、exceptionKind、transport 先选首个文本再核验协议枚举；外层非空但非法的值阻止回退到内层。
- statusCode/status 每层先 nullish 选择，再检查整数 100–599，非法时可检查下一层；不会改读同层被非 null 值挡住的别名。retryable 优先首个上下文布尔值，然后首个非 wrapper 帧自己的布尔标记，false 不能丢失。上下文属性按检查/读取阶段处理，选中的 getter 取值变为 nullish 时仍回退到帧标记，不继续寻找另一份上下文值。
- providerErrorCode 先选 context.providerCode，再用原因链中首个全数字节点 code；上下文值限制 160，后一回退沿用节点 code。reason、providerKind 等按相同文本规则选取。
- 字段输出顺序保持 source、reason、errorPhase、exceptionKind、providerId、modelId、providerKind、transport、statusCode、providerErrorCode、retryable。无有效字段时省略 attribution。未知 context 字段不输出。

## 工具结果

- 仅对 CoreError context 中的合法 toolHandlerFailure 使用 handler 错误；其 result 必须严格 false、errorCode 为有限 number（包括 0）、message 为 string。保留原引用，不改错误编号或 handler 文案。isToolHandlerFailureError 只完成判定，不为返回布尔值再次提取 payload；构造结果时才按既有阶段读取它。
- 首次模型校验内容优先于 handler 的 tool_use_error 包装，空字符串也保留。普通错误不新增 modelContent。handler code 优先于投影 code。
- CoreError 的 reasonSource 为 plan_approval_feedback/workflow_refine_feedback，或 preserveReasonFormatting 严格 true 时，错误 message 保留原文，不截断用户反馈；其余使用投影摘要。detail/code 仍按原投影提供。reasonSource 保留依次短路比较及命中后再次读取的阶段；最终 message 在结果字段构造前确定，随后读取 toolCall 身份、error.type、code、stack，不因拆分呈现策略而提前读取元数据或推迟捕获反馈。
- 保持 toolCallId/toolName、success=false、output=null、error 中的 type/message/可选 code/detail/reasonSource/stack、可选 modelContent、durationMs 与两个独立 Date。缺省时长为 0，不擅自规整已有数值。
- 权限错误保留 reason ?? 默认文案，原 context 浅复制后强制写正确 toolName；不修改调用方 context，不改变权限判断。handler 失败工厂保留代码、完整 failure 引用和调用身份。

## 验收与许可范围

先为公共错误形状、命名策略、原因链与枚举优先级、格式边界、原始反馈、首次模型错误和 handler envelope 编写固定期望测试，在旧实现验收后再切换。新旧有限输入对照排除 stack 的源码位置与实际时间值，保留其他外部字段/顺序；任意 Proxy 或全局对象改写不作无限支持声明。

随后运行根/CLI 类型及 lint、变更严格 lint、架构、格式、真实编译产物和完整离线回归，并更新逐文件许可证据。公开兼容协议与标准 Error 机制不宣称为 Knorvia 的新发明；MIT 决定只绑定本次独立实现及对应规格/测试，根许可和发行版本仍待全量迁移结束。
