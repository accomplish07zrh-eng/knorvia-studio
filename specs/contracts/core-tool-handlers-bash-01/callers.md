# core-tool-handlers-bash-01 调用方（v1）

数据来源：`scripts/dep-refs.mjs` 同源的静态引用分析（ts-morph），对 38 个继承文件的 **209 个导出**逐个查询工作区（`packages/*`、`apps/*`、`apps/cli/packages/*`、`harness/**`）内的全部引用点。静态分析不覆盖 `import()` 动态导入与字符串路径引用；桶 `export *` 的再导出另见 `interface.md`。

## 概览

| 指标             | 数值 |
| ---------------- | ---- |
| 继承文件         | 38   |
| 导出合计         | 209  |
| 有包外引用的导出 | 7    |
| 包外引用点       | 19   |
| 仅包内使用的导出 | 174  |

## 跨包/跨目录边界（按引用点计）

| 引用方区域               | 引用点 |
| ------------------------ | ------ |
| `apps/cli/packages/core` | 19     |

> 主要调用方为 `handlers/index.ts`（桶，归最后一个 handlers 包）与 core 执行器/权限链（core-tool-01 已合并）。接口默认不可变。

## 逐模块明细

### `bash-background-lifecycle.ts`（3 个导出）

包外无引用（仅包内使用）。

### `bash-background-policy.ts`（1 个导出）

包外无引用（仅包内使用）。

### `bash-command-parser.ts`（7 个导出）

| 导出                          | 种类     | 包外引用点 | 位置                                                              |
| ----------------------------- | -------- | ---------- | ----------------------------------------------------------------- |
| `analyzeBashCommand`          | function | 2          | memory/memory-agent-loop.ts:17<br>memory/memory-agent-loop.ts:162 |
| `isBashCommandPermissionSafe` | function | 2          | memory/memory-agent-loop.ts:18<br>memory/memory-agent-loop.ts:163 |

### `bash-command-permission-policy.ts`（1 个导出）

包外无引用（仅包内使用）。

### `bash-command-rule-evaluator.ts`（1 个导出）

| 导出                | 种类     | 包外引用点 | 位置                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evaluateBashRules` | function | 7          | apps/cli/packages/core/test/permission-rule-patterns.test.ts:11<br>apps/cli/packages/core/test/permission-rule-patterns.test.ts:115<br>apps/cli/packages/core/test/permission-rule-patterns.test.ts:116<br>apps/cli/packages/core/test/permission-rule-patterns.test.ts:117<br>apps/cli/packages/core/test/permission-rule-patterns.test.ts:119<br>apps/cli/packages/core/test/permission-rule-patterns.test.ts:126<br>apps/cli/packages/core/test/permission-rule-patterns.test.ts:128 |

### `bash-cwd-policy.ts`（2 个导出）

包外无引用（仅包内使用）。

### `bash-gh-rate-limit.ts`（1 个导出）

包外无引用（仅包内使用）。

### `bash-git-runtime-safety.ts`（4 个导出）

包外无引用（仅包内使用）。

### `bash-image-output.ts`（1 个导出）

包外无引用（仅包内使用）。

### `bash-metadata.ts`（6 个导出）

包外无引用（仅包内使用）。

### `bash-model-content.ts`（3 个导出）

| 导出                        | 种类     | 包外引用点 | 位置                                                                  |
| --------------------------- | -------- | ---------- | --------------------------------------------------------------------- |
| `isBashOutputProviderError` | function | 2          | runtime/helpers/tool-result.ts:2<br>runtime/helpers/tool-result.ts:93 |

### `bash-output.ts`（4 个导出）

包外无引用（仅包内使用）。

### `bash-prompt.ts`（1 个导出）

包外无引用（仅包内使用）。

### `bash-read-file-sources.ts`（2 个导出）

包外无引用（仅包内使用）。

### `bash-read-file-state.ts`（1 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy-argv-direct.ts`（2 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy-argv-flags.ts`（1 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy-argv-git.ts`（2 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy-argv-io.ts`（4 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy-argv.ts`（2 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy-callbacks.ts`（22 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy-commands.ts`（8 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy-flags-file.ts`（6 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy-flags-git.ts`（12 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy-flags-process.ts`（14 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy-flags-text.ts`（11 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy-flags.ts`（43 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy-git-callbacks.ts`（6 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy-git-subcommands-core.ts`（1 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy-git-subcommands-history.ts`（1 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy-multiword-core.ts`（1 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy-multiword-gh.ts`（1 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy-simple-commands.ts`（6 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy-types.ts`（2 个导出）

包外无引用（仅包内使用）。

### `bash-readonly-policy.ts`（3 个导出）

包外无引用（仅包内使用）。

### `bash-semantics.ts`（5 个导出）

| 导出                           | 种类     | 包外引用点 | 位置                                                              |
| ------------------------------ | -------- | ---------- | ----------------------------------------------------------------- |
| `isRuntimeReadOnlyBashCommand` | function | 2          | memory/memory-agent-loop.ts:20<br>memory/memory-agent-loop.ts:180 |

### `bash.ts`（7 个导出）

包外无引用（仅包内使用）。

### `tool-perf.ts`（11 个导出）

| 导出                          | 种类     | 包外引用点 | 位置                                                                                    |
| ----------------------------- | -------- | ---------- | --------------------------------------------------------------------------------------- |
| `mergeToolExecutionTelemetry` | function | 2          | tool/executor/invocation/invocation.ts:13<br>tool/executor/invocation/invocation.ts:207 |
| `readToolExecutionTelemetry`  | function | 2          | tool/executor/invocation/invocation.ts:14<br>tool/executor/invocation/invocation.ts:207 |

## 仅包内使用的导出（包外无静态引用）

- bash-background-lifecycle.ts :: BashBackgroundLifecycleMode
- bash-background-lifecycle.ts :: BashBackgroundLifecycleResult
- bash-background-lifecycle.ts :: supportsBashBackgroundLifecycle
- bash-background-policy.ts :: isBashAutoBackgroundEligible
- bash-command-parser.ts :: BashCommandAnalysis
- bash-command-parser.ts :: BashCommandEnvAssignment
- bash-command-parser.ts :: BashCommandInvocation
- bash-command-parser.ts :: BashCommandOperator
- bash-command-parser.ts :: BashCommandRedirect
- bash-command-permission-policy.ts :: resolveBashPermissionRulePolicy
- bash-cwd-policy.ts :: appendBashCwdStderrSuffix
- bash-cwd-policy.ts :: decideBashCwdPolicy
- bash-gh-rate-limit.ts :: getGhRateLimitHint
- bash-git-runtime-safety.ts :: analysisContainsGitAndDirectoryChange
- bash-git-runtime-safety.ts :: analysisContainsGitCommand
- bash-git-runtime-safety.ts :: BashReadonlyRuntimeContext
- bash-git-runtime-safety.ts :: isGitRuntimeContextUnsafe
- bash-image-output.ts :: prepareBashImageOutput
- bash-metadata.ts :: readStringProperty
- bash-model-content.ts :: formatBashModelContent
- bash-model-content.ts :: formatPersistedBashModelContent
- bash-output.ts :: BashProgressTiming
- bash-output.ts :: createBashBackgroundPerformanceTelemetry
- bash-output.ts :: createEmptyBashPerformanceTelemetry
- bash-output.ts :: toBashOutput
- bash-prompt.ts :: createBashProviderDescription
- bash-read-file-sources.ts :: collectBashReadFileSources
- bash-read-file-sources.ts :: selectReadContent
- bash-read-file-state.ts :: applyBashReadFileStateEffects
- bash-readonly-policy-argv-direct.ts :: evaluateDirectReadonlyArgv
- bash-readonly-policy-argv-direct.ts :: isFindWriteOption
- bash-readonly-policy-argv-flags.ts :: isArgvAllowedByPolicy
- bash-readonly-policy-argv-git.ts :: hasDangerousGitGlobalOption
- bash-readonly-policy-argv-git.ts :: isGitReadOnlyCommand
- bash-readonly-policy-argv-io.ts :: areEnvAssignmentsAllowed
- bash-readonly-policy-argv-io.ts :: areRedirectsAllowed
- bash-readonly-policy-argv-io.ts :: isUnsafeWindowsUncPath
- bash-readonly-policy-argv-io.ts :: stripSafeCommandWrappers
- bash-readonly-policy-callbacks.ts :: dateCommandIsDangerous
- bash-readonly-policy-callbacks.ts :: dockerCommandIsDangerous
- bash-readonly-policy-callbacks.ts :: ghCommandIsDangerous
- bash-readonly-policy-callbacks.ts :: gitBranchCommandIsDangerous
- bash-readonly-policy-callbacks.ts :: gitLsRemoteCommandIsDangerous
- bash-readonly-policy-callbacks.ts :: gitReflogCommandIsDangerous
- bash-readonly-policy-callbacks.ts :: gitRemoteShowCommandIsDangerous
- bash-readonly-policy-callbacks.ts :: gitRevisionFormatCommandIsDangerous
- bash-readonly-policy-callbacks.ts :: gitTagCommandIsDangerous
- bash-readonly-policy-callbacks.ts :: hasDangerousDockerOption
- bash-readonly-policy-callbacks.ts :: jqCommandIsDangerous
- bash-readonly-policy-callbacks.ts :: lsofCommandIsDangerous
- bash-readonly-policy-callbacks.ts :: manCommandIsDangerous
- bash-readonly-policy-callbacks.ts :: psCommandIsDangerous
- bash-readonly-policy-callbacks.ts :: pyrightCommandIsDangerous
- bash-readonly-policy-callbacks.ts :: sedCommandIsDangerous
- bash-readonly-policy-callbacks.ts :: ssCommandIsDangerous
- bash-readonly-policy-callbacks.ts :: testCommandIsDangerous
- bash-readonly-policy-callbacks.ts :: tputCommandIsDangerous
- bash-readonly-policy-callbacks.ts :: XARGS_TARGET_COMMANDS
- bash-readonly-policy-callbacks.ts :: xargsCommandIsDangerous
- bash-readonly-policy-commands.ts :: GIT_READONLY_SUBCOMMAND_POLICIES
- bash-readonly-policy-commands.ts :: READONLY_MULTIWORD_COMMAND_POLICIES
- bash-readonly-policy-flags-file.ts :: BASE64_SAFE_FLAGS
- bash-readonly-policy-flags-file.ts :: DATE_SAFE_FLAGS
- bash-readonly-policy-flags-file.ts :: FD_SAFE_FLAGS
- bash-readonly-policy-flags-file.ts :: HOSTNAME_SAFE_FLAGS
- bash-readonly-policy-flags-file.ts :: SHA_SUM_SAFE_FLAGS
- bash-readonly-policy-flags-file.ts :: SORT_SAFE_FLAGS
- bash-readonly-policy-flags-git.ts :: COMMON_GIT_COLOR_FLAGS
- bash-readonly-policy-flags-git.ts :: COMMON_GIT_COUNT_FLAGS
- bash-readonly-policy-flags-git.ts :: COMMON_GIT_DATE_FLAGS
- bash-readonly-policy-flags-git.ts :: COMMON_GIT_LOG_STYLE_FLAGS
- bash-readonly-policy-flags-git.ts :: COMMON_GIT_PATCH_FLAGS
- bash-readonly-policy-flags-git.ts :: COMMON_GIT_REF_FLAGS
- bash-readonly-policy-flags-git.ts :: COMMON_GIT_STAT_FLAGS
- bash-readonly-policy-flags-git.ts :: GIT_DIFF_SAFE_FLAGS
- bash-readonly-policy-flags-git.ts :: GIT_GREP_SAFE_FLAGS
- bash-readonly-policy-flags-git.ts :: GIT_LOG_SAFE_FLAGS
- bash-readonly-policy-flags-git.ts :: GIT_SHOW_SAFE_FLAGS
- bash-readonly-policy-flags-git.ts :: GIT_STATUS_SAFE_FLAGS
- bash-readonly-policy-flags-process.ts :: DOCKER_INSPECT_SAFE_FLAGS
- bash-readonly-policy-flags-process.ts :: DOCKER_LOGS_SAFE_FLAGS
- bash-readonly-policy-flags-process.ts :: GH_JSON_REPO_FLAGS
- bash-readonly-policy-flags-process.ts :: GH_LIMIT_REPO_FLAGS
- bash-readonly-policy-flags-process.ts :: GH_REPO_FLAGS
- bash-readonly-policy-flags-process.ts :: LSOF_SAFE_FLAGS
- bash-readonly-policy-flags-process.ts :: MAN_SAFE_FLAGS
- bash-readonly-policy-flags-process.ts :: NETSTAT_SAFE_FLAGS
- bash-readonly-policy-flags-process.ts :: PGREP_SAFE_FLAGS
- bash-readonly-policy-flags-process.ts :: PS_SAFE_FLAGS
- bash-readonly-policy-flags-process.ts :: PYRIGHT_SAFE_FLAGS
- bash-readonly-policy-flags-process.ts :: SS_SAFE_FLAGS
- bash-readonly-policy-flags-process.ts :: TEST_SAFE_FLAGS
- bash-readonly-policy-flags-process.ts :: TPUT_SAFE_FLAGS
- bash-readonly-policy-flags-text.ts :: CAT_SAFE_FLAGS
- bash-readonly-policy-flags-text.ts :: FILE_SAFE_FLAGS
- bash-readonly-policy-flags-text.ts :: GREP_SAFE_FLAGS
- bash-readonly-policy-flags-text.ts :: HEAD_TAIL_SAFE_FLAGS
- bash-readonly-policy-flags-text.ts :: JQ_SAFE_FLAGS
- bash-readonly-policy-flags-text.ts :: OPTION_PATTERN
- bash-readonly-policy-flags-text.ts :: RG_SAFE_FLAGS
- bash-readonly-policy-flags-text.ts :: SED_SAFE_FLAGS
- bash-readonly-policy-flags-text.ts :: TREE_SAFE_FLAGS
- bash-readonly-policy-flags-text.ts :: WC_SAFE_FLAGS
- bash-readonly-policy-flags-text.ts :: XARGS_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: BASE64_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: CAT_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: COMMON_GIT_COLOR_FLAGS
- bash-readonly-policy-flags.ts :: COMMON_GIT_COUNT_FLAGS
- bash-readonly-policy-flags.ts :: COMMON_GIT_DATE_FLAGS
- bash-readonly-policy-flags.ts :: COMMON_GIT_LOG_STYLE_FLAGS
- bash-readonly-policy-flags.ts :: COMMON_GIT_PATCH_FLAGS
- bash-readonly-policy-flags.ts :: COMMON_GIT_REF_FLAGS
- bash-readonly-policy-flags.ts :: COMMON_GIT_STAT_FLAGS
- bash-readonly-policy-flags.ts :: DATE_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: DOCKER_INSPECT_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: DOCKER_LOGS_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: FD_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: FILE_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: GH_JSON_REPO_FLAGS
- bash-readonly-policy-flags.ts :: GH_LIMIT_REPO_FLAGS
- bash-readonly-policy-flags.ts :: GH_REPO_FLAGS
- bash-readonly-policy-flags.ts :: GIT_DIFF_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: GIT_GREP_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: GIT_LOG_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: GIT_SHOW_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: GIT_STATUS_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: GREP_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: HEAD_TAIL_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: HOSTNAME_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: JQ_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: LSOF_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: MAN_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: NETSTAT_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: OPTION_PATTERN
- bash-readonly-policy-flags.ts :: PGREP_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: PS_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: PYRIGHT_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: RG_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: SED_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: SHA_SUM_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: SORT_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: SS_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: TEST_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: TPUT_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: TREE_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: WC_SAFE_FLAGS
- bash-readonly-policy-flags.ts :: XARGS_SAFE_FLAGS
- bash-readonly-policy-git-callbacks.ts :: gitBranchCommandIsDangerous
- bash-readonly-policy-git-callbacks.ts :: gitLsRemoteCommandIsDangerous
- bash-readonly-policy-git-callbacks.ts :: gitReflogCommandIsDangerous
- bash-readonly-policy-git-callbacks.ts :: gitRemoteShowCommandIsDangerous
- bash-readonly-policy-git-callbacks.ts :: gitRevisionFormatCommandIsDangerous
- bash-readonly-policy-git-callbacks.ts :: gitTagCommandIsDangerous
- bash-readonly-policy-git-subcommands-core.ts :: GIT_READONLY_SUBCOMMAND_POLICY_ENTRIES_CORE
- bash-readonly-policy-git-subcommands-history.ts :: GIT_READONLY_SUBCOMMAND_POLICY_ENTRIES_HISTORY
- bash-readonly-policy-multiword-core.ts :: READONLY_MULTIWORD_POLICY_ENTRIES_CORE
- bash-readonly-policy-multiword-gh.ts :: READONLY_MULTIWORD_POLICY_ENTRIES_GH
- bash-readonly-policy-types.ts :: BashReadonlyCommandPolicy
- bash-readonly-policy-types.ts :: SafeFlagValue
- bash-semantics.ts :: interpretBashReturnCode
- bash-semantics.ts :: isBashProviderErrorStatus
- bash-semantics.ts :: isSedInPlaceBashCommand
- bash-semantics.ts :: isSilentBashCommand
- bash.ts :: bashToolEntry
- bash.ts :: createBashToolEntry
- tool-perf.ts :: attachToolExecutionTelemetry
- tool-perf.ts :: classifyCommand
- tool-perf.ts :: classifySafeCommandIdentity
- tool-perf.ts :: commandHash
- tool-perf.ts :: compactToolExecutionTelemetry
- tool-perf.ts :: elapsedMsSince
- tool-perf.ts :: fileByteCount
- tool-perf.ts :: roundNonNegativeMs
- tool-perf.ts :: workspaceKind

## 只被桶再导出的导出

- bash-metadata.ts :: getBashActivityDescription
- bash-metadata.ts :: getBashAutoClassifierInput
- bash-metadata.ts :: getBashDescription
- bash-metadata.ts :: getBashToolUseSummary
- bash-metadata.ts :: getBashUserFacingName
- bash-readonly-policy-argv.ts :: evaluateBashReadonlyPolicy
- bash-readonly-policy-argv.ts :: hasKnownBashWriteOption
- bash-readonly-policy-callbacks.ts :: isSedInPlaceOption
- bash-readonly-policy-commands.ts :: GIT_GLOBAL_DANGEROUS_FLAGS
- bash-readonly-policy-commands.ts :: GIT_GLOBAL_NO_VALUE_FLAGS
- bash-readonly-policy-commands.ts :: GIT_GLOBAL_VALUE_FLAGS
- bash-readonly-policy-commands.ts :: READONLY_ALLOW_ANY_ARG_COMMAND_PREFIXES
- bash-readonly-policy-commands.ts :: READONLY_ALLOW_ANY_ARG_COMMANDS
- bash-readonly-policy-commands.ts :: READONLY_COMMAND_POLICIES
- bash-readonly-policy-simple-commands.ts :: GIT_GLOBAL_DANGEROUS_FLAGS
- bash-readonly-policy-simple-commands.ts :: GIT_GLOBAL_NO_VALUE_FLAGS
- bash-readonly-policy-simple-commands.ts :: GIT_GLOBAL_VALUE_FLAGS
- bash-readonly-policy-simple-commands.ts :: READONLY_ALLOW_ANY_ARG_COMMAND_PREFIXES
- bash-readonly-policy-simple-commands.ts :: READONLY_ALLOW_ANY_ARG_COMMANDS
- bash-readonly-policy-simple-commands.ts :: READONLY_COMMAND_POLICIES
- bash-readonly-policy.ts :: evaluateBashReadonlyPolicy
- bash-readonly-policy.ts :: hasKnownBashWriteOption
- bash-readonly-policy.ts :: isSedInPlaceOption
- bash.ts :: getBashActivityDescription
- bash.ts :: getBashAutoClassifierInput
- bash.ts :: getBashDescription
- bash.ts :: getBashToolUseSummary
- bash.ts :: getBashUserFacingName
