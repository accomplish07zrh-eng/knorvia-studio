<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# UI B1：错误投影、任务元数据与草稿失效合同

2026-09-30。基线为 PR #7 的 `8e8f6310d5ca70a57a454054e44f7b61db30b83f`。此文件在生产实现变动前建立。本批只拥有 `packages/ui/src/lib/{uiError,taskMetaMerge,draftSkillInvalidation,customModelValue}.ts` 及唯一命名的新测试、规格、验收文档；不改 UI 布局、存储、logger、共享协议/schema/模型 codec、许可清单、锁文件或全局配置。不得开始 B4 store 改造。

## 来源与边界

作者已读取上述四份旧源码、公开调用点与迁移来源清单。固定上游清单存在 `zcodeUiError.ts`、`zcodeTaskMetaMerge.ts`、`zcodeDraftSkillInvalidation.ts`、`zcodeCustomModelValue.ts`，不能因当前路径缺少映射就声称原创。旧实现仅用于提取外部合同和验收，不能把逐行改写或通过测试当作独立来源证明。本批没有 clean-room 隔离，也不作整体或文件 MIT-ready 结论。生产改动保持 Apache-2.0；新的规格与测试表达单列 MIT，仍由集成者审核登记。

先冻结旧文件字节及固定期望测试，再执行新设计：错误投影以有序字段规则和分阶段候选流表达；元数据以单次基底选择和显式字段策略表达；草稿以同步失效阶段与异步 close 阶段表达。简短的共享模型转发适配器保留原字节，不增加第二份 codec，也不将其计为独立替换完成。

## 状态所有者与顺序

错误与元数据投影是无 IO 的调用局部函数，不修改输入、不缓存真相。服务仍拥有任务持久状态，UI store 仍拥有 optimistic overlay 和 workspace draft runtime epoch；本 helper 只是现有 owner 的命令适配。workspace identity 只在失效调用边界 trim，使用现有 store 的路由规则。

```text
unknown error → ordered candidates → display choice → validated attribution → UI error
task + optimistic overlay → preferred base → title/read-status policies → task projection

runtime/skill change
  → no workspace path: return
  → store.getState → getWorkspaceState(path, trimmed identity) → capture draft id
  → store.invalidateDraftRuntime(path, identity)  [同步，V4 没有 draft id 也必须执行]
  → no captured id: return
  → sessionService.closeSession(captured id, path, optional identity)
  → success info / failure warn
```

close 不能早于失效。关闭挂起时失效已可见；捕获的旧 id 不因 store 被失效后改动而改变。每次调用各自执行一次失效/关闭，不新增去重、队列、timeout、retry 或跨窗口状态。桌面 continuous 和手机 replay 投影继续使用相同 owner；本批不修改其传输或恢复协议。

## 错误公开合同

- 保留 `KnorviaUiError` 与 `normalizeKnorviaUiError(error, options?)`。输出键序是 `code,message,detail`、存在时的 `underlyingErrorMessage,underlyingErrorDetail`、`traceId,taskId`、存在时的 `attribution`。`detail/traceId/taskId` 缺省也必须是 own undefined 字段；underlying/attribution 缺省须省略。
- record 仅非 null、非数组 object。文字只 trim 两端，不压缩内部空白、不截断。空白、数字、布尔字段不可作为 string 字段；原始未知输入以 `String(error)` 转换，转换失败向外抛出。
- record 候选顺序：message、detail、data.message、data.detail、data.details、data.reason、data.error.message/detail/details、data.knorvia.error.message/detail/details。去重保留首见顺序。Error 先加入其 message，然后同样读取 record 字段。
- 字符串若 trim 后以 `{`/`[` 开头，尝试原生 JSON.parse；仅成功 record 且有可用候选才用其字段，其他情况显示 trim 后原始字符串。JSON array 不遍历。record 的每个候选加入后，若自身是 JSON record 字符串，只展开其同一组字段一层；顶层 JSON 字符串不执行这层展开。
- 五种泛化文案为 `Internal error`、`Turn execution failed`、`Compact failed`、`Rewind failed`、`Knorvia Studio session failed`。主消息取首个非泛化候选，再首候选，再原样 fallbackMessage，再 `Internal error`。detail 取与主消息不同的首个非泛化候选；它不是单纯复制 error.detail。
- code 路径顺序为 code、providerCode、data.code、data.error.code、data.knorvia.error.code、data.knorvia.error.context.providerCode、data.error.context.providerCode、context.providerCode。独立 detail 读取顺序为 detail、data.detail、data.error.detail、data.knorvia.error.detail；其中首个字符串的 `/provider_code=([0-9]+)/` 匹配优先于 code、fallbackCode 和 `UNKNOWN`。不从其他候选、details（复数）或晚于第一 detail 的文本提取业务码。
- underlyingErrorMessage、underlyingErrorDetail、traceId、taskId 的顺序均为 root、data、data.error、data.knorvia.error。options traceId/taskId 用 nullish 覆盖；空字符串仍是显式覆盖。fallbackCode/fallbackMessage 原样使用，包括空字符串。
- attribution 按 root、data、data.error、data.knorvia.error 顺序调用现有 `errorAttributionSchema.safeParse`，首个成功结果为准。空对象有效且阻止后续 attribution；strict schema 拒绝未知属性，不能手写或放宽 schema。
- 不采集 cause 链，不新增兜底异常吞噬。读取 getter、原生 String 与 schema 的异常仍公开抛出；一般数据的候选/字段次序与已冻结旧版保持。

## 元数据公开合同

- 保留 `mergeTaskWithOptimisticMeta(task, optimisticTask)` 与有序 `mergeTaskMetaCandidates(...candidates)`。时间较新者为基底；时间相同时仅 optimistic 的原始 title.length 更长才取它，相同长度仍取 task。不按 trim 后长度、不重新排序、不校验 taskId 或 workspace identity。
- 只浅复制基底的全部 own enumerable 字段（含未知字段/symbol），非基底的任意未知字段不合入。两个输入均不可修改；嵌套引用不 clone。
- changeSummary/model/provider/status 用基底值 nullish 回退另一输入。空字符串、false、0 等非 nullish 值不能被吞掉。模型之外的 target、thoughtLevel、pendingInteraction 等仍完全依赖基底，不扩展 merge 范围。
- title：fallback.titleOverridden truthy 且 base.titleOverridden falsy 时取 fallback.title；否则基底标题 trim+toLocaleLowerCase 后为空或 `new session`，且 fallback 不是占位，才取 fallback；其他情况取基底。只有严格 true 才强制 titleOverridden=true；否则 nullish 回退，不能把 truthy 当严格 true。
- optimisticTask 有 own unreadAt 时，无论时间新旧都采用该值，包括 own undefined（显式清已读）。没有 own 字段时才使用 base.unreadAt ?? fallback.unreadAt；继承属性不算 own，但在 nullish 回退时仍可读取。
- 返回始终 own changeSummary/model/provider/title/titleOverridden/status/unreadAt，缺省可为 undefined；保留原基底字段键序，追加新键顺序保持上述次序。
- candidates 从左到右跳过 null/undefined（运行时的其他 falsy 也沿用跳过）。首个非空 candidate 返回原引用；后续调用 `mergeTaskWithOptimisticMeta(candidate, accumulated)`，因此旧 unreadAt overlay 与同长度标题优先级具有顺序性。空输入返回 undefined。不改成无序集合或重新按时间排序。

## 草稿公开失败合同

- 两个 async 入口和参数保持；skill 入口强制 logScope=`skills`，其他参数沿用。
- falsy path 不访问 store；仅 identity trim（空/空白 → undefined），path 本身不 trim。store 读取、workspace 查询、invalidate 的异常使 Promise reject，不执行 close 或日志。
- close 请求包含 workspacePath、sessionId；identity 只有非空时存在 own 字段。draft id 为 falsy 时只失效、不关闭、不记录日志。
- close 同步 throw/异步 reject 均 warn 并 resolve；成功 info。保留原消息及日志对象键序 `draftSessionId,reason,workspaceIdentity,workspacePath`（warn 再加 error），缺省 identity 是 null；Error 使用 message，其他原因 String 转换。
- success info 抛出也走同一个 warn；warn 抛出或错误 String 转换抛出仍 reject。不把失败偷偷改成成功。sessionService 的 method receiver 保留。

## 模型适配与验收

模型入口继续调用 `@knorvia/shared` 的 encode/decode；旧编码、空 model、URI 特殊字符、畸形 escape、legacy builtin、多冒号、非 custom 值、输入异常全部由现有 codec 决定。不新增本地 prefix/解析器、迁移或缓存。

固定期望测试先跑旧版再改实现；冻结 candidate 顺序、业务码优先级、空对象 attribution、own/absent、空白/JSON/数组/异常，元数据竞争/已读清除/手动标题/未知字段与多候选，失效/close 挂起和失败顺序，以及共享 codec 等价。有限数据交叉对照和实际编译产物只作为兼容证据，不声称任意动态 Proxy/getter 或全产品等价。执行根 typecheck/lint、变更架构、格式、UI/lib 定向合同与相关构建；全量 suite、设备实机、数据迁移、打包和发布由父任务协调，不重复执行。
