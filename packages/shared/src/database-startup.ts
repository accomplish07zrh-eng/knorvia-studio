// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

/** 错误码是跨进程协议的一部分：新增值要同时更新 Host 与 UI 的提示表。 */
const ERROR_CODE_TABLE = {
  storageFull: "storage_full",
  permissionDenied: "permission_denied",
  ioError: "io_error",
  outOfMemory: "out_of_memory",
  corrupt: "corrupt",
  openFailed: "open_failed",
  lockTimeout: "lock_timeout",
  checksumMismatch: "checksum_mismatch",
  newerDatabase: "newer_database",
  backupFailed: "backup_failed",
  sqlFailed: "sql_failed",
  startupStatusTimeout: "startup_status_timeout",
  transportClosed: "transport_closed",
  unsupportedRuntime: "unsupported_runtime",
} as const;

type ErrorCodeValue = (typeof ERROR_CODE_TABLE)[keyof typeof ERROR_CODE_TABLE];

export const databaseStartupErrorCodeSchema = z.enum(
  Object.values(ERROR_CODE_TABLE) as [ErrorCodeValue, ...ErrorCodeValue[]],
);

export type DatabaseStartupErrorCode = z.output<typeof databaseStartupErrorCodeSchema>;

const PHASE_VALUES = {
  starting: "starting",
  preparingHost: "preparing_host_storage",
  preparingSession: "preparing_session_storage",
  startingServices: "starting_services",
  ready: "ready",
  failed: "failed",
} as const;

type PhaseValue = (typeof PHASE_VALUES)[keyof typeof PHASE_VALUES];

export const databaseStartupPhaseSchema = z.enum(
  Object.values(PHASE_VALUES) as [PhaseValue, ...PhaseValue[]],
);

/** cause 链可能被日志包装多次；限制深度并防环，避免病态错误图拖垮分类。 */
const CAUSE_LIMIT = 12;

type ErrorNode = {
  code?: unknown;
  errcode?: unknown;
  kind?: unknown;
  cause?: unknown;
};

const asErrorNode = (value: unknown): ErrorNode | undefined =>
  typeof value === "object" && value !== null ? (value as ErrorNode) : undefined;

/** 遍历 cause 链；回调返回 true 时提前结束。 */
function walkCauseChain(start: unknown, visit: (node: ErrorNode) => boolean): void {
  const visited = new Set<unknown>();
  let cursor: unknown = start;
  for (let step = 0; step < CAUSE_LIMIT; step += 1) {
    const node = asErrorNode(cursor);
    if (node === undefined || visited.has(cursor) || visited.size >= CAUSE_LIMIT) return;
    visited.add(cursor);
    if (visit(node)) return;
    cursor = node.cause;
  }
}

/** errcode 的低 8 位是 sqlite 主错误码；高位是扩展码，不参与分类。 */
const primarySqliteCode = (node: ErrorNode): number | undefined =>
  typeof node.errcode === "number" ? node.errcode & 0xff : undefined;

type SystemCodeMap = Partial<Record<string, ErrorCodeValue>>;

/** 系统错误名与 sqlite 主码都指向同一组结论；用两张映射替代线性规则表。 */
const SQLITE_CODE_MAP: Partial<Record<number, DatabaseStartupErrorCode>> = {
  13: ERROR_CODE_TABLE.storageFull,
  3: ERROR_CODE_TABLE.permissionDenied,
  8: ERROR_CODE_TABLE.permissionDenied,
  10: ERROR_CODE_TABLE.ioError,
  7: ERROR_CODE_TABLE.outOfMemory,
  11: ERROR_CODE_TABLE.corrupt,
  26: ERROR_CODE_TABLE.corrupt,
};

const SYSTEM_CODE_MAP: SystemCodeMap = {
  ENOSPC: ERROR_CODE_TABLE.storageFull,
  EDQUOT: ERROR_CODE_TABLE.storageFull,
  EACCES: ERROR_CODE_TABLE.permissionDenied,
  EPERM: ERROR_CODE_TABLE.permissionDenied,
  EIO: ERROR_CODE_TABLE.ioError,
  ENOMEM: ERROR_CODE_TABLE.outOfMemory,
  ERR_WORKER_OUT_OF_MEMORY: ERROR_CODE_TABLE.outOfMemory,
};

const FALLBACK_SQLITE_MAP: Partial<Record<number, DatabaseStartupErrorCode>> = {
  14: ERROR_CODE_TABLE.openFailed,
  5: ERROR_CODE_TABLE.lockTimeout,
};

function directVerdict(node: ErrorNode): DatabaseStartupErrorCode | undefined {
  const bySqlite = SQLITE_CODE_MAP[primarySqliteCode(node) ?? -1];
  if (bySqlite !== undefined) return bySqlite;
  if (typeof node.code !== "string") return undefined;
  return SYSTEM_CODE_MAP[node.code];
}

function fallbackVerdict(node: ErrorNode, current: DatabaseStartupErrorCode) {
  const fallback = FALLBACK_SQLITE_MAP[primarySqliteCode(node) ?? -1];
  const kind = databaseStartupErrorCodeSchema.safeParse(node.kind);
  if (kind.success && kind.data !== ERROR_CODE_TABLE.sqlFailed) return kind.data;
  return fallback ?? current;
}

/** 原始结构化 cause 比外层通用包装更准确；禁止从错误文案推断满盘或 OOM。 */
export const classifyDatabaseStartupError = (error: unknown): DatabaseStartupErrorCode => {
  let fallback: DatabaseStartupErrorCode = ERROR_CODE_TABLE.sqlFailed;
  let decided: DatabaseStartupErrorCode | undefined;
  walkCauseChain(error, (node) => {
    const direct = directVerdict(node);
    if (direct !== undefined) {
      decided = direct;
      return true;
    }
    fallback = fallbackVerdict(node, fallback);
    return false;
  });
  return decided ?? fallback;
};

const SYSTEM_CODE_PATTERN = /^[A-Z_0-9]{1,64}$/;
const MIGRATION_ID_PATTERN = /^[a-zA-Z_0-9-]{1,128}$/;

type ErrorDetails = {
  sqliteCode?: number;
  systemCode?: string;
  migrationId?: string;
};

/** 三个可选字段共享「沿链取最后一个合法值」的规则，只是合法性判定不同。 */
const DETAIL_READERS: ReadonlyArray<readonly [keyof ErrorDetails, (value: unknown) => unknown]> = [
  ["sqliteCode", (value) => (Number.isSafeInteger(value) ? value : undefined)],
  [
    "systemCode",
    (value) => (typeof value === "string" && SYSTEM_CODE_PATTERN.test(value) ? value : undefined),
  ],
  [
    "migrationId",
    (value) => (typeof value === "string" && MIGRATION_ID_PATTERN.test(value) ? value : undefined),
  ],
];

/**
 * 沿 cause 链保留最后一个合法值：更内层的原因通常更接近真实失败点，
 * 但外层也可能是唯一带迁移 ID 的一层，因此合法值互相覆盖而不是合并。
 */
export function databaseStartupErrorDetails(error: unknown): ErrorDetails {
  const details: Record<string, unknown> = {};
  walkCauseChain(error, (node) => {
    const source = node as ErrorNode & { migrationId?: unknown; systemCode?: unknown };
    const values: Record<string, unknown> = {
      sqliteCode: typeof node.errcode === "number" ? node.errcode : undefined,
      systemCode: node.code,
      migrationId: source.migrationId,
    };
    for (const [field, isValid] of DETAIL_READERS) {
      const accepted = isValid(values[field]);
      if (accepted !== undefined) details[field] = accepted;
    }
    return false;
  });
  return details as ErrorDetails;
}

const optionalDetailFields = () => ({
  sqliteCode: z.number().int().optional(),
  systemCode: z.string().max(64).optional(),
  migrationId: z.string().max(128).optional(),
});

export const databaseStartupErrorDetailsSchema = z.object(optionalDetailFields());

const nullableBytes = () => z.number().finite().nonnegative().nullable();

export const startupDiskSummarySchema = z
  .object({
    scopeId: z.string().max(128),
    observedAvailableDropPeakBytes: nullableBytes(),
    minAvailableBytes: nullableBytes(),
    quality: z.enum(["complete", "partial", "unknown"]),
    sampledAt: nullableBytes(),
  })
  .strict();

export type StartupDiskSummary = z.output<typeof startupDiskSummarySchema>;

export const databaseMigrationIdSchema = z.string().regex(MIGRATION_ID_PATTERN);

const nonNegativeInt = () => z.number().int().nonnegative();

const migrationFactsFields = () => ({
  kind: z.enum(["none", "initialize", "upgrade"]),
  executedCount: nonNegativeInt(),
  committedCount: nonNegativeInt(),
  // null 表示锁内账本为空；缺失表示尚未取得可信起点。
  lastAppliedMigrationId: databaseMigrationIdSchema.nullable().optional(),
});

/** 需求种类与真实执行/提交分开；预检发现需求不意味着当前执行者运行过 SQL。 */
export const databaseMigrationFactsSchema = z
  .object(migrationFactsFields())
  .strict()
  .refine(
    (facts) =>
      facts.committedCount <= facts.executedCount &&
      (facts.kind !== "none" || facts.executedCount === 0),
    { message: "Invalid migration execution facts" },
  );

export type DatabaseMigrationFacts = z.output<typeof databaseMigrationFactsSchema>;

const baselineFields = () => ({
  databaseId: z.string().min(1).max(128),
  databaseKind: z.enum(["tasks-index", "session"]),
  lastAppliedMigrationId: databaseMigrationIdSchema.nullable().optional(),
});

const migrationBaselineSchema = z.object(baselineFields()).strict();

const boundedId = () => z.string().min(1).max(128);

const DATABASE_PHASES = [
  "checking",
  "waiting_for_lock",
  "migrating",
  "committing",
  "maintaining",
  "ready",
] as const;

const stateBaseFields = () => ({
  schemaVersion: z.literal(1),
  startupId: boundedId(),
  attemptId: boundedId(),
  sequence: nonNegativeInt(),
  startedAt: z.number().finite().nonnegative(),
  updatedAt: z.number().finite().nonnegative(),
  phase: databaseStartupPhaseSchema,
  databasePhase: z.enum(DATABASE_PHASES).optional(),
  migration: databaseMigrationFactsSchema.optional(),
  currentMigration: databaseMigrationFactsSchema.optional(),
  migrationBaselines: z.array(migrationBaselineSchema).optional(),
  finalDatabase: z.boolean().optional(),
  failedPhase: databaseStartupPhaseSchema.optional(),
  errorCode: databaseStartupErrorCodeSchema.optional(),
});

export const databaseStartupStateSchema = z
  .object({
    ...stateBaseFields(),
    ...optionalDetailFields(),
    disk: z.array(startupDiskSummarySchema).max(8),
  })
  .strict();

export type DatabaseStartupState = z.output<typeof databaseStartupStateSchema>;

/** 本地端口和启动快照必须来自同一 Host；此 ID 不承担工作区或任务身份。 */
export const databaseStartupPortPayloadSchema = z
  .object({ databaseStartupId: boundedId() })
  .strict();

const controlVariants = () =>
  [
    z.object({ action: z.literal("snapshot") }).strict(),
    z.object({ action: z.literal("exit") }).strict(),
    z.object({ action: z.literal("retry"), attemptId: boundedId() }).strict(),
  ] as const;

export const databaseStartupControlSchema = z.discriminatedUnion("action", controlVariants());

export type DatabaseStartupControl = z.output<typeof databaseStartupControlSchema>;

/** 这些失败重开后恢复：已部分装配服务或底层状态不可用，重试只会重复副作用。 */
const NON_RETRYABLE_CODES: ReadonlySet<string> = new Set([
  ERROR_CODE_TABLE.corrupt,
  ERROR_CODE_TABLE.checksumMismatch,
  ERROR_CODE_TABLE.newerDatabase,
  ERROR_CODE_TABLE.transportClosed,
  ERROR_CODE_TABLE.startupStatusTimeout,
  ERROR_CODE_TABLE.unsupportedRuntime,
]);

/** 迁移可手动重试；已部分装配服务或损坏/失联时通过退出重开恢复。 */
export const canRetryDatabaseStartup = (
  state: Pick<DatabaseStartupState, "phase" | "failedPhase" | "errorCode">,
): boolean => {
  if (state.phase !== PHASE_VALUES.failed) return false;
  if (state.failedPhase === PHASE_VALUES.startingServices) return false;
  const code = state.errorCode ?? ERROR_CODE_TABLE.sqlFailed;
  return !NON_RETRYABLE_CODES.has(String(code));
};
