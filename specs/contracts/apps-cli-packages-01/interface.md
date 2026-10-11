# apps-cli-packages-01 接口（interface.md）

本文件只列**兼容所需的模块路径、导出名、参数与返回类型**。签名用 TypeScript 编译器 API（`ts.createSourceFile`）从源码逐字提取；**`pnpm dep:refs` 对这些路径报「源文件未加载到 project」**（`apps/cli/packages/adapters` 不在 dep-refs 的 project 里），所以改用与 ts-morph 等价的编译器 API 分析：同一套 TypeScript 解析器，直接对源码文本取导出声明，不新增依赖。

### `apps/cli/packages/adapters/src/commands/index.ts`

继承分类 `upstream-modified`，372 行。导出 3 个声明、0 条 re-export。

```ts
export interface NodeCustomCommandAdapterOptions extends CustomCommandRootResolutionOptions {
  disabledPaths?: Iterable<string>;
}
export class NodeCustomCommandAdapter implements CustomCommandPort {
  private readonly rootOptions: NodeCustomCommandAdapterOptions;
  private readonly disabled: Set<string>;

  constructor(options: NodeCustomCommandAdapterOptions = {});

  async discoverCommands(
    request: { roots?: CustomCommandRoot[]; workingDirectory: string },
    options?: CustomCommandOperationOptions,
  ): Promise<CustomCommandLoadOutcome>;

  async loadCommand(
    request: {
      maxBytes?: number;
      name: string;
      roots?: CustomCommandRoot[];
      workingDirectory: string;
    },
    options?: CustomCommandOperationOptions,
  ): Promise<CustomCommandContent>;
}
export function createNodeCustomCommandAdapter(
  options: NodeCustomCommandAdapterOptions = {},
): NodeCustomCommandAdapter;
```

### `apps/cli/packages/adapters/src/commands/roots.ts`

继承分类 `upstream-modified`，128 行。导出 2 个声明、0 条 re-export。

```ts
export interface CustomCommandRootResolutionOptions {
  extraRoots?: string[];
  extraResolvedRoots?: CustomCommandRoot[];
  homeDirectory?: string;
  includeKnorviaCommands?: boolean;
}
export async function resolveDefaultCustomCommandRoots(
  workingDirectory: string,
  options: CustomCommandRootResolutionOptions = {},
): Promise<CustomCommandRoot[]>;
```

### `apps/cli/packages/adapters/src/config/config-factory.ts`

继承分类 `upstream-modified`，353 行。导出 7 个声明、0 条 re-export。

```ts
export interface ConfigFactoryOptions {
  userConfigPath?: string;
  projectConfigPath?: string;
  workingDirectory?: string;
  workspaceIdentity?: string;
  env?: Record<string, string | undefined>;
  cliOverrides?: RuntimeConfigPatch;
  skipUserConfig?: boolean;
  loggerFactory?: LoggerFactory;
}
export interface ConfigResult {
  configPort: ConfigPort;
  config: RuntimeConfig;
  sources: {
    user: {
      diagnostics: LoadedConfig["diagnostics"];
      path: string;
      loaded: boolean;
      hasMcpServers: boolean;
      hasUiLocale: boolean;
      hasUiTheme: boolean;
      mcpServerNames: string[];
    };
    project: {
      diagnostics: LoadedConfig["diagnostics"];
      path: string | undefined;
      paths: string[];
      loaded: boolean;
      hasUiLocale: boolean;
      hasUiTheme: boolean;
      hasMcpServers: boolean;
      mcpServerNames: string[];
      uiLocalePath: string | undefined;
      uiThemePath: string | undefined;
      workspaceHookSnapshot?: WorkspaceHookBundleSnapshot;
      workspaceHookRuntimeRoot?: WorkspaceHookRuntimeRoot;
    };
    plugins: PluginConfigSources;
    mcp: { serverSources: Record<string, McpServerConfigSource> };
    env: boolean;
    cli: boolean;
  };
}
export type McpServerConfigSource = "system" | "project" | "user" | "env" | "cli";
export type PluginConfigScope = "user" | "workspace";
export interface PluginConfigSources {
  dirs: { user: string[]; workspace: string[] };
  enabled: Record<string, PluginConfigScope>;
  marketplaces: Record<string, PluginConfigScope>;
  options: Record<string, Record<string, PluginConfigScope>>;
  paths: { user: string; workspace: string | undefined };
}
export function createConfig(options: ConfigFactoryOptions = {}): ConfigResult;
export function resolveWorkspaceStorageDir(input: {
  env?: Record<string, string | undefined>;
  workingDirectory: string;
}): string;
```

### `apps/cli/packages/adapters/src/config/config-merger.ts`

继承分类 `upstream-modified`，141 行。导出 3 个声明、0 条 re-export。

```ts
export function getScopePriority(scope: ConfigScope): number;
export function createPrioritizedConfig(
  config: RuntimeConfigPatch,
  scope: ConfigScope,
): PrioritizedConfig;
export function mergeConfigs(...configs: PrioritizedConfig[]): RuntimeConfigPatch;
```

### `apps/cli/packages/adapters/src/config/env-config.adapter.ts`

继承分类 `upstream-modified`，90 行。导出 2 个声明、0 条 re-export。

```ts
export function parseEnvConfig(
  env: Record<string, string | undefined> = process.env,
  options: EnvConfigOptions = {},
): RuntimeConfigPatch;
export function getToolConcurrencyConfig(): { maxConcurrency: number };
```

### `apps/cli/packages/adapters/src/config/file-config.adapter.ts`

继承分类 `upstream-modified`，373 行。导出 18 个声明、0 条 re-export。

```ts
export interface LoadedConfig {
  config: RuntimeConfigPatch;
  diagnostics: ConfigDiagnostic[];
  path: string;
  loaded: boolean;
}
export interface UiLocalePatchResult {
  locale: UiLocale;
  path: string;
}
export interface PluginEnabledPatchResult {
  enabled: boolean;
  path: string;
  pluginId: string;
}
export interface PluginOptionsPatchResult {
  clearedOptionKeys: string[];
  options: Record<string, string | number | boolean>;
  path: string;
  pluginId: string;
}
export interface PluginRemovePatchResult {
  path: string;
  pluginId: string;
  removedEnabled: boolean;
  removedOptions: boolean;
}
export interface SuppressedBuiltinPatchResult {
  path: string;
  pluginId: string;
  suppressed: boolean;
}
export function resolvePath(path: string): string;
export function getDefaultConfigPath(): string;
export function hasDefaultConfigFile(): boolean;
export function loadFileConfig(filePath?: string, options: FileConfigOptions = {}): LoadedConfig;
export async function updateUiLocaleInFileConfig(
  filePath: string,
  locale: UiLocale,
): Promise<UiLocalePatchResult>;
export async function updatePluginEnabledInFileConfig(
  filePath: string,
  pluginId: string,
  enabled: boolean,
): Promise<PluginEnabledPatchResult>;
export async function enablePluginsByDefaultInFileConfig(
  filePath: string,
  pluginIds: readonly string[],
): Promise<{ enabledIds: string[]; path: string }>;
export async function updatePluginOptionsInFileConfig(
  filePath: string,
  pluginId: string,
  options: Record<string, string | number | boolean>,
  clearOptionKeys: string[] = [],
): Promise<PluginOptionsPatchResult>;
export async function removePluginFromFileConfig(
  filePath: string,
  pluginId: string,
): Promise<PluginRemovePatchResult>;
export async function removePluginEnabledFromFileConfig(
  filePath: string,
  pluginId: string,
): Promise<{ path: string; pluginId: string; removedEnabled: boolean }>;
export async function addSuppressedBuiltinInFileConfig(
  filePath: string,
  pluginId: string,
): Promise<SuppressedBuiltinPatchResult>;
export async function removeSuppressedBuiltinInFileConfig(
  filePath: string,
  pluginId: string,
): Promise<SuppressedBuiltinPatchResult>;
```

### `apps/cli/packages/adapters/src/config/index.ts`

继承分类 `upstream-modified`，492 行。导出 2 个声明、5 条 re-export。

```ts
export {
  loadFileConfig,
  getDefaultConfigPath,
  hasDefaultConfigFile,
  resolvePath,
  updatePluginEnabledInFileConfig,
  enablePluginsByDefaultInFileConfig,
  removePluginEnabledFromFileConfig,
  updatePluginOptionsInFileConfig,
  removePluginFromFileConfig,
  addSuppressedBuiltinInFileConfig,
  removeSuppressedBuiltinInFileConfig,
  updateUiLocaleInFileConfig,
  type PluginEnabledPatchResult,
  type PluginOptionsPatchResult,
  type PluginRemovePatchResult,
  type SuppressedBuiltinPatchResult,
  type UiLocalePatchResult,
} from "./file-config.adapter.js";
export { parseEnvConfig, getToolConcurrencyConfig } from "./env-config.adapter.js";
export { KnorviaConfigFileSchema, type KnorviaConfigFile } from "./schema.js";
export { mergeConfigs, createPrioritizedConfig, getScopePriority } from "./config-merger.js";
export {
  createConfig,
  resolveWorkspaceStorageDir,
  type ConfigFactoryOptions,
  type ConfigResult,
} from "./config-factory.js";
```

```ts
export class ConfigPortImpl implements ConfigPort {
  private store: ConfigStore;

  constructor(initial?: RuntimeConfigPatch);

  get<K extends ConfigKey>(key: K): ConfigValue<K>;

  getAll(): RuntimeConfig;

  has(key: ConfigKey): boolean;

  set<K extends ConfigKey>(key: K, value: ConfigValue<K>): void;

  observe(): ConfigObserver;

  getSources(key: ConfigKey): ConfigSource[];

  merge(config: RuntimeConfigPatch, scope: ConfigScope): void;
}
export function createConfigPort(initial?: RuntimeConfigPatch): ConfigPort;
```

### `apps/cli/packages/adapters/src/config/owners.test.mjs`

继承分类 `unreviewed`，806 行。导出 0 个声明、0 条 re-export。

### `apps/cli/packages/adapters/src/config/project-config.adapter.ts`

继承分类 `upstream-modified`，157 行。导出 5 个声明、0 条 re-export。

```ts
export interface ProjectConfigFile {
  baseDir: string;
  config: RuntimeConfigPatch;
  diagnostics: LoadedConfig["diagnostics"];
  hookCandidate?: WorkspaceHookSourceInput;
  loaded: boolean;
  path: string;
}
export interface ProjectConfigDiscovery {
  files: ProjectConfigFile[];
  diagnostics: LoadedConfig["diagnostics"];
  hookCandidates: WorkspaceHookSourceInput[];
  loaded: boolean;
  paths: string[];
  mcpServerNames: string[];
}
export function loadProjectConfigs(
  workingDirectory?: string,
  explicitProjectConfigPath?: string,
): ProjectConfigDiscovery;
export function loadProjectConfigFile(
  path: string,
  options: {
    discoveryOrder?: number;
    explicitProjectConfig?: boolean;
    workingDirectory?: string;
  } = {},
): ProjectConfigFile;
export function summarizeProjectConfigs(files: ProjectConfigFile[]): ProjectConfigDiscovery;
```

### `apps/cli/packages/adapters/src/config/schema.ts`

继承分类 `upstream-modified`，576 行。导出 10 个声明、0 条 re-export。

```ts
LEGACY_CUA_PLUGIN_ID = "cua@knorvia-plugins-bundled";
CANONICAL_CUA_PLUGIN_ID = "computer-use@knorvia-plugins-bundled";
export function canonicalizePluginId(pluginId: string): string;
export function pluginIdAliases(pluginId: string): readonly string[];
KnorviaConfigFileSchema = z
  .object({
    $schema: z.string().optional(),
    modelStream: modelStreamSchema.optional(),
    permission: permissionSchema.optional(),
    storage: storageSchema.optional(),
    network: networkSchema.optional(),
    features: featuresSchema.optional(),
    memory: memorySchema.optional(),
    mcp: mcpSchema.optional(),
    plugins: pluginsSchema.optional(),
    skills: skillsSchema.optional(),
    skill: skillCommandOverridesSchema.optional(),
    command: skillCommandOverridesSchema.optional(),
    logging: loggingSchema.optional(),
    ui: uiSchema.optional(),
    toolConcurrency: toolConcurrencySchema.optional(),
    modelAnomalyGuard: modelAnomalyGuardSchema.optional(),
    hooks: hooksSchema.optional(),
  })
  .passthrough();
export type KnorviaConfigFile = z.infer<typeof KnorviaConfigFileSchema>;
export type ConfigDiagnosticSeverity = "warning" | "error";
export type ConfigDiagnosticCode =
  | "config_file_invalid"
  | "config_mcp_server_invalid"
  | "config_project_hooks_pending_trust";
export interface ConfigDiagnostic {
  code: ConfigDiagnosticCode;
  filePath?: string;
  message: string;
  path?: string;
  severity: ConfigDiagnosticSeverity;
}
export function parseConfigFileToRuntimePatchWithDiagnostics(value: unknown): ParseConfigFileResult;
```

### `apps/cli/packages/adapters/src/context/git-snapshot.ts`

继承分类 `upstream-modified`，180 行。导出 1 个声明、0 条 re-export。

```ts
export async function resolveGitSnapshot(workingDirectory: string): Promise<Partial<EnvInfo>>;
```

### `apps/cli/packages/adapters/src/context/index.ts`

继承分类 `upstream-modified`，344 行。导出 3 个声明、0 条 re-export。

```ts
export interface NodeContextSourceAdapterOptions {
  env?: NodeJS.ProcessEnv;
}
export class NodeContextSourceAdapter implements ContextSourcePort {
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: NodeContextSourceAdapterOptions = {});

  async resolveContextSources(request: ContextSourceRequest): Promise<ContextSourceSnapshot>;

  private async detectEnvInfo(
    workingDirectory: string,
    effectiveShellDisplayName?: string,
  ): Promise<EnvInfo>;
}
export function createNodeContextSourceAdapter(
  options: NodeContextSourceAdapterOptions = {},
): NodeContextSourceAdapter;
```

### `apps/cli/packages/adapters/src/device/cli-device-mid.ts`

继承分类 `upstream-modified`，142 行。导出 1 个声明、0 条 re-export。

```ts
export function ensureCliDeviceMid(options: EnsureCliDeviceMidOptions = {}): Promise<string>;
```

### `apps/cli/packages/adapters/src/device/process-probe-darwin.ts`

继承分类 `upstream-modified`，71 行。导出 2 个声明、0 条 re-export。

```ts
export async function readDarwinProcessTable(
  execFile: ProcessProbeExecFile,
): Promise<readonly ProcessRow[]>;
export async function readDarwinProcessGroup(
  execFile: ProcessProbeExecFile,
  processGroupId: number,
): Promise<readonly ProcessRow[]>;
```

### `apps/cli/packages/adapters/src/device/process-probe-linux.ts`

继承分类 `upstream-modified`，154 行。导出 3 个声明、0 条 re-export。

```ts
export interface LinuxProcReaders {
  listProcDirectory: () => Promise<readonly string[]>;
  readProcFile: (path: string) => Promise<string>;
  isExpired?: () => boolean;
}
export async function sampleLinuxProcessTrees(
  readers: LinuxProcReaders,
  rootPids: readonly number[],
): Promise<ReadonlyMap<number, readonly ProcessProbeSample[]>>;
export async function sampleLinuxProcessGroup(
  readers: LinuxProcReaders,
  processGroupId: number,
): Promise<readonly ProcessProbeSample[]>;
```

### `apps/cli/packages/adapters/src/device/process-probe-shared.ts`

继承分类 `upstream-modified`，127 行。导出 13 个声明、0 条 re-export。

```ts
export interface ProcessProbeSample {
  pid: number;
  rssKb: number;
  cpuTimeMs?: number;
}
export interface ProcessProbeCommandResult {
  error?: unknown;
  status: number | null;
  stderr: string;
  stdout: string;
}
export type ProcessProbeExecFile = (
  file: string,
  args: readonly string[],
  options: ExecFileOptionsWithStringEncoding,
) => Promise<ProcessProbeCommandResult>;
export interface ProcessRelation {
  cpuTimeMs?: number;
  parentPid?: number;
  pid: number;
  processGroupId?: number;
}
export interface ProcessRow extends ProcessRelation {
  rssKb: number;
}
PROCESS_PROBE_SAMPLE_TIMEOUT_MS = 1000;
export class ProcessProbeFailure extends Error {}
export function isSamplablePid(pid: number): boolean;
export function toSample(row: ProcessRow): ProcessProbeSample;
export function collectProcessTreePids(
  relations: readonly ProcessRelation[],
  rootPids: readonly number[],
): ReadonlyMap<number, readonly number[]>;
export function groupProcessTrees(
  rows: readonly ProcessRow[],
  rootPids: readonly number[],
): ReadonlyMap<number, readonly ProcessProbeSample[]>;
export async function runProbeCommand(
  execFile: ProcessProbeExecFile,
  file: string,
  args: readonly string[],
  extraOptions?: Partial<ExecFileOptionsWithStringEncoding>,
): Promise<string>;
export function defaultProbeExecFile(
  file: string,
  args: readonly string[],
  options: ExecFileOptionsWithStringEncoding,
): Promise<ProcessProbeCommandResult>;
```

### `apps/cli/packages/adapters/src/device/process-probe-windows.ts`

继承分类 `upstream-modified`，54 行。导出 1 个声明、0 条 re-export。

```ts
export async function readWindowsProcessMemory(
  execFile: ProcessProbeExecFile,
  pids: readonly number[],
): Promise<readonly ProcessProbeSample[]>;
```

### `apps/cli/packages/adapters/src/device/process-probe.ts`

继承分类 `upstream-modified`，120 行。导出 3 个声明、1 条 re-export。

```ts
export {
  PROCESS_PROBE_SAMPLE_TIMEOUT_MS,
  type ProcessProbeCommandResult,
  type ProcessProbeExecFile,
  type ProcessProbeSample,
} from "./process-probe-shared.js";
```

```ts
export type ProcessTreeScope = "direct_process" | "process_tree";
export interface ProcessProbe {
  sampleProcessTrees(
    rootPids: readonly number[],
  ): Promise<ReadonlyMap<number, readonly ProcessProbeSample[]> | undefined>;
  sampleProcessGroup(processGroupId: number): Promise<readonly ProcessProbeSample[] | undefined>;
  reset(): void;
  readonly treeScope: ProcessTreeScope;
}
export function createProcessProbe(options: CreateProcessProbeOptions = {}): ProcessProbe;
```

### `apps/cli/packages/adapters/src/fs/file-search-paths.ts`

继承分类 `unreviewed`，160 行。导出 11 个声明、0 条 re-export。

```ts
VCS_NAMES = [".git", ".svn", ".hg", ".bzr", ".jj", ".sl"] as const;
export interface Candidate {
  path: string;
  mtimeMs: number;
}
export function posixRelative(root: string, file: string): string;
export function glob(pattern: string): (relativePath: string, fileName: string) => boolean;
export const TYPE_EXTENSIONS: Record<string, string[]>;
export function fileType(type: string): string;
export function matchesType(path: string, type: string): boolean;
export function filter(
  root: string,
  request: FileSystemSearchTextRequest,
): (path: string) => boolean;
export async function walk(
  root: string,
  signal: AbortSignal | undefined,
  visit: (path: string, info: Awaited<ReturnType<typeof stat>>) => Promise<void> | void,
): Promise<void>;
export async function candidates(
  path: string,
  info: Awaited<ReturnType<typeof stat>>,
  request: FileSystemSearchTextRequest,
  signal?: AbortSignal,
): Promise<Candidate[]>;
export function recent(a: Candidate, b: Candidate): number;
```

### `apps/cli/packages/adapters/src/fs/index.ts`

继承分类 `upstream-modified`，275 行。导出 5 个声明、0 条 re-export。

```ts
export function setRipgrepWorkerFactoryForTests(
  factory: RipgrepWorkerFactory | undefined,
): () => void;
export function setRipgrepTimeoutMsForTests(timeoutMs: number | undefined): () => void;
export interface NodeFileSystemAdapterOptions {
  textSearchEngine?: "ripgrep" | "javascript";
}
export class NodeFileSystemAdapter implements FileSystemPort {
  constructor(private readonly adapterOptions: NodeFileSystemAdapterOptions = ;) {}
  async createDirectory(
    request: FileSystemCreateDirectoryRequest,
  ): Promise<FileSystemCreateDirectoryResult> ;
  async stat(request: FileSystemStatRequest): Promise<FileSystemStatResult> ;
  async readTextFile(request: FileSystemReadTextRequest): Promise<FileSystemReadTextResult> ;
  async readBinaryFile(request: FileSystemReadBytesRequest): Promise<FileSystemReadBytesResult> ;
  async readTextFileRange(
    request: FileSystemReadTextRangeRequest,
    options?: { signal?: AbortSignal },
  ): Promise<FileSystemReadTextRangeResult> ;
  async writeTextFile(request: FileSystemWriteTextRequest): Promise<FileSystemWriteTextResult> ;
  async removeFile(
    request: FileSystemRemoveFileRequest,
    options?: { signal?: AbortSignal },
  ): Promise<FileSystemRemoveFileResult> ;
  async listDirectory(
    request: FileSystemListDirectoryRequest,
    options?: { signal?: AbortSignal },
  ): Promise<FileSystemListDirectoryResult> ;
  async searchFiles(
    request: FileSystemSearchFilesRequest,
    options?: { signal?: AbortSignal },
  ): Promise<FileSystemSearchFilesResult> ;
  async searchText(
    request: FileSystemSearchTextRequest,
    options?: { signal?: AbortSignal },
  ): Promise<FileSystemSearchTextResult> ;
}
export function createNodeFileSystemAdapter(
  options: NodeFileSystemAdapterOptions = {},
): NodeFileSystemAdapter;
```

### `apps/cli/packages/adapters/src/fs/node-file-io.ts`

继承分类 `unreviewed`，90 行。导出 3 个声明、0 条 re-export。

```ts
export async function prefix(path: string, capacity: number): Promise<Buffer>;
export async function bounded(path: string, capacity: number, initialSize: number): Promise<Buffer>;
export async function publish(path: string, bytes: Buffer): Promise<void>;
```

### `apps/cli/packages/adapters/src/fs/node-file-policy.ts`

继承分类 `unreviewed`，104 行。导出 9 个声明、0 条 re-export。

```ts
export function absolute(path: string): string;
export function code(error: unknown): unknown;
export function failure(error: unknown, path: string): Error;
export function aborted(signal?: AbortSignal): void;
export function abortError(message: string): Error;
export function nodeKind(info: {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}): FileSystemNodeKind;
export function regular(
  info: { isFile(): boolean; isDirectory(): boolean },
  path: string,
  kind: "text" | "binary",
): void;
export function revision(info: { mtimeMs: number; size: number }, bytes?: Buffer);
export function byteCount(bytes: number): string;
```

### `apps/cli/packages/adapters/src/fs/node-search.ts`

继承分类 `unreviewed`，174 行。导出 2 个声明、0 条 re-export。

```ts
export async function searchFiles(
  request: FileSystemSearchFilesRequest,
  signal?: AbortSignal,
): Promise<FileSystemSearchFilesResult>;
export async function searchText(
  request: FileSystemSearchTextRequest,
  engine: "javascript" | "ripgrep" | undefined,
  signal?: AbortSignal,
): Promise<FileSystemSearchTextResult>;
```

### `apps/cli/packages/adapters/src/fs/ripgrep-plan.ts`

继承分类 `unreviewed`，45 行。导出 1 个声明、0 条 re-export。

```ts
export function searchPlan(request: FileSystemSearchTextRequest, directory: boolean);
```

### `apps/cli/packages/adapters/src/fs/ripgrep-worker.ts`

继承分类 `unreviewed`，146 行。导出 4 个声明、0 条 re-export。

```ts
export class RipgrepRuntimeFailure extends Error {
  constructor(cause: unknown);
}
export function setRipgrepWorkerFactoryForTests(
  factory: RipgrepWorkerFactory | undefined,
): () => void;
export function setRipgrepTimeoutMsForTests(timeoutMs: number | undefined): () => void;
export async function runSearch(
  args: string[],
  preopens: Record<string, string>,
  signal?: AbortSignal,
): Promise<RipgrepBufferedResult>;
```

### `apps/cli/packages/adapters/src/fs/text-line-window.ts`

继承分类 `unreviewed`，59 行。导出 1 个声明、0 条 re-export。

```ts
export class TextLineWindow {
  readonly lines: string[] = [];
  totalLines = 0;
  private fragments: string[] = [];
  private last = "";
  private newlineBalance = 0;

  constructor(
    private readonly offset: number,
    private readonly limit: number | undefined,
  ) ;

  private selected(): boolean ;

  private append(text: string): void ;

  private complete(newline: boolean): void ;

  write(text: string): void ;

  finish(decoderTail: string, sawBytes: boolean): void ;

  get lineEndings(): "CRLF" | "LF" {
    return this.newlineBalance > 0 ? "CRLF" : "LF";
  }
}
```

### `apps/cli/packages/adapters/src/fs/text-metadata.ts`

继承分类 `upstream-modified`，152 行。导出 8 个声明、0 条 re-export。

```ts
export function detectTextEncoding(buffer: Buffer, path?: string): FileSystemTextEncoding;
export function decodeTextBuffer(request: {
  buffer: Buffer;
  encoding?: FileSystemTextEncoding;
  path?: string;
}): DecodedTextBuffer;
export function encodeTextContent(request: {
  content: string;
  encoding?: FileSystemTextEncoding;
  path?: string;
}): Buffer;
export function createStreamingTextDecoder(encoding: FileSystemTextEncoding): StreamingTextDecoder;
export function shouldNormalizeLineEndings(encoding: FileSystemTextEncoding): boolean;
export function detectLineEndings(content: string): FileSystemLineEndings;
export function normalizeLineEndings(content: string): string;
export function applyRequestedLineEndings(
  content: string,
  lineEndings: FileSystemLineEndings | undefined,
): string;
```

### `apps/cli/packages/adapters/src/fs/text-range-reader.ts`

继承分类 `upstream-modified`，158 行。导出 1 个声明、0 条 re-export。

```ts
export async function readTextFileRangeFromNode(
  request: FileSystemReadTextRangeRequest,
  info: Stats,
  signal?: AbortSignal,
): Promise<FileSystemReadTextRangeResult>;
```

### `apps/cli/packages/adapters/src/fs/text-search-lines.ts`

继承分类 `unreviewed`，133 行。导出 3 个声明、0 条 re-export。

```ts
export interface LineMatches {
  matchCount: number;
  entries: FileSystemSearchTextEntry[];
}
export function matchingFragments(
  path: string,
  text: string,
  lineNumber?: number,
): FileSystemSearchTextEntry[];
export function matchContent(
  path: string,
  content: string,
  regex: RegExp,
  request: FileSystemSearchTextRequest,
): LineMatches;
```

### `apps/cli/packages/adapters/src/fs/text-search-results.ts`

继承分类 `unreviewed`，160 行。导出 5 个声明、0 条 re-export。

```ts
export interface SearchHits {
  files: string[];
  entries: FileSystemSearchTextEntry[];
  numMatches: number;
}
export function finish(
  request: FileSystemSearchTextRequest,
  startedAt: number,
  hits: SearchHits,
): FileSystemSearchTextResult;
export function parseOutput(
  text: string,
  root: string,
  request: FileSystemSearchTextRequest,
): SearchHits;
export async function sortFiles(paths: string[]): Promise<string[]>;
export function ripgrepFailure(stderr: string, path: string, pattern: string): Error;
```

### `apps/cli/packages/adapters/src/image/image-budget.ts`

继承分类 `upstream-modified`，54 行。导出 4 个声明、0 条 re-export。

```ts
export type ImageBudget = {
  maxBase64Bytes: number;
  maxRawBytes: number;
  maxTokens?: number;
  tokenToBase64CharRatio: number;
};
export function createImageBudget(request: ImagePrepareForModelRequest): ImageBudget;
export function validatePrepareRequest(request: ImagePrepareForModelRequest): void;
export function fitsImageBudget(buffer: Buffer, budget: ImageBudget): boolean;
```

### `apps/cli/packages/adapters/src/image/index.ts`

继承分类 `upstream-modified`，81 行。导出 1 个声明、0 条 re-export。

```ts
export function createJimpImageProcessorAdapter(): ImageProcessorPort;
```

### `apps/cli/packages/adapters/src/image/jimp-compression.ts`

继承分类 `upstream-modified`，279 行。导出 1 个声明、0 条 re-export。

```ts
export async function prepareJimpImageForModel(
  request: ImagePrepareForModelRequest,
  options: { signal?: AbortSignal } = {},
): Promise<ImagePrepareForModelResult>;
```

### `apps/cli/packages/adapters/src/image/jimp-media.ts`

继承分类 `upstream-modified`，50 行。导出 3 个声明、1 条 re-export。

```ts
export { detectImageMediaType };
```

```ts
export function normalizeMediaType(value: string): string;
export function jimpOutputMediaType(
  requested: string,
  detected: string | undefined,
): JimpOutputMime;
export function throwIfAborted(signal: AbortSignal | undefined): void;
```

### `apps/cli/packages/adapters/src/image/webp-passthrough.ts`

继承分类 `upstream-modified`，30 行。导出 1 个声明、0 条 re-export。

```ts
export function prepareWebpPassthrough(
  input: Buffer,
  request: ImagePrepareForModelRequest,
): ImagePrepareForModelResult;
```

### `apps/cli/packages/adapters/src/index.ts`

继承分类 `upstream-unchanged`，20 行。导出 0 个声明、18 条 re-export。

```ts
export * from "./storage/index.js";
export * from "./fs/index.js";
export * from "./context/index.js";
export * from "./exec/index.js";
export * from "./http/index.js";
export * from "./image/index.js";
export * from "./pdf/index.js";
export * from "./provider/index.js";
export * from "./model/index.js";
export * from "./logging/index.js";
export * from "./config/index.js";
export * from "./skills/index.js";
export * from "./commands/index.js";
export * from "./plugins/index.js";
export * from "./auth/index.js";
export * from "./browser/index.js";
export * from "./mcp/index.js";
export * from "./workflow/index.js";
```

### `apps/cli/packages/adapters/src/logging/entry.ts`

继承分类 `unreviewed`，39 行。导出 1 个声明、0 条 re-export。

```ts
export function projectLogEntry(
  category: string,
  level: LogLevel,
  message: string,
  context: LogContext,
  error: Error | undefined,
  includeStack: boolean,
): LogEntry;
```

### `apps/cli/packages/adapters/src/logging/file-sink.ts`

继承分类 `unreviewed`，22 行。导出 1 个声明、0 条 re-export。

```ts
export function appendLogRecord(directory: string, json: string): void;
```

### `apps/cli/packages/adapters/src/logging/index.ts`

继承分类 `upstream-modified`，181 行。导出 6 个声明、4 条 re-export。

```ts
export {
  LOG_CLEANUP_STARTUP_DELAY_MS,
  LOG_RETENTION_DAYS,
  cleanupLogRetention,
  formatLocalLogDate,
  scheduleLogRetentionCleanup,
} from "./retention.js";
export type {
  LogRetentionCleanupOptions,
  LogRetentionCleanupResult,
  LogRetentionScheduleOptions,
  LogRetentionTimer,
} from "./retention.js";
export { DefaultLogRedactor } from "./serialize.js";
export type { SerializableLogEntry, SerializedLogError } from "./serialize.js";
```

```ts
export interface NodeLoggerFactoryOptions {
  env?: NodeJS.ProcessEnv;
  logDir?: string;
  minLevel?: LogLevel;
  console?: boolean | { stream: NodeJS.WritableStream };
  includeErrorStack?: boolean;
  redactor?: LogRedactor;
}
export type NodeLogRetentionScheduleOptions = Pick<
  LogRetentionScheduleOptions,
  "delayMs" | "logger" | "now" | "retentionDays" | "setTimeout"
>;
export interface NodeLoggerFactory extends LoggerFactory {
  getLogDir(): string;
  scheduleLogRetentionCleanup(
    options?: NodeLogRetentionScheduleOptions,
  ): LogRetentionTimer | undefined;
}
export class NodeFileLogger implements Logger {
  private readonly settings: FileLoggerOptions & {
    defaultContext: LogContext;
    includeErrorStack: boolean;
  };

  constructor(options: FileLoggerOptions);

  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;

  child(context: LogContext): Logger;

  private write(level: LogLevel, message: string, context?: LogContext, error?: Error): void;
}
export function getDefaultLogDir(): string;
export function createNodeLoggerFactory(options: NodeLoggerFactoryOptions = {}): NodeLoggerFactory;
```

### `apps/cli/packages/adapters/src/logging/retention.ts`

继承分类 `upstream-modified`，177 行。导出 9 个声明、0 条 re-export。

```ts
LOG_RETENTION_DAYS = 7;
LOG_CLEANUP_STARTUP_DELAY_MS = 60_000;
export interface LogRetentionCleanupOptions {
  logDir: string;
  logger?: Logger;
  now?: Date;
  retentionDays?: number;
}
export interface LogRetentionCleanupResult {
  cutoffDate: string;
  deletedFiles: string[];
  failedFiles: string[];
  retentionDays: number;
  scannedFiles: number;
  status: "completed" | "failed";
}
export interface LogRetentionTimer {
  unref?(): void;
}
export interface LogRetentionScheduleOptions extends Omit<LogRetentionCleanupOptions, "now"> {
  delayMs?: number;
  now?: () => Date;
  setTimeout?: (callback: () => void, delayMs: number) => LogRetentionTimer;
}
export function formatLocalLogDate(date: Date): string;
export async function cleanupLogRetention(
  options: LogRetentionCleanupOptions,
): Promise<LogRetentionCleanupResult>;
export function scheduleLogRetentionCleanup(
  options: LogRetentionScheduleOptions,
): LogRetentionTimer;
```

### `apps/cli/packages/adapters/src/logging/serialize.ts`

继承分类 `upstream-modified`，264 行。导出 8 个声明、0 条 re-export。

```ts
export interface SerializedLogError {
  name: string;
  message: string;
  code?: string;
  type?: string;
  stack?: string;
  context?: Record<string, unknown>;
  cause?: SerializedLogError;
}
export type SerializableLogEntry = Record<string, unknown>;
export class DefaultLogRedactor implements LogRedactor {
  redact(input: unknown): unknown;
}
export function stripReservedContext(context: LogContext): Record<string, unknown> | undefined;
export function toSerializableEntry(entry: LogEntry, redactor: LogRedactor): SerializableLogEntry;
export function formatConsoleLine(entry: LogEntry): string;
export function isLogStatus(value: unknown): value is LogEntry["status"];
export function serializeLogError(
  error: unknown,
  includeStack: boolean,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): SerializedLogError;
```

### `apps/cli/packages/adapters/src/mailbox/index.ts`

继承分类 `upstream-modified`，77 行。导出 3 个声明、0 条 re-export。

```ts
export interface NodeSessionMailboxOptions {
  rootDir: string;
}
export class NodeSessionMailboxAdapter implements SessionMailboxPort {
  constructor(private readonly options: NodeSessionMailboxOptions) ;

  async drainUnread(
    input: { sessionId: SessionId; limit?: number },
    options?: { signal?: AbortSignal },
  ): Promise<SessionMailboxEnvelope[]> ;

  private sessionDir(sessionId: SessionId, kind: "read" | "unread"): string ;
}
export function createNodeSessionMailboxAdapter(
  options: NodeSessionMailboxOptions,
): SessionMailboxPort;
```

### `apps/cli/packages/adapters/src/pdf/index.ts`

继承分类 `upstream-modified`，297 行。导出 2 个声明、0 条 re-export。

```ts
export interface PopplerPdfDocumentAdapterOptions {
  executionPort: ExecutionPort;
  tempRoot?: string;
}
export function createPopplerPdfDocumentAdapter(
  options: PopplerPdfDocumentAdapterOptions,
): PdfDocumentPort;
```

### `apps/cli/packages/adapters/src/provider/index.ts`

继承分类 `upstream-unchanged`，3 行。导出 0 个声明、1 条 re-export。

```ts
export {};
```

### `apps/cli/packages/adapters/src/skills/index.ts`

继承分类 `upstream-modified`，378 行。导出 3 个声明、0 条 re-export。

```ts
export interface NodeSkillAdapterOptions extends SkillRootResolutionOptions {
  disabledPaths?: Iterable<string>;
}
export class NodeSkillAdapter implements SkillPort {
  private readonly factoryOptions: NodeSkillAdapterOptions;
  private readonly disabled = new Set<string>();
  private readonly pluginNames = new Map<string, Promise<string | undefined>>();

  constructor(options: NodeSkillAdapterOptions = {});

  private async labels(
    root: SkillRoot,
    skillName: string,
  ): Promise<{
    pluginId?: string;
    pluginName?: string;
    qualifiedName?: string;
  }>;

  private async parse(
    path: string,
    root: SkillRoot,
    diagnostics: SkillDiagnostic[],
  ): Promise<SkillMetadata | null>;

  async discoverSkills(
    request: { workingDirectory: string; roots?: SkillRoot[] },
    options?: SkillOperationOptions,
  ): Promise<SkillLoadOutcome>;

  async loadSkill(
    request: { name: string; workingDirectory: string; roots?: SkillRoot[]; maxBytes?: number },
    options?: SkillOperationOptions,
  ): Promise<SkillContent>;
}
export function createNodeSkillAdapter(options: NodeSkillAdapterOptions = {}): NodeSkillAdapter;
```

### `apps/cli/packages/adapters/src/skills/roots.ts`

继承分类 `upstream-modified`，130 行。导出 2 个声明、0 条 re-export。

```ts
export interface SkillRootResolutionOptions {
  homeDirectory?: string;
  extraRoots?: string[];
  extraResolvedRoots?: SkillRoot[];
  includeKnorviaSkills?: boolean;
}
export async function resolveDefaultSkillRoots(
  workingDirectory: string,
  options: SkillRootResolutionOptions = {},
): Promise<SkillRoot[]>;
```

### `apps/cli/packages/adapters/src/skills/scan.ts`

继承分类 `upstream-modified`，114 行。导出 2 个声明、0 条 re-export。

```ts
export async function scanSkillFilesUnderRoot(
  rootPath: string,
  options: ScanSkillFilesOptions = {},
): Promise<string[]>;
export function scanSkillFilesUnderRootSync(
  rootPath: string,
  options: ScanSkillFilesOptions = {},
): string[];
```

### `apps/cli/packages/adapters/src/storage/session-store/migrations/0020-provider-model-selection.ts`

继承分类 `upstream-unchanged`，113 行。导出 1 个声明、0 条 re-export。

```ts
PROVIDER_MODEL_SELECTION_MIGRATION_SQL = `
  -- 无 entry 时沿用既有最后一个明确消息来源规则；不能越过损坏/明确空选择找更早的值。
  with ranked as (
    select message.*, row_number() over (
      partition by session_id order by sequence desc, time_created desc, rowid desc
    ) as rank
    from message
    where json_valid(data) and json_type(data) = 'object'
      and ((${value("role")} = 'user' and (json_type(data, '$.model') is not null or json_type(data, '$.modelSelection') is not null))
        or (${value("role")} = 'assistant' and (json_type(data, '$.providerID') is not null or json_type(data, '$.modelID') is not null
          or json_type(data, '$.providerId') is not null or json_type(data, '$.modelId') is not null or json_type(data, '$.reasoningLevel') is not null)))
      and not exists (select 1 from session_entry e where e.session_id = message.session_id and e.type = 'runtime/model_selection')
  ), candidates as (
    select *, ${messageCandidate} as candidate from ranked where rank = 1
  ), migrated as (
    select *, ${selection(
      migratedProvider("json_extract(candidate, '$.providerId')"),
      "trim(json_extract(candidate, '$.modelId'))",
      "trim(json_extract(candidate, '$.options.reasoningLevel'))",
    )} as normalized from candidates
  )
  insert into session_entry(id, session_id, type, time_created, time_updated, data)
    select session_id || ':runtime-model-selection', session_id, 'runtime/model_selection', time_created, time_updated,
      json_object('modelSelection', json(normalized))
    from migrated where normalized is not null
    on conflict(id) do nothing;

  update session_entry set data = json_set(data, '$.modelSelection', json(${entrySelection}))
    where type = 'runtime/model_selection' and json_valid(data) and json_type(data) = 'object'
      and ${text(value("providerId"))} and ${text(value("modelId"))} and ${entrySelection} is not null;

  -- 已发布 User 消息也可能含 modelSelection；它本身不是可覆盖的未发布新目标字段。
  update message set data = json_set(data, '$.modelSelection', json(${legacyUserSelection}))
    where json_valid(data) and json_type(data) = 'object' and ${value("role")} = 'user'
      and json_type(data, '$.modelSelection') is null and json_type(data, '$.model') = 'object';

  update message set data = json_patch(data, json_patch(
      json_object('providerId', ${value("providerID")}, 'modelId', ${value("modelID")}),
      case when ${text(value("variant"))} then json_object('reasoningLevel', ${value("variant")}) else '{}' end))
    where json_valid(data) and json_type(data) = 'object' and ${value("role")} = 'assistant'
      and ${text(value("providerID"))} and ${text(value("modelID"))};

  ${migratePartMember("fromModel", "fromModelSelection")}
  ${migratePartMember("toModel", "toModelSelection")}
  ${migratePartMember("model", "modelSelection")}
`;
```

### `apps/cli/packages/adapters/src/storage/session-store/migrations/0021-official-glm-selection.ts`

继承分类 `upstream-unchanged`，36 行。导出 1 个声明、0 条 re-export。

```ts
OFFICIAL_GLM_SELECTION_MIGRATION_SQL = `
UPDATE session_entry
SET data = json_set(data, '$.modelSelection.modelId',
  CASE lower(json_extract(data, '$.modelSelection.modelId'))
    WHEN 'glm-5.3' THEN 'GLM-5.3'
    WHEN 'glm-5.3-flash' THEN 'GLM-5.3-Flash'
    WHEN 'glm-5v-turbo' THEN 'GLM-5V-Turbo'
    WHEN 'glm-5.2' THEN 'GLM-5.2'
    WHEN 'glm-5.1' THEN 'GLM-5.1'
    WHEN 'glm-5.1-highspeed' THEN 'GLM-5.1-Highspeed'
    WHEN 'glm-5' THEN 'GLM-5'
    WHEN 'glm-5-turbo' THEN 'GLM-5-Turbo'
    WHEN 'glm-4.7' THEN 'GLM-4.7'
    WHEN 'glm-4.7-flashx' THEN 'GLM-4.7-FlashX'
    WHEN 'glm-4.7-flash' THEN 'GLM-4.7-Flash'
    WHEN 'glm-4.6' THEN 'GLM-4.6'
    WHEN 'glm-4.5-air' THEN 'GLM-4.5-Air'
    WHEN 'glm-4.5' THEN 'GLM-4.5'
    WHEN 'glm-4.6v' THEN 'GLM-4.6V'
    WHEN 'glm-4.6v-flash' THEN 'GLM-4.6V-Flash'
    WHEN 'glm-4.6v-flashx' THEN 'GLM-4.6V-FlashX'
    WHEN 'glm-4.1v-thinking-flashx' THEN 'GLM-4.1V-Thinking-FlashX'
    WHEN 'glm-4.1v-thinking-flash' THEN 'GLM-4.1V-Thinking-Flash'
    WHEN 'glm-4-flashx-250414' THEN 'GLM-4-FlashX-250414'
    WHEN 'glm-4-flash-250414' THEN 'GLM-4-Flash-250414'
    WHEN 'glm-4v-flash' THEN 'GLM-4V-Flash'
    ELSE json_extract(data, '$.modelSelection.modelId')
  END)
WHERE type = 'runtime/model_selection' AND CASE WHEN json_valid(data) THEN
  json_extract(data, '$.modelSelection.providerId') IN ('account:zai-start-plan', 'account:bigmodel-start-plan', 'account:zai-individual-coding-plan', 'account:bigmodel-individual-coding-plan', 'account:zai-team-coding-plan', 'account:bigmodel-team-coding-plan')
  AND lower(json_extract(data, '$.modelSelection.modelId')) IN ('glm-5.3', 'glm-5.3-flash', 'glm-5v-turbo', 'glm-5.2', 'glm-5.1', 'glm-5.1-highspeed', 'glm-5', 'glm-5-turbo', 'glm-4.7', 'glm-4.7-flashx', 'glm-4.7-flash', 'glm-4.6', 'glm-4.5-air', 'glm-4.5', 'glm-4.6v', 'glm-4.6v-flash', 'glm-4.6v-flashx', 'glm-4.1v-thinking-flashx', 'glm-4.1v-thinking-flash', 'glm-4-flashx-250414', 'glm-4-flash-250414', 'glm-4v-flash')
  ELSE 0 END;
`;
```

### `apps/cli/packages/adapters/src/storage/session-store/migrations/0022-backfilled-session-reasoning.ts`

继承分类 `upstream-unchanged`，97 行。导出 1 个声明、0 条 re-export。

```ts
BACKFILLED_SESSION_REASONING_MIGRATION_SQL = `
WITH last_user AS (
  SELECT session_id, data, row_number() OVER (
    PARTITION BY session_id ORDER BY sequence DESC, time_created DESC, rowid DESC
  ) AS rank
  FROM message
  WHERE CASE WHEN json_valid(data) THEN json_extract(data, '$.role') = 'user' ELSE 0 END
), normalized_user AS (
  SELECT session_id,
    CASE trim(json_extract(data, '$.modelSelection.providerId'))
      WHEN 'builtin:bigmodel' THEN 'bigmodel-api'
      WHEN 'builtin:zai' THEN 'zai-api'
      WHEN 'builtin:bigmodel-start-plan' THEN 'account:bigmodel-start-plan'
      WHEN 'builtin:zai-start-plan' THEN 'account:zai-start-plan'
      WHEN 'builtin:bigmodel-coding-plan' THEN 'account:bigmodel-individual-coding-plan'
      WHEN 'builtin:zai-coding-plan' THEN 'account:zai-individual-coding-plan'
      ELSE CASE WHEN substr(trim(json_extract(data, '$.modelSelection.providerId')), 1, 8) = 'builtin:'
        THEN NULL ELSE trim(json_extract(data, '$.modelSelection.providerId')) END
    END AS provider_id,
    trim(json_extract(data, '$.modelSelection.modelId')) AS model_id,
    json_extract(data, '$.modelSelection.options.reasoningLevel') AS level
  FROM last_user
  WHERE rank = 1
    AND json_type(data, '$.modelSelection.providerId') = 'text'
    AND json_type(data, '$.modelSelection.modelId') = 'text'
    AND json_type(data, '$.modelSelection.options.reasoningLevel') = 'text'
    AND length(trim(json_extract(data, '$.modelSelection.options.reasoningLevel'))) > 0
), canonical_user AS (
  SELECT session_id, provider_id, level,
    CASE WHEN provider_id IN (${officialProviders.map((id) => `'${id}'`).join(", ")})
      THEN CASE lower(model_id)
        ${officialModels.map((id) => `WHEN '${id.toLowerCase()}' THEN '${id}'`).join("\n        ")}
        ELSE model_id END
      ELSE model_id END AS model_id
  FROM normalized_user
), untouched_entries AS (
  SELECT e.id, CASE WHEN json_valid(e.data) THEN e.data ELSE '{}' END AS data, e.session_id
  FROM session_entry e
  JOIN session s ON s.id = e.session_id
  JOIN schema_migration m ON m.id = '0020_provider_model_selection'
  WHERE e.type = 'runtime/model_selection'
    AND e.id = e.session_id || ':runtime-model-selection'
    AND e.time_updated <= m.time_applied AND s.time_updated <= m.time_applied
), repairs AS (
  SELECT e.id, u.level
  FROM untouched_entries e JOIN canonical_user u ON u.session_id = e.session_id
  WHERE json_type(e.data, '$.providerId') IS NULL
    AND json_type(e.data, '$.modelId') IS NULL
    AND json_type(e.data, '$.thoughtLevel') IS NULL
    AND json_type(e.data, '$.modelSelection.options') IS NULL
    AND json_type(e.data, '$.modelSelection.providerId') = 'text'
    AND json_type(e.data, '$.modelSelection.modelId') = 'text'
    AND length(u.provider_id) > 0 AND length(u.model_id) > 0
    AND json_extract(e.data, '$.modelSelection.providerId') = u.provider_id
    AND json_extract(e.data, '$.modelSelection.modelId') = u.model_id
)
UPDATE session_entry AS e
SET data = json_set(data, '$.modelSelection.options.reasoningLevel',
  (SELECT level FROM repairs WHERE repairs.id = e.id))
WHERE id IN (SELECT id FROM repairs);
`;
```

### `apps/cli/packages/adapters/src/storage/session-store/migrations.ts`

继承分类 `upstream-unchanged`，931 行。导出 1 个声明、0 条 re-export。

```ts
export const SQLITE_MIGRATIONS: readonly SqliteMigration[];
```

### `apps/cli/packages/adapters/src/storage/session-store/options.ts`

继承分类 `upstream-unchanged`，33 行。导出 3 个声明、0 条 re-export。

```ts
export type ForkCommitFaultStage =
  | "afterChild"
  | "afterMessages"
  | "afterGoal"
  | "afterEntries"
  | "afterInput"
  | "afterCommandFact"
  | "beforeCommit";
export interface SqliteSessionStoreOptions {
  dbPath?: string;
  /** 仅供事务原子性测试；生产调用不得设置。 */
  forkCommitFaultAt?: ForkCommitFaultStage;
  /** 仅供启动锁等待边界测试；生产调用使用默认值。 */
  startupLockTimeoutMs?: number;
}
export interface SessionStoreDebugCounts {
  sessions: number;
  messages: number;
  parts: number;
  todos: number;
  targets: number;
  sessionEntries: number;
  permissions: number;
  localSettings: number;
  schemaMigrations: number;
  inputHistory: number;
  modelUsage: number;
  toolUsage: number;
  turnUsage: number;
}
```

### `apps/cli/packages/adapters/src/storage/session-store/rows.ts`

继承分类 `upstream-unchanged`，92 行。导出 9 个声明、0 条 re-export。

```ts
export interface SessionRow {
  id: string;
  project_id: string;
  workspace_id: string | null;
  parent_id: string | null;
  trace_id: string | null;
  task_type: string;
  slug: string;
  directory: string;
  path: string | null;
  title: string;
  title_source: string | null;
  title_message_id: string | null;
  version: string;
  share_url: string | null;
  summary_additions: number | null;
  summary_deletions: number | null;
  summary_files: number | null;
  summary_diffs: string | null;
  revert: string | null;
  permission: string | null;
  time_created: number;
  time_updated: number;
  time_title_updated: number | null;
  time_compacting: number | null;
  time_archived: number | null;
}
export interface MessageRow {
  id: string;
  session_id: string;
  sequence: number | null;
  time_created: number;
  time_updated: number;
  data: string;
}
export interface PartRow {
  id: string;
  message_id: string;
  session_id: string;
  sequence: number | null;
  time_created: number;
  time_updated: number;
  data: string;
}
export interface SessionEntryRow {
  id: string;
  session_id: string;
  type: string;
  time_created: number;
  time_updated: number;
  data: string;
}
export interface TodoRow {
  session_id: string;
  content: string;
  status: string;
  priority: string;
  position: number;
  time_created: number;
  time_updated: number;
}
export interface PermissionRow {
  project_id: string;
  time_created: number;
  time_updated: number;
  data: string;
}
export interface LocalSettingRow {
  value: string;
}
export interface SchemaMigrationRow {
  checksum: string;
  id: string;
}
export interface InputHistoryRow {
  id: string;
  project_id: string;
  session_id: string | null;
  text: string;
  attachments: string | null;
  kind: string;
  time_created: number;
}
```

### `apps/cli/packages/adapters/src/storage/session-store.ts`

继承分类 `upstream-modified`，40 行。导出 0 个声明、8 条 re-export。

```ts
export {
  createSqliteSessionStore,
  getDefaultSessionDbPath,
  openStartupSqliteSessionStore,
  SqliteSessionStore,
} from "./session-store/sqlite-session-store.js";
export { createDwfJournalStore } from "./session-store/repositories/dwf-journal.js";
export type {
  DwfArtifactItem,
  DwfArtifactItemsQuery,
  DwfListRunsQuery,
  DwfNodeStatusCounts,
  DwfRunIntrospectionQueries,
} from "./session-store/repositories/dwf-journal.js";
export type {
  DwfRunDetailRow,
  DwfRunListItem,
  DwfRunSessionListItem,
  DwfRunSessionRow,
  DwfRunTimestamps,
  DwfWorldNodeRow,
} from "./session-store/repositories/dwf-journal-codecs.js";
export { SqliteSessionMigrationError } from "./session-store/errors.js";
export type {
  SqliteSessionMigrationErrorKind,
  SqliteSessionMigrationErrorOptions,
} from "./session-store/errors.js";
export type {
  SessionStoreDebugCounts,
  SqliteSessionStoreOptions,
} from "./session-store/options.js";
export type {
  AsyncSqliteMigrationOptions,
  SqliteMigrationProgress,
} from "./session-store/migration-runner.js";
```

### `apps/cli/packages/adapters/src/workflow/index.ts`

继承分类 `upstream-modified`，331 行。导出 8 个声明、0 条 re-export。

```ts
export interface NodeWorkflowStoreOptions {
  rootDir?: string;
}
export interface NodeWorkflowDefinitionStoreOptions {
  definitionsDir?: string;
  rootDir?: string;
}
export class NodeWorkflowStore implements WorkflowStorePort {
  private readonly rootDir: string;

  constructor(options: NodeWorkflowStoreOptions = {});

  async appendEvent(event: WorkflowEvent, options?: { signal?: AbortSignal }): Promise<void>;

  async appendGraphRecord(
    runId: string,
    record: WorkflowGraphRecord,
    options?: { signal?: AbortSignal },
  ): Promise<void>;

  async listRuns(
    options: { cwd?: string; kind?: WorkflowKind; limit?: number } = {},
    signalOptions?: { signal?: AbortSignal },
  ): Promise<WorkflowRunListItem[]>;

  async readEvents(runId: string, options?: { signal?: AbortSignal }): Promise<WorkflowEvent[]>;

  async readLatestRun(
    options: { cwd?: string; kind?: WorkflowKind } = {},
    signalOptions?: { signal?: AbortSignal },
  ): Promise<WorkflowRunSnapshot | null>;

  async readRun(
    runId: string,
    options?: { signal?: AbortSignal },
  ): Promise<WorkflowRunSnapshot | null>;

  async writeArtifact(
    runId: string,
    relativePath: string,
    content: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ path: string; relativePath: string }>;

  async writeReport(
    runId: string,
    content: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ path: string; relativePath: string }>;

  async writeSnapshot(
    snapshot: WorkflowRunSnapshot,
    options?: { signal?: AbortSignal },
  ): Promise<void>;

  private async upsertIndex(snapshot: WorkflowRunSnapshot, signal?: AbortSignal): Promise<void>;

  private async readIndex(signal?: AbortSignal): Promise<WorkflowIndexFile>;

  private eventsPath(runId: string): string;

  private graphPath(runId: string): string;

  private indexPath(): string;

  private runRoot(runId: string): string;

  private snapshotPath(runId: string): string;
}
export function createNodeWorkflowStore(options: NodeWorkflowStoreOptions = {}): WorkflowStorePort;
export class NodeWorkflowDefinitionStore implements WorkflowDefinitionStorePort {
  private readonly definitionsDir: string;

  constructor(options: NodeWorkflowDefinitionStoreOptions = {});

  async listDefinitions(options?: { signal?: AbortSignal }): Promise<WorkflowDefinition[]>;

  async readDefinition(
    definitionId: string,
    options?: { signal?: AbortSignal },
  ): Promise<WorkflowDefinition | null>;

  private definitionPath(definitionId: string): string;
}
export function createNodeWorkflowDefinitionStore(
  options: NodeWorkflowDefinitionStoreOptions = {},
): WorkflowDefinitionStorePort;
export function getDefaultWorkflowRoot(): string;
export function getDefaultWorkflowDefinitionsRoot(): string;
```
