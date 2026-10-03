# PR #7–12 持续整合基线

2026-10-03。本轮用户授权先整合积压 PR，为父任务后续固定云端任务提供唯一基线；实现阶段不运行测试、lint、类型检查、构建或完整审计。代码阅读、冲突解决和远端提交确认继续进行。上述本轮要求优先于仓库/技能的中途验证命令。最终统一验收与合并 main 留待后续阶段。

## 唯一分支与初始输入

唯一整合分支为 `integration/backlog-20261003`，从 PR #7 的实际最新 head 建立。main 为 `bd0bb014c0974334557fa51814709d0b78f35f1d`。所有输入使用完整 SHA；不信任 PR 描述内较旧的 checkpoint，不强推、不改写源分支，不创建额外云端任务。

| PR | 分支 | 固定 head |
| --- | --- | --- |
| #7 | recovery/independent-logging-20260930-0456 | f25b931164ee6287167e965e9da7a7586131b264 |
| #8 | parallel/material-closure-fast-20261002 | da2aae2e86e83f62ac9b8edd3496b408fcda2139 |
| #9 | recovery/server-lifecycle-20261002 | 2458655c2644c487bb66967800e000943b9678cf |
| #10 | independent/settings-lifecycle-20261002 | ea7aa6acf8e9b33c7446aa25a8ca16687e2f330e |
| #11 | parallel/cli-tools-fast-20261001 | e884311ee74df690cfe36e38d9bbe0eae86c791d |
| #12 | independent/root-remote-cache-20261003 | b84ab3a992f1df751661f6b64ee5f7e25d0ebdb8 |

#9、#10、#12 继承 #7 实际最新 head；#8 从 main 分叉，#11 从 #7 的较早祖先分叉。分别以真正 merge-base 枚举改动，不把较旧分支缺少的后续文件误判为有意删除。使用保留父提交的 merge，不重放已整合提交。发现 head 推进时另记新 SHA 和增量，仍维护此唯一分支。

## 冲突的版本选择

- 保留 #7 的 `read-text-orchestration.ts`、`read.ts`、Read consumer fixture/test 与 `specs/knorvia-read-orchestration.md`。#11 携带的较旧版本没有同步 generator 的完成时序修复，也缺少 PDF golden 的跨平台 UTF-8 字节校正。保留 #7 的源码、规格和原测试，不削弱 oracle；#11 后续其他成果照常合入。
- `workflow/scheduler/{collection-planner,node-runner,planner-expansion}.ts` 采用 #8 后续完整 E owner：planner `cf75d15f534f1d9855356fb9cb3a11b06a7c648d`、runner `dfae259be47287be6642ab8469009b008a01bdb2` 的实际 descendants。完整冻结稿与安装绑定先于本轮整合。#11 早期 mixed/corrected versions、额外 helper 和失败记录保留在提交历史及证据；不能把其旧 source/emitted selectors 写成 E 当前组合的通过证据。
- `session-context/read-session-context.ts` 是 #7/#8 另一处冲突：采用 #8 `b5152875cb5aa236e920af07779b05fe2b8b8752` 已安装的完整 E owner，并同时保留 #7 的 material-selection helper、原有测试和历史记录。保留公开 API、筛选/排序/预算/引用/可见性行为；本轮不声称执行验证或绑定旧 helper receipt 为新 owner 验收。
- 无冲突文件按 Git 三方合并保留；有冲突的文件逐一阅读并绑定选择来源，不用全局 ours/theirs 丢弃某一路成果。来源决定、LICENSE、NOTICE、第三方义务与历史失败不可为门禁修改。

## 业务与来源边界

本轮不增加产品行为、不改变 GUI、黑白视觉/玻璃/布局/快捷键/中英文，也不迁移或操作用户数据。保留 workspace identity、owner/lease、CommandInbox 串行 admission、stale run、桌面 continuous 与手机 replayable 的已有边界。

```text
固定 PR head → 三方合并 → 单一当前 source owner → 同一整合分支
                           └→ 历史来源/失败/冻结稿继续保留
后续固定任务 → 基于完整基线 SHA 的模块分支 → 此整合分支 → 最终统一验收 → main
```

#10 的 `sessionService` 与 `taskIndexSyncer` 仍为 UNALLOCATED / UNINSTALLED，保留 prior-root-allocation-and-origin-holds；其他 root/E accepted-hash HOLD 按精确路径与 descendant 查明，不能用本地缺 receipt 推断未分配。#8 的 todo/tool-perf 等询问仅作归属输入，不因文件短或 inventory 标签就重写。

## 本轮完成记录与后续验收

完成记录写入 `docs/knorvia-backlog-integration-20261003.md` 和同名独立整合证据目录：完整输入 SHA、merge commit、冲突选择与最终 blob、来源义务、后续模块文件归属、远端确认及未执行项。保留旧 PR open/draft 供活动分支继续提交；建立面向 main 的整合 draft PR，暂不合并 main。后续提交继续按 source head 记录，不修改历史通过/失败记录。

本轮测试、lint、类型检查、格式/架构验证、构建、完整审计、原生/界面/真实消费者验收均 **未运行**。仅阅读既有 CI：#9 `37096643153`、#10 `37096385450`、#12 `37095110127` 的 Linux/Windows job 都失败于 file provenance inventory，安装及后续产品检查 skipped。不得写成通过，不重跑、不绕过门禁。来源清单新鲜度、跨模块兼容、source-expression/权利核验、原生 UI/平台、安装版/便携版/迁移与最终 Linux/Windows CI 仍待最终阶段完成；根许可不改称全量 MIT。
