<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# UI B3 WIP：停止 Fast 后的恢复检查点

2026-09-30。用户要求立即停止扩展工作，保存可恢复成果，由父任务使用 Standard 接续。本批没有受支持的任务级配置切换接口，不声明已切换。此检查点为 WIP，尚未验收，不启动 B4。

分支 `ui/b3-session-projection-20260930-01` 直接基于实际 PR #7 head `34fb23e5f5c610bd7379096d3f281f4bff79b71f`；当时 origin/main `bd0bb014c0974334557fa51814709d0b78f35f1d`。未引入本工作者 B1/B2 分支提交，不要求 whole-branch merge。父任务将成果转给新整合者 `01a0f285-d0f0-74f1-a49c-03dd1e15109f`。

先行合同提交 `3f10794b33ca4f3f2fa9e3634cd12b2b8a654062`，本 WIP 实现作为下一提交；按此顺序 cherry-pick 后接续验证。生产仅修改 sessionProjection.ts，复用共享公开 mode policy，保留 UI 独有 thought 有效性回退、模型 codec、title/status owner、UUID 求值顺序及浅层 goal projection。

## 已完成的有限验证

- 修改前旧版本 58/58，0 fail/skip；涵盖实际 config/workflow/workspace consumer 与受控 hook 生命周期。
- 候选源码同一合同 58/58，0 fail/skip。
- 根 `pnpm typecheck` 通过，5,422 i18n matching keys。
- 新增测试独立 typecheck 通过；仓库外临时配置显式纳入实际 Vite client 类型，没有修改全局配置。
- 已在运行的有限对照于停止指令后收尾：4,800 settings + 9,450 snapshot inputs，14,289 comparisons，0 differences；包含异常、own key order、UUID 每调用次数，65,001 model catalog 与 150,001 messages。比较使用固定共享 owner，不证明其独立来源。
- 生产前 freshness 与架构检查通过，baseline/new violations 均 0。源文件已格式化；保存前 git diff --check 通过。

初次消费者冻结测试把显示名预期写为 `Named provider / a:free`，旧实现实际为 `Named provider/a:free`；先行合同提交前已修正并全部通过。测试类型检查曾发现 fixture 必需 workspace 缺失、断言窄化/可选值和 Vite ImportMeta 类型上下文问题；已修正测试及仓库外配置后通过，生产未为这些测试问题改行为。

## 尚未完成

- 实际 dist 的 B3 合同与消费者测试。根 typecheck 已生成候选 dist，但没有将其宣称为已跑 compiled contracts。
- 修改后的根 lint/verify:pre-push、架构检查、完整 owned format check。
- 相关 Web build 与 source-map sourceContent/最终 SHA 绑定。
- 最终验收证据、最新整合 head 的冲突检查，以及主线组合 CI/跨平台/DOM/E2E。

不重跑已有检查、不新增功能，Standard 接续时先核对该 WIP 源码，再完成以上缺项。保存时没有仍在运行的本批测试；临时 harness/log/config 不在 Git，另一 executor 应从本分支/基线自行 materialize，不依赖 `/workspace/b3-*` 路径存在。

## 完整 owned 路径

1. `packages/ui/src/lib/sessionProjection.ts`
2. `packages/ui/test/ui-b3-projection-fixtures-20260930.ts`
3. `packages/ui/test/ui-b3-session-projection-contracts-20260930.test.ts`
4. `packages/ui/test/ui-b3-projection-consumers-20260930.test.ts`
5. `packages/ui/test/ui-b3-projection-hook-20260930.test.ts`
6. `specs/knorvia-ui-b3-session-projection-20260930.md`
7. `docs/knorvia-ui-b3-wip-standard-handoff-20260930.md`

B1/B2 文件、状态 store、协议/服务 schema、共享实现及许可 inventory/global config 未写。QA 正独立处理 B2 同 text node citation 的无限参数展开问题，此分支不处理该文件。

作者读过旧源码、消费者和固定上游 alias；保留 source exposure 与生产 Apache-2.0，不声明 clean-room/MIT-ready。上游 `zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521` 的 `packages/ui/src/lib/zcodeSessionProjection.ts`，blob `2b0a3985024e46ec3c281c7beab538f6f43ceb2e`，SHA-256 `422ccdef060ac72bb445bb8bb7a349a79aea513fd4c79417f29987885e5fc5f7`，9,879 bytes；实际字节已核验。PR 基线 sessionProjection.ts SHA-256 `199849cfbc75a6e3d7f675bbb35f49f5cfb94e573f2a5f87606fd794ca68e7b4`，9,984 bytes。独立作者审查、共享 mode/title/status/codec 依赖来源及统一 inventory 绑定仍由主线处理；新 tests/spec/doc MIT 标注不覆盖生产或依赖许可。
