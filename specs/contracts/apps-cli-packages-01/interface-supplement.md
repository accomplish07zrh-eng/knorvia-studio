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
