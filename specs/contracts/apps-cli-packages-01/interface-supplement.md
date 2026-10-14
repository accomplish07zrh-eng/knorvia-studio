# apps-cli-packages-01 补充形状名单

用途：`specs/contracts/apps-cli-packages-01/interface.md` 未收录下列文件的形状声明，导致
`similarity.mjs --declaration` 无法剥离其声明块。本文件为该文件提供**补充计分输入**：
声明块被剥离后，残留只应是 import 与注释，用于判断「被继承文件 + 契约形状」是否达标。

用法：

```
node <tool>/scripts/provenance/similarity.mjs --repo <worktree> \
  --candidate apps/cli/packages/adapters/src/storage/workspace-hook-trust-types.ts \
  --upstream-dir <upstream> \
  --interface specs/contracts/apps-cli-packages-01/interface-supplement.md \
  --declaration
```

## `apps/cli/packages/adapters/src/storage/workspace-hook-trust-types.ts`

```ts
export type WorkspaceHookTrustStoreLoadResult =
  | { status: "missing"; records: [] }
  | { status: "ok"; records: WorkspaceHookTrustRecord[] }
  | { status: "corrupt"; records: []; recoveredCorruptPath: string };

export interface FileWorkspaceHookTrustStoreOptions {
  filePath: string;
  now?: () => number;
  lockTimeoutMs?: number;
  staleLockMs?: number;
  beforeRename?: () => void | Promise<void>;
  renameFile?: typeof rename;
  renameRetryDelaysMs?: readonly number[];
  probeProcessStartTime?: (pid: number) => Promise<number | null>;
  writeLockOwnerMetadata?: (handle: FileHandle, content: string) => Promise<void>;
}

export interface WorkspaceHookTrustStoreCompactOptions {
  current: Array<{ workspaceIdentity: string; hookDeclarationDigest: string }>;
  maxAgeMs: number;
  maxRecords: number;
  now?: number;
}

export interface WorkspaceHookTrustStoreRevokeOptions {
  workspaceIdentity: string;
  hookDeclarationDigests?: readonly string[];
}

export interface WorkspaceHookTrustStorePathOptions {
  homeDir?: string;
  userConfigPath?: string;
}
```

约束：字段名与类型属于契约，不得为降低相似度而改名；本名单与源码形状必须保持逐字一致。

## `apps/cli/packages/adapters/src/storage/session-store/migration-progress-types.ts`

```ts
export type SqliteMigrationPhase =
  | "checking"
  | "migrating"
  | "waiting_for_lock"
  | "committing"
  | "ready"
  | "failed";

export interface SqliteMigrationProgress {
  phase: SqliteMigrationPhase;
  elapsedMs: number;
  migration?: DatabaseMigrationFacts;
  migrationId?: string;
  total?: number;
  completed?: number;
  errorCode?: string;
  systemCode?: string;
  sqliteCode?: number;
}

export interface AsyncSqliteMigrationOptions {
  onProgress?: (progress: SqliteMigrationProgress) => Promise<void>;
  lockWaitTimeoutMs?: number;
}
```

## `apps/cli/packages/adapters/src/storage/session-store/repositories/dwf-journal-rows.ts`（类型别名部分）

```ts
export type DwfRunPhysicalStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type DwfRunMetadataRow = Omit<DwfRunRow, "result_json">;
export interface DwfRunTimestamps {
  timeCreated: number;
  timeUpdated: number;
}
export type DwfRunListItem = Omit<RunRecord, "failure" | "result"> & DwfRunTimestamps;
export type DwfRunDetailRow = RunRecord & DwfRunTimestamps;
export type DwfRunSessionRow = DwfRunMetadataRow;
export type DwfRunSessionListItem = DwfRunListItem & Pick<RunRecord, "failure">;
```

## `apps/cli/packages/adapters/src/storage/session-store/repositories/dwf-journal-rows.ts`（行形状部分）

```ts
export interface DwfRunRow {
  args_json: string | null;
  caps_max_concurrency: number;
  cwd: string | null;
  failure_json: string | null;
  id: string;
  name: string | null;
  parent_session_id: string | null;
  result_json: string | null;
  resumed_from: string | null;
  script_hash: string | null;
  script_text: string | null;
  spent_tokens: number;
  status: DwfRunPhysicalStatus;
  time_created: number;
  time_updated: number;
  tool_call_id: string | null;
}

export interface DwfActorRow {
  id: number;
  name: string | null;
  ordinal: number;
  persona_json: string | null;
  resolved_model: string | null;
  run_id: string;
  session_id: string | null;
  site_id: string;
  time_created: number;
  time_updated: number;
}

export interface DwfNodeRow {
  actor_ordinal: number | null;
  actor_seq: number | null;
  actor_site_id: string | null;
  artifact_id: string | null;
  error_json: string | null;
  id: number;
  input_hash: string;
  input_json: string | null;
  kind: NodeKind;
  message_boundary: number | null;
  ordinal: number;
  result_json: string | null;
  run_id: string;
  site_id: string;
  stats_json: string | null;
  status: NodeRecordStatus;
  time_created: number;
  time_updated: number;
}

export interface DwfWorldNodeRow extends Omit<NodeRecord, "result">, DwfRunTimestamps {
  resultBytes?: number;
  resultCount?: number;
  exitCode?: number;
  stdoutBytes?: number;
  stderrBytes?: number;
}

export interface DwfEventRow {
  id: number;
  payload_json: string;
  run_id: string;
  sequence: number;
  time_created: number;
  type: string;
}
```

## `apps/cli/packages/adapters/src/storage/session-store/repositories/script-workflow-rows.ts`

用途：新增的行形状模块在 `interface.md` 中无条目，按本名单剥离声明块后计分（声明模式）。

```ts
export interface WorkflowDefinitionRow {
  enabled: number;
  id: string;
  meta_json: string;
  name: string;
  scope: "builtin" | "explicit" | "project" | "user";
  script_hash: string;
  script_path: string | null;
  source: "builtin" | "user";
  time_created: number;
  time_updated: number;
  trusted: number;
}

export interface WorkflowRunRow {
  args_hash: string | null;
  args_json: string | null;
  budget_spent: number;
  budget_total: number | null;
  current_phase: string | null;
  cwd: string;
  definition_id: string | null;
  failure_json: string | null;
  id: string;
  kind: "script";
  name: string;
  parent_session_id: SessionId | null;
  script_hash: string;
  script_path: string | null;
  stats_json: string | null;
  status: ScriptWorkflowRunStatus;
  time_completed: number | null;
  time_created: number;
  time_started: number | null;
  time_updated: number;
}

export interface WorkflowActivityRow {
  attempt: number;
  call_index: number;
  call_path: string;
  child_session_id: SessionId | null;
  error_json: string | null;
  id: string;
  input_hash: string;
  label: string | null;
  opts_json: string | null;
  parent_activity_id: string | null;
  phase: string | null;
  prompt: string | null;
  result_json: string | null;
  run_id: string;
  status: ScriptWorkflowActivityStatus;
  time_completed: number | null;
  time_created: number;
  time_started: number | null;
  time_updated: number;
  type: ScriptWorkflowActivityRecord["type"];
}

export interface WorkflowEventRow {
  activity_id: string | null;
  id: string;
  payload_json: string | null;
  phase: string | null;
  run_id: string;
  sequence: number;
  time_created: number;
  type: string;
}

export interface SessionTaskLinkRow {
  activity_id: string | null;
  agent_type: string | null;
  child_session_id: SessionId;
  depth: number;
  id: string;
  label: string | null;
  model: string | null;
  parent_link_id: string | null;
  parent_session_id: SessionId | null;
  path: string;
  phase: string | null;
  role: string;
  root_workflow_run_id: string | null;
  status: string;
  time_created: number;
  time_updated: number;
}
```

## `apps/cli/packages/adapters/src/network/proxy-fetch-types.ts`

用途：network 区新增的形状模块，`interface.md` 无条目，按本名单在声明模式下计分。

```ts
export type FetchLike = typeof globalThis.fetch;

export interface ProxyFetchOptionSet {
  caCertFile?: string;
  env?: Record<string, string | undefined>;
  fetch?: FetchLike;
  httpProxy?: string;
  noProxy?: string;
}
```

## `apps/cli/packages/adapters/src/network/http-config-types.ts`

用途：network 区新增的形状模块，`interface.md` 无条目，按本名单在声明模式下计分（本文件仅供内部使用，不改变 http-config.ts 的导出面）。

```ts
export interface NetworkProxyOptions {
  env?: Record<string, string | undefined>;
  httpProxy?: string;
  noProxy?: string;
}

export interface NetworkTlsOptions {
  caCertFile?: string;
  env?: Record<string, string | undefined>;
}

export interface NetworkProxyResolution {
  noProxyMatched: boolean;
  proxySource?: string;
  proxyUrl?: string;
}

export interface BypassRule {
  host: string;
  port?: string;
}
```

## `apps/cli/packages/adapters/src/network/subprocess-env-types.ts`

用途：network 区新增的形状模块，`interface.md` 无条目，按本名单在声明模式下计分；`NetworkEgressEnvPolicy` 由 subprocess-env.ts 原样再导出，`…Options` 仅供内部使用。

```ts
export interface NetworkEgressEnvPolicy {
  caCertFile?: string;
  httpProxy?: string;
  noProxy?: string;
}

export interface NetworkEgressEnvOptions {
  network?: NetworkEgressEnvPolicy;
  platform?: NodeJS.Platform;
  sourceEnv?: Record<string, string | undefined>;
  toolEnvPassthrough?: boolean;
}
```

## `apps/cli/packages/adapters/src/auth/browser-types.ts`

用途：auth 区新增的形状模块，`interface.md` 无条目，按本名单在声明模式下计分；两个接口由 browser.ts 原样再导出，公开面不变。

```ts
export interface BrowserOpenResult {
  command: string;
  opened: boolean;
  reason?: string;
}

export interface BrowserOpenOptions {
  platform?: NodeJS.Platform;
  spawnProcess?: typeof spawn;
  timeoutMs?: number;
}
```

## `apps/cli/packages/adapters/src/auth/shared-credentials-types.ts`

用途：auth 区新增的形状模块，`interface.md` 无条目，按本名单在声明模式下计分；两个接口由 shared-credentials.ts 原样再导出，公开面不变。

```ts
export interface SharedKnorviaCredentialStoreOptions {
  baseDir?: string;
  cipher?: KnorviaCredentialCipher;
  env?: Record<string, string | undefined>;
  filePath?: string;
}

export interface SharedKnorviaCredentialStore {
  readonly filePath: string;
  delete(key: string): Promise<void>;
  deleteIfValue(key: string, expectedValue: string): Promise<boolean>;
  deleteIfValues(
    expectedValues: Readonly<Record<string, string>>,
  ): Promise<Record<string, boolean>>;
  deleteManyIfValue(
    guardKey: string,
    expectedGuardValue: string,
    keysToDelete: readonly string[],
  ): Promise<boolean>;
  load(key: string): Promise<string | null>;
  loadMany(keys: readonly string[]): Promise<Record<string, string | null>>;
  onDidChange?(listener: () => void | Promise<void>): () => void;
  save(key: string, value: string): Promise<void>;
  saveMany(entries: Readonly<Record<string, string>>): Promise<void>;
  saveReplacing(key: string, value: string, replacedKeys: readonly string[]): Promise<void>;
}
```

## `apps/cli/packages/adapters/src/auth/localhost-callback-types.ts`

用途：auth 区新增的形状模块，`interface.md` 无条目，按本名单在声明模式下计分；三个接口由 localhost-callback.ts 原样再导出，公开面不变。

```ts
export type McpOAuthCallbackDeniedCode = "MCP_OAUTH_CALLBACK_DENIED";

export interface McpOAuthCallbackDeniedError extends Error {
  code: McpOAuthCallbackDeniedCode;
  oauthError: string;
  oauthErrorDescription?: string;
}

export interface LocalhostOAuthCallback {
  code: string;
  url: string;
}

export interface LocalhostOAuthCallbackServer {
  callbackPath: string;
  callbackUrl: string;
  close(): Promise<void>;
  waitForCallback(): Promise<LocalhostOAuthCallback>;
}
```

## `apps/cli/packages/adapters/src/http/public-egress-policy-types.ts`

用途：http 区新增的形状模块，`interface.md` 无条目，按本名单在声明模式下计分；`DnsLookupAddress`/`DnsLookup` 由实现文件原样再导出，`Completion`/`PublicEgressLookupOptions` 仅供模块内部使用。

```ts
export type DnsLookupAddress = { address: string; family: number };
export type DnsLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<DnsLookupAddress[]>;

export interface PublicEgressLookupOptions {
  signal?: AbortSignal;
}

export type Completion = (
  error: NodeJS.ErrnoException | null,
  address?: string | DnsLookupAddress[],
  family?: number,
) => void;
```

## `apps/cli/packages/adapters/src/http/client-options-types.ts`

用途：http 区新增的形状模块，`interface.md` 无条目，按本名单在声明模式下计分；接口由 http/index.ts 原样再导出。

```ts
export interface NodeHttpClientAdapterOptions {
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  maxResponseBytes?: number;
  proxyUrl?: string;
  noProxy?: string;
  caCertFile?: string;
  dnsLookup?: DnsLookup;
  capturedUserProxyEnvFallback?: boolean;
}
```

## `apps/cli/packages/adapters/src/mcp/pool-identity-types.ts`

用途：mcp 区新增的形状模块，`interface.md` 无条目，按本名单在声明模式下计分；接口由 pool-identity.ts 与 pool.ts 原样再导出。

```ts
export interface McpConnectionContext {
  mcpConnectionId: string;
  mcpIsolation: "session" | "workspace";
  sessionId?: string;
  workspaceKey?: string;
}
```

## `apps/cli/packages/adapters/src/mcp/oauth-types.ts`

用途：mcp 区新增的形状模块，`interface.md` 无条目，按本名单在声明模式下计分；接口由实现文件原样再导出。

```ts
export interface McpOAuthRuntimeOptions {
  authorizationTimeoutMs?: number;
  credentialStore?: SharedKnorviaCredentialStore;
  onAuthorizationRequired?: (context: McpOAuthAuthorizationContext) => Promise<void> | void;
  openAuthorizationUrl?: (context: McpOAuthAuthorizationContext) => Promise<void> | void;
}
```

## `apps/cli/packages/adapters/src/mcp/oauth-provider-types.ts`

用途：mcp 区新增的形状模块，`interface.md` 无条目，按本名单在声明模式下计分；接口由实现文件原样再导出。

```ts
interface CreateMcpOAuthTokenProviderInput {
  config: McpAuthorizationCodeOAuthConfig;
  credentialStore: SharedKnorviaCredentialStore;
  fetchFn?: FetchLike;
  keyPrefix: string;
  logger?: Logger;
  serverName: string;
  serverUrl: string;
}
```

## `apps/cli/packages/adapters/src/mcp/oauth-shared-types.ts`

用途：mcp 区新增的形状模块，`interface.md` 无条目，按本名单在声明模式下计分；接口由 oauth-shared.ts 原样再导出。

```ts
export interface McpOAuthAuthorizationContext {
  authorizationUrl: string;
  redirectUrl: string;
  serverName: string;
}
```

## `apps/cli/packages/adapters/src/mcp/oauth-error-types.ts`

用途：mcp 区新增的形状模块，`interface.md` 无条目，按本名单在声明模式下计分；导出类型由 oauth-errors.ts 原样再导出。

```ts
export type McpOAuthInteractiveRequiredReason =
  | "no_credentials"
  | "no_refresh_token"
  | "invalid_grant"
  | "invalid_client"
  | "insufficient_scope"
  | "unauthorized"
  | "legacy_provider_seam";

export interface InteractiveAuthorizationTrigger {
  reason: McpOAuthInteractiveRequiredReason;
  requiredScope?: string;
  resourceMetadataUrl?: string;
}

export interface CreateInteractiveAuthorizationErrorInput extends InteractiveAuthorizationTrigger {
  cause?: unknown;
  serverName: string;
}
```

## `apps/cli/packages/adapters/src/mcp/stdio-transport-types.ts`

用途：mcp 区新增的内部形状模块，`interface.md` 无条目，按本名单在声明模式下计分；接口仅供实现模块内部导入，不新增公开导出。

```ts
interface StdioProcessExitInfo {
  exitCode: number | null;
  endedAt: number;
  signal: NodeJS.Signals | null;
  beganAt: number;
}

interface ProcessTreeStdioClientTransportOptions {
  windowsJobObjectFactory?: JobFactory;
}
```

## `apps/cli/packages/adapters/src/mcp/client-state-types.ts`

用途：mcp 区新增的形状模块，`interface.md` 无条目，按本名单在声明模式下计分；导出接口由 client-state.ts 原样再导出。

```ts
export interface CreateMcpAdapterOptions {
  clientName?: string;
  clientVersion?: string;
  connectionContext?: McpConnectionContext;
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
  telemetry?: McpTelemetryTracker;
  mcpOAuth?: McpOAuthRuntimeOptions;
  network?: NetworkEgressEnvPolicy;
  officialMcpAuth?: {
    authHeadersPort?: OfficialMcpAuthHeadersPort;
    trustedOrigins: OfficialMcpTrustedOriginRegistry;
    resolveKnorviaApiOrigin?: () => string;
    workspaceIdentity?: string;
  };
  workingDirectory?: string;
}

export type ProtocolTransport = Parameters<Client["connect"]>[0];
export interface ServerRecord {
  config: McpServerConfig;
  status: McpServerStatus;
  tools: McpToolDescriptor[];
  client?: Client;
  transport?: ProtocolTransport;
  pending?: Promise<McpServerStatus>;
  owner?: AbortController;
}
export interface ConnectionDiagnostic {
  failureKind: McpServerFailureKind;
  serverRequestId?: string;
}
```

## `apps/cli/packages/adapters/src/mcp/client-lifecycle-types.ts`

用途：mcp 区新增的形状模块，`interface.md` 无条目，按本名单在声明模式下计分；接口由 client-lifecycle.ts 原样再导出。

```ts
export interface Establishment {
  name: string;
  config: McpServerConfig;
  generation: number;
  timeoutMs: number;
  started: number;
  connectDurationMs?: number;
  listToolsDurationMs?: number;
  stderr: StderrCapture;
  client?: Client;
  transport?: ProtocolTransport;
  signal?: AbortSignal;
  workingDirectory?: string;
  authorizationAttempted?: boolean;
}
```

## `apps/cli/packages/adapters/src/mcp/process-tree-types.ts`

用途：mcp 区新增的内部形状模块，`interface.md` 无条目，按本名单在声明模式下计分；接口仅供实现模块内部导入，不新增公开导出。

```ts
interface CommandResult {
  error?: unknown;
  status: number | null;
  stderr: string;
  stdout: string;
}

type KillFn = typeof process.kill;
type ExecFileFn = (
  file: string,
  args: readonly string[],
  options: ExecFileOptionsWithStringEncoding,
) => Promise<CommandResult>;

interface TerminatorOptions {
  execFile?: ExecFileFn;
  kill?: KillFn;
  now?: () => number;
  platform?: NodeJS.Platform;
  sleep?: (ms: number) => Promise<void>;
}

const ENUMERATION_TIMEOUT_MS = 1000;
const TASKKILL_TIMEOUT_MS = 2000;
const POLL_INTERVAL_MS = 25;
const FINAL_WAIT_MS = 250;
const GRACE_STAGES = [
  ["SIGINT", 250],
  ["SIGTERM", 750],
] as const;
```

## `apps/cli/packages/adapters/src/mcp/telemetry-types.ts`

用途：mcp 区新增的形状模块，`interface.md` 无条目，按本名单在声明模式下计分；导出类型由 telemetry.ts 原样再导出。

```ts
export interface McpProcessTelemetryIdentity {
  mcpId: string;
  mcpInstanceId: string;
}

export interface McpTrackedProcess {
  pid: number;
  serverName: string;
  mcpSource: McpTelemetrySource;
  pluginName?: string;
}

export interface McpTelemetryTracker {
  acquireOwner(input: { connectionId: string; ownerId: string; sessionId?: string }): void;
  recordSessionStartup(input: {
    configuredCount: number;
    connectedCount: number;
    failedCount: number;
    processCount: number;
    sessionId: string;
  }): void;
  recordProcessCrashed(input: {
    connectionId: string;
    exitCode: number | null;
    signal: string | null;
  }): void;
  recordProcessClosed(input: { connectionId: string }): void;
  recordProcessStarted(input: {
    connectionId: string;
    pid: number;
  }): McpProcessTelemetryIdentity | undefined;
  releaseOwner(input: { connectionId: string; ownerId: string }): void;
  registerConnection(input: {
    connectionId: string;
    isolation: McpTelemetryIsolation;
    serverName: string;
    source?: McpTelemetrySource;
  }): void;
  unregisterConnection(input: { connectionId: string }): void;
  listProcesses(): McpTrackedProcess[];
  sampleNow(): Promise<void>;
  start(): void;
  stop(): void;
}
```

## `apps/cli/packages/adapters/src/mcp/oauth-credentials-types.ts`

用途：mcp 区新增的形状模块，`interface.md` 无条目，按本名单在声明模式下计分；导出类型由 oauth-credentials.ts 原样再导出。

```ts
export interface McpOAuthCanonicalCredentials {
  client_information: OAuthClientInformationMixed;
  expires_at?: number;
  generation?: string;
  issuer?: string;
  obtained_at?: number;
  published_by: string;
  tokens: OAuthTokens;
  version: 1 | typeof MCP_OAUTH_CREDENTIALS_VERSION;
}

export interface CanonicalCredentialSnapshot {
  clientInformation: OAuthClientInformationMixed;
  expiresAt?: number;
  generation: string;
  issuer?: string;
  obtainedAt?: number;
  raw: string;
  tokens: OAuthTokens;
}

interface PublishCanonicalCredentialsInput {
  clientInformation: OAuthClientInformationMixed;
  issuer?: string;
  obtainedAt?: number;
  publishedBy: string;
  tokens: OAuthTokens;
}

interface PublishedCanonicalCredentials {
  canonical: McpOAuthCanonicalCredentials;
  generation: string;
  legacyClientRaw: string;
  legacyTokensRaw: string;
  raw: string;
}

type CanonicalInvalidationScope = "tokens" | "all";

export interface CredentialPairSnapshot {
  clientInformation?: OAuthClientInformationMixed;
  expiresAt?: number;
  generation?: string;
  issuer?: string;
  obtainedAt?: number;
  raw?: string;
  source: "canonical" | "legacy";
  tokens?: OAuthTokens;
}
```

## `apps/cli/packages/adapters/src/mcp/oauth-interactive-types.ts`

用途：mcp 区新增的形状模块，`interface.md` 无条目，按本名单在声明模式下计分；结果联合由实现文件原样再导出，入参接口仅供模块内部使用。

```ts
export type McpInteractiveAuthorizationOutcome =
  | { status: "authorized" }
  | { status: "already-authorized" }
  | { status: "pending"; authorizationUrl?: string }
  | { status: "failed"; error: unknown };

interface McpInteractiveAuthorizationInput {
  adapterInstanceId?: string;
  config: Extract<McpOAuthConfig, { type: "authorization_code" }>;
  credentialStore: SharedKnorviaCredentialStore;
  fetchFn?: FetchLike;
  forceReauthorization?: boolean;
  keyPrefix: string;
  logger?: Logger;
  onAuthorizationRequired?: (context: McpOAuthAuthorizationContext) => Promise<void> | void;
  openAuthorizationUrl?: (context: McpOAuthAuthorizationContext) => Promise<void> | void;
  requestedScope?: string;
  resourceMetadataUrl?: URL;
  serverName: string;
  serverUrl: string;
  signal?: AbortSignal;
  transactionTtlMs?: number;
}
```

## `apps/cli/packages/adapters/src/plugins/atomic-directory-types.ts`

```ts
export interface AtomicDirectoryActivation {
  transactionId: string;
  finalize: () => Promise<void>;
  rollback: () => Promise<void>;
}

export interface AtomicDirectoryActivationInput {
  authorityPath?: string;
  prepare?: (stagedPath: string) => Promise<void>;
  signal?: AbortSignal;
  sourcePath?: string;
  targetPath: string;
}
```

## `apps/cli/packages/adapters/src/plugins/atomic-protocol-types.ts`

```ts
export interface AtomicPaths {
  target: string;
  parent: string;
  marker: string;
  backup: string;
  stagePrefix: string;
}

export interface LegacyAtomicMarker {
  version: 1;
  stageName: string;
}

export interface AtomicMarker {
  version: 2;
  stageName: string;
  transactionId: string;
  ownerId: string;
  ownerPid: number;
  hadTarget: boolean;
  mode: "coordinated" | "standalone";
  authorityPath?: string;
}

export type ReadableAtomicMarker = LegacyAtomicMarker | AtomicMarker;
```

## `apps/cli/packages/adapters/src/plugins/catalog-load-source-types.ts`

```ts
export interface MarketplaceSourceLease {
  manifest: PluginMarketplaceManifest;
  sourceRoot?: string;
  cleanup?: () => Promise<void>;
}
```

## `apps/cli/packages/adapters/src/plugins/catalog-describe-types.ts`

```ts
export interface DescribeMarketplacePluginInput {
  marketplace: string;
  name: string;
  storageRoot: string;
}
```

## `apps/cli/packages/adapters/src/plugins/catalog-install-types.ts`

```ts
export interface InstallMarketplacePluginInput {
  marketplace: string;
  name: string;
  signal?: AbortSignal;
  storageRoot: string;
  scope?: "user" | "workspace";
  allowCrossMarketplaces?: ReadonlySet<string>;
}

export interface UninstallMarketplacePluginInput {
  pluginId: string;
  storageRoot: string;
  removeCache?: boolean;
  keepData?: boolean;
}
```

## `apps/cli/packages/adapters/src/plugins/catalog-refresh-types.ts`

```ts
export interface AddMarketplaceInput {
  expectedId?: string;
  signal?: AbortSignal;
  source: MarketplaceSource;
  storageRoot: string;
  trustedId?: string;
}

export interface EnsureMarketplaceManifestAvailableInput {
  marketplace: string;
  signal?: AbortSignal;
  storageRoot: string;
}

export interface UpdateMarketplaceInput {
  marketplace?: string;
  signal?: AbortSignal;
  storageRoot: string;
}

export interface RemoveMarketplaceInput {
  marketplace: string;
  storageRoot: string;
}
```

## `apps/cli/packages/adapters/src/plugins/catalog-types.ts`

用途：插件目录的纯形状模块（全部为 type/interface、无运行时值），`interface.md` 无条目，按本名单在声明模式下计分；导出形状由 marketplace/catalog 系列实现文件引用，公开面不变。

```ts
export type MarketplaceSource =
  | { source: "url"; url: string; headers?: Record<string, string> }
  | { source: "github"; repo: string; ref?: string; path?: string; sparsePaths?: string[] }
  | { source: "git"; url: string; ref?: string; path?: string; sparsePaths?: string[] }
  | { source: "npm"; package: string }
  | { source: "file"; path: string }
  | { source: "directory"; path: string }
  | { source: "hostPattern"; hostPattern: string }
  | { source: "pathPattern"; pathPattern: string }
  | { source: "settings"; marketplace: PluginMarketplaceManifest };

export interface PluginMarketplaceEntry {
  name: string;
  raw: Record<string, unknown>;
  category?: string;
  description?: string;
  version?: string;
  source?: unknown;
  cachePath?: string;
  dependencies?: string[];
  strict?: boolean;
  tags?: string[];
  listing?: PluginStoreListing;
}

export interface PluginMarketplaceManifest {
  name: string;
  raw: Record<string, unknown>;
  plugins: PluginMarketplaceEntry[];
  description?: string;
  allowCrossMarketplaceDependenciesOn?: string[];
  pluginRoot?: string;
  featured?: string[];
}

export interface MarketplaceRefreshFailure {
  code: PluginDiagnostic["code"];
  failedAt: string;
  message: string;
}

export interface KnownMarketplaceRecord {
  id: string;
  source: MarketplaceSource;
  name: string;
  addedAt: string;
  pluginCount: number;
  description?: string;
  lastUpdated?: string;
  lastRefreshFailure?: MarketplaceRefreshFailure;
  cacheTransactionId?: string;
}

export interface InstalledPluginRecord {
  id: string;
  name: string;
  marketplace: string;
  version: string;
  installPath: string;
  installedAt: string;
  scope: "user" | "workspace";
  updatedAt?: string;
  dependencies?: string[];
  source?: unknown;
  cacheTransactionId?: string;
}

export interface MarketplaceInstallResult {
  closure: string[];
  installed: InstalledPluginRecord[];
}

export interface PluginValidationDiagnostic {
  code: PluginDiagnostic["code"];
  message: string;
  severity: PluginDiagnostic["severity"];
  path?: string;
  pluginId?: string;
}

export interface PluginManifestDisplayMetadata {
  author?: string;
  authorUrl?: string;
  homepage?: string;
  version?: string;
}

export interface DescribeMarketplacePluginResult {
  components: PluginComponentGroup[];
  diagnostics: PluginValidationDiagnostic[];
  metadata?: PluginManifestDisplayMetadata;
}
```
