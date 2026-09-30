<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# B4 session store 最小纯逻辑交接

2026-09-30，唯一主整合者线程 `01a0f294-8a06-7635-a34d-d85d47bb50bd`。独立分支 `ui/b4-session-store-selectors-20260930-01` 直接基于已读取的 PR #7 head `43f0abada1946266108df2bf6b93a1c525a0c6ef`。B3 不回写。本批未创建 PR、修改 main、force push、部署或改凭据、安全配置。

## 改动与 cherry-pick

按以下顺序整合，最终文档提交的完整 SHA 以该分支 Git head 和机器回执为准：

1. `f61d27165033b6d10dc6167fc8e8578264a3cfc4`：spec 和永久合同，先在旧实现冻结并通过 54 项。
2. `7714040a07a137e58570de2be19eada1ffa5e5e4`：生产重构，仅 selectors 与 navigation。
3. 当前文档提交：本交接说明；无生产改动。

恰好八份拥有路径：

- `packages/ui/src/store/sessionStoreSelectors.ts`
- `packages/ui/src/store/sessionStoreNavigation.ts`
- `packages/ui/test/ui-b4-store-fixtures-20260930.ts`
- `packages/ui/test/ui-b4-store-selectors-20260930.test.ts`
- `packages/ui/test/ui-b4-store-navigation-20260930.test.ts`
- `packages/ui/test/ui-b4-store-consumers-20260930.test.ts`
- `specs/knorvia-ui-b4-session-store-20260930.md`
- `docs/knorvia-ui-b4-session-store-handoff-20260930.md`

`sessionStoreTypes.ts` 全字节保留（SHA-256 `fa22203b4ab41a5f97342a8eaf5136990b36f0236845c71a7cd2b0d88ec2454a`）。未修改 sessionStore、task/workspace slices、hooks、history owner、services、shared schema、inventory、lockfile、全局配置或 QA 所有的 fileCitationRemarkPlugin。

selectors 将首次 identity seed 拆成有序六展示字段、九 task 字段策略，只对 fresh defaults 写入；task 字段须有匹配 ID union。外层 workspaces 使用一个 resolved key 写入。原 accessor/查找和 metadata owner 保持。navigation 集中 deferred history transform 与同步 cursor move 两个 port；仍由现有 history owner 决定去重、50 项上限和删除回退。单个 Zustand store 仍是状态 owner；无第二 accepted state 或新同步边界。

## 来源与许可

固定上游为 `zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521`，对应 `zcodeSessionStoreSelectors.ts`、`zcodeSessionStoreNavigation.ts`、`zcodeSessionStoreTypes.ts`。当前来源 inventory 三份均 unreviewed/upstream:null/NOASSERTION，没有已有原创 review。经显式产品与文件别名替换、忽略 trivia 和可选尾逗号后的 token 对照，三旧文件全部匹配固定上游（1204、335、2041 tokens）；这不是字节相等或原创证据。

Types 包含工厂、默认常量和 mutable singleton，并非纯类型。本批保留，不授予原创，不为修改数改写。作者已读旧源、消费者及固定上游，保持 source-exposed 记录。两候选生产文件使用 Apache-2.0 注释；小 accessors 和其他上游表达仍有继承，字段策略/adapter 重构也不自动构成独立作者证明。LICENSE、NOTICE 和依赖归属继续保留。新 tests/spec/docs 的 MIT 仅覆盖新表达。来源调查只能支持后续逐文件审核，不能将本批直接标为 MIT/独立实现。

当前旧源 SHA-256：selectors `3bcc37d739c069d96224b654ce4254f1aa1471086be2adf3b53143159ce5014d`，navigation `5850c7120987514d394fcd60abf23d4f5dccc78941db81f0f006fd14f763af4c`，types 见上。上游三 blob 分别 `15174d626448933a48457738812f002bf1fc5e61`、`55ef37081c653bd6dd4b5390507546076ec2dbb7`、`e17bab9f4bacc7d91573119068a962b9591ca900`。

## 合同与验证交接

永久 54 项覆盖 identity/path fallback、一次性任务迁移、空/null/undefined、终态和空错误、cache/optimistic 去重顺序、own keys、`__proto__`、引用 identity、普通 getter 顺序及错误传播。导航覆盖 deferred callback、get/set traces、边界/hole、删除 fallback、可选参数原字节、history 引用。实际 sessionStore 消费测试包括 setActiveTaskId、运行态更新、Zustand subscription/no-op 通知和 removeTaskState；不使用 mock store 代替实际消费链。

生产提交上有限对照 6,800 次零差异：960 组 seed 输入，另有 malformed metadata 和 70 组 navigation port 操作；检查值、own keys 顺序、输入不变性、引用 anchors、异常类别/消息和 get/set traces。工具首次因 scratch baseline 缺少 @knorvia/shared workspace package link 未启动；补 scratch ESM/package link 后通过，未修改产品来迁就 harness。B1/B2/B3 旧对照未重跑。

候选生产 source 已通过 54/54、测试 noEmit、root typecheck（含 5422 个 i18n 键）、lint 与全量/changed architecture（baseline/new/total 均 0）。最终文档提交后按实际 clean SHA 再执行以下门禁；终态成功以 `/tmp/knorvia-b4-validation/final-*.json` 和 `handoff-receipt.json` 为准，交接消息必须报告真实结果，不将下面的门禁清单当作已通过：

| 门禁                | 范围与证据                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| source 合同         | 三份 B4 test，54 项；实际 sessionStore 消费者                                                                               |
| root types          | `pnpm typecheck`，含 i18n、UI/所有 store 消费者及 desktop host/main types                                                   |
| test types          | `/tmp/knorvia-b4-test-typecheck.json`，test/fixture noEmit                                                                  |
| compiled 合同       | 三份合同以 UI dist `.js` 模块运行；resolver 拒绝任何 UI/src import，alias 指向 dist；shared 保留原 public export            |
| lint / changed arch | `pnpm verify:pre-push`                                                                                                      |
| full arch           | `pnpm architecture:check`                                                                                                   |
| format / patch      | 八份 owned paths 的 `oxfmt --check` 与 `git diff --check`                                                                   |
| Web build / maps    | `pnpm --filter @knorvia/web build`，三生产边界 sourceContent 对 HEAD 精确字节，artifact hashes 绑定 clean SHA/build receipt |

scratch 证据目录 `/tmp/knorvia-b4-source-review`、`/tmp/knorvia-b4-validation`；冻结旧三文件 `/tmp/knorvia-b4-pr-baseline/store`。执行工具 `/tmp/knorvia-b4-run-check.py`、`/tmp/knorvia-b4-prepare-dist.py`、`/tmp/knorvia-b4-differential.mts`。指定 Node 24.14.0/pnpm 10.33.2；使用 `/tmp/knorvia-b3-tooling/node_modules/.bin` 和 scratch XDG/cache，无 sandbox/global config 变更。环境断连通知后实际 exec 与 Git 正常，先保存并推送合同检查点再继续；当前没有恢复阻塞。

## 限制与后续 owner

本批证据只覆盖纯逻辑、实际 store 的单元消费、编译边界和相关 Web 构建。没有冻结或验收 React DOM/native UI、Windows/macOS 原生体验、真实模型、升级/持久化重放、完整审批/resume 链路；不改变这些链路的 owner 或 schema。任意被篡改 builtins/stateful Proxy 的全观测等价不在有限矩阵内。source-exposed 独立作者/许可审核仍待完成。

最终 cherry-pick 后的组合 head、全量离线 CI 和任何后续生产工作由唯一主整合者决定。B4 完成后停在检查点，不自行扩展下一 slice。
