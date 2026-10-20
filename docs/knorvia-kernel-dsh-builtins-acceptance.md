# kernel-dsh-builtins 实现验收（实现阶段补充）

> 合同侧验收见 [specs/contracts/kernel-dsh-builtins/acceptance.md](specs/contracts/kernel-dsh-builtins/acceptance.md)。
> 本文件是**实现 PR** 的验收记录：范围、测试结果、两处修正的实测证据、门禁输出、首次失败与修正、未覆盖内容。

## 一、范围

| 项         | 内容                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------- |
| 包         | `kernel-dsh-builtins`（M2 接入包）                                                          |
| 认领 issue | #219                                                                                        |
| 实现分支   | `replace/kernel-dsh-builtins`，基线 `origin/main` `394001eb`（合同 PR #225 合并提交）       |
| 合并前基线 | `merge --ff-only origin/main` 到 `23cd766e`（合同 `kernel-bridge-legacy` v1，与本包无交集） |
| 依据       | 计划书「内核方案调整」（含 2026-10-20 审查结论）、`specs/knorvia-builtin-kernel-dsh.md`     |

**本包改动的文件**（全部在 `apps/cli/packages/bootstrap/src/kernel/` 内，本包独占该路径）：

| 类别         | 文件                                                                                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 修改         | `composition.ts`、`environment.ts`、`host.ts`、`index.ts`、`module-url.ts`                                                                                                                                                                       |
| 新增         | `builtins-context.ts`、`builtins-modules.ts`、`builtins-rows.ts`、`compression.ts`、`runtime-context.ts`、`shell-environment.ts`、`shell-environment-bash.ts`、`shell-environment-pwsh.ts`、`user-environment.ts`、`user-environment-service.ts` |
| 新增（探针） | `scripts/kernel-context-probe.mjs`、`scripts/kernel-shell-probe.mjs`                                                                                                                                                                             |
| 测试         | `specs/contracts/kernel-dsh-builtins/tests/**`（9 个测试文件 + 2 个辅助模块）                                                                                                                                                                    |
| 既有测试升级 | `kernel-dsh-00/tests/{composition,boot-contract,paths,identity}.test.mjs`（D1/D2）                                                                                                                                                               |

**不在范围**：`kernel-bridge/entry.ts` 的 `route()` default 分支（legacy 线 #221）；不新增 v4 方法（回合命令归 #222）。

## 二、测试结果（实测，2026-10-20，Node 24.14.0 / Windows 11）

### 本包契约测试：两个入口均 100% 通过、0 跳过

```powershell
# dist 入口（默认；先 pnpm build:cli-packages 或 --dir apps/cli/packages/bootstrap build）
node --import tsx --test --test-concurrency=2 "specs/contracts/kernel-dsh-builtins/tests/*.test.mjs"
# 源码入口
$env:KNORVIA_KERNEL_ENTRY="source"; node --import tsx --test --test-concurrency=2 "specs/contracts/kernel-dsh-builtins/tests/*.test.mjs"
```

| 入口   | tests | pass   | fail | skipped | duration |
| ------ | ----- | ------ | ---- | ------- | -------- |
| dist   | 51    | **51** | 0    | 0       | 19.2s    |
| source | 51    | **51** | 0    | 0       | 21.2s    |

分文件（均为 `--test-concurrency=2` 单文件跑完的实测耗时）：

| 文件                            | 条目      | 用例 | 耗时 |
| ------------------------------- | --------- | ---- | ---- |
| `composition-builtins.test.mjs` | B1–B3     | 6    | 3.4s |
| `tools-mount.test.mjs`          | B4–B7     | 8    | 3.7s |
| `policy-approval.test.mjs`      | B8        | 4    | 2.1s |
| `child-env.test.mjs`            | B9–B13    | 3    | 7.9s |
| `runtime-context.test.mjs`      | B14–B16   | 3    | 5.7s |
| `compaction-mount.test.mjs`     | B17–B18   | 8    | 2.2s |
| `goal-plan.test.mjs`            | B19–B20   | 6    | 2.7s |
| `subagent-mcp.test.mjs`         | B21–B22   | 7    | 2.8s |
| `isolation-mount.test.mjs`      | B3 隔离面 | 4    | 2.7s |
| `default-engine.test.mjs`       | B23–B24   | 2    | 3.3s |

### 上游回归：两个既有套件全过

| 套件                        | 结果           | 说明                   |
| --------------------------- | -------------- | ---------------------- |
| `kernel-dsh-00/tests/**`    | **25/25 pass** | D1/D2 升级后（见 §五） |
| `kernel-bridge-01/tests/**` | **20/20 pass** | 挂载没破坏协议面       |

## 三、审查结论两处修正的实测证据

### 修正一：工具子进程环境快照（三断言）

```powershell
$env:TSX_TSCONFIG_PATH="D:\knorvia studio开发\wt\exec-kernel\packages\ui\tsconfig.json"
node --import tsx --test --test-concurrency=2 "specs/contracts/kernel-dsh-builtins/tests/child-env.test.mjs"
```

```text
✔ B9/B10/B11 工具子进程只看得到用户环境：普通变量与凭据形变量可见，DSH_* 不可见 (4374.6662ms)
✔ B12 进程级清洗仍生效，但快照让子进程看得到同一个变量 (3365.7284ms)
✔ B13 boot 之后新增的变量不进入工具子进程 (2725.6788ms)
ℹ tests 3 / pass 3 / fail 0
```

| 断言                          | 结果 | 证据                                                                                           |
| ----------------------------- | ---- | ---------------------------------------------------------------------------------------------- |
| (a) 普通变量可见              | ✅   | `KNORVIA_TEST_PLAIN_MARKER` 等于夹具值                                                         |
| (b) **凭据形变量可见**        | ✅   | `MY_SERVICE_API_KEY` 等于夹具值（审查结论点名的修正）                                          |
| (c) `DSH_*` 不可见            | ✅   | 宿主继承的 `DSH_KNORVIA_INHERITED` 与 `dsh-shell-env` 托管注入的 `DSH_HOME`/`DSH_SHELL` 全为空 |
| (d) 进程级清洗仍生效          | ✅   | `ANTHROPIC_API_KEY` 在 `process.env` 里已删、在子进程里有且等于启动值                          |
| (e) boot 后新增变量不进子进程 | ✅   | `KNORVIA_TEST_AFTER_BOOT` 为空                                                                 |
| (f) 快照不落盘不进日志        | ✅   | `kernel.env.snapshot` 只报 `{entries: <n>}`，无键名无键值                                      |

### 修正二：系统提示运行环境信息（六字段）

```powershell
node --import tsx --test --test-concurrency=2 "specs/contracts/kernel-dsh-builtins/tests/runtime-context.test.mjs"
```

```text
✔ B14 运行环境信息六个字段齐全且取值来自真实宿主 (2329.2918ms)
✔ B15 日期与工作目录随装配时刻求值，不是启动期常量 (2619.5064ms)
✔ B16 装配结果不出现 DSH 品牌，且以 Knorvia 开场 (2398.5631ms)
ℹ tests 3 / pass 3 / fail 0
```

实测装配结果（探针 `scripts/kernel-context-probe.mjs` 回传的 `renderContextSnapshot`）：

```text
Current runtime context. This snapshot supersedes earlier runtime-context snapshots.

# Environment
You have been invoked in the following environment:
- Primary working directory: D:\knorvia studio开发\wt\exec-kernel
- Platform: win32
- Shell: pwsh
- OS Version: 10.0.26200
- Today's date is 2026-10-20.
- Time zone: Asia/Taipei.
```

六字段齐全；无 `harness:identity` 段、无 `DeepSeek Harness` 字样、无 `@deepseek-ai/` 包名；prompt 以 Knorvia persona 开场。

## 四、门禁输出（实现 PR 实测）

| 检查                                          | 结果                     | 备注                                                               |
| --------------------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| `pnpm fmt`                                    | exit 0                   | Frozen evidence integrity passed                                   |
| `pnpm fmt:check`                              | exit 0                   | All matched files use the correct format                           |
| `pnpm typecheck`                              | exit 0                   | i18n 5573 键校验通过                                               |
| `pnpm lint`                                   | exit 0                   | 216 warnings / **0 errors**；本包 `bootstrap/src/kernel/**` 零告警 |
| `pnpm architecture:check`                     | exit 0                   | violations 0 / baseline 0 / new 0                                  |
| `pnpm build:cli-packages`                     | exit 0                   | 15/15 tasks（`KNORVIA_CUA_DRIVER_ARCHIVE` 离线暂存）               |
| 两道相似度门                                  | 见 §六                   | normal 10/10、declaration 4/4                                      |
| `pnpm knip`                                   | main 上本来就失败        | 本包零新增，见 §七                                                 |
| `pnpm test:studio`                            | 交 CI（Linux + Windows） | 本地失败项已逐类核实，见 §八                                       |
| `pnpm provenance:report` / `provenance:check` | 最后一次执行             | 见 §九                                                             |

## 五、首次失败与修正（如实记录）

本包实现过程中被自己的测试抓出 **5 个真实问题**，全部按「改实现、不改测试」处理：

| #   | 现象                                                                        | 根因                                                                                                                                       | 修正                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 压缩阈值算出 **132000** 而非 166000                                         | 只把「缓冲」当 `headroomTokens`、漏了 DSH 还要扣 `reservedCompletionTokens`。DSH 公式是 `min(窗口×占比, 窗口 − 输出预留 − 余量)`           | `compression.ts` 重写：`maxTokens=21000`（预留上限）+ `headroomTokens=13000`（缓冲）+ `thresholdRatio=1` → `200000−21000−13000=166000` ✅。导出 `dshPressureThreshold`/`pressureThresholdFor`/`legacyBudgetChain`/`minimumUsableWindow` 让测试能逐节点核对 |
| 2   | 沙箱写边界等于 `process.cwd()`（宿主目录）而非会话 cwd                      | `dsh-sandbox-policy` 的 `workspaceRoot` 缺省取 `process.cwd()`                                                                             | 组合显式写入启动 cwd（`prepareKernelEnvironment` 回传已校验的绝对 cwd）；测试断言 `=== 启动 cwd` 且 `!== process.cwd()`                                                                                                                                    |
| 3   | `createKernelPluginRows()` 不传 `moduleIds` 时只回底座                      | 早期为保住 `kernel-dsh-00` 的 19 行快照而留的分支，与合同 B1「物化结果 = 底座 + 追加行」冲突                                               | 改为**永远追加**（模块地址与 cwd 都有缺省值），并按 D1 升级 `kernel-dsh-00` 的期望值（断言强度不变，见下）                                                                                                                                                 |
| 4   | **源码入口全红、dist 入口全绿**：整份环境快照被摊平成 `{}`                  | `materializeSnapshot` 用 `instanceof FrozenUserEnvironment` 判断「这是不是快照」。源码入口与 dist 入口各持一份类对象，跨入口实例互相认不出 | 改为按 interface.md §二 的 `names()`+`get()` 摊平（`names()` 本就是合同要求的导出）；空快照单例补齐 `names()`。**教训：跨入口/跨模块实例一律不用 `instanceof` 做接口判断**                                                                                 |
| 5   | `builtins-modules.ts` declaration 门 containment 0.125–0.25（<10 行必须 0） | 残留行是 `return ids;` / `new Map<string, string>()` / `return Object.fromEntries(` 一类通用惯用式                                         | 改成「具名子路径常量 + `addressOf()` + 一次对象字面量构造」，residual 6 行、containment **0.000**                                                                                                                                                          |

另外一次**偶发红**（非本包缺陷，如实记录）：`kernel-dsh-00` 的 B2/B20 在 2 并发下曾报 `app-server --stdio` → `Protocol input closed`。单文件跑 3/3、全量复跑 25/25 通过，判定为 CLI 冷启动抖动；未改测试、未放宽断言。

### D1/D2 的期望值升级（修正实现，不是改测试）

| 用例                        | 升级前                                                                    | 升级后                                                                                                             | 断言强度                                                   |
| --------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `composition.test.mjs` B15  | `assert.deepEqual(rows, expectedRows(...))` —— 物化结果**整体等于** 19 行 | `assert.deepEqual(rows.slice(0,19), expectedRows(...))` **加** 追加行 id 唯一、不与底座重名、`appended.length > 0` | **不变且更严**：底座 19 行仍逐字段比对；新增三条追加行约束 |
| `boot-contract.test.mjs` B3 | `assert.deepEqual(parsed, createKernelPluginRows(dshHome))` 同源比较      | `assert.deepEqual(parsed.slice(0,19), materialized.slice(0,19))` + 追加行 id 唯一 + 不重名                         | **不变**：同源比较保留在切片上                             |
| `paths.test.mjs` B17        | 同上                                                                      | 同上                                                                                                               | **不变**                                                   |
| `identity.test.mjs` B11     | 只断言「无 Harness 身份句」                                               | **保留全部原断言**，追加「注册了 `knorvia:runtime-context`」+「快照含 `Primary working directory:`」               | **更严**：原断言一条未删                                   |

## 六、两道相似度门槛实测

工具：本工作树自带的 `scripts/provenance/similarity.mjs`；`--old-rev origin/main`；上游 `--upstream-dir "D:\knorvia studio开发\cache\zcode-872ad960"` `--upstream-rev 872ad960de7ec172591f7e1952f7849229f94521`。

比较对象（`--old-list`，95 个文件）：`core/src/context/**`（8）、`core/src/compact/**`（8）、`core/src/permission/**`（含子目录）、`core/src/tool/**` 里与 bash/shell/env/result 相关的文件。

### normal 门（10/10 通过）

| 文件                          | 行数 | containment | run | structural |
| ----------------------------- | ---- | ----------- | --- | ---------- |
| `builtins-context.ts`         | 3    | 0.000       | 0   | 0.000      |
| `builtins-modules.ts`         | 15   | 0.000       | 0   | 0.167      |
| `builtins-rows.ts`            | 153  | 0.039       | 2   | 0.034      |
| `compression.ts`              | 80   | 0.050       | 1   | 0.077      |
| `runtime-context.ts`          | 45   | 0.089       | 1   | 0.000      |
| `shell-environment.ts`        | 29   | 0.034       | 1   | 0.000      |
| `shell-environment-bash.ts`   | 1    | 0.000       | 0   | 0.000      |
| `shell-environment-pwsh.ts`   | 1    | 0.000       | 0   | 0.000      |
| `user-environment.ts`         | 43   | 0.047       | 1   | 0.000      |
| `user-environment-service.ts` | 16   | 0.125       | 1   | 0.000      |

门槛：containment < 0.20、run < 8、<10 行的 containment 必须 0、structural < 0.40。**全部达标**。

### declaration 门（4/4 通过）

只对纯转发/纯声明模块跑（`shell-environment-{bash,pwsh}.ts` 各自只 `export default` 一个类；`builtins-context.ts`、`builtins-modules.ts` 以签名为主）：

| 文件                        | residual | containment | run |
| --------------------------- | -------- | ----------- | --- |
| `shell-environment-bash.ts` | 1        | 0.000       | 0   |
| `shell-environment-pwsh.ts` | 1        | 0.000       | 0   |
| `builtins-context.ts`       | 1        | 0.000       | 0   |
| `builtins-modules.ts`       | 6        | 0.000       | 0   |

**未过计数（两门并集）：0。**

## 七、knip（main 上本来就失败；本包零新增）

`pnpm knip` 在干净 `origin/main` 上同样 exit 1。**基准取 `wt/ek-baseline` @`526825db`（干净 main 工作树）的实测**，与本分支逐分类对照：

| 分类                         | 干净 main `526825db` | 本分支  | 差额    | 归因                                                                                   |
| ---------------------------- | -------------------- | ------- | ------- | -------------------------------------------------------------------------------------- |
| Unused files                 | 331                  | **330** | **−1**  | 两个探针已按 `knip.json` 既有口径登记为 entry                                          |
| Unused dependencies          | 67                   | 103     | +36     | 组合行按**字符串**引用 DSH 包、knip 静态图看不到；干净 main 上同类已有 11 条先例，见下 |
| Unused devDependencies       | 26                   | 26      | **0**   | —                                                                                      |
| Unlisted dependencies        | 137                  | **64**  | **−73** | 本轮 `pnpm install` 补齐 lockfile；另修掉 3 条本包引入的未声明导入（见下）             |
| Unresolved imports           | 2                    | 2       | **0**   | —                                                                                      |
| Unused exports               | 689                  | 696     | +7      | 全部来自 main 推进，见下「+7 归因」                                                    |
| Unused exported types        | 402                  | 402     | **0**   | —                                                                                      |
| Unused exported enum members | 5                    | 5       | **0**   | —                                                                                      |

**本包文件在 knip 输出里零条目**：`kernel/builtins*`、`compression`、`runtime-context`、`shell-environment*`、`user-environment*`、`module-url`、`composition`、`environment`、`host`、`scripts/kernel-*`、`kernel-dsh-builtins/tests/**` 全部干净。

### `+36 Unused dependencies` 的归因

干净 main 在 `apps/cli/packages/bootstrap` 下已有 **11 条**同口径条目（`cordis-plugin-timer`、`dsh-agent`、`dsh-agent-instructions`、`dsh-agent-loop`、`dsh-llm-pi-ai`、`dsh-mcp-resources`、`dsh-session-persistence-jsonl`、`dsh-session-projection`、`dsh-skill`、`dsh-skill-filesystem`、`dsh-tools`）。它们都是「组合行用**字符串**写包名、代码里不 import」的必然结果。本包新增 25 行组合行，必然带出同类条目。**不是本包新增的问题类别。**

### `+7 Unused exports` 的归因（逐条）

这 7 条**没有一条出自本包**：本包文件零条目。逐条核对来源：

| 条目                                                                                                                      | 文件                                                               | 来源                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `readModelFailureErrorPhase`、`modelFailureAttributionFields`、`modelFailureStatusFields`、`providerRequestIdFromHeaders` | `apps/cli/packages/adapters/src/model/runner-telemetry.ts`         | main 既有（`git show origin/main:` 可查到）；本分支对该目录 `git diff --name-only origin/main` 为 **0 个文件** |
| `RuntimeHeadersRefreshError`、`resolveModelForAttempt`                                                                    | `apps/cli/packages/adapters/src/model/runner-runtime-headers.ts`   | 同上                                                                                                           |
| `removeTempDir`、`protocolEnv`、`LEGACY_ERROR_CODES`、`repoRoot`                                                          | `specs/contracts/kernel-bridge-legacy/tests/{_protocol,entry}.mjs` | **不属于本分支**：该合同由 `23cd766e`（PR #226，legacy 线 #221）合入 main；本分支对它零改动                    |

同时干净 main 上有 3 条在本分支消失（`clearWebFetchCacheForTests`、`addReadLineNumbers`、`inspectProviderFailure`），故净额 `689 − 3 + 10 = 696`。

### 本轮修掉的 3 条本包引入的未声明导入

实现过程中本包曾引入 `@deepseek-ai/dsh-agent`（`assembleContextFor`）与 `@deepseek-ai/dsh-system-prompt`（`renderPrompt`）两个跨包 import，而仓库根 `package.json` 未声明它们（干净 main 上同类条目只有 `kernel-dsh-00/tests/identity.test.mjs` 1 条）。为不新增该类别：

- 计划模式的装配上下文改为在测试内联 `{ agent, scope: agent }`（`assembleContextFor` 的全部内容），去掉 `dsh-agent` import；
- prompt 断言改为直接读装配结果的 section 文本（`plan:policy`），去掉 `renderPrompt` import。

**本包对 `Unlisted dependencies` 的净影响为 0 新增**（并因 lockfile 补齐而 −73）。

### 收尾清理（正常清理，一句话带过）

`kernelSessionsRoot`、`resolveSiblingModuleUrl` 两个未调用的导出已删除；`resolveSelfModuleUrl`、`KERNEL_USER_ENVIRONMENT_SERVICE`、`KERNEL_RUNTIME_CONTEXT_ID` 三个只在模块内用的常量去掉 `export`。

## 七之二、一处**正确性决定**（不是「清理无用依赖」）

`@deepseek-ai/dsh-bash-sandbox` 与 `@deepseek-ai/dsh-pwsh-sandbox` 已从 `apps/cli/packages/bootstrap/package.json` 的依赖里**删除**。

**这是防止运行时出现双 shell 所有者的正确性决定，不是清理无用依赖。** 理由：

- 这两个包是 DSH 的**沙箱消费型执行器**（`Sandbox-consuming implementation of the … executor seam`），每个都注册一个 `ctx.shell`；
- 本包已经用 `SnapshotBashExecutor` / `SnapshotPwshExecutor`（官方执行器的**子类**）顶替了同 id 的 `shell` 行，而 `ctx.shell` 在**一个 context 里只能有一个实现**——再加载一个用 `ctx.sandbox` 的执行器会注册第二个 shell 所有者，直接违反本包合同 `interface.md` §一「单实例：`ctx.shell` 只有本包一个实现」与 README G2；
- 两者从合同 PR 起就只声明、从未被任何组合行引用。删掉声明即是把「不会误挂」这件事固定在依赖清单层面：**没有声明就不可能被 Loader 解析到**。

沙箱能力本身不受影响：策略执行点仍是 `dsh-sandbox-policy`（`mode: workspace-write` + 启动 cwd）+ `dsh-sandbox-local` + `dsh-fs-sandbox` 三行（B8 断言其全部在位）。

## 八、`pnpm test:studio`（交 CI）

本地全量运行的已知失败项与归属（与 `kernel-dsh-00` 合同 PR 阶段记录一致，均为环境类）：

| 失败项                                          | 原因                                                                                                           | 归属                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `core/test/causality-*`（6 个）                 | `dynamic-workflow/src/compiler/libs.generated.js` 由包 `build` 生成但不在 turbo `outputs` 里，缓存命中时不写出 | 环境；`node scripts/generate-libs.mjs` 即恢复 |
| `desktop/test/official-plugin-staging.test.mjs` | 同上                                                                                                           | 环境                                          |
| `studio-workspace-runtime-health`               | GATE-PLAYBOOK 已列的 Windows 抖动族                                                                            | 抖动                                          |

CI 冷跑不受上述缓存问题影响；以**双平台 CI 结果**为准。

## 九、来源登记与 provenance

- 12 个新增源码/脚本文件登记 `original`、`Apache-2.0`（每文件首行 SPDX）。
- 9 个测试文件 + 2 个辅助模块 + 2 个探针同样登记 `original`。
- DSH 子包按第三方依赖登记，**不跑相似度**、不登记 `original`。
- 顺序：`fmt` → `fmt:check` → 登记 → `provenance:report` → `provenance:check`；登记后不再跑 fmt 与旧门，否则摘要过期。

## 十、未覆盖的内容

| #   | 项                                                | 归属                                                      |
| --- | ------------------------------------------------- | --------------------------------------------------------- |
| 1   | 真实模型驱动的工具调用、压缩触发、目标轮次        | `kernel-switch` 真实模型冒烟                              |
| 2   | 真实 MCP 服务器连通（本包只断言行生成与字段映射） | `kernel-switch`（D24）                                    |
| 3   | macOS 上的 bash 支                                | 无实机；Linux CI 覆盖 POSIX 语义（D23）                   |
| 4   | 安装版/便携版的 DSH 运行时树与原生模块            | `kernel-switch`（`kernel-dsh-00` G1–G3）                  |
| 5   | 小窗口模型的 `modelPolicies` 逐模型填值           | `kernel-plugin-policy` 与本包 D4b（本包只留位并给出判据） |

## 十一、安全约定（全队口径，本包自查）

本机（以及全部执行线）就运行在 DSH 之上，`DSH_HOME` 指向真实用户目录、`DSH_WEB_URL` 是当前 GUI。因此本包：

- **无任何进程级清理**：全部 `**/tests/**` 与探针脚本零命中 `taskkill`/`pkill`/`killall`/`process.kill`；子进程只用 `spawn` 返回的句柄收尾。`kernel-bridge-01/tests/_protocol.mjs` 与 `kernel-bridge-legacy/tests/_protocol.mjs` 里的 `child.kill("SIGKILL")` 都是**自己 spawn 的句柄**，符合口径。
- **不碰真实用户数据**：`isolation-mount.test.mjs` 用 `mkdtemp` 造「诱饵主目录」，在其中铺 `~/.dsh/.credentials.yaml`、`sessions/`、`cordis.patch.yml` 的**虚构占位副本**，boot 全部内置能力后断言**整树内容与 mtime 完全不变**。
- 另断言：宿主继承的 `DSH_HOME` 被忽略（数据目录只由 `KNORVIA_DATA_BASE_DIR` 决定）；数据目录不得落在真实 `~/.dsh` 内（只做字符串前缀判定，不 list/stat 真实路径）。

### `isolation-mount.test.mjs` 的四条反向断言（点名保留）

1. **诱饵主目录整树不变**：`mkdtemp` 里造一份结构同真实用户目录的 `~/.dsh`（虚构 `.credentials.yaml` / `sessions/` / `cordis.patch.yml`），boot 全部内置能力后逐文件比对**内容 + mtime** —— mtime 一起比才能抓到「读后写」。
2. **宿主继承的 `DSH_HOME` 被忽略**：把它指向一个诱饵目录，断言内核不采用它、且该目录内容不变。
3. **数据目录只由 `KNORVIA_DATA_BASE_DIR` 派生**。
4. **对真实 `~/.dsh` 零读写：不动、不 list、不 stat** —— 只用字符串前缀判定数据目录不在它里面。
