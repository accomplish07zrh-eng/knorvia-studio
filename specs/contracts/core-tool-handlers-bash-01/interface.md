# core-tool-handlers-bash-01 接口（interface.md）

只列**兼容所需的模块路径、导出名、参数与返回类型**：替换包必须让这些模块路径与导出在编译产物中保持可用，签名不变。行为见 `behavior.md`，调用方见 `callers.md`。

覆盖 `apps/cli/packages/core/src/tool/handlers` 下 **38 个继承文件**（`licensing/current-files.json` 实测：upstream-modified 13 / upstream-unchanged 25）。

## 导出统计

| 项           | 数量 |
| ------------ | ---- |
| 模块数       | 38   |
| 导出合计     | 209  |
| 运行时值导出 | 198  |
| 类型导出     | 11   |

> 大型只读规则表常量（`bash-readonly-policy-*` 的 `*_SAFE_FLAGS` / `*_POLICIES` 等）按选择 9 只列名字与种类，不贴巨型字面量；其判定结果样例见 `tests/bash-readonly.test.ts`。

## 逐文件导出

### `apps/cli/packages/core/src/tool/handlers/bash-background-lifecycle.ts`

继承分类 `upstream-modified`，37 行，3 个导出。

```ts
export type BashBackgroundLifecycleMode = "explicit" | "auto_on_timeout";
export type BashBackgroundLifecycleResult =
  | { kind: "foreground"; result: ExecutionResult }
  | { kind: "backgrounded"; task: BackgroundExecutionStartResult };
export function supportsBashBackgroundLifecycle(
  executionPort: ExecutionPort,
): executionPort is BashBackgroundLifecycleExecutionPort;
```

### `apps/cli/packages/core/src/tool/handlers/bash-background-policy.ts`

继承分类 `upstream-modified`，10 行，1 个导出。

```ts
export function isBashAutoBackgroundEligible(input: BashInput): boolean;
```

### `apps/cli/packages/core/src/tool/handlers/bash-command-parser.ts`

继承分类 `upstream-unchanged`，277 行，7 个导出。

```ts
export function analyzeBashCommand(command: string): BashCommandAnalysis;
export interface BashCommandAnalysis {
  readonly commands: BashCommandInvocation[];
  readonly hasDynamicWords: boolean;
  readonly hasParseErrors: boolean;
  readonly hasRedirects: boolean;
  readonly hasUnsupportedSyntax: boolean;
  readonly unsupportedNodeTypes: string[];
}
export interface BashCommandEnvAssignment {
  readonly name: string | undefined;
  readonly value: string | undefined;
}
export interface BashCommandInvocation {
  readonly argv: string[];
  readonly commandText: string;
  readonly envAssignments: BashCommandEnvAssignment[];
  readonly hasAssignmentPrefix: boolean;
  readonly hasDynamicWords: boolean;
  readonly hasRedirects: boolean;
  readonly name: string;
  readonly operatorBefore?: BashCommandOperator;
  readonly redirects: BashCommandRedirect[];
}
export type BashCommandOperator = "&&" | "||" | "|" | "|&" | "sequence";
export interface BashCommandRedirect {
  readonly fileDescriptor: number | undefined;
  readonly operator: Redirect["operator"];
  readonly target: string;
}
export function isBashCommandPermissionSafe(analysis: BashCommandAnalysis): boolean;
```

### `apps/cli/packages/core/src/tool/handlers/bash-command-permission-policy.ts`

继承分类 `upstream-modified`，384 行，1 个导出。

```ts
export function resolveBashPermissionRulePolicy(
  input: unknown,
  context?: ToolRuntimePermissionCapabilityContext,
): ToolPermissionRulePolicy | undefined;
```

### `apps/cli/packages/core/src/tool/handlers/bash-command-rule-evaluator.ts`

继承分类 `upstream-modified`，51 行，1 个导出。

```ts
export function evaluateBashRules(input: BashRuleEvaluationInput): boolean;
```

### `apps/cli/packages/core/src/tool/handlers/bash-cwd-policy.ts`

继承分类 `upstream-modified`，121 行，2 个导出。

```ts
export function appendBashCwdStderrSuffix(stderr: string, suffix: string | undefined): string;
export function decideBashCwdPolicy(input: BashCwdPolicyInput): BashCwdPolicyDecision;
```

### `apps/cli/packages/core/src/tool/handlers/bash-gh-rate-limit.ts`

继承分类 `upstream-unchanged`，17 行，1 个导出。

```ts
export function getGhRateLimitHint(command: string, output: string): string | undefined;
```

### `apps/cli/packages/core/src/tool/handlers/bash-git-runtime-safety.ts`

继承分类 `upstream-unchanged`，212 行，4 个导出。

```ts
export function analysisContainsGitAndDirectoryChange( commands: readonly
export function analysisContainsGitCommand( commands: readonly
export interface BashReadonlyRuntimeContext { workingDirectory?: string; workspaceRoot?: string; }
export function isGitRuntimeContextUnsafe( context: BashReadonlyRuntimeContext | undefined, ): boolean
```

### `apps/cli/packages/core/src/tool/handlers/bash-image-output.ts`

继承分类 `upstream-modified`，92 行，1 个导出。

```ts
export async function prepareBashImageOutput( stdout: BashImageSource, context: ToolExecutionContext, ): Promise<
```

### `apps/cli/packages/core/src/tool/handlers/bash-metadata.ts`

继承分类 `upstream-unchanged`，37 行，6 个导出。

```ts
export function getBashActivityDescription(input?: unknown): string;
export function getBashAutoClassifierInput(input: unknown): string | undefined;
export function getBashDescription(input: unknown): string;
export function getBashToolUseSummary(input?: unknown): string | null;
export function getBashUserFacingName(input?: unknown): string;
export function readStringProperty(input: unknown, key: string): string | undefined;
```

### `apps/cli/packages/core/src/tool/handlers/bash-model-content.ts`

继承分类 `upstream-modified`，133 行，3 个导出。

```ts
export function formatBashModelContent(output: unknown): ModelMessageContent
export function formatPersistedBashModelContent(input:
export function isBashOutputProviderError(output: unknown): boolean
```

### `apps/cli/packages/core/src/tool/handlers/bash-output.ts`

继承分类 `upstream-modified`，168 行，4 个导出。

```ts
export interface BashProgressTiming { firstOutputMs?: number; }
export function createBashBackgroundPerformanceTelemetry( input: BashInput, ): ToolExecutionTelemetry | undefined
export function createEmptyBashPerformanceTelemetry( input: BashInput, ): ToolExecutionTelemetry | undefined
export async function toBashOutput( result: ExecutionResult, input: BashInput, context: ToolExecutionContext, options:
```

### `apps/cli/packages/core/src/tool/handlers/bash-prompt.ts`

继承分类 `upstream-unchanged`，24 行，1 个导出。

```ts
export function createBashProviderDescription(input:
```

### `apps/cli/packages/core/src/tool/handlers/bash-read-file-sources.ts`

继承分类 `upstream-unchanged`，276 行，2 个导出。

```ts
export function collectBashReadFileSources(command: string): BashReadFileSource[];
export function selectReadContent(
  content: string,
  source: BashReadFileSource,
): SelectedReadContent | undefined;
```

### `apps/cli/packages/core/src/tool/handlers/bash-read-file-state.ts`

继承分类 `upstream-modified`，201 行，1 个导出。

```ts
export async function applyBashReadFileStateEffects(
  input: BashReadFileStateEffectsInput,
): Promise<void>;
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy-argv-direct.ts`

继承分类 `upstream-unchanged`，147 行，2 个导出。

```ts
export function evaluateDirectReadonlyArgv(argv: readonly string[]): boolean | undefined;
export function isFindWriteOption(word: string): boolean;
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy-argv-flags.ts`

继承分类 `upstream-modified`，182 行，1 个导出。

```ts
export function isArgvAllowedByPolicy(
  argv: readonly string[],
  policy: BashReadonlyCommandPolicy,
  commandName: string,
  startIndex = 1,
): boolean;
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy-argv-git.ts`

继承分类 `upstream-unchanged`，80 行，2 个导出。

```ts
export function hasDangerousGitGlobalOption(argv: readonly string[]): boolean;
export function isGitReadOnlyCommand(argv: readonly string[]): boolean;
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy-argv-io.ts`

继承分类 `upstream-unchanged`，100 行，4 个导出。

```ts
export function areEnvAssignmentsAllowed(commandPart: BashCommandInvocation): boolean;
export function areRedirectsAllowed(commandPart: BashCommandInvocation): boolean;
export function isUnsafeWindowsUncPath(value: string): boolean;
export function stripSafeCommandWrappers(argv: readonly string[]): readonly string[];
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy-argv.ts`

继承分类 `upstream-unchanged`，109 行，2 个导出。

```ts
export function evaluateBashReadonlyPolicy(commandPart: BashCommandInvocation): boolean | undefined;
export function hasKnownBashWriteOption(commandPart: BashCommandInvocation): boolean;
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy-callbacks.ts`

继承分类 `upstream-unchanged`，355 行，22 个导出。

```ts
export function dateCommandIsDangerous(_commandText: string, args: readonly string[]): boolean;
export function dockerCommandIsDangerous(_commandText: string, args: readonly string[]): boolean;
export function ghCommandIsDangerous(_commandText: string, args: readonly string[]): boolean;
export function gitBranchCommandIsDangerous(_commandText: string, args: readonly string[]): boolean;
export function gitLsRemoteCommandIsDangerous(
  _commandText: string,
  args: readonly string[],
): boolean;
export function gitReflogCommandIsDangerous(_commandText: string, args: readonly string[]): boolean;
export function gitRemoteShowCommandIsDangerous(
  _commandText: string,
  args: readonly string[],
): boolean;
export function gitRevisionFormatCommandIsDangerous(
  _commandText: string,
  args: readonly string[],
): boolean;
export function gitTagCommandIsDangerous(_commandText: string, args: readonly string[]): boolean;
export function hasDangerousDockerOption(args: readonly string[]): boolean;
export function isSedInPlaceOption(word: string): boolean;
export function jqCommandIsDangerous(_commandText: string, args: readonly string[]): boolean;
export function lsofCommandIsDangerous(_commandText: string, args: readonly string[]): boolean;
export function manCommandIsDangerous(_commandText: string, args: readonly string[]): boolean;
export function psCommandIsDangerous(_commandText: string, args: readonly string[]): boolean;
export function pyrightCommandIsDangerous(_commandText: string, args: readonly string[]): boolean;
export function sedCommandIsDangerous(_commandText: string, args: readonly string[]): boolean;
export function ssCommandIsDangerous(_commandText: string, args: readonly string[]): boolean;
export function testCommandIsDangerous(_commandText: string, args: readonly string[]): boolean;
export function tputCommandIsDangerous(_commandText: string, args: readonly string[]): boolean;
export const XARGS_TARGET_COMMANDS: Set<string>;
export function xargsCommandIsDangerous(_commandText: string, args: readonly string[]): boolean;
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy-commands.ts`

继承分类 `upstream-unchanged`，25 行，8 个导出。

```ts
export const GIT_GLOBAL_DANGEROUS_FLAGS: Set<string>;
export const GIT_GLOBAL_NO_VALUE_FLAGS: Set<string>;
export const GIT_GLOBAL_VALUE_FLAGS: Set<string>;
export const GIT_READONLY_SUBCOMMAND_POLICIES: Map<string, BashReadonlyCommandPolicy>;
export const READONLY_ALLOW_ANY_ARG_COMMAND_PREFIXES: unknown;
export const READONLY_ALLOW_ANY_ARG_COMMANDS: Set<string>;
export const READONLY_COMMAND_POLICIES: Map<string, BashReadonlyCommandPolicy>;
export const READONLY_MULTIWORD_COMMAND_POLICIES: Map<string, BashReadonlyCommandPolicy>;
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy-flags-file.ts`

继承分类 `upstream-unchanged`，196 行，6 个导出。

```ts
export const BASE64_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const DATE_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const FD_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const HOSTNAME_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const SHA_SUM_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const SORT_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy-flags-git.ts`

继承分类 `upstream-unchanged`，244 行，12 个导出。

```ts
export const COMMON_GIT_COLOR_FLAGS: { readonly "--color": "none"; readonly "--no-color": "none" };
export const COMMON_GIT_COUNT_FLAGS: { readonly "-n": "number"; readonly "--max-count": "number" };
export const COMMON_GIT_DATE_FLAGS: {
  readonly "--after": "string";
  readonly "--before": "string";
  readonly "--since": "string";
  readonly "--until": "string";
};
export const COMMON_GIT_LOG_STYLE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const COMMON_GIT_PATCH_FLAGS: {
  readonly "-p": "none";
  readonly "-s": "none";
  readonly "--no-ext-diff": "none";
  readonly "--no-patch": "none";
  readonly "--patch": "none";
};
export const COMMON_GIT_REF_FLAGS: {
  readonly "--all": "none";
  readonly "--branches": "none";
  readonly "--remotes": "none";
  readonly "--tags": "none";
};
export const COMMON_GIT_STAT_FLAGS: {
  readonly "--name-only": "none";
  readonly "--name-status": "none";
  readonly "--numstat": "none";
  readonly "--shortstat": "none";
  readonly "--stat": "none";
};
export const GIT_DIFF_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const GIT_GREP_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const GIT_LOG_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const GIT_SHOW_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const GIT_STATUS_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy-flags-process.ts`

继承分类 `upstream-unchanged`，324 行，14 个导出。

```ts
export const DOCKER_INSPECT_SAFE_FLAGS: {
  readonly "-f": "string";
  readonly "-s": "none";
  readonly "--format": "string";
  readonly "--size": "none";
  readonly "--type": "string";
};
export const DOCKER_LOGS_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const GH_JSON_REPO_FLAGS: {
  readonly "--json": "string";
  readonly "-R": "string";
  readonly "--repo": "string";
};
export const GH_LIMIT_REPO_FLAGS: {
  readonly "-L": "number";
  readonly "--limit": "number";
  readonly "--json": "string";
  readonly "-R": "string";
  readonly "--repo": "string";
};
export const GH_REPO_FLAGS: { readonly "-R": "string"; readonly "--repo": "string" };
export const LSOF_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const MAN_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const NETSTAT_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const PGREP_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const PS_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const PYRIGHT_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const SS_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const TEST_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const TPUT_SAFE_FLAGS: {
  readonly "-T": "string";
  readonly "-V": "none";
  readonly "-x": "none";
};
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy-flags-text.ts`

继承分类 `upstream-unchanged`，363 行，11 个导出。

```ts
export const CAT_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const FILE_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const GREP_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const HEAD_TAIL_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const JQ_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const OPTION_PATTERN: RegExp;
export const RG_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const SED_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const TREE_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const WC_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const XARGS_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy-flags.ts`

继承分类 `upstream-unchanged`，5 行，43 个导出。

```ts
export const BASE64_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const CAT_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const COMMON_GIT_COLOR_FLAGS: { readonly "--color": "none"; readonly "--no-color": "none" };
export const COMMON_GIT_COUNT_FLAGS: { readonly "-n": "number"; readonly "--max-count": "number" };
export const COMMON_GIT_DATE_FLAGS: {
  readonly "--after": "string";
  readonly "--before": "string";
  readonly "--since": "string";
  readonly "--until": "string";
};
export const COMMON_GIT_LOG_STYLE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const COMMON_GIT_PATCH_FLAGS: {
  readonly "-p": "none";
  readonly "-s": "none";
  readonly "--no-ext-diff": "none";
  readonly "--no-patch": "none";
  readonly "--patch": "none";
};
export const COMMON_GIT_REF_FLAGS: {
  readonly "--all": "none";
  readonly "--branches": "none";
  readonly "--remotes": "none";
  readonly "--tags": "none";
};
export const COMMON_GIT_STAT_FLAGS: {
  readonly "--name-only": "none";
  readonly "--name-status": "none";
  readonly "--numstat": "none";
  readonly "--shortstat": "none";
  readonly "--stat": "none";
};
export const DATE_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const DOCKER_INSPECT_SAFE_FLAGS: {
  readonly "-f": "string";
  readonly "-s": "none";
  readonly "--format": "string";
  readonly "--size": "none";
  readonly "--type": "string";
};
export const DOCKER_LOGS_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const FD_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const FILE_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const GH_JSON_REPO_FLAGS: {
  readonly "--json": "string";
  readonly "-R": "string";
  readonly "--repo": "string";
};
export const GH_LIMIT_REPO_FLAGS: {
  readonly "-L": "number";
  readonly "--limit": "number";
  readonly "--json": "string";
  readonly "-R": "string";
  readonly "--repo": "string";
};
export const GH_REPO_FLAGS: { readonly "-R": "string"; readonly "--repo": "string" };
export const GIT_DIFF_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const GIT_GREP_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const GIT_LOG_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const GIT_SHOW_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const GIT_STATUS_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const GREP_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const HEAD_TAIL_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const HOSTNAME_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const JQ_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const LSOF_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const MAN_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const NETSTAT_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const OPTION_PATTERN: RegExp;
export const PGREP_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const PS_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const PYRIGHT_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const RG_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const SED_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const SHA_SUM_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const SORT_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const SS_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const TEST_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const TPUT_SAFE_FLAGS: {
  readonly "-T": "string";
  readonly "-V": "none";
  readonly "-x": "none";
};
export const TREE_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const WC_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
export const XARGS_SAFE_FLAGS: /* 大型只读规则表，见 behavior.md B-ro；选择 9 不贴巨型字面量 */ unknown;
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy-git-callbacks.ts`

继承分类 `upstream-unchanged`，122 行，6 个导出。

```ts
export function gitBranchCommandIsDangerous(_commandText: string, args: readonly string[]): boolean;
export function gitLsRemoteCommandIsDangerous(
  _commandText: string,
  args: readonly string[],
): boolean;
export function gitReflogCommandIsDangerous(_commandText: string, args: readonly string[]): boolean;
export function gitRemoteShowCommandIsDangerous(
  _commandText: string,
  args: readonly string[],
): boolean;
export function gitRevisionFormatCommandIsDangerous(
  _commandText: string,
  args: readonly string[],
): boolean;
export function gitTagCommandIsDangerous(_commandText: string, args: readonly string[]): boolean;
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy-git-subcommands-core.ts`

继承分类 `upstream-unchanged`，203 行，1 个导出。

```ts
export const GIT_READONLY_SUBCOMMAND_POLICY_ENTRIES_CORE: unknown;
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy-git-subcommands-history.ts`

继承分类 `upstream-unchanged`，228 行，1 个导出。

```ts
export const GIT_READONLY_SUBCOMMAND_POLICY_ENTRIES_HISTORY: unknown;
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy-multiword-core.ts`

继承分类 `upstream-unchanged`，37 行，1 个导出。

```ts
export const READONLY_MULTIWORD_POLICY_ENTRIES_CORE: unknown;
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy-multiword-gh.ts`

继承分类 `upstream-unchanged`，346 行，1 个导出。

```ts
export const READONLY_MULTIWORD_POLICY_ENTRIES_GH: unknown;
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy-simple-commands.ts`

继承分类 `upstream-unchanged`，224 行，6 个导出。

```ts
export const GIT_GLOBAL_DANGEROUS_FLAGS: Set<string>;
export const GIT_GLOBAL_NO_VALUE_FLAGS: Set<string>;
export const GIT_GLOBAL_VALUE_FLAGS: Set<string>;
export const READONLY_ALLOW_ANY_ARG_COMMAND_PREFIXES: unknown;
export const READONLY_ALLOW_ANY_ARG_COMMANDS: Set<string>;
export const READONLY_COMMAND_POLICIES: Map<string, BashReadonlyCommandPolicy>;
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy-types.ts`

继承分类 `upstream-unchanged`，15 行，2 个导出。

```ts
export interface BashReadonlyCommandPolicy {
  additionalCommandIsDangerousCallback?: (
    commandText: string,
    argsAfterPrefix: readonly string[],
  ) => boolean;
  allowAnyArgs?: boolean;
  allowCompactNumericCountFlag?: boolean;
  commandOnly?: boolean;
  regex?: RegExp;
  respectsDoubleDash?: boolean;
  safeFlags?: Readonly<Record<string, SafeFlagValue>>;
}
export type SafeFlagValue = "{}" | "EOF" | "char" | "none" | "number" | "optionalString" | "string";
```

### `apps/cli/packages/core/src/tool/handlers/bash-readonly-policy.ts`

继承分类 `upstream-unchanged`，6 行，3 个导出。

```ts
export function evaluateBashReadonlyPolicy(commandPart: BashCommandInvocation): boolean | undefined;
export function hasKnownBashWriteOption(commandPart: BashCommandInvocation): boolean;
export function isSedInPlaceOption(word: string): boolean;
```

### `apps/cli/packages/core/src/tool/handlers/bash-semantics.ts`

继承分类 `upstream-modified`，175 行，5 个导出。

```ts
export function interpretBashReturnCode( command: string, result: Pick<ExecutionResult, "error" | "exitCode" | "signal" | "status">, ): string | undefined
export function isBashProviderErrorStatus(output:
export function isRuntimeReadOnlyBashCommand( command: string, context?: BashReadonlyRuntimeContext, ): boolean
export function isSedInPlaceBashCommand(command: string): boolean
export function isSilentBashCommand(command: string): boolean
```

### `apps/cli/packages/core/src/tool/handlers/bash.ts`

继承分类 `upstream-modified`，570 行，7 个导出。

```ts
export const bashToolEntry: ToolEntry
export function createBashToolEntry( options:
export function getBashActivityDescription(input?: unknown): string
export function getBashAutoClassifierInput(input: unknown): string | undefined
export function getBashDescription(input: unknown): string
export function getBashToolUseSummary(input?: unknown): string | null
export function getBashUserFacingName(input?: unknown): string
```

### `apps/cli/packages/core/src/tool/handlers/tool-perf.ts`

继承分类 `upstream-modified`，135 行，11 个导出。

```ts
export function attachToolExecutionTelemetry<T extends object>(
  output: T,
  perf: ToolExecutionTelemetry | undefined,
): T;
export function classifyCommand(command: string): string;
export function classifySafeCommandIdentity(
  command: string,
): Pick<CommandExecutionTelemetry, "count" | "name">;
export function commandHash(command: string): string;
export function compactToolExecutionTelemetry(
  perf: ToolExecutionTelemetry,
): ToolExecutionTelemetry | undefined;
export function elapsedMsSince(startedAt: number): number;
export function fileByteCount(content: string): number;
export function mergeToolExecutionTelemetry(
  ...items: (ToolExecutionTelemetry | undefined)[]
): ToolExecutionTelemetry | undefined;
export function readToolExecutionTelemetry(output: unknown): ToolExecutionTelemetry | undefined;
export function roundNonNegativeMs(ms: number): number;
export function workspaceKind(context: ToolExecutionContext): "local" | "remote" | "unknown";
```
