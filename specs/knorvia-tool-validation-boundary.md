<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 工具诊断对象、输入准备与执行校验边界

2026-09-28。独立替换 `tool-input-validation-issues.ts`、`input-normalization.ts` 和 `executor/validation.ts`，承接已替换的 JSON Schema 校验与模型错误呈现。已访问旧源码，不作无源码接触声明；公开名称、字段和消息是兼容约束，不是独立来源证明。CoreError 定义、工具执行主循环、权限/Hook 调度和第三方 parser 本体不在本次迁移范围。

## 状态和边界

每次调用独占有序诊断字段、解码结果、parser 调用和错误投影，不增加会话缓存、队列、持久状态或 I/O。日志仅经既有 Logger 端口。字段协议、格式化描述及有序写入分别位于 `validation-issues/`，公开工厂保留当前签名和导出类型。两个执行校验方向通过同一 runtime parser 适配入口调用对象方法；不会把第三方 schema 实现算作自研。

```text
原始输入 → 顶层 JSON 解码 → runtime parser → 输入 schema 检查
                                              ├─ 首次：附完整模型错误
                                              └─ Hook/permission：常规错误
工具结果 → runtime output parser（存在则权威）→ 无 parser 时检查 output schema
诊断描述 → 有序字段协议 → 可变问题对象 → 已有模型呈现或 CoreError context
```

调用调度顺序、权限重新评估、审批与执行器生命周期继续由现有调用方负责；本批不提前执行工具或复用首次模型错误到后续阶段。

## 诊断对象协议

- 保留八个工厂、八种问题类型及公开接口名称；输出仍是可修改的普通对象。字段顺序直接进入模型 JSON，按显式协议表写入，不能靠“语义相同”重排。
- invalid_type 的顺序为 expected、可选 format、code、可选 received、path、message；有限 number 对 integer 一律使用 int/safeint（包括非整数与超大数），其他 integer 输入使用 number。NaN/正负 Infinity 的 received 字段分别为 NaN/Infinity；Infinity 文案仍用 received number。format 存在时不输出 received。
- received 文案保持 null、array、NaN、原生 typeof 及非本 realm 普通原型/类实例的 constructor.name 区分。schemaType 仍经 String 转换。无法完成既有字符串转换的输入抛出，不用占位文案假装成功。
- invalid_value：code、values、path、message；unrecognized_keys：code、keys、path、message。空/单/多值、空键单数和多键复数保持。字符串值仅包双引号，不额外 JSON 转义；BigInt 文案带 n 后缀而 values 中保留原值。
- 太小/太大：origin、code、minimum/maximum、inclusive、可选 exact、path、message。inclusive 缺省或 null 时为 true；exact 仅严格 true 时出现，且不把比较符文案改成等号。string/array 分别使用 characters/items，number 使用数值文案。
- union：code、errors、path、message；custom：code、path、message；format：可选 origin、code、format、可选 pattern、path、message。pattern 空字符串仍输出。format 选项保留先检查、再读取的顺序：origin 完成后再处理 pattern；首次读取为 undefined 时省略，首次有值而第二次返回 undefined 时仍保留已决定写入的字段。其他可选字段缺省时省略。
- 每个 path 复制；values/keys 只复制外层，errors 保留原引用。稀疏 values/keys 的输出副本稠密化，文案仍基于原列表的空槽语义。复制字段按协议顺序完成，消息在轮到时求值；类型诊断的类型描述在构造问题前完成。不会冻结、深复制或清洗任意载荷。

## 输入准备

- 只解码顶层字符串一次。JSON 标量、null、数组和对象都有效；JSON 字符串的内容不再递归解码。非字符串原值直接传递。
- 解码失败保留原字符串，并发送既有 warn 文案及 event、inputLength、module、source、status、toolName 元数据；不记录输入正文。解码/日志阶段之后才读取 runtime schema，保留先后顺序。
- 只接纳非 null 对象上的可调用 safeParse（包括继承方法和数组对象）；函数自身携带 safeParse 不视为 schema。捕获方法后以原 schema 对象作为 receiver 调用一次，修复旧输入分支丢失 this 的问题。方法抛出与日志抛出仍传播，不转换成成功或改用 JSON schema 掩盖。
- runtime 成功返回其 data，包括 undefined 和新的对象引用；失败保留解码后的输入，只收集 error.issues 数组中的非 null、非数组对象。原 issue 引用保持，收集列表独立；没有有效项时省略 runtimeValidationIssues 字段。
- initial API 返回准备结果；普通 normalize API 只返回 input。source 为 initial/hook/permission，首次 API 固定 initial。不在此处补写默认值，默认值和 preprocess 仍由 parser 决定。

## 执行校验

- 输入以 entry.inputSchema 检查；有效返回 undefined。无效返回 ToolExecutionFailed / recoverable=true，消息为原 inputSchema 文案，context 保留 errors（最多 20）和 toolName。
- runtime-only input issues 不独立触发这一层的拒绝；JSON schema 有效时仍返回 undefined。这是当前调用边界，不能把接入工厂迁移误写成改变整个工具接纳策略。
- 首次校验额外附加 initialInputValidationModelContent；内容覆盖完整问题列表，不受 context 的 20 条上限影响。普通输入校验及 output 失败没有该字段。读取器只接受对应 CoreError 类型中的字符串值，包括空字符串，不修改错误对象。
- 输出 runtime parser 存在时，其成功/失败决定结果：成功即结束，不回退 JSON schema，也不把 parsed.data 替换成调用方 output；失败抛原 runtimeOutputSchema 错误，消息列表取 issue.message 前 20 条，recoverable=false。输出阶段保留先读取 safeParse 检查能力、调用时再次读取的契约，输入阶段则使用先前捕获的方法；两阶段均只执行 parser 一次并保留 schema receiver。第二次读取不可调用时继续抛错，不能回退成成功。
- 无 runtime output parser 时才检查 entry.outputSchema，失败抛原 outputSchema 错误且不可恢复。parser 自身异常继续传播。畸形 parser 返回不伪造成合法成功，也不作为本轮通用第三方 schema 修复工程。
- 纯校验不触碰文件、网络、设备、模型、权限或用户数据。没有增加真实模型测试或默认启用能力。

## 验收和许可

先补固定期望对象/字段顺序、类型边界、稀疏列表、引用关系、字符串转换、parser receiver、日志与执行阶段测试；在旧实现复现 receiver 故障。与固定旧提交对照有限工厂和准备/校验输入，receiver 修正单独验收，避免将新行为混入兼容比较。再检查真实编译产物、根/CLI 类型与 lint、变更严格 lint、架构、格式、来源记录、CLI 构建及完整离线回归。

本批 MIT 决定绑定实际新实现、测试和规格摘要；不扩大到未迁移工具执行器、CoreError、桌面、UI 或整库。根许可证和版本保持到最终全量迁移与稳定发行验收。
