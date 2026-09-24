# Knorvia Studio 身份归一

2026-09-23。本规格定义统一仓库内部产品身份的范围、保留边界、执行顺序与验收标准。
依据：`docs/knorvia-backend-acceptance-20260923.md`、`specs/knorvia-clean-base.md`、`specs/knorvia-agent-identity.md`、
`specs/knorvia-builtin-plugins.md`，以及只读调查报告 `D:/tools/knorvia-provenance-report.md`。

## 目标

统一 B–J 类产品标识（内部包名、目录、文件、环境变量、配置字段、协议常量、构建产物）为 Knorvia，
保留模型供应商的真实名称和仍适用的第三方署名。需要交付便携版时，按用户的数据保护规则覆盖
`C:\Users\17018\Desktop\Knorvia Studio Portable`。

## 不可改（硬约束）

**A 类：许可与署名。** 任何替换都不得触及：

| 禁改内容 | 位置 | 依据 |
| --- | --- | --- |
| `Copyright 2026 Z.AI Co., Ltd` | `LICENSE:190` | Apache-2.0 §4(c) |
| `modified by ZCode; … patches/…` | `THIRD-PARTY-NOTICES.md:2477,2479,2481` | 上游原文，改即伪造来源 |
| `Modified by ZCode: …` | 35 个 `packages/ui/src/components/ai-elements/*.tsx:4`、`.agents/skills/agent-browser/SKILL.md:10` | Apache-2.0 §4(b) 修改告知 |
| `Copyright 2023 Vercel, Inc.` / `Copyright 2025 Vercel Inc.` | `ai-elements/*.tsx:3`、agent-browser/dogfood/electron 技能 | §4(c) |
| `Copyright (c) 2025 Jesse Vincent` | `apps/cli/packages/superpowers-plugin/LICENSE:3` | MIT |
| `Copyright (c) Microsoft Corporation` | `dynamic-workflow/src/compiler/libs.generated.ts:8-64` | Apache-2.0 |

**供应商名与商标。** `智谱`、`Z.ai`、`BigModel`、`Moonshot`、`MiniMax`、`DeepSeek`、`Alibaba`、`Xiaomi`、
`OpenAI`、`Anthropic`、`xAI`、`OpenRouter`、`OpenCode`，以及
`packages/ui/src/assets/provider-icons/model-provider-logo-sources.json` 的 `sourceOwner` 与来源说明。
这些是模型供应商的正确名称，不是 ZCode 归属。

**隔离性证据。** 3 个测试文件里的 `ZCODE_*` 是**反向断言**，故意喂入上游变量名并断言仍解析到 Knorvia 路径：
`packages/desktop/test/knorvia-isolation.test.ts:31-34,46`、`scripts/knorvia-agent-base.test.ts:38`、
`packages/services/test/knorviaAccountRemoval.test.ts:69,72`。删除即销毁隔离性证据。

**历史与许可文档整体排除自动替换**：`LICENSE`、`NOTICE.md`、`THIRD-PARTY-NOTICES.md`、`FORK-NOTES.md`、
`README.md`、`README.en.md`、`docs/**`、`third-party/**`、`patches/**`。

## 命名映射

### 包作用域（30 个 workspace 包）

`@knorvia/<name>` → `@knorvia/<name>`，其中 `@knorvia/cua` → `@knorvia/cua`（特例）。

`pnpm-lock.yaml` 重新生成；`pnpm-workspace.yaml`、`turbo.json`、`knip.json`、`architecture-policy.yaml`、
`.oxlintrc.json`、`.prettierignore`、根 `package.json` 同步更新。

### 目录（10 个）

| 现名 | 新名 |
| --- | --- |
| `apps/cli` | `apps/cli` |
| `apps/cli/packages/bootstrap/src/protocol` | `…/bootstrap/src/protocol` |
| `apps/cli/packages/bootstrap/src/protocol-v4` | `…/bootstrap/src/protocol-v4` |
| `packages/services/src/agent` | `packages/services/src/agent` |
| `packages/services/src/agent-session` | `packages/services/src/agent-session`（`session` 已被占用） |
| `packages/shared/src/protocol` | `packages/shared/src/protocol` |
| `packages/shared/src/protocol-v4` | `packages/shared/src/protocol-v4` |
| `packages/cua` | `packages/cua` |
| `packages/server-cli` | `packages/server-cli` |
| `scripts/distribution` | `scripts/distribution` |

### 文件（88 个）

机器生成，见 `D:/tools/.rename-work/map.json`。规则：去掉 `zcode`/`ZCode` 标识并保持原首字母大小写。
已做冲突检测：0 冲突。例：

`agent.ts` → `agent.ts`；`agentService.ts` → `agentService.ts`；
`sessionStore.ts` → `sessionStore.ts`；`useConfig.ts` → `useConfig.ts`；
`AboutLogo.tsx` → `AboutLogo.tsx`；`builtin-cache-paths.ts` → `builtin-cache-paths.ts`；
`desktopDataSizeTelemetry.ts` → `desktopDataSizeTelemetry.ts`；
`config/provider/builtin.json` → `config/provider/builtin.json`。

### 环境变量与配置字段（F/G 类）

- `mise.toml:20` `ZCODE_DATA_BASE_DIR` → `KNORVIA_DATA_BASE_DIR`，`.zcode-dev-home` → `.knorvia-dev-home`
  （与 `specs/knorvia-agent-identity.md:7` 契约一致）
- `packages/desktop/build/installer.nsh` 的 `ZCODE_*` NSIS define → `KNORVIA_*`
- `scripts/native-search-tools-windows/CMakeLists.txt` 的 `ZCODE_*` CMake 变量 → `KNORVIA_*`
- `packages/server-cli/package.json` 的 `bin` 名 `zcode` → `knorvia`

### 协议常量（H 类）

**已持久化或跨进程的常量保留双读**，只把新写入改为 knorvia：

| 常量 | 处理 |
| --- | --- |
| `zcode-artifact://`（`shared/src/artifact-uri.ts:3` `LEGACY_ARTIFACT_SCHEME`） | **值保留**，作为旧数据读取分支；新写入已是 `knorvia-artifact://` |
| `::zcode-file-citation` | **值保留**（旧会话读取）；新输出已是 `::knorvia-file-citation` |
| `/* zcode-workflow` | **值保留**（旧工作流读取）；新保存已是 `/* knorvia-workflow` |
| `x-zcode-rpc-host-capability`、`__zcode_rpc_nested_uint8array_v1` | **值保留**（旧远端 bundle 读取） |
| `protocol` / `protocol-v4` 模块路径 | 随目录/文件重命名改（非线上值） |

**纯粹内部、无持久化兼容负担的常量直接改名：**

| 常量 | 处理 |
| --- | --- |
| i18n message id `knorvia.error.*`（4 文件 58 行） | → `knorvia.error.*`，同步更新引用点 |
| `_meta.knorvia.target`、`data.knorvia.error` 的注释描述 | 更新为当前实际写入的 knorvia 名称（先核对代码） |
| `Symbol.for("knorvia.node-repl…")` | 代码已用 `knorvia.`，仅文档残留 |

**需先核实的疑似缺陷**：`packages/shared/src/conversation-share.ts:122` 的正则
`/^knorvia-artifact:\/\/share\/…/` 只接受旧 scheme，若新写入用 `knorvia-artifact://share/` 则会被拒绝。
按 `shared/src/artifact-uri.ts` 的双读做法修正。

### 标识符（代码内）

`ZCode` → `Knorvia`、`zcode` → `knorvia`（保持大小写形态），仅限代码与配置文件，
且逐条豁免上述禁改清单。例：`ZCodeCredentialCipher` → `KnorviaCredentialCipher`、
`ZCodeConfigFileSchema` → `KnorviaConfigFileSchema`、`useZCodeIntl` → `useKnorviaIntl`。

### 产品可见文案（B 类）

- `packages/ui/src/ChatEmptyScratchWorkspaceDialog.tsx:2` 的 `~/ZCodeProject/` → `~/KnorviaProject/`
- `CONTEXT.md:1,10` 的 `ZCode` 产品名 → `Knorvia Studio`（仅产品指代处，不涉及上游来源说明）
- `packages/ui/src/i18n/locales/*.ts` 的 key 名 `titleBar.menu.help.toggleZCodeStdioTap` → `…toggleKnorviaStdioTap`

### Markdown 处理原则

**不做事后全量替换。** 仅对 `specs/**`、`AGENTS.md`、`CONTEXT.md`、`apps/cli/README.md` 做
**路径字符串**替换（`apps/zcode-cli` → `apps/cli` 等），散文里的上游 `ZCode` 指代一律保留。

## 执行顺序

1. 备份与基线（已完成：`D:/tools/.knorvia-backup-rename-baseline`；typecheck 通过、lint 0 错误 29 警告）
2. 目录与文件重命名（`git mv` 语义，保持历史）
3. 内容替换：路径映射 → 包作用域 → 标识符 → 环境变量 → 协议常量（按豁免清单）
4. `pnpm install` 重建 lock 与 node_modules 链接
5. 静态验证：`pnpm typecheck`、`pnpm lint`、`pnpm architecture:check`
6. 行为验证：相关包测试
7. J 类合规修复：从 `D:/Knorvia/resources/glm/packages/` 恢复被删除的 4 个 `LICENSE.txt`，
   并处理 `official-plugin-staging.mjs` 的 `rmSync` 与 `specs/knorvia-builtin-plugins.md:65` 的说明
8. 打包便携版并覆盖目标目录

## 验收

1. `pnpm typecheck` 通过（基线：通过）。
2. `pnpm lint` 0 错误、警告数不超过基线 29。
3. `pnpm architecture:check --changed` 0 违规。
4. 源码树内 `rg -i knorvia` 命中仅剩：A 类署名、供应商名无关项、H 类双读常量、3 个反向断言测试、
   历史与许可文档。逐条列出并说明理由。
5. `pnpm install --frozen-lockfile` 在重建 lock 后可重复执行成功。
6. 桌面构建成功；便携版覆盖后产品名、便携标记、内置 Agent 包与图标校验通过。
7. 便携版 `data` 目录既有文件逐一 SHA-256 不变。
# 2026-09-24 追加清理范围

用户要求去除产品内部残留的供应商品牌字段，包括 glm 运行身份、目录、打包名称和默认标识。模型提供商配置中的真实厂商、模型名、协议及用户填写的端点保留。内部身份迁移必须贯穿调用方、协议、打包和已有会话/配置；不得仅做全文替换导致已保存数据不可读。旧字段只用于必要迁移读取，新写入统一使用 Knorvia 名称。保留已归档原件与备份引用，不重写用户数据或远端历史。

## 内置运行身份迁移

- 内置执行内核 id 改为 `knorvia`，与模型供应商 id 和 GLM 模型名分离。shared 的 provider schema/常量是所有生产者与消费者的共同边界；旧任务元数据的读取边界将历史执行内核值归一到新值。
- Task database 是索引 provider 的唯一所有者：新增 0004 迁移，仅更新旧内置执行内核的 tasks.provider、meta_json.provider 和 automations.provider，不改模型选择、用户文本、排序、时间戳、外部 CLI id 或历史迁移校验和。使用既有库级事务和账本保证失败回滚与重复启动幂等。
- Desktop 打包目录、运行时描述符、主进程解析、远端资源 id 和 staging 参数同步使用新身份；旧远端资源无需修改生产机器，下一次用户授权连接时按当前 manifest 部署。旧包不自动冒充新版资源。
- 时序：存储启动所有者取得数据库锁 → 校验冻结账本 → 0004 转换 → 提交 → Repo 查询；界面仅消费已归一元数据，不能另设迁移状态。
- 验收：旧 provider 和 meta_json 转换后仍可查询，其他供应商与退休内核记录不变；迁移失败可回滚、二次运行不改时间戳；新包路径和资源 id 一致；新写入没有旧执行内核身份。真实模型名称及模型供应商兼容逻辑保留。
