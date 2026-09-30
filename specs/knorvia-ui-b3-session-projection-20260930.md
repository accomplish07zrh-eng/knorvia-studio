<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# UI B3 会话投影合同

2026-09-30，生产修改前冻结。实际最新 PR #7 基线 `34fb23e5f5c610bd7379096d3f281f4bff79b71f`，origin/main 为 `bd0bb014c0974334557fa51814709d0b78f35f1d`。专用 B3 分支直接从 PR head 建立，不包含未在主线落地的 B1/B2 分支提交；此文件不依赖 B1/B2 helper，不回写它们。仅修改 `packages/ui/src/lib/sessionProjection.ts` 与本批唯一命名的新 tests/spec/docs；不改 UI 布局、state store、协议/服务 schema、共享实现或 inventory/global config。B4 不授权。

依循 `knorvia-independent-implementation.md`、既有 session/protocol 类型与消费者公共行为。作者读过当前旧实现、消费者及固定上游 `zcodeSessionProjection.ts`，属于 source-exposed，不是 clean-room；生产保留 Apache-2.0，来源与可独立授权判断待外部复核。

## Owner 与设计

```text
Host accepted state/snapshot → existing shared title/status/model codec owners
                            → UI adapter ordered task meta / select catalogs
desktop continuous ─────────┐
mobile replayable ──────────┴→ identical supplied snapshot projection
readSession promise → existing active-header hook effect generation/cancel guard
                    → current task fallback meta; stale result is ignored
```

投影无存储、订阅、网络或 revision cache；只投影提供的当前快照，不能在此判断哪个异步结果新鲜。hook/service 继续独占读取及取消顺序，projection 不处理审批响应、重放、附件下载或用户数据迁移。

候选设计：共享公开 mode policy 继续独占四模式的名称/顺序与 fresh options，UI 复用它避免维护第二份相同目录。UI 的 thought-level 有效性检查与共享旧 settings helper 不同，不能整函数转交或改掉。UI 用 select 记录 factory 与 model/thought 专用 adapter 建立有序目录；goal 只读明确字段/别名和浅层 time，不递归未知对象；完整 meta 维持规定键序。模型选择仍复用共享 codec，不复制 parser。

## 固定配置与模型边界

- 五个导出名称与签名保留：formatModelPickerValue、parseModelPickerValue、sessionSettingsToConfigOptions、knorviaWorkspacePresentationToConfigOptions、sessionSnapshotToTaskMeta。
- format 完全沿用共享 formatter：undefined/未绑定显示空串，provider/model/options 的 slash/colon/$ 不另作编码。parse 先调用共享 custom decoder；仅 providerId 和 modelName 均 truthy 时返回 own providerId/modelId（不注入 options、不额外 trim/validate）。其他输入继续共享 parser，包括其错误类型/message。custom 前缀大小写/空白、legacy builtin、URI 解码失败仍由 decoder 决定。
- settings 目录固定 model、mode，thoughtLevel.enabled truthy 才追加 thought_level；返回每次新数组/新 select/options，顺序、英文文案、键序固定，不因 mode.available、permission、unknown 等字段变更目录。
- model current 使用 settings.model.current；catalog 按原 available 顺序含重复项。model option 必有 own value/name/description/modelProviderId/modelProviderName，description 可以 undefined；providerLabel nullish 才 fallback providerId，空串不 fallback。reasoning 存在则 own modelThoughtLevels，即便 []；defaultLevel truthy 且在 levels 才有 own modelDefaultThoughtLevel。
- mode 目录顺序 build/edit/plan/yolo，当前 auto/unknown 不在该目录则显示 build；task meta 的 session.mode 原样传递，不能同步归一它。
- thought current 必须 truthy 且在 available 值中，否则尝试有效 default，否则第一项值，否则空串。enabled=false 不读取 thought.available。重复/空串/空列表、unknown current/default、缺省属性按旧适配器处理，不按 schema 外的值补新验证。

## 固定快照边界

- meta own keys 顺序：taskId/traceId/title/workspacePath/workspaceIdentity/createdAt/updatedAt/mode/model/thoughtLevel/provider/status/lastError/target。可选 meta 字段仍创建 own key，其值可为 undefined；target null 与 undefined 必须区分。
- taskId 来自 session.sessionId；随后立即调用 generateTraceId 一次生成新的 UUID，而不是沿用 session.traceId 或稳定推导。UUID 之后才调用 title owner；异常照常抛出，不能提前预计算后续投影导致 trace call 顺序改变。
- title/status 始终调用现有共享公共函数；标题 trim/真实首条 user/goal objective/fallback 与隐藏合成消息规则不另写。model 则按 supplied messages 的数组倒序取第一条 truthy info.model，不按时间排序、不按 role/visibility 筛选；没有才回 settings.model.current。恢复 hint 保留消息的 reasoning options。task thoughtLevel 仍是原 settings.thoughtLevel.current，与工具栏 default fallback 区分。
- lastError truthy 时 code 使用 code ?? type（空串 code 保留），truthy detail/attribution 才创建对应属性，message 原样；attribution 保留引用。lastError 强制 error 及其他终态/审批/工具阻塞/过期 currentTurnId 规则由共享 status owner 决定。projection.status 不直接覆盖 session.status。
- target truthy 时浅层适配；非 truthy 原样传递，不把 null/undefined/false/0 合并。目标字符串要求非空但不 trim；sessionID/targetID 大写别名优先，其次小写；objective 空缺为 ""，summaryTitle/activeInputId 空缺为 null；status 仅 active/paused/budget_limited/complete，否则 active。tokenBudget 只检查 typeof number，保留 NaN/Infinity；其他计数/timestamps 仅有限 number，缺省 0/null。time.created/updated 优先嵌套有限值，再 createdAt/updatedAt，再 0，零值优先；不递归数组/未知值/循环对象，不保留未知键。
- workspacePath 与 workspaceIdentity 原样传递，不 normalize、decode、resolve 或替换 identity。message file/url/parts、permission input、backgroundJobs 等载荷不进入 meta；附件呈现与路径协议仍由现有其他消费者处理。深层/cyclic 未使用载荷不应触发遍历、克隆或 serialization。
- 无数据 mutation；已冻结快照可重复投影，除 trace UUID 外输出确定。无效必要结构的 TypeError、codec/schema 错误和 getter 异常继续公开；不吞异常、补伪模型、把 unread malformed snapshot 当成成功。此边界不承诺代理对象任意 getter 变化的全量语义。

## 消费者与验收

先跑旧源码固定期望，再提交 spec/tests。新增测试覆盖目录/keys/default/unknown、全状态与阻塞/终态优先级、恢复模型/隐藏消息/时间乱序、target 空值/非有限值/继承/深层循环、workspace 原路径/附件不投影、错误与 UUID 顺序、fresh arrays/引用/不变性。

执行实际 sessionConfigTaskCache、workflowRunSettings/subagent label、workspacePrepareRpc 的公共函数，验证 codec/catalog 与协议边界。实际 useActiveTaskSnapshotMeta 在受控 useState/useEffect 与注入 readSession 的单元 harness 中运行，验证先清跨 task meta、列表命中不读、messageLimit=1、workspaceIdentity 与 remoteSessionId、stale resolve/reject/unmount 取消；这是实际 hook 代码的生命周期单测，不是 React DOM/E2E。

最终运行 source 与实际 dist、新测试独立 typecheck、根 typecheck/lint/架构/owned 格式、相关 Web build 和 source-map 字节核验。有限对照去除随机 trace 值但单独检查 UUID 次数/格式；不得将有限合同或 build 当成全产品、并发 Host 协议或来源法律保证。主线负责组合 CI、共享清单及独立来源审查，本批在 B3 检查点交接。
