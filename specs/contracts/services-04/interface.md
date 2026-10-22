# services-04 接口（interface.md）

本文件只列**兼容所需的模块路径、导出名、参数与返回类型**：实现包必须让这些模块路径与导出在编译产物中保持可用，签名不变。行为见 `behavior.md`，调用方见 `callers.md`。

机器生成：`node --import tsx specs/contracts/services-04/tests/gen-interface.mjs`（抽取器 `tests/exports-ast.mjs`，范围真源 `tests/scope.mjs` / `scope-files.json`）。**不要手改**；导出面测试的 oracle 是本文件的导出声明块。

覆盖范围：**46 个实现文件**（计划书 L215 的 7 项，排除 2 个包级聚合桶），按功能组分组。

## 本包的定位

`packages/services/src` 的**编排层**：服务注册基础设施、子 Agent、系统探测、终端、用量统计、窗口控制。

与 `services-03`（`studio-runtime/domain` 的**纯逻辑层**）不同，本层**允许 I/O** ——

实测 46 个文件里有 45 处 `node:*` 内置依赖（`fs` / `child_process` / `path` / `os` 等）。

但按插件化结构要求，**I/O 必须通过注入的依赖获取，不在模块级创建**（见 `behavior.md` B3）。

**层内耦合比 domain 层紧得多**：

- 层内依赖边 **64 条**（domain 层是 21 条）

- 汇聚点（入度 ≥2）**19 个**，最多的是 `terminal/terminalProfileTypes`（入度 7）与 `descriptors`（入度 6）

- 叶子（无层内依赖）**16 个**

## 不在兼容面上

- `packages/services/src/index.ts`（198 行）与 `node.ts`（1,796 行）：**包级公开面聚合桶**，

  共 144 条 `export { ... } from` 转发，**无实现**。

  它们不属于本包的实现范围（同 `services-03` 的 `contract.ts` 先例），

  改用「转发面完整性断言」保障（见 `behavior.md` B6 与 `known-differences.md` K-z）。

- `packages/services/src/types/yazl.d.ts`：第三方类型声明（`yazl` 是 zip 库），登记但不跑相似度。

- `studio-runtime/`（149 个 `.ts`）：**不在 M6 返工范围**（`pending-rework` 零个），不归本包。

## 根目录（`packages/services/src/*.ts`，7 件）

服务注册与访问的基础设施：`ServiceCollection`、`ServiceDescriptor`、`IServiceAccessor`、数据位置与路径解析。
这些是**所有 service 的共同基座** —— 46 个文件里有 6 个依赖 `descriptors`。

### `packages/services/src/paths.ts`

205 行，导出 18 项（运行时 18 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export { setDataBaseDir } from "./dataLocationOwner.js";
export { getDataBaseDir } from "./dataLocationOwner.js";
export { getKnorviaDataRootDir } from "./dataLocationOwner.js";
export { copyDataDirectory } from "./dataLocationOwner.js";
export const KNORVIA_WINDOWS_APP_INSTALL_DIR_ENV = "KNORVIA_WINDOWS_APP_INSTALL_DIR";
export function getConversationWorkspaceDir(): string;
export function getAppConfigDir(): string;
export function validateDataBaseDirTarget(
  targetBaseDir: string,
  options: DataBaseDirTargetValidationOptions = {},
): DataBaseDirTargetValidationResult;
export function getExportLogStageDir(): string;
export function getExportLogDir(): string;
export function getFeedbackRootDir(): string;
export function getFeedbackAttachmentDir(): string;
export function getFeedbackLogArchiveDir(): string;
export function getGitCheckpointIndexRootDir(): string;
export function getTasksIndexDatabasePath(): string;
export function getWorkspaceHash(workspacePath: string, workspaceIdentity?: string): string;
export function getLegacyTaskSessionSnapshotPath(
  workspacePath: string,
  taskId: string,
  workspaceIdentity?: string,
): string;
export function getLegacyDeletedTaskSessionSnapshotPath(
  workspacePath: string,
  taskId: string,
  workspaceIdentity?: string,
): string;
```

### `packages/services/src/accessor.ts`

81 行，导出 1 项（运行时 0 / 纯类型 1），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface IServiceAccessor {
  readonly studioRuntimeService?: IStudioRuntimeService;
  readonly creationService?: ICreationService;
  readonly fileService: IFileService;
  readonly mediaPreviewService?: IMediaPreviewService;
  readonly gitService: IGitService;
  readonly gitCheckpointService: IGitCheckpointService;
  readonly systemService: ISystemService;
  readonly terminalService: ITerminalService;
  readonly settingService: ISettingService;
  /** Onboarding 完成记录（本地持久化）；旧测试 double / 不支持的 host 可不提供。 */
  readonly onboardingRecordService?: IOnboardingRecordService;
  readonly credentialService: ICredentialService;
  readonly broadcastService: IBroadcastService;
  readonly taskService: IKnorviaTaskService;
  /** 窗口 Host 聚合面；旧 server wire 或测试 double 可暂不提供。 */
  readonly windowControllerService?: IWindowControllerService;
  readonly agentService: IKnorviaAgentService;
  readonly sessionService: IKnorviaSessionService;
  // CUA 是 opt-in 内测特性：local macOS host 提供，远端 等 host 没有。可选避免连锁必填。
  readonly cuaPermissionService?: ICuaPermissionService;
  readonly fileWatcherService: IFileWatcherService;
  /** 当前 Environment 的 Provider 配置与设置视图。 */
  readonly providerSettingsService: IProviderSettingsService;
  /** 当前 Environment Registry 发布的唯一模型选择 View。 */
  readonly modelSelectionService: IModelSelectionService;
  readonly usageStatsService: IUsageStatsService;
  readonly skillsService: ISkillsService;
  readonly skillSyncService: ISkillSyncService;
  readonly mcpSyncService: IMcpSyncService;
  readonly pluginSyncService: IPluginSyncService;
  readonly pluginsService: IPluginsService;
  /** 设置页插件管理（UI 不再直触 agentService 的 plugins/* 面） */
  readonly pluginManagementService: IPluginManagementService;
  readonly subagentsService: ISubagentsService;
  readonly commandsService: ICommandsService;
  readonly hooksService: IHooksService;
  readonly memoryService: IMemoryService;
  readonly settingsSyncService: ISettingsSyncService;
  /** 仅本机 Host 提供；远程工作区或旧 Host 上为空，界面据此隐藏切换入口。 */
  readonly cliProviderSwitchService?: ICliProviderSwitchService;
  readonly promptAttachmentTransferService: IPromptAttachmentTransferService;
}
```

### `packages/services/src/dataLocationOwner.ts`

49 行，导出 4 项（运行时 4 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function setDataBaseDir(dir: string | null): void;
export function getDataBaseDir(): string;
export function getKnorviaDataRootDir(): string;
export async function copyDataDirectory(oldBaseDir: string, newBaseDir: string): Promise<void>;
```

### `packages/services/src/collection.ts`

36 行，导出 1 项（运行时 1 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export class ServiceCollection { … }
```

### `packages/services/src/memoryDiagnostics.ts`

26 行，导出 3 项（运行时 3 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export const memoryDiagnosticsRegistry: MemoryDiagnosticsRegistry =
  createMemoryDiagnosticsRegistry();
export function registerMemoryDiagnosticsProvider(
  name: string,
  provider: MemoryDiagnosticsProvider,
): IDisposable;
export function collectServiceMemoryDiagnostics(): Record<string, number>;
```

### `packages/services/src/descriptors.ts`

16 行，导出 2 项（运行时 1 / 纯类型 1），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export interface ServiceDescriptor<T> {
  readonly channelName: string;
  /** Phantom type — 仅用于类型推断，运行时不存在 */
  readonly _brand?: T;
}
export function createServiceDescriptor<T>(channelName: string): ServiceDescriptor<T>;
```

### `packages/services/src/storage-startup.ts`

5 行，导出 5 项（运行时 5 / 纯类型 0），分类 `original`。签名逐字取自源码。

```ts
export { prepareTasksIndexStorage } from "#src/session/tasksDatabase/startup.js";
export { markTasksStoragePrepared } from "#src/session/tasksDatabase/prepared.js";
export { getTasksIndexDatabasePath } from "#src/paths.js";
export { resolveDefaultKnorviaAgentCommand } from "#src/agent/agentProcessManager.js";
export { resolveKnorviaAgentSpawnCwd } from "#src/agent/agentSpawnCwd.js";
```

## `subagents/`（子 Agent，8 件）

子 Agent 的定义、存储、模型选择与插件装配。
`subagentMarkdown.ts`（350 行）是本组最大文件，负责解析子 Agent 的 Markdown 定义。

### `packages/services/src/subagents/subagentMarkdown.ts`

350 行，导出 2 项（运行时 2 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export function parseSubagentMarkdown(
  input: ParseSubagentMarkdownInput,
): ParseSubagentMarkdownResult;
export function serializeSubagentMarkdown(config: SubAgentConfig): string;
```

### `packages/services/src/subagents/subagentsService.ts`

251 行，导出 1 项（运行时 1 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export function createSubagentsService(options?: SubagentsServiceOptions): ISubagentsService & {
  prepareRuntimeState(): Promise<void>;
};
```

### `packages/services/src/subagents/subagentServicePlugins.ts`

227 行，导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export async function discoverPlugins(
  options: SubagentStorageOptions,
  overrides: PluginSubagentModelSelectionOverrides,
  reservedNames: Iterable<string>,
  diagnostics: AgentDiagnostic[],
): Promise<{ profiles: AgentSummary[]; runtimeAgents: AgentSummary[] }>;
```

### `packages/services/src/subagents/subagentServiceFiles.ts`

105 行，导出 6 项（运行时 6 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export const builtInNames = ["general-purpose", "Explore"] as const;
export async function exists(path: string): Promise<boolean>;
export async function collectMarkdown(root: string): Promise<string[]>;
export async function readProfiles(
  root: string,
  scope: "user" | "workspace",
  workspacePath: string,
  diagnostics: AgentDiagnostic[],
): Promise<AgentSummary[]>;
export function validateConfig(config: SubAgentConfig): void;
export function savedProfile(
  config: SubAgentConfig,
  path: string,
  scope: AgentScope,
  workspacePath?: string,
): { content: string; agent: AgentSummary };
```

### `packages/services/src/subagents/subagentServiceState.ts`

79 行，导出 4 项（运行时 3 / 纯类型 1），分类 `unreviewed`。签名逐字取自源码。

```ts
export interface AgentsStateFile {
  builtInModelSelectionOverrides: BuiltInSubagentModelSelectionOverrides;
  pluginAgentModelSelectionOverrides: PluginSubagentModelSelectionOverrides;
  disabledAgentIds: string[];
  builtInModelOverrides?: unknown;
  builtInThoughtLevelOverrides?: unknown;
}
export async function readState(options: SubagentStorageOptions): Promise<AgentsStateFile>;
export async function writeState(
  state: AgentsStateFile,
  options: SubagentStorageOptions,
): Promise<void>;
export async function migrateDisabledAgentId(
  oldId: string,
  newId: string,
  options: SubagentStorageOptions,
): Promise<void>;
```

### `packages/services/src/subagents/subagentStorage.ts`

74 行，导出 8 项（运行时 7 / 纯类型 1），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface SubagentStorageOptions {
  homeDir?: string;
}
export function resolveUserHomeDir(options?: SubagentStorageOptions): string;
export function resolveUserDataRoot(options?: SubagentStorageOptions): string;
export async function resolveUserSubagentRoot(options?: SubagentStorageOptions): Promise<string>;
export function resolveWorkspaceSubagentRoot(workspacePath: string): string;
export async function resolveSubagentStateFile(options?: SubagentStorageOptions): Promise<string>;
export async function resolveKnorviaStorageRoot(options?: SubagentStorageOptions): Promise<string>;
export function resolveConfigPath(path: string, options?: SubagentStorageOptions): string;
```

### `packages/services/src/subagents/subagents.ts`

45 行，导出 2 项（运行时 1 / 纯类型 1），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface ISubagentsService {
  list(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    provider?: KnorviaProvider;
    mode?: SubagentsListMode;
  }): Promise<AgentsListResult>;

  setEnabled(params: { agentId: string; enabled: boolean }): Promise<void>;

  setBuiltInModelOverride(params: BuiltInSubagentModelOverrideParams): Promise<void>;

  /** 只写用户 state 的完整覆盖，不改插件 Markdown。 */
  setPluginAgentModelOverride(params: PluginSubagentModelOverrideParams): Promise<void>;

  /** 当前筛选来源对应的用户级 agent 根目录（与内置扫描顺序一致，取 buildUserRoots 的首项）。 */
  getPrimaryUserAgentsDirectory(params: { provider: KnorviaProvider }): Promise<{ path: string }>;

  /** 创建新的 agent 文件 */
  createAgent(params: AgentCreateParams): Promise<{ agent: AgentSummary }>;

  /** 更新现有 agent 文件 */
  updateAgent(params: AgentUpdateParams): Promise<{ agent: AgentSummary }>;

  /** 删除 agent 文件 */
  deleteAgent(params: AgentDeleteParams): Promise<void>;
}
export const ISubagentsService = createServiceDescriptor<ISubagentsService>(
  ServiceChannels.Subagents,
);
```

### `packages/services/src/subagents/subagentModelSelection.ts`

13 行，导出 1 项（运行时 1 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export function normalizeSubagentModelSelection(
  selection: ModelSelection | undefined,
): ModelSelection | undefined;
```

## `system/`（系统探测与 SSH 别名，12 件）

系统探测（`system-probe/`）与 SSH 别名（`ssh-alias/`）两组子目录，加系统服务本体。
`system-probe/contracts.ts` 被 4 个层内模块依赖，是本组的契约汇聚点。

### `packages/services/src/system/systemService.ts`

200 行，导出 1 项（运行时 1 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export function createSystemService(options: CreateSystemServiceOptions = {}): ISystemService;
```

### `packages/services/src/system/integratedTerminalShells.ts`

111 行，导出 1 项（运行时 1 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export function listIntegratedTerminalShellOptions(options: {
  env: NodeJS.ProcessEnv;
  isExecutable?: (path: string) => boolean;
  platform: NodeJS.Platform;
}): IntegratedTerminalShellOption[];
```

### `packages/services/src/system/ssh-alias/configuration.ts`

108 行，导出 4 项（运行时 2 / 纯类型 2），分类 `original`。签名逐字取自源码。

```ts
export interface Context {
  patterns: string[];
  directives: Array<{ key: string; value: string }>;
  source: string;
  eligibleHost: boolean;
}
export interface Declaration {
  alias: string;
  source: string;
}
export function readContexts(root: string): Promise<Context[]>;
export function declarations(contexts: Context[]): Declaration[];
```

### `packages/services/src/system/ssh-alias/fallback.ts`

103 行，导出 3 项（运行时 3 / 纯类型 0），分类 `original`。签名逐字取自源码。

```ts
export function validPort(value: string): number | undefined;
export function fallbackOption(declaration: Declaration, contexts: Context[]): SSHConfigAliasOption;
export function mergeQuery(
  output: string | null,
  fallback: SSHConfigAliasOption,
): SSHConfigAliasOption;
```

### `packages/services/src/system/ssh-alias/query.ts`

93 行，导出 3 项（运行时 3 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function findSSH(): string | null;
export function queryAlias(executable: string, root: string, alias: string): Promise<string | null>;
export async function mapWorkers<T, R>(
  items: T[],
  requested: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]>;
```

### `packages/services/src/system/ssh-alias/tokens.ts`

76 行，导出 3 项（运行时 3 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function withoutComment(line: string): string;
export function words(line: string): string[];
export function homeToken(raw: string): string;
```

### `packages/services/src/system/system-probe/targetLifecycle.ts`

72 行，导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export async function runTarget(
  target: ProbeTarget,
  attempts: number,
  tcpProbe: TcpProbe,
  serviceProbe: ServiceProbe,
): Promise<TargetResult>;
```

### `packages/services/src/system/system-probe/defaultAdapters.ts`

60 行，导出 2 项（运行时 2 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function probeTcp({ host, port, timeoutMs }: TcpParameters): Promise<number>;
export async function probeHttp(
  params: ServiceParameters,
  policy: OwnerPolicy,
): Promise<{ latencyMs: number; marker?: string }>;
```

### `packages/services/src/system/systemServiceOwner.ts`

54 行，导出 2 项（运行时 1 / 纯类型 1），分类 `unreviewed`。签名逐字取自源码。

```ts
export type { ProbeTarget } from "./system-probe/contracts.js";
export function createSystemServiceOwner(
  options: OwnerOptions,
  policy: OwnerPolicy,
): ISystemService;
```

### `packages/services/src/system/system-probe/contracts.ts`

41 行，导出 8 项（运行时 0 / 纯类型 8），分类 `unreviewed`。签名逐字取自源码。

```ts
export type ProbeTarget =
  | { kind: "tcp"; targetId: string; host: string; port: number; timeoutMs: number }
  | {
      kind: "service";
      targetId: string;
      url: string;
      expectedMarker?: string;
      token?: string;
      timeoutMs: number;
    };
export type TcpParameters = { host: string; port: number; timeoutMs: number };
export type ServiceParameters = { url: string; timeoutMs: number; token?: string };
export type TcpProbe = (params: TcpParameters) => Promise<number>;
export type ServiceProbe = (
  params: ServiceParameters,
) => Promise<{ latencyMs: number; marker?: string }>;
export type OwnerOptions = {
  env?: NodeJS.ProcessEnv;
  isExecutable?: (path: string) => boolean;
  platform?: NodeJS.Platform;
  tcpProbe?: TcpProbe;
  serviceProbe?: ServiceProbe;
  now?: () => number;
};
export type OwnerPolicy = {
  plan: (request: IntranetProbeRequest) => {
    targets: ProbeTarget[];
    attempts: number;
    requiredSuccessCount: number;
  };
  parseResponse: (payload: unknown) => IntranetProbeServiceResponse;
  strategy: (targets: ProbeTarget[]) => IntranetProbeResult["strategy"];
};
export type TargetResult = IntranetProbeResult["results"][number];
```

### `packages/services/src/system/sshConfigAlias.ts`

38 行，导出 1 项（运行时 1 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export async function listSSHConfigAliasesFromLocalConfig(): Promise<SSHConfigAliasOption[]>;
```

### `packages/services/src/system/system.ts`

16 行，导出 2 项（运行时 1 / 纯类型 1），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface ISystemService {
  info(): Promise<SystemInfo>;
  listIntegratedTerminalShells(): Promise<IntegratedTerminalShellOption[]>;
  probeIntranet(request: IntranetProbeRequest): Promise<IntranetProbeResult>;
}
export const ISystemService = createServiceDescriptor<ISystemService>(ServiceChannels.System);
```

## `terminal/`（终端与配置文件解析，12 件）

终端服务与跨平台配置文件解析（macOS plist / portable 格式）。
`terminalProfileTypes.ts` 被 7 个层内模块依赖 —— **本层入度最高的模块**。

### `packages/services/src/terminal/terminalServiceInstanceOwner.ts`

289 行，导出 1 项（运行时 1 / 纯类型 0），分类 `original`。签名逐字取自源码。

```ts
export class TerminalServiceInstanceOwner { … }
```

### `packages/services/src/terminal/terminalService.ts`

252 行，导出 1 项（运行时 1 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export function createTerminalService(dependencies: {
  settingService: ISettingService;
}): ITerminalService;
```

### `packages/services/src/terminal/terminalProfileMacOsDecode.ts`

183 行，导出 2 项（运行时 1 / 纯类型 1），分类 `unreviewed`。签名逐字取自源码。

```ts
export type TerminalProfileMacOsApp = "iterm2" | "macos-terminal";
export function decodeTerminalProfileMacOs(
  plist: RecordValue | null,
  app: TerminalProfileMacOsApp,
): TerminalDetectedProfile | null;
```

### `packages/services/src/terminal/terminalServiceLaunchPlan.ts`

113 行，导出 8 项（运行时 7 / 纯类型 1），分类 `unreviewed`。签名逐字取自源码。

```ts
export interface TerminalLaunchCandidate {
  value: string;
  paths: Iterable<string>;
}
export function* terminalShellPlan(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): Generator<TerminalLaunchCandidate>;
export function terminalWorkingDirectoryPlan(
  requested: string | undefined,
  environmentHome: string | undefined,
  home: string,
): TerminalLaunchCandidate[];
export function terminalShellPlanFailure(platform: NodeJS.Platform): string;
export function terminalEnvironmentPlan(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv;
export function terminalPtyOptionPlan(
  platform: NodeJS.Platform,
  dimensions: TerminalLaunchDimensions,
): readonly [TerminalLaunchOptions, TerminalLaunchOptions?];
export function terminalConptyDllMiss(message: string): boolean;
export function terminalWindowsPtyPlan(
  platform: NodeJS.Platform,
  release: string,
): TerminalWindowsPtyInfo | undefined;
```

### `packages/services/src/terminal/terminalProfilePortableFormats.ts`

109 行，导出 1 项（运行时 1 / 纯类型 0），分类 `original`。签名逐字取自源码。

```ts
export function interpretTerminalProfile(
  format: TerminalProfileFormat,
  raw: string,
): TerminalDetectedProfile | null;
```

### `packages/services/src/terminal/terminalProfilePortablePlan.ts`

93 行，导出 4 项（运行时 1 / 纯类型 3），分类 `original`。签名逐字取自源码。

```ts
export type TerminalProfileFormat = "windows-jsonc" | "vscode-jsonc" | "kitty" | "toml" | "yaml";
export interface TerminalProfileProbe {
  path: string;
  format: TerminalProfileFormat;
}
export type TerminalProfileGroup =
  | { kind: "files"; probes: TerminalProfileProbe[] }
  | { kind: "external"; detector: ExternalDetector };
export function* terminalProfilePortablePlan(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  homePort: () => string,
  external: readonly ExternalDetector[],
): Generator<TerminalProfileGroup>;
```

### `packages/services/src/terminal/terminalProfile.ts`

76 行，导出 3 项（运行时 1 / 纯类型 2），分类 `upstream-modified`。签名逐字取自源码。

```ts
export type { TerminalFontFamilySource } from "./terminalProfileTypes.js";
export type { TerminalThemeProfile } from "./terminalProfileTypes.js";
export function resolveTerminalFontProfile(input: TerminalFontProfileInput): TerminalFontProfile;
```

### `packages/services/src/terminal/terminalProfileMacOs.ts`

46 行，导出 1 项（运行时 1 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export function createMacOsTerminalProfileDetectors(): readonly TerminalProfileDetector[];
```

### `packages/services/src/terminal/terminalProfileTypes.ts`

32 行，导出 3 项（运行时 0 / 纯类型 3），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export type TerminalFontFamilySource = "custom" | "system" | "fallback";
export interface TerminalThemeProfile {
  background?: string;
  foreground?: string;
  cursor?: string;
  cursorAccent?: string;
  selectionBackground?: string;
  selectionInactiveBackground?: string;
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}
export interface TerminalDetectedProfile {
  fontFamily?: string;
  fontSize?: number;
  theme?: TerminalThemeProfile;
}
```

### `packages/services/src/terminal/terminal.ts`

28 行，导出 3 项（运行时 1 / 纯类型 2），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface TerminalWindowsPtyInfo {
  backend: "conpty" | "winpty";
  buildNumber?: number;
}
export interface ITerminalService {
  create(params: { cols: number; rows: number; cwd?: string }): Promise<{
    id: string;
    shell: string;
    fontFamily: string;
    fontSize?: number;
    theme?: TerminalThemeProfile;
    fontFamilySource: TerminalFontFamilySource;
    windowsPty?: TerminalWindowsPtyInfo;
  }>;
  write(params: { id: string; data: string }): Promise<void>;
  resize(params: { id: string; cols: number; rows: number }): Promise<void>;
  dispose(params: { id: string }): Promise<void>;
  onDynamicData(id: string): Event<string>;
  onDynamicExit(id: string): Event<number>;
}
export const ITerminalService = createServiceDescriptor<ITerminalService>(ServiceChannels.Terminal);
```

### `packages/services/src/terminal/terminalProfileMacOsPlist.ts`

24 行，导出 2 项（运行时 1 / 纯类型 1），分类 `unreviewed`。签名逐字取自源码。

```ts
export interface TerminalProfileMacOsPlistPorts {
  platform(): NodeJS.Platform;
  exists(path: string): boolean;
  convertJson(path: string): string;
}
export function readTerminalProfileMacOsPlist(
  path: string,
  ports: TerminalProfileMacOsPlistPorts,
): Record<string, unknown> | null;
```

### `packages/services/src/terminal/terminalProfilePortableRead.ts`

23 行，导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function readTerminalProfileGroup(
  probes: readonly TerminalProfileProbe[],
  ports: {
    exists(path: string): boolean;
    readUtf8(path: string): string;
  },
): TerminalDetectedProfile | null;
```

## `usage-stats/`（用量统计，2 件）

用量统计（28 行，本层最小的组）。

### `packages/services/src/usage-stats/usageStatsService.ts`

17 行，导出 1 项（运行时 1 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export function createUsageStatsService(dependencies: {
  agentService: Pick<IKnorviaAgentService, "getAppUsageStats">;
}): IUsageStatsService;
```

### `packages/services/src/usage-stats/usageStats.ts`

11 行，导出 2 项（运行时 1 / 纯类型 1），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface IUsageStatsService {
  getAppUsageSnapshot(request: AppUsageRequest): Promise<AppUsageSnapshot>;
}
export const IUsageStatsService = createServiceDescriptor<IUsageStatsService>(
  ServiceChannels.UsageStats,
);
```

## `window-controller/`（窗口宿主控制，5 件）

窗口宿主的 controller service / projection / sessions index observer。
**注意**：本组对 `services-01`（agent）与 `services-03`（session）有 6 处跨包依赖（见 `known-differences.md` K-w）。

### `packages/services/src/window-controller/windowHostControllerService.ts`

805 行，导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function createWindowHostControllerRuntime(options: {
  createId: () => string;
  resolveSource: (
    scope: KnorviaTaskListWorkspaceScope,
  ) => ResolvedWindowHostControllerSource | null;
  onSourceError?: (
    scope: WindowHostControllerSourceScope,
    operation: "refresh" | "search",
    error: unknown,
  ) => void;
});
```

### `packages/services/src/window-controller/windowHostControllerProjection.ts`

556 行，导出 5 项（运行时 1 / 纯类型 4），分类 `unreviewed`。签名逐字取自源码。

```ts
export type WindowHostControllerSourceScope =
  | {
      kind: "local";
      workspacePath: string;
      workspaceIdentity?: string;
    }
  | {
      kind: "remote";
      remoteSessionId: string;
      workspacePath: string;
      workspaceIdentity: string;
    };
export interface WindowHostControllerSessionOverlay {
  taskId: string;
  liveStatus: WindowHostControllerTaskRow["liveStatus"];
  title?: string;
  titleSource?: "default" | "generated" | "custom";
  updatedAt?: number;
  pendingInteraction?: KnorviaTaskMeta["pendingInteraction"];
  activity?: NonNullable<WindowHostControllerTaskRow["activity"]>;
}
export type WindowHostControllerMutation =
  | { kind: "pin"; pinned: boolean }
  | { kind: "archive"; archived: boolean }
  | { kind: "delete" }
  | { kind: "delete-archived" }
  | { kind: "delete-archived-batch"; taskIds: string[] }
  | { kind: "mark-read"; expectedUnreadAt?: number }
  | { kind: "mark-unread" }
  | { kind: "open" }
  | { kind: "resume" };
export type WindowHostControllerMutationResult = void | boolean | KnorviaArchivedTaskDeletionResult;
export function createWindowHostControllerProjection(options: { createId: () => string });
```

### `packages/services/src/window-controller/windowHostSessionsIndexObserver.ts`

362 行，导出 2 项（运行时 1 / 纯类型 1），分类 `unreviewed`。签名逐字取自源码。

```ts
export interface WindowHostSessionsIndexObserver {
  start(): Promise<void>;
  dispose(): void;
}
export function createWindowHostSessionsIndexObserver(options: {
  agentService: SessionsIndexAgentService;
  target: { workspacePath: string; workspaceIdentity?: string };
  onSessionsChange: (sessions: SessionSummary[]) => void;
  onError?: (error: unknown) => void;
}): WindowHostSessionsIndexObserver;
```

### `packages/services/src/window-controller/windowController.ts`

71 行，导出 6 项（运行时 1 / 纯类型 5），分类 `upstream-modified`。签名逐字取自源码。

```ts
export type WindowHostControllerMutation =
  | { kind: "pin"; pinned: boolean }
  | { kind: "archive"; archived: boolean }
  | { kind: "delete" }
  | { kind: "delete-archived" }
  | { kind: "mark-read"; expectedUnreadAt?: number }
  | { kind: "mark-unread" }
  | { kind: "open" }
  | { kind: "resume" };
export type WindowHostControllerTaskListItem = KnorviaTaskListItem & {
  remoteSessionId?: string;
  sourceAvailability: "online" | "offline";
  liveStatus: WindowHostControllerTaskRow["liveStatus"];
  activity?: WindowHostControllerTaskRow["activity"];
};
export interface WindowHostControllerTaskListResult extends Omit<KnorviaTaskListResult, "items"> {
  items: WindowHostControllerTaskListItem[];
}
export type WindowHostControllerFrame =
  | WindowHostControllerTaskFrame
  | WindowHostControllerWorkspaceFrame;
export interface IWindowControllerService {
  deleteArchivedTask(params: { address: WindowHostTaskAddress }): Promise<boolean>;
  deleteArchivedTasks(params: {
    address: WindowHostTaskAddress;
    taskIds: string[];
  }): Promise<KnorviaArchivedTaskDeletionResult>;
  listTaskList(params: KnorviaTaskListQuery): Promise<WindowHostControllerTaskListResult>;
  mutateTask(params: {
    address: WindowHostTaskAddress;
    mutation: WindowHostControllerMutation;
  }): Promise<KnorviaTaskMeta | null>;
  subscribeControllerV4(params: ControllerSubscribeParams): Promise<ControllerSubscribeResult>;
  resyncControllerV4(params: ControllerResyncParams): Promise<ControllerResyncResult>;
  unsubscribeControllerV4(params: ControllerUnsubscribeParams): Promise<void>;
  onDynamicControllerFrame(): Event<WindowHostControllerFrame>;
}
export const IWindowControllerService = createServiceDescriptor<IWindowControllerService>(
  ServiceChannels.WindowController,
);
```

### `packages/services/src/window-controller/node.ts`

11 行，导出 8 项（运行时 3 / 纯类型 5），分类 `unreviewed`。签名逐字取自源码。

```ts
export { createWindowHostControllerRuntime } from "./windowHostControllerService.js";
export { createWindowHostControllerProjection } from "./windowHostControllerProjection.js";
export type { WindowHostControllerMutation } from "./windowHostControllerProjection.js";
export type { WindowHostControllerMutationResult } from "./windowHostControllerProjection.js";
export type { WindowHostControllerSessionOverlay } from "./windowHostControllerProjection.js";
export type { WindowHostControllerSourceScope } from "./windowHostControllerProjection.js";
export { createWindowHostSessionsIndexObserver } from "./windowHostSessionsIndexObserver.js";
export type { WindowHostSessionsIndexObserver } from "./windowHostSessionsIndexObserver.js";
```
