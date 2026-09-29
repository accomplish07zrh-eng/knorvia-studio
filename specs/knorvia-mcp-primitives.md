<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP描述符与等待截止边界

2026-09-29。以下先行行为合同经设计审阅和有限旧行为观察确认，独立作者只读取批准合同/声明及自身既有上下文，先写设计再实现。模型类型由公开contracts提供；descriptor只导出normalizer，timeout保留错误类、四函数及deadline类型。调用方的连接、OAuth、重试、权限及UI所有权均不改变。

Scope is exactly two existing helper surfaces in the adapter's MCP infrastructure. No callers, schema/auth policy, shared connection ownership, source task cancellation or UI change. Descriptor state is a fresh value projection. Deadline state belongs to a single waiter; underlying connection/recovery/callback Promise remains borrowed and shared. No framework, new configuration, public test hook, hidden retry or observer registry.

Descriptor signature normalizes serverName:string, tool:unknown, optional timeoutMs:number and official:boolean to the existing McpToolDescriptor. Keep arity4. A record is any non-null object except arrays (not only plain objects); functions are not records. Non-record tool is an empty record. Tool name is its string name, including empty, else "unknown". Keep raw serverName/toolName separately; public name is mcp** + separately sanitized server and tool components joined by **. In each component replace every non-ASCII-letter/digit/underscore/hyphen with underscore, collapse underscore runs, and use "unknown" only if the resulting component is empty. Do not trim or collapse the final delimiter/prefix.

Always return own keys in order serverName, toolName, name, description, timeoutMs, inputSchema, outputSchema, annotations; description is a string or undefined, timeoutMs is passed unchanged. An official:true own key is appended only when requested; false/omitted does not produce that key. This flag remains supplied by the caller's trusted HTTP-origin decision, never derived from tool input or plugin labels.

Non-record input schema yields a fresh object with type:"object", fresh properties:{}, additionalProperties:true. Record schema yields a new shallow copy of its own enumerable fields with type forced to "object" and properties preserved by identity when record-valued, otherwise replaced by a fresh empty object; do not inject additionalProperties into this branch. Preserve other fields and nested references, never mutate input. Record output schema is returned by identity; other values yield an explicit undefined outputSchema. Record annotations produce exactly four own fields in order readOnlyHint, destructiveHint, idempotentHint, openWorldHint, each a boolean or undefined; other annotations produce undefined. Ignore other annotation fields. Inherited ordinary tool/schema properties are read normally where selected; shallow copying remains own-enumerable only. No validation library or actual auth request.

Timeout public surface is McpTimeoutError(message) extending Error with name="McpTimeoutError", McpDeadline with expiresAt/timeoutMs numeric fields, createMcpDeadline(ms) arity1, remainingMcpDeadlineMs(deadline,message) arity2, waitWithinMcpDeadline(promise,deadline,message,signal?) arity4 and withTimeout(promise,ms,message,signal?) arity4. Preserve type signatures and synchronous versus Promise failure boundaries.

createMcpDeadline uses current Date.now plus the supplied duration floored and clamped to at least zero, returns own fields expiresAt then timeoutMs; timeoutMs stores that same floored/clamped duration, not the raw input, and performs no extra finite-value validation. Native NaN/Infinity behavior remains. remaining subtracts current Date.now from expiresAt; <=0 synchronously throws a fresh McpTimeoutError with the supplied message, otherwise returns the remainder unchanged (including native nonfinite results). It does not mutate/recompute the deadline or read its timeoutMs for this result.

waitWithin first evaluates the remaining deadline and retains its synchronous expiry error before considering the optional signal. When still valid it returns the ordinary waiter wrapper using that remaining duration. withTimeout always returns a new Promise, forwards the requested duration to the platform timer without its own floor/clamp, and never aborts or modifies the source Promise. An already-aborted signal wins over an already-settled source: reject with signal.reason if it is an Error, otherwise a fresh Error("Operation aborted"). A later abort uses the same rule. Native DOMException is an Error and retains identity. On source success, return its value by identity; source rejection retains any reason (including non-Error). A timer win rejects with a new McpTimeoutError(message). First observed terminal event owns settlement; no retry or result transformation.

Every terminal path releases its owned timeout and abort subscription; no listener or live timer survives completion. Normal pending cancellation currently cleans up correctly and must not be advertised as a new fix. Late source success/failure after cancellation or timeout must be harmless and cannot re-settle the waiter or escape as unhandled rejection. Different waiters sharing one source remain independent; source completion is still available to the others. Do not cancel shared work or alter connection lifecycle/authentication.

Confirmed gaps from four native owned child observations: withTimeout on an already-aborted signal left an already-rejected source unobserved (one unhandledRejection); waitWithin on an expired deadline synchronously threw as required but left an already-rejected source unobserved (one unhandledRejection). Pending-then-aborted source rejection had zero unhandled events/listeners, and cancelling one of two waiters did not affect the other. Correct only the two early observer gaps while preserving the required error identity/priority and synchronous expiry. The input remains the same Promise with its rejection still observable by other consumers. Root used no real network, model, credentials or tasks.

Source observation on early exit must preserve synchronous deadline failure and signal priority without retaining active waiter resources. Ordinary platform/native Promise semantics are the acceptance focus, not arbitrary hostile Proxies or patched platform functions. Write your own design before source; normally formatted modules must stay below400 lines each. Static checks only against the approved declarations with exact compiler input inventory.

Root owns old-first tests, main-source and actual CLI artifact acceptance, full offline regression, per-file provenance review and commits. Static passes, small standard expressions, fixed protocol names, MIT headers or eventual test success alone do not prove authorship; prior context remains disclosed.

## Final clarified valid-input observations

createMcpDeadline at Date.now=1000: inputs -1.75/1.75/NaN/Infinity produce timeoutMs 0/1/NaN/Infinity and expiresAt 1000/1001/NaN/Infinity. Own field order remains expiresAt, timeoutMs.

A record inputSchema shallow copy has the ordinary Object.prototype even for a different source prototype. Own enumerable symbol fields are preserved along with own enumerable string fields. Ordinary JSON own **proto** remains an own data field and retains its nested value identity; it must not alter the copy prototype. Existing type/properties keys keep their original positions; absent type then properties are appended in that order. For source {z:1}, keys are z,type,properties; source keys properties,z,type keep that order. Selected inherited properties retain reference identity; no other inherited fields are copied.

For native source Promise and AbortController: source already fulfilled, then withTimeout returns and same-stack abort occurs before reaction: abort wins. Pending source resolved in the same stack and immediately aborted: abort wins. Resolve pending source then await one Promise microtask before abort: source reaction wins. Already fulfilled source with a 0ms timeout: source reaction wins. This is callback observation order, not a snapshot of the source Promise internal state. Keep Error/DOMException identity and fresh fallback abort Error rules.

Two further owned child observations cover source initially pending and rejecting only after early return: already-aborted withTimeout and expired waitWithin each still leave one unhandled source rejection in the old baseline. The expired observation also used an aborted signal; required synchronous deadline priority remains. Correct these late-source cases as well as the already-rejected cases. Both early paths leave zero abort listeners already; do not claim listener cleanup is newly fixed. Borrowed source rejection must remain available unchanged to separate consumers.

## 所有权与可观察顺序

描述符拥有新顶层记录及输入schema浅层，借用嵌套properties/outputSchema；不查询模型、身份或网络。等待器只拥有本次包装Promise、终态仲裁和自己的timer/abort listener；底层source为借用对象，其他等待者可继续观察它。

```text
tool值 → 新描述符 + 新inputSchema浅层 → 原嵌套引用/固定hint投影
deadline → 求remaining ── 到期：观察源拒绝 → 同步抛原期限错误
                     └─ 有效：等待包装
signal已取消 → 观察源拒绝 → 包装Promise拒绝（不建立活动资源）
正常等待 → source / abort / timer 首个回调 → 释放本等待者资源 → 结算
                                      └─ 迟到源结果仍被观察，不影响其他等待者
```

CLI目录未托管，本批人工核对适配层只使用公开contracts类型，无新增产品运行依赖或公共hook。日期、原生Promise和AbortController的有限观察不能证明所有主机负载；生命周期测试在自有子进程观察unhandledRejection、监听器及自然退出，不接触模型/用户配置。旧版四项早退源拒绝失败须保留为修复证据；其他兼容用例、主仓整合、实际CLI可达产物与完整离线回归均应实际运行。
