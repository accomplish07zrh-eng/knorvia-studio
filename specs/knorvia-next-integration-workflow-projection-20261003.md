# Shared workflow run projection 完整替换候选

2026-10-03，基线 `91d5cd9dc70f7e801abe2cdecdb12e73d3491c56`。父任务授权继续 shared workflow reducer 的真实剩余替换。当前主体 `packages/shared/src/protocol-v4/workflow-runs-reducer.ts` 最后提交仍为 `7619e41b950bd52073ebf36754146cf25659d9fa`，原当前 SHA-256 `f07e531f2dc425d701ce538f0a74c865f6658a99acc9c22ff68d67a6cfef11e6` 与历史 WIP/accepted-binding HOLD 均保留。不会恢复旧私有 artifact，亦不把新实现绑定成历史 accepted bytes。

已读原主体、workflow-runs schema、调用方及 installed concurrency/node-progress/phase/artifact helpers。属于 source-exposed authoring；独立表达、来源与贡献权利仍待核验，保留原许可义务。

## 范围与状态所有者

保留 reduceWorkflowRunsState、WorkflowRunProgressEnvelope 的原公开入口与字段。替换主体并增加包内 workflow-run-projection/collections/nodes/observations 完整 owner；schema、public barrel、已安装的 concurrency/phases/node-progress/artifacts、CLI bootstrap、UI/services/native 文件不改。

一个 envelope 先选择同 runId 旧记录或默认 pending；一个包内 draft 持有该次转换的唯一新 run，各领域按自己身份写有界表，不另存业务状态、订阅缓存、engine command 或线程。actor 状态采用本次节点观察汇总派生，不另维护持久 actor lifecycle。顶部统一按既有 JSON equality 抑制无变化并写 revision/bounded runs。

```text
CLI envelope → 原 shared reducer 入口 → 本次 run draft → node/actor、report/question 或 lifecycle
                                     └→ 已安装 helper 继续处理其字段
               → 同一次 run commit → JSON 无变化则 null；否则 revision+1 与 maxRuns 裁剪
UI / cold replay / TUI ← 原 schema 与单一 shared 入口
```

## 必须保留的行为

- runId falsy 或 eventType 非 string 返回 null；sequence 非 number 用 0，payload 仍接受 non-null/non-array object，不新增严格解析。previous 缺失为空态；新 run 的字段顺序/默认 pending/usage/actors/nodes 与 toolCallId 规则保持。sequence 用 Math.max 保持高水位；迟到事件仍归约、不按序号拒绝。unknown/log/artifact-failed 只更新水位，不杜撰产物或节点。
- 同 runId 查首个旧记录，写回全部同 runId 项；新 run 追加，超 maxRuns 按最旧裁剪，不自动按活跃时间调序。已有 run 的 JSON.stringify 逐字节相同则 null，不抬 revision。未知扩展字段按旧浅复制保留；纯归约无时钟、随机、I/O 或 schema 放宽。
- actors/nodes/reports 按严格 siteId===、ordinal=== 首槽替换或追加；questions 按 qid 首槽；触界拒新、继续更新旧条目，truncated 继续累计。ordinal 只沿用 number 读法，不把新 Map 的 SameValueZero 当成 strict upsert 身份。固定字段、limit 和顺序均保留。
- actor-created 保留 name/session/birth phaseName 的读取与裁剪，不向前猜缺失字段。node 只在现有七个 phase 事件变相位；kind/actor/phaseName/任务进度按原 carry 规则，outcome/cached 的缺席仍按旧 snapshot 重建，不新携带。首次 dispatched（旧节点不存在或 queued）计 nodesUsed，即使节点被展示 cap 拒收也保留计数事实。
- actor 的 running 优先 executing/repairing/nudged；waiting 为 queued/dispatched/waiting 或尚无 owned node；其余 completed，run 终态压过所有节点。状态未变保留 actor 对象引用。node-progress 继续由已安装 helper 仅更新读数，不计步、不动 actor。
- report 保留 serializer/预览省略号、instance upsert 和 tag；tag 计数按 upsert 前是否首次出现判断，被 cap 拒收时仍沿用旧计数政策；不计 nodes/actor。artifact-published 继续调用 installed summary/upsert/id policy；artifact-failed 不造失败卡、不占 version。
- escalation-raised 必需 qid/question；actor 读不出仍可展示，actorName/context/askedAt 的读取、裁剪、有限数条件保持。resolved 划掉所有同 qid；只在实际删除到零时摘整个 pendingQuestions 键，未命中/原空表保持旧幂等行为。
- run-started 继续由原 helper 清结算残影并重臂、归零 usage，保留 learned concurrency/model/lineage 条件。phase/concurrency/helper 行为不重写。run-settled 清实际 pending/cooldown，completed/errored/stopped 才是已知终态；未知词按 errored 关闭并保留/补原错误文案。stopReason 只随 stopped 搬运，supersededBy 只随 superseded；resumable===true 才写 true，其他原字段携带边界不修订。

## 后续统一验收与来源

本阶段不运行测试、lint、类型检查、格式/架构检查、构建或完整审计。以后统一验收覆盖空/残缺/未知/迟到/replay、run eviction、每种 phase、cached resume、caps/strict identities/重复项、actor 状态、report/artifact/question、token/progress/concurrency/phase/lineage 和 cold/live/UI 实际消费者。既有源码阅读、旧报告或新 commit 不构成通过证据。

schema/声明/固定字段政策与标准语言表达保留原来源；新 bounded-table/observation/draft 结构也不自动建立独立表达或 MIT 权利结论。根 LICENSE/NOTICE、current-files/reviews、历史 accepted hash、首次失败和材料义务不修改。只在现有 lane-integration 记录中追加实际 source SHA，不另造重复审计包。
