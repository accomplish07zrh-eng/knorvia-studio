<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# UI B3：WIP 历史与 Standard 验收检查点

下方 WIP 段落记录切换时的历史状态；最新进度与最终提交门见文末 Standard 续验记录。B3 产品源码保持 `c3528ebae8342a3b1f75f73257a4a80f39c709f7` 的原字节，本次只补本 owned 交接文档，不开始 B4。

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

## Standard 续验记录

2026-09-30。新环境从原分支抓取并核对精确 tip `c3528ebae8342a3b1f75f73257a4a80f39c709f7`，相对原 PR 基线仍仅上述七路径。没有复制或重新实施 B1/B2，没有触碰 QA 所有的 `fileCitationRemarkPlugin.ts`。最终 cherry-pick 顺序为先行合同 `3f10794b33ca4f3f2fa9e3634cd12b2b8a654062`、原 WIP 实现 `c3528ebae8342a3b1f75f73257a4a80f39c709f7`、本续验文档提交；不合并整个工作分支。第三提交与所有检查的实际 HEAD 由提交后的交接回执报告，避免文档自引用。

生产文件固定为 Git blob `f5b60d086aeba9eab7ded169523f711a412be088`，SHA-256 `e771fba9b54e9ba84214cb179c325deaad973cfd4dcee1dc648cf11fa4106367`，8,392 bytes。本次没有产品修复需求；原冻结旧版 58/58 与 14,289 comparisons、0 differences 的有限对照继续引用原记录，没有重复昂贵对照。对照不能证明 shared owner 的独立来源或任意 Proxy/getter 行为。

恢复环境安装 Node `24.14.0` 与 pnpm `10.33.2`，使用原 frozen lockfile。最初默认 pnpm 自动安装失败于不可写用户工具目录；固定工具后，普通 install 又失败于 Electron 下载和桌面 native rebuild 的用户目录。最终按仓库 Linux CI 的 `pnpm install --frozen-lockfile --ignore-scripts` 完成，未改 lockfile、manifest 或 global config。此模式不验证 Electron 二进制、原生桌面启动或打包。

在原 tip 上重新生成 dist 并完成以下恢复验证：

| 检查                                                           | 实际结果                                     |
| -------------------------------------------------------------- | -------------------------------------------- |
| 源码 B3 合同、真实 config/workflow/workspace 消费者与受控 hook | 58/58，0 fail/cancel/skip                    |
| 实际 UI dist 的同一合同与消费者/hook                           | 58/58，0 fail/cancel/skip                    |
| 根 `pnpm typecheck`                                            | 通过；中英文 5,422 keys                      |
| 四份新增测试的独立 noEmit typecheck                            | 通过；仓库外配置纳入实际 Vite client 类型    |
| 根 `pnpm lint`                                                 | 0 warning、0 error，2,806 files              |
| 架构 changed 检查与 ui context                                 | 0 violations/baseline/new；ui 仍为 unmanaged |
| 完整七 owned 文件 `oxfmt --check` 与 `git diff --check`        | 通过                                         |

dist harness 在仓库外复制本批测试，只有测试导入路径调整：投影与实际 config/workflow/workspace/hook imports 指向根 typecheck 生成的 `packages/ui/dist`，受控 hook 的 service mock 同时指向 dist；`@/` alias 指向 dist，resolver 拒绝任何 `packages/ui/src/` 加载。共享公开 barrel 仍按原 package export 绑定，没有独立重写共享依赖。首次 scratch harness 使用根 hoisted node_modules，找不到 package-local `@knorvia/shared`，两测试文件未加载；明确绑定同一共享公开入口后完整 58/58 通过。没有为 harness 失败改生产、合同预期或仓库配置。

实际读取 PR #7 head `43f0abada1946266108df2bf6b93a1c525a0c6ef`，origin/main 仍为 `bd0bb014c0974334557fa51814709d0b78f35f1d`。最新整合 head 与原基线对七 owned 路径无重叠。仓库外 detached worktree 从该 head 建立，两原 B3 提交按顺序 cherry-pick 无冲突；初次组合 head `f779349c9cbc54d2fe626f69ab31bdfa90334928` 上既有 B1/B2 加 B3 合同 163/163、0 fail/cancel/skip，根 verify:pre-push 与完整 architecture 检查通过、0 violations/baseline/new。组合 worktree 不推送、不写 PR #7/main，也不代替主整合者。

## 包含本记录的最终提交门

先提交本记录，再在实际新 HEAD 上执行根 typecheck、独立测试 typecheck、源码及实际 UI dist 的 58 项合同、verify:pre-push、全量架构、七 owned 格式和 diff 检查；执行 `KNORVIA_COMMIT=<实际新 HEAD> pnpm --filter @knorvia/web build`。逐个 Web map 找到 sessionProjection 的 `sourcesContent`，必须精确 UTF-8 字节等于该 HEAD 的 Git 文件，并记录对应 emitted JavaScript 与 map 的 SHA-256；build 回执的开始/结束 HEAD、注入的 KNORVIA_COMMIT 和 clean tracked status 必须绑定同一实际最终 SHA。若失败，修复后以新的最终 SHA 重验；只允许这些门实际通过后推送原 isolated UI 分支。

首次 Web build 均通过且 B3 sourceContent 已精确匹配，但临时审计错误要求完整 commit 字符串出现在 bundle，因 Web 没有消费 `__KNORVIA_COMMIT__` 而失败。这是验收工具添加的无依据条件，已改为上述可核验的 build 回执与产物摘要绑定；不为保留 unused define 改产品 UI 或构建配置。包含该说明的新最终提交必须重新实际构建与核验，旧提交产物不得冒充新 SHA 的产物。

将本文提交也 cherry-pick 到同一最新 PR head 的临时组合 worktree，按组合最终 HEAD 复核 B1/B2/B3 163 项、B3 dist 58 项、根类型/lint/完整架构、owned 格式、相关 Web build 与同样的 source-map/commit 绑定。检查日志、退出码、开始/结束 HEAD、源码与产物摘要保存在本 executor 的 `/tmp/knorvia-b3-validation/`，最终回执附实际 SHA 和结果；这些临时路径不是另一 executor 的前置依赖。源码重跑入口为：

```sh
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --experimental-test-module-mocks --import tsx --test --test-concurrency=1 \
  packages/ui/test/ui-b3-session-projection-contracts-20260930.test.ts \
  packages/ui/test/ui-b3-projection-consumers-20260930.test.ts \
  packages/ui/test/ui-b3-projection-hook-20260930.test.ts
```

最终实际 SHA、Web map/bundle 摘要与组合 HEAD 在提交后由交接回执绑定，不把本段执行要求写成已完成结果。全 `test:studio`/CLI 构建、统一来源 inventory/notices 复核、主线实际整合后的 CI、Windows/macOS、DOM/浏览器/Electron E2E、真实模型与用户数据升级仍由主线安排。本批受控 hook 验证的是 effect 取消与状态投影，不是原生 GUI 或浏览器目视证据。生产 Apache-2.0、LICENSE/NOTICE/第三方事实与 source exposure 均保留，不能从行为合同、无差异或 build 推导 MIT independent。
