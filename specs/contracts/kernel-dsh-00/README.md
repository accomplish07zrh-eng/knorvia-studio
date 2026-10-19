# kernel-dsh-00 合同（内置内核接入 DSH · 直接配置启动）

**合同版本：v1**（2026-10-18）

本目录是 M2 接入包 `kernel-dsh-00` 的合同。它不是“替换旧模块”的合同，而是**新增运行时入口**的合同：默认路径保持旧运行时，只有 `KNORVIA_KERNEL_ENGINE=dsh` 时启动 DSH。协议级回归从 `kernel-bridge-01` 开始，本包只要求新运行时能启动并就绪（见 [acceptance.md](acceptance.md)）。

- 分支：`contract/kernel-dsh-00`（基线 `origin/main` `575acf91`）；工作树 `wt/kernel-dsh-00`；认领 issue：**#188**
- 依据：`specs/knorvia-builtin-kernel-dsh.md` 全文、`specs/knorvia-internal-plugins.md`「内核层（M2）」「架构治理」、计划书「内核方案调整」「接入包流程」「接入门禁」。
- 上游事实来源：本机 npm registry 的 `@deepseek-ai/dsh@0.2.0-rc.2` 及其子包（2026-10-18 实测），不读、不改 DSH 源码。

## 一、范围

### 1. 本包做什么

1. 把 `@deepseek-ai/dsh@0.2.0-rc.2`（确切版本，不用 `^`/`~`）及其固定插件组合引入 `apps/cli` 工作区。
2. 用 `@deepseek-ai/dsh-app-boot` 的**直接配置入口** `boot()` 启动，不经过 DSH 自带 profile、不叠加任何 patch 层。
3. 落地内核规格「与本机 DSH 隔离」的全部项：`DSH_HOME`、直接配置、`.env`、环境变量、技能、Hook、遥测、程序版本。
4. 身份：关闭 `includeHarnessIdentity`，`personaPrefix` 写入 Knorvia 开场。
5. `KNORVIA_KERNEL_ENGINE=dsh` 开关下，`knorvia app-server --stdio` / `agent-server --stdio` 启动新运行时，向 stderr 输出一行就绪标记后保持运行；默认（无该变量）完全走旧运行时。
6. 固定插件组合与组合根归 `bootstrap` 唯一持有；`apps/cli/packages/kernel-plugins/<名称>` 为后续 Knorvia 插件预留目录，本包只建立目录约定，不做 bridge、工具、权限、Hook、凭据、记忆等插件。
7. DSH 按第三方依赖登记（`third-party/` 与许可正文），Knorvia 新代码登记 original。

### 2. 本包不做什么

- 不做 v4 命令 → DSH 会话操作的映射，不产生 v4 帧（`kernel-bridge-01`）。
- 不做 Knorvia 工具、权限策略、Hook 7 事件、凭据、记忆、文件回退、技能来源、动态工作流、目标、子 Agent、MCP 配置（后续 `kernel-plugin-*`）。
- 不改 `specs/knorvia-builtin-kernel-dsh.md` 之外的协议、数据格式、环境变量前缀、数据目录。
- 不改 DSH 源码，不 fork，不 vendor。
- 不切换默认引擎（`kernel-switch`）。

## 二、DSH 公开接口事实（2026-10-18 实测）

> 以下结论来自 `@deepseek-ai/dsh@0.2.0-rc.2` 安装树（临时目录，`node_modules/.pnpm`）的包清单、`lib/types/*.d.ts` 与 `lib/*.js` 的公开导出。只记录接入需要的事实，不复制实现。

### 1. 直接配置启动入口

`@deepseek-ai/dsh-app-boot` 导出：

```ts
function boot(
  binName: string,
  absoluteConfigPath: string,
  patches?: PatchOptions[],
  prepare?: (ctx: Context) => Promise<void> | void,
  bareModuleBaseUrl?: string,
): Promise<Context>;
```

- `absoluteConfigPath` 必须是**顶层为数组**的 YAML 或 JSON 配置文件（Loader 的 entry-list 方言）。每个 entry 至少 `id`、`name`；可选 `config`、`disabled`、`inject`、`group`。
- `boot()` 内部创建根 `Context`、安装 `@deepseek-ai/cordis-plugin-loader`、挂载 `cordis:include`、等待整棵树 settle，再跑 `auditStartupEntries`。必需 entry 未激活会抛 `StartupError`；可选 entry 失败只告警。
- `bareModuleBaseUrl` 是“宿主拥有整套插件”的裸包名解析基准，传给 Node 内部 ESM loader 的 `import(specifier, baseUrl, {})`。传 `import.meta.url`（或 staging 目录里任一文件的 `file:` URL）即可让 entry 的 `name` 从该目录向上解析 `node_modules`。**不传则按配置文件所在目录解析**。
- `prepare(ctx)` 在 Loader 安装后、配置树挂载前运行；可用来 `ctx.provide()` 宿主服务。本包暂不使用。
- `boot()` **不加载 `.env`**，**不读 profile**，**不读 `$DSH_HOME/cordis.patch.yml`**。这些行为在 `loadEnv` / `loadLayeredEnv` / `readProfilePatches` 等独立函数里，只有官方 bin 会组合它们。
- `boot()` 不安装 fail-loud 处理器；需要时由宿主自行调用 `installFailLoud`（本包不安装，错误经 CLI 既有边界上报）。
- 生命周期：`ctx.fiber.dispose()` 释放整棵树；`ctx.get("loader")` 存在表示 Loader 已就绪。进程存活由调用方负责。

官方 bin 的组合方式（仅作对照，不采用）：`runProfile()` → `composeProfile()` → `readProfilePatches()` → `boot()`，并 `provide("profileContext")`。本包跳过 `runProfile`/`readProfilePatches`/`profileContext`。

### 2. 插件组合声明（Cordis）

- 每个插件包导出以下之一：
  - 默认导出 `class extends Service`，带 `static Config`（Schemastery schema）与 `static inject`（依赖服务名数组）；
  - 具名 `apply(ctx, config)` 函数，可另导出 `inject`、`Config`、`name`。
- 组合 entry 示例：

  ```yaml
  - id: system-prompt
    name: "@deepseek-ai/dsh-system-prompt"
    config:
      includeHarnessIdentity: false
      personaPrefix: "..."
  ```

- 激活顺序由服务可用性驱动，不按行顺序；`inject` 声明硬依赖，缺服务时 entry 保持 pending 或被审计判失败。
- 行 `name` 可以是包名、子路径（`@deepseek-ai/dsh-session/invariant`）或绝对文件路径。**没有运行期动态加载 Knorvia 模块的机制**；Knorvia 插件也必须是磁盘上可解析的模块（或绝对路径文件）。
- `disabled: true` 的行不挂载；`disabled` 也可以是表达式（官方 profile 用 `!!js`），本包生成的 JSON 配置只写布尔值。

### 3. 可用插件包与关键 config

DSH 0.2.0-rc.2 自带约 80 个 `@deepseek-ai/dsh-*` 运行时包。与本包直接相关的：

| 包                                                | 作用                                       | 关键 config                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dsh-system-prompt`                               | 系统提示装配                               | `includeHarnessIdentity`（默认 true）、`includeRuntimeContext`（默认 true）、`personaPrefix`、`personaSuffix`、`toolOrder`                                                                                                                                                                              |
| `dsh-session`                                     | 事件溯源会话存储（`ctx.sessions`）         | 无                                                                                                                                                                                                                                                                                                      |
| `dsh-session-persistence-jsonl`                   | JSONL 会话日志（`ctx.sessionPersistence`） | `root`（必填）、`compression`（默认 zstd）                                                                                                                                                                                                                                                              |
| `dsh-session-projection`                          | 投影注册表（`ctx.sessionProjections`）     | 无                                                                                                                                                                                                                                                                                                      |
| `dsh-agent`                                       | Agent 注册表（`ctx.agents`）               | 无                                                                                                                                                                                                                                                                                                      |
| `dsh-agent-loop`                                  | 具体 agent loop（`ctx.agentLoop`）         | `agents`（默认 `[]`）、`maxParallelToolCalls`（默认 10）                                                                                                                                                                                                                                                |
| `dsh-tools`                                       | 工具注册表（`ctx.tools`）                  | `presentation` 等                                                                                                                                                                                                                                                                                       |
| `dsh-agent-instructions`                          | 项目 `AGENTS.md` / `CLAUDE.md` 注入        | `maxBytes`（默认 65536）；用户全局只读 `$DSH_HOME/AGENTS.md`                                                                                                                                                                                                                                            |
| `dsh-skill`                                       | 技能注册表（`ctx.skills`）                 | `collectCacheMaxEntries`（catalog 缓存条数）                                                                                                                                                                                                                                                            |
| `dsh-skill-filesystem`                            | 文件系统技能 provider                      | `includeDefaultRoots`（默认 true）、`dshHome`、`agentsHome`、`customSkillDirs`、`watch` 等                                                                                                                                                                                                              |
| `dsh-llm`                                         | LLM seam（`ctx.llm`）                      | 无                                                                                                                                                                                                                                                                                                      |
| `dsh-llm-pi-ai`                                   | pi-ai 多供应商适配器                       | `providers`（dict，默认空 = 零路由，休眠）                                                                                                                                                                                                                                                              |
| `dsh-sandbox-local` / `dsh-sandbox-policy`        | 文件沙箱与每调用策略                       | `mode`（`read-only`/`workspace-write`/`danger-full-access`）、`workspaceRoot`                                                                                                                                                                                                                           |
| `dsh-user-approval`                               | 审批 seam（`ctx.approval`）                | `policy`（`ask`/`never`，默认 `ask`，无应答者时 fail closed）                                                                                                                                                                                                                                           |
| `dsh-plan-mode`                                   | 计划模式                                   | `section`（必填，计划模式提示文本）                                                                                                                                                                                                                                                                     |
| `dsh-compaction-basic`                            | 自动压缩                                   | `thresholdRatio`（默认 0.8）、`headroomTokens`（默认 65536）、`retainRatio`（默认 0.16）或 `retainTokens`、`summarizationProvider`/`summarizationModel`、`maxTokens`、`compactionRetries`（默认 1）、`maxOverflowRetries`（默认 1）、`auto`（默认 true）、`modelPolicies[]`（精确 provider/model 覆盖） |
| `dsh-goal` / `dsh-command-goal` / `dsh-tool-goal` | 目标模式                                   | `dsh-goal`：`defaultMaxGoalRounds`（默认轮次上限）；命令与工具行无自己的 Config                                                                                                                                                                                                                         |
| `dsh-subagent` / `dsh-subagent-*-in-process`      | 子 Agent                                   | seam 无 Config；in-process provider 配 `providerName`（`spawn`/`fork`）；工具行另配 `provider`、`toolName`、`backgroundMode`                                                                                                                                                                            |
| `dsh-mcp-client` / `dsh-mcp-resources`            | MCP 客户端与资源                           | `dsh-mcp-client` 为 `StdioConfig \| StreamableHttpConfig`：`transport`、`serverName`、`command`/`args`/`env`/`cwd` 或 `url`/`headers`、`toolCallTimeoutMs`、`failOnStartupError`、`reconnect`；每行连接一个服务器                                                                                       |
| `dsh-hooks-claude-code` / `dsh-hooks-codex`       | Hook 兼容层（**不挂载**）                  | 不适用                                                                                                                                                                                                                                                                                                  |

本包 v1 组合见 §三。

### 4. 关闭 profile / patch / `.env` / Hook / 遥测

| 目标               | 可确认的事实                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| profile 层         | 只有 `runProfile()` / `loadProfileDirectory()` 会读 `$DSH_HOME/profiles/*` 与 profile manifest；直接调用 `boot()` 不经过它们。                                                                                                                                |
| `cordis.patch.yml` | 只有 `readProfilePatches()` 会读 `$DSH_HOME/cordis.patch.yml`；直接 `boot()` 不读。实测在该文件写入一个不存在的插件，boot 仍成功。                                                                                                                            |
| `.env`             | `loadEnv()` / `loadLayeredEnv()` 是显式函数；直接 `boot()` 不调用。实测在 cwd 放 `.env`，boot 后 `process.env` 无新增键。                                                                                                                                     |
| Hook 兼容层        | `dsh-hooks-claude-code`、`dsh-hooks-codex` 是独立包，不写进组合即不挂载。                                                                                                                                                                                     |
| 遥测               | `dsh-base` bundle 含 `otel` 与 `session-telemetry-otel` 行；本包**不使用 bundle**，组合中没有这两行。`DSH_TELEMETRY_DISABLED` 只对已存在的 `session-telemetry-otel` 行生成 disable patch（`resolveTelemetryPatch`），没有该行时是空操作；本包仍按规格置 `1`。 |
| 程序版本           | 只用 `apps/cli` 依赖树里的包；`boot()` 与插件 import 都走 Node 模块解析，不 spawn `dsh`，也不读 PATH。实测 PATH 放一个写标记的假 `dsh`，启动后标记未出现。                                                                                                    |

### 5. 身份

`dsh-system-prompt` 默认在 persona 之前注入固定句 `You are an AI agent powered by DeepSeek Harness.`（`HARNESS_IDENTITY` 段，order `-1000`）。设置 `includeHarnessIdentity: false` 后该段不注册；`personaPrefix` 注册为 `deployment:persona-prefix` 段（order 0）。实测装配结果只含 Knorvia 文本，不含 `DeepSeek Harness` 身份句。

`includeRuntimeContext: false` 关闭动态运行上下文快照，保持提示确定性；运行上下文如需开启，由 bridge 或身份插件另行评估。

### 6. 会话与事件公开 API（为 `kernel-bridge-01` 铺路，本包不实现）

| 入口                             | 位置                                                   | 用途                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ctx.sessions`（`SessionStore`） | `@deepseek-ai/dsh-session`                             | `create(id?,{seed,meta})` / `prepare` / `enter` / `announce` / `flush(session)` / `fork` 相关方法；会话生命周期的唯一所有者。                                                      |
| `Session`                        | 同上                                                   | `append(type,data)`、`snapshotEvents(from,to)`、`ownEvents()`、`seq`、`fork`/`header`；事件正文的唯一来源。                                                                        |
| `ctx.agents`（`AgentRegistry`）  | `@deepseek-ai/dsh-agent`                               | `create(CreateAgentOptions)` / `resume` / 查找；`CreateAgentOptions` 含 `sessionId`、`meta.cwd`、`seed`、`agentOptions`。                                                          |
| 事件                             | 同上                                                   | `session/created`、`session/event`、`session/disposed`、`session/flush`；`agent/created`、`agent/disposed`、`agent/turn-stopping` 等（`dsh-agent/lib/types/runtime-types.d.ts`）。 |
| 事件序号                         | `Session.seq` / `SessionEvent.seq`                     | v4 帧序号与快照可从 DSH 事件序号重建。                                                                                                                                             |
| fork                             | `buildForkSeed(events,boundary)`（`dsh-session/fork`） | 编辑重发/回退的 seed 构造；实际 fork 通过 agent/session 工厂。                                                                                                                     |

## 三、v1 固定插件组合

组合清单由 `bootstrap` 的 `KERNEL_PLUGIN_ROWS` 唯一持有，按以下顺序生成 `<DSH_HOME>/knorvia/kernel.cordis.json`：

| #   | id                     | 包                                           | config                                                                                           |
| --- | ---------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | `timer`                | `@deepseek-ai/cordis-plugin-timer`           | —                                                                                                |
| 2   | `llm`                  | `@deepseek-ai/dsh-llm`                       | —                                                                                                |
| 3   | `sessions`             | `@deepseek-ai/dsh-session`                   | —                                                                                                |
| 4   | `session-persistence`  | `@deepseek-ai/dsh-session-persistence-jsonl` | `{ root: <DSH_HOME>/sessions, compression: "none" }`                                             |
| 5   | `session-projection`   | `@deepseek-ai/dsh-session-projection`        | —                                                                                                |
| 6   | `system-prompt`        | `@deepseek-ai/dsh-system-prompt`             | `{ includeHarnessIdentity: false, includeRuntimeContext: false, personaPrefix: <Knorvia 开场> }` |
| 7   | `tools`                | `@deepseek-ai/dsh-tools`                     | —                                                                                                |
| 8   | `agents`               | `@deepseek-ai/dsh-agent`                     | —                                                                                                |
| 9   | `agent-loop`           | `@deepseek-ai/dsh-agent-loop`                | `{ agents: [] }`                                                                                 |
| 10  | `invariants`           | `@deepseek-ai/dsh-invariants`                | —                                                                                                |
| 11  | `session-invariant`    | `@deepseek-ai/dsh-session/invariant`         | —                                                                                                |
| 12  | `agent-invariant`      | `@deepseek-ai/dsh-agent/invariant`           | —                                                                                                |
| 13  | `scope-invariant`      | `@deepseek-ai/dsh-scope/invariant`           | —                                                                                                |
| 14  | `agent-loop-invariant` | `@deepseek-ai/dsh-agent-loop/invariant`      | —                                                                                                |
| 15  | `agent-instructions`   | `@deepseek-ai/dsh-agent-instructions`        | `{ maxBytes: 65536 }`                                                                            |
| 16  | `skill`                | `@deepseek-ai/dsh-skill`                     | —                                                                                                |
| 17  | `skill-filesystem`     | `@deepseek-ai/dsh-skill-filesystem`          | `{ includeDefaultRoots: false, watch: false }`                                                   |
| 18  | `mcp-resources`        | `@deepseek-ai/dsh-mcp-resources`             | —                                                                                                |
| 19  | `llm-pi-ai`            | `@deepseek-ai/dsh-llm-pi-ai`                 | `{ providers: {} }`                                                                              |

- `compression: "none"` 只是不压缩 JSONL；这是 DSH 新会话日志的内部格式，不涉及 Knorvia 数据格式。后续如需 zstd，单独评估包内原生依赖。
- 不挂载 `dsh-base` bundle，因此没有 `otel`、`session-telemetry-otel`、`deepseek-account`、`credentials-local`、`shell-env`、`web`、工具行、Hook 兼容行。
- **不把 `@deepseek-ai/dsh` 元包作为生产依赖**：元包会拉入 `dsh-skill-office` → `@deepseek-ai/libreoffice-kit`（MPL-2.0），而内核规格要求该可选包不挂载、不打包。生产依赖直接声明上表用到的 18 个 DSH 子包，全部锁定 `0.2.0-rc.2`（`@deepseek-ai/cordis@4.0.5`、`cordis-plugin-timer@1.1.6` 锁定确切版本）；版本口径仍是“DSH 0.2.0-rc.2”。元包只在侦察时临时安装，不进仓库。
- 后续包只在这张表上**追加** Knorvia 行或 DSH 行；删除一行必须同步删除它的能力测试与架构登记。

## 四、已有契约测试的复用

计划书「接入包流程」第 2 条要求列出“走公开协议入口、对新运行时同样适用”的已有契约测试。

**结论（实测）：当前 `specs/contracts/*/tests` 没有启动真实 `knorvia app-server` 或发送 v4 帧的用例。** 现有测试分三类：

| 类别                                                              | 例子                                                                                | 对新运行时的适用性                                                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 纯类型/编解码（v4 schema、帧形状）                                | `specs/contracts/shared-01/tests/protocol-schemas.test.mjs`、`wire-frames.test.mjs` | 与内核无关，继续适用；但它们不经过运行时。                                                                                 |
| 模块级黑盒（bootstrap 的 session mapper / projection / snapshot） | `apps/cli/packages/bootstrap/test/session-projection-contract.test.ts` 等           | 测的是 `bootstrap/src/protocol/**` 的纯函数，新运行时仍需用同一 projection；在 `kernel-bridge-01` 接线后用同一套断言回归。 |
| 旧运行时端口（core runtime methods / tool handlers）              | `specs/contracts/core-runtime-methods-*`、`core-tool-*`                             | 只测旧内部端口，随 `core` 删除，不迁移。                                                                                   |

因此本包的协议级复用清单为空；从 `kernel-bridge-01` 起，把上表第二类测试接到新运行时，并在该包合同 README 列明。本包只要求新运行时**启动并就绪**。

## 五、条目 → 测试对照表

> 接入包例外：本包没有“旧实现”可供旧门录制，新增路径的测试随实现 PR 落地；合同 PR 只带 T1/T2（默认路径不变），CI 必须绿。测试文件在 `specs/contracts/kernel-dsh-00/tests/`，实现后由 `pnpm test:studio` 发现。

| 条目                    | 测试文件 · 用例                                                               | 落地             |
| ----------------------- | ----------------------------------------------------------------------------- | ---------------- |
| B1 引擎选择             | `engine-selection.test.mjs` · 缺省/未知值走旧运行时；`dsh` 走新运行时         | 实现 PR          |
| B2 默认路径不加载 DSH   | `engine-selection.test.mjs` · 模块加载记录无 `@deepseek-ai/*`                 | 实现 PR          |
| B3 直接配置启动         | `boot-contract.test.mjs` · 无 profile/patch、无 HMR                           | 实现 PR          |
| B4 `DSH_HOME`           | `isolation.test.mjs` · 解析/创建/不碰 `~/.dsh`                                | 实现 PR          |
| B5 不加载 `.env`        | `isolation.test.mjs` · cwd 与 DSH_HOME 的 `.env` 均不生效                     | 实现 PR          |
| B6 环境变量清洗         | `isolation.test.mjs` · `DSH_*`/供应商 key 清除，`KNORVIA_*` 保留              | 实现 PR          |
| B7 不加载 `.dsh/skills` | `isolation.test.mjs` · 项目技能不可见                                         | 实现 PR          |
| B8 不挂 Hook 兼容层     | `composition.test.mjs` · 行清单无 `dsh-hooks-*`                               | 实现 PR          |
| B9 不挂遥测             | `composition.test.mjs` · 无 `otel`/`telemetry` 行；`DSH_TELEMETRY_DISABLED=1` | 实现 PR          |
| B10 只用包内版本        | `isolation.test.mjs` · PATH 假 `dsh` 不执行；模块路径在依赖树内               | 实现 PR          |
| B11 身份                | `identity.test.mjs` · prompt 含 Knorvia、不含 Harness 身份                    | 实现 PR          |
| B12 就绪标记            | `process-contract.test.mjs` · stderr 单行、stdout 无输出                      | 实现 PR          |
| B13 生命周期            | `process-contract.test.mjs` · stdin EOF/SIGTERM 后退出 0、资源释放            | 实现 PR          |
| B14 失败语义            | `process-contract.test.mjs` · 配置/依赖错误 → 标记 + 退出 1                   | 实现 PR          |
| B15 组合固定            | `composition.test.mjs` · 行 id/顺序/包名快照                                  | 实现 PR          |
| B16 会话存储所有权      | `session-contract.test.mjs` · 会话文件只落 `$DSH_HOME/sessions`               | 实现 PR          |
| B17 平台差异            | `paths.test.mjs` · Windows/POSIX 路径与大小写；macOS 标注未实测               | 实现 PR          |
| B18 单次启动            | `process-contract.test.mjs` · 第二次 boot 拒绝                                | 实现 PR          |
| B19 日志                | `process-contract.test.mjs` · 日志走 stderr，级别符合约定，无凭据             | 实现 PR          |
| B20 数据/协议不变       | `engine-selection.test.mjs` · 默认路径输出与基线一致（版本命令）              | 合同 PR（T1/T2） |

**合同 PR 实际测试**：`tests/engine-selection-default.test.mjs`（T1：`version` 命令带 `KNORVIA_KERNEL_ENGINE=dsh` 仍输出旧版本、无就绪标记；T2：`help` 同理）。这两条在合同阶段即可通过，且实现后必须继续通过。

## 六、计分模式

- 本包新增文件全部登记 **original**，不做“替换文件”计分；仍按计划书对旧 `core` 与上游固定提交跑两道门槛，证明没有照搬：
  - 行相似度：规范化包含率 < 0.20，最长相同段 < 8 行（<10 行文件必须 0）。
  - 结构相似度：< 0.40。
- 比较对象（实现 PR 的 `--old-list`）：`apps/cli/packages/bootstrap/src/app/create-app.ts`、`apps/cli/packages/bootstrap/src/protocol-entrypoint.ts`、`apps/cli/packages/core/src/runtime/**` 中最接近的入口文件，以及上游 `872ad960` 对应路径。
- DSH 包本身按第三方依赖登记，**不跑相似度**，不登记 original。
- 声明模式：本包没有“兼容签名壳”，不需要 `--declaration`；若实现中出现只含签名的转发模块，按声明模式补测并在 PR 说明。

## 七、完成度

| 步骤                                     | 状态                    |
| ---------------------------------------- | ----------------------- |
| DSH 公开接口侦察（§二）                  | ✅                      |
| 缺口清单（§八）                          | ✅                      |
| `behavior.md` B1–B20                     | ✅                      |
| `interface.md`                           | ✅                      |
| `tests/`（合同阶段 T1/T2）               | ✅                      |
| `fixtures/`                              | ✅（路径/环境夹具说明） |
| `known-differences.md` / `acceptance.md` | ✅                      |
| 实现 PR                                  | ⬜                      |

## 八、缺口清单（DSH 做不到或语义不符）

| #   | 缺口                                                                                                                     | 影响                                        | 备选/处置                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **单文件打包与运行期模块解析冲突**：Loader 按包名从磁盘解析插件；当前桌面只带一个 `knorvia.cjs`，没有 `node_modules`。   | 打包版无法启动 DSH。                        | esbuild 把 `@deepseek-ai/*` 标为 external；桌面/SEA 打包阶段把 DSH 运行时树 stage 到 `resources/knorvia/node_modules`（或同等目录），并把 `bareModuleBaseUrl` 指向该目录。安装版/便携版实测归 `kernel-switch` 验收；本包在打包说明中固化步骤。 |
| G2  | **SEA 单可执行文件不能动态 import 外部 ESM 包**。                                                                        | SEA 产物无法加载 DSH。                      | 本包不承诺 SEA 下的 DSH；远程/SEA 仍走旧运行时。是否支持由 `kernel-switch` 决定（可能需要把 DSH 树作为旁置资源）。                                                                                                                             |
| G3  | **原生模块**：Linux/macOS 会话锁用 `@deepseek-ai/node-addon-system`，Windows 用 `koffi`；二者不能内联进单文件。          | 打包后锁不可用。                            | 打包时解包（asarUnpack）并实测 `flock`/`koffi` 加载；本包记录依赖与解包清单，安装版/便携版实测归 `kernel-switch`。                                                                                                                             |
| G4  | **身份只有 persona 文本可配**：DSH 没有“关闭所有 DSH 品牌文案”的运行时开关；工具错误/命令文案仍可能带 DSH 字样。         | 用户可见文案可能透出 DSH。                  | 本包关闭 `includeHarnessIdentity` 并写 Knorvia 开场；协议桥在 `kernel-bridge-01` 做文案映射。                                                                                                                                                  |
| G5  | **没有 v4 协议表面**：DSH 自带 ACP/SDK/Web 表面，均不是 Knorvia v4。                                                     | 开关打开后 `app-server` 不产出 v4 帧。      | 本包只做就绪与保活；`kernel-bridge-01` 实现 v4 桥。合同与验收明确此边界。                                                                                                                                                                      |
| G6  | **profile 关闭只能靠“不用”**：DSH 没有 `--no-profile` 之类开关；只要调用官方 bin 就会叠加 profile/patch/.env。           | 误用官方入口会破坏隔离。                    | 代码只调用 `boot()`；测试断言不 import `dsh` bin、不调用 `readProfilePatches`；esbuild 不把 `@deepseek-ai/dsh` 主包打进 bundle。                                                                                                               |
| G7  | **`DSH_TELEMETRY_DISABLED` 不是全局网络开关**：它只禁用 `session-telemetry-otel` 行；其他插件仍可能出网（如 web 工具）。 | 不能仅靠该变量证明“无遥测外发”。            | 组合中不挂遥测行、不挂 web/DeepSeek 账号/凭据插件；用组合快照 + 网络抓取双重证据。                                                                                                                                                             |
| G8  | **技能默认根包含 `$DSH_HOME/skills` 与项目 `.dsh/skills`**：`dsh-skill-filesystem` 默认 `includeDefaultRoots: true`。    | 会读到用户 DSH 技能。                       | 设为 `false`；本包不挂任何技能来源，后续 Knorvia 技能插件用 `customSkillDirs` 提供 `.agents/skills`。                                                                                                                                          |
| G9  | **DSH 是预发布 SDK**：0.2.0-rc.2 不承诺 API 兼容。                                                                       | 升级可能破坏接入。                          | 锁定确切版本；升级单独验收（内核规格）。                                                                                                                                                                                                       |
| G10 | **会话正文所有权在 DSH**：Knorvia 旧库仍存正文，切换后不能双写。                                                         | `kernel-legacy-sessions` 必须做一次性导入。 | 本包不写旧库；`kernel-bridge-01` 起按 DSH 事件派生 projection，`kernel-legacy-sessions` 处理导入。                                                                                                                                             |

## 九、接口与调用方

见 [interface.md](interface.md) 与 [callers.md](callers.md)。合同阶段新增的公开面只有：

- 环境变量 `KNORVIA_KERNEL_ENGINE`（既有名字，新取值 `dsh`）。
- `@knorvia/bootstrap/kernel` 子路径导出（供 CLI 与测试使用）。
- stderr 就绪/失败标记行。

不改任何既有导出、协议字段、数据目录或用户数据格式。
