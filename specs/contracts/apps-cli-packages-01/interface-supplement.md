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
