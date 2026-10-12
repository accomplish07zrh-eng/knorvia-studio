// SPDX-License-Identifier: Apache-2.0

# core-hooks 合同（试点 1）

**合同版本：v1**（2026-10-11）。条目编号发布后不重用；改动合同必须重跑旧门并升版本。

- 包范围：`apps/cli/packages/core/src/hooks/` 里 **16 个继承文件**（`upstream-modified` 14 +
  `upstream-unchanged` 2），见 `behavior.md`「范围与口径」。另 10 个文件已登记
  `independent-replacement`，按 AGENTS.md「不重复改已独立候选」本包不动。
- 依据：`docs/knorvia-independent-replacement-plan.md` 的 M0-13（试点 1）、「每包流程」一～三、
  「已定的关键选择」1/3/6/8/9/12；跟踪 issue #95。
- 复用的既有规格：见 `behavior.md` 附录 B。

## 文件

| 文件                                                           | 内容                                                                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `behavior.md`                                                  | 行为规格 B1..B19（本包要重写并验收的行为）+ 附录 A（已独立候选拥有的行为，不进入本包测试）+ 附录 B（复用的既有规格） |
| `interface.md`                                                 | 兼容所需的模块路径、44 个导出与签名、跨包依赖                                                                        |
| `callers.md`                                                   | 生产与测试调用方清单、`dep:refs` 覆盖说明                                                                            |
| `tests/`                                                       | 契约测试（node:test，只走公开入口；`tests/entry.mjs` 决定源码入口或 dist 入口）                                      |
| `tests/run-old-gate.mjs`                                       | 旧门执行器：两种入口各跑一遍，生成 `gate-old.json`（`--with-stubs` 附带桩替换验证）                                  |
| `fixtures/builders.mjs`                                        | 合成夹具构造器（无真实用户数据、凭据、内部地址）                                                                     |
| `known-differences.md`                                         | 预登记差异（当前为空）                                                                                               |
| `acceptance.md`                                                | 验收记录：旧门结果、桩验证、门禁、未覆盖内容                                                                         |
| `stubs/build-stubs.mjs`、`stubs/hooks/*.ts`、`stubs/apply.mjs` | 16 个模块路径的最小桩与覆盖/恢复脚本                                                                                 |
| `gate-old.json`                                                | 旧门结果（用例数、通过、失败、预登记差异、两种入口、提交号、桩验证）                                                 |

## 怎么跑

```sh
# 前置：构建 CLI 包（dist 入口与 @knorvia/contracts/dist 都需要）
pnpm build:cli-packages

# 旧门（源码入口 + dist 入口）并生成 gate-old.json
node specs/contracts/core-hooks/tests/run-old-gate.mjs

# 附带桩替换验证（先覆盖 16 个继承文件为桩、断言全部失败、再 git checkout 还原）
node specs/contracts/core-hooks/tests/run-old-gate.mjs --with-stubs

# 只跑单次（默认源码入口）
node --import tsx --test --test-concurrency=1 specs/contracts/core-hooks/tests/*.test.ts
# 指定 dist 入口
KNORVIA_CORE_HOOKS_ENTRY=$PWD/apps/cli/packages/core/dist/hooks/index.js node --import tsx --test ...
```

`mise.toml` 固定 Node 24.14.0；本机无 mise 时用仓库外的 Node 24 包装（见 PR 描述）。

## 旧门结果（v1）

- 用例数 **33**，源码入口 **33/33 通过**，dist 入口 **33/33 通过**，失败 0，预登记差异 0。
- 桩替换验证：16 个继承文件替换为 `stubs/hooks/*.ts` 后 **0 通过 / 33 失败**。
- 提交号与逐项细节见 `gate-old.json`。

## 条目 → 测试对照表

| 条目                          | 测试                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 兼容 stdin                 | `tests/configured-runner.test.ts`「B1、B7 兼容 stdin、执行参数与临时目录清理」                                                                                                                                                                                                                                      |
| B2 插件环境与变量展开         | `tests/configured-runner.test.ts`「B2 变量展开：会话变量生效，skill 变量报配置错误且不执行」                                                                                                                                                                                                                        |
| B3 执行描述元数据             | `tests/display-metadata.test.ts`「B3 process 类型逐段展开并按需加引号」「B3 command 类型、后台模式与插件来源字段」「B3 process 类型即使 async 也保持前景模式」                                                                                                                                                      |
| B4 展示文本脱敏               | `tests/display-metadata.test.ts`「B4 遮蔽 URL 凭据、authorization 头与敏感键值」「B4 只遮蔽秘密，保留普通命令与 URL 其余部分」                                                                                                                                                                                      |
| B5 配置运行器登记             | `tests/configured-runner.test.ts`「B5 无登记项时返回 undefined；enabled=false 只保留 workspace 来源」「B5 登记顺序、source 命名、async 仅对 command 生效」                                                                                                                                                          |
| B6 workspace 登记项与插入顺序 | `tests/configured-runner.test.ts`「B6 workspace 登记项：evaluateDispatch 收到摘要、项目 Hook 插在用户之后非用户之前」「B6 准入拒绝时不执行项目 Hook」                                                                                                                                                               |
| B7 配置回调执行映射           | `tests/configured-runner.test.ts`「B1、B7 兼容 stdin、执行参数与临时目录清理」                                                                                                                                                                                                                                      |
| B8 执行结果解析               | `tests/configured-runner.test.ts`「B8、B9 stdout 解析：非 JSON 忽略、非法 JSON 报错、schema 不符报错」「B8 非零退出码生成可恢复错误并带 stderr 预览」                                                                                                                                                               |
| B9 退出码 2 输出语义          | `tests/configured-runner.test.ts`「B8、B9 stdout 解析…」「B9 exit code 2 在各事件上生成对应阻断输出」                                                                                                                                                                                                               |
| B10 策略提供者                | `tests/workspace-trust.test.ts`「B10 策略提供者：默认值、设置/清除通知、去重与非法输入」                                                                                                                                                                                                                            |
| B11 信任协调者                | `tests/workspace-trust.test.ts`「B11 协调者：epoch 校验、revision 递增与校验」「B11 策略 fail-closed、持久信任变更资格与 corrupt 状态」                                                                                                                                                                             |
| B12 单条信任求值              | `tests/workspace-trust.test.ts`「B12 trustState 判定顺序与 effectiveRunnable」「B12 allow_trusted_only 缺记录时 blocked_policy，deny 优先于一切」                                                                                                                                                                   |
| B13 审核流程注册表            | `tests/review-and-admission.test.ts`「B13 open：同代返回同一 flow，不同代必须显式 supersede」「B13 resolve/fail/close 与幂等结算」「B13 validate：superseded 与 snapshot_mismatch 的判定」「B13 supersede：旧流程立即结算，替换必须推进同一 flow」「B13 超时：deadline 到达后结算为 timed_out（含已过期立即结算）」 |
| B14 运行时准入                | `tests/review-and-admission.test.ts`「B14 准入：未激活、快照不匹配、失效与启用状态」「B14 功能关闭、跨 workspace 替换与 trusted-only 策略拒绝」「B14 bootstrap 失败 fail-closed 且不抛错」                                                                                                                          |
| B15 telemetry 脱敏            | `tests/review-and-admission.test.ts`「B15 telemetry：字段脱敏、摘要截断与空 logger」                                                                                                                                                                                                                                |
| B16 信任记录创建              | `tests/workspace-trust.test.ts`「B16 信任记录：去重、字段映射与错误」                                                                                                                                                                                                                                               |
| B17 session mailbox 登记项    | `tests/session-mailbox.test.ts`「B17 登记项形状：三个事件、内部 descriptor 与 drain 参数」「B17 UserPromptSubmit/Stop 返回 additionalContext，Stop 额外 continue:true」「B17 PostToolUse 逐条入队 pending input且不产生上下文」                                                                                     |
| B18 公开入口与类型面          | `tests/exports.test.ts`「B18 值导出齐全且可被实例化/调用」（类型面由替换步骤的 `pnpm typecheck` 覆盖）                                                                                                                                                                                                              |
| B19 平台与资源边界            | `tests/configured-runner.test.ts`「B1、B7…」断言临时目录在执行期存在、执行后被清理；其余用例均在 Windows 与 POSIX 下用 `node:os`/`node:path` 运行；无 stdout 写入由测试框架与 CI 观察                                                                                                                               |

每条 B 至少一个断言；表中没有空行。附录 A 的行为不属本包验收范围，见 `behavior.md`。
