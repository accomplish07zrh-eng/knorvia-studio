// SPDX-License-Identifier: Apache-2.0
// 流恢复的预算与尝试记账：计数只增不减（同一回合状态非并发安全），busy 判定沿错误 cause 链
// 下钻（含环检测）。Start Plan 系供应商的准入退避按下标取档，耗尽错误的形状逐字钉死。
type FaultFields = Record<string, unknown>;

/** 重试上限档位（短别名）。 */
type RetryCeiling = number;

/** 第几次尝试（短别名）。 */
type AttemptOrdinal = number;

/** 供应商标识（短别名）。 */
type ProviderTag = string;

/** 回合序号（短别名）。 */
type TurnOrdinal = number;

/** 对外错误形状：名字/错误码/context 三件套。 */
type ExposedError = Error & { code: string; context: FaultFields };

/** 恢复重试上限（逐字常量）。 */
export const STREAM_RECOVERY_MAX_RETRIES = 10;

/** Start Plan 主回合准入退避档（逐字常量，下标 = 已消耗的尝试数）。 */
export const START_PLAN_BUSY_ADMISSION_DELAYS_MS = [1_000, 2_000] as const;

/** cause 链遍历深度上限（含环检测；从顶层起至多 7 个记录）。 */
export const MAX_ERROR_CAUSE_DEPTH = 6;

/** busy 判定命中的供应商错误码（逐字）。 */
const BUSY_PROVIDER_CODES = new Set(["3008", "3009", "3010"]);

/** 耗尽错误的固定文案（逐字，取值不变）。 */
export const BUSY_EXHAUSTED_TEXT =
  "Start Plan is busy and automatic model stream recovery reached the maximum retry count.";

/** 耗尽错误的名字与错误码（逐字常量）。 */
const BUSY_EXHAUSTED_ERROR_NAME = "StartPlanBusyAutoRetryExhaustedError";
const RATE_LIMITED_CODE = "model_rate_limited";

/** 耗尽错误未命中 busy 码时的兜底供应商码。 */
const FALLBACK_BUSY_CODE = "3010";

/** 有资格走 Start Plan 准入退避的供应商（逐字）。 */
const START_PLAN_PROVIDER_IDS = new Set(["account:bigmodel-start-plan", "account:zai-start-plan"]);

/** 尝试记账结果。 */
export interface RecoveryAttempt {
  /** 预算上限（档数）。 */
  maxRetries: RetryCeiling;
  /** 本次序号（从 1 起）。 */
  retryNumber: AttemptOrdinal;
}

/** 回合恢复计数的最小视图。 */
export interface RecoveryBudgetState {
  /** 已消耗的恢复尝试数。 */
  streamRecoveryRetryCount: AttemptOrdinal;
}

/** 计数 +1 的纯步进（集中一处，避免散落的自增语义漂移）。 */
const steppedCount = (current: AttemptOrdinal): AttemptOrdinal => current + 1;

/** 预算是否还有余量。 */
export const hasStreamRecoveryBudget = (state: RecoveryBudgetState): boolean =>
  state.streamRecoveryRetryCount < STREAM_RECOVERY_MAX_RETRIES;

/** 消耗一次恢复预算并返回尝试信息。 */
export const beginStreamRecoveryAttempt = (state: RecoveryBudgetState): RecoveryAttempt => {
  const ordinal = steppedCount(state.streamRecoveryRetryCount);
  state.streamRecoveryRetryCount = ordinal;
  const attempt = {} as RecoveryAttempt;
  attempt.maxRetries = STREAM_RECOVERY_MAX_RETRIES;
  attempt.retryNumber = ordinal;
  return attempt;
};

/** 消耗一次 Start Plan 准入退避预算（档数 = 退避表长度）。 */
export const beginStartPlanBusyAdmissionRetryAttempt = (
  state: RecoveryBudgetState,
): RecoveryAttempt => {
  const ordinal = steppedCount(state.streamRecoveryRetryCount);
  state.streamRecoveryRetryCount = ordinal;
  const attempt = {} as RecoveryAttempt;
  attempt.maxRetries = START_PLAN_BUSY_ADMISSION_DELAYS_MS.length;
  attempt.retryNumber = ordinal;
  return attempt;
};

const asFields = (value: unknown): FaultFields | undefined =>
  typeof value === "object" && value !== null ? (value as FaultFields) : undefined;

const readableString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

/** 沿 cause 链迭代记录（含环检测与深度上限）。 */
function* causeChain(error: unknown): IterableIterator<FaultFields> {
  const walked = new Set<FaultFields>();
  let cursor = error;
  let depth = 0;
  while (depth <= MAX_ERROR_CAUSE_DEPTH) {
    const record = asFields(cursor);
    if (record === undefined || walked.has(record)) return;
    walked.add(record);
    yield record;
    cursor = record.cause;
    depth += 1;
  }
}

/** 记录的供应商码（字段优先级：providerCode → context.providerCode → code → context.code）。 */
const providerCodeOf = (record: FaultFields): string | undefined => {
  const context = asFields(record.context);
  return (
    readableString(record.providerCode) ??
    readableString(context?.providerCode) ??
    readableString(record.code) ??
    readableString(context?.code)
  );
};

const isBusyCode = (code: string | undefined): boolean =>
  code !== undefined && BUSY_PROVIDER_CODES.has(code);

/** busy 判定：链上任一记录命中 busy 码即真。 */
export function isBusyFailure(error: unknown): boolean {
  for (const record of causeChain(error)) {
    if (isBusyCode(providerCodeOf(record))) return true;
  }
  return false;
}

/** Error 入参才挂 cause（非 Error 归 undefined）。 */
const asErrorCause = (fault: unknown): Error | undefined =>
  fault instanceof Error ? fault : undefined;

/** 耗尽错误构造：链上首个 busy 码进 context，未命中回兜底码；Error 入参挂 cause。 */
export function buildBusyExhaustedError(error: unknown): Error {
  let selectedCode = FALLBACK_BUSY_CODE;
  for (const record of causeChain(error)) {
    const candidate = providerCodeOf(record);
    if (isBusyCode(candidate)) {
      selectedCode = candidate as string;
      break;
    }
  }
  const built = new Error(BUSY_EXHAUSTED_TEXT, { cause: asErrorCause(error) }) as ExposedError;
  built.name = BUSY_EXHAUSTED_ERROR_NAME;
  built.code = RATE_LIMITED_CODE;
  const context: FaultFields = {};
  context.providerCode = selectedCode;
  context.reason = "rate_limited";
  context.retryable = false;
  context.startPlanBusyAutoRetryExhausted = true;
  built.context = context;
  return built;
}

/** 准入退避取档：回合号、供应商、busy 判定三条件齐才给值，越界回 undefined。 */
export function busyAdmissionDelayMs(input: {
  error: unknown;
  providerId: ProviderTag;
  state: RecoveryBudgetState;
  turnNumber: TurnOrdinal;
}): number | undefined {
  const { error, providerId, state, turnNumber } = input;
  if (!(turnNumber > 0)) return undefined;
  if (!START_PLAN_PROVIDER_IDS.has(providerId)) return undefined;
  if (!isBusyFailure(error)) return undefined;
  return START_PLAN_BUSY_ADMISSION_DELAYS_MS[state.streamRecoveryRetryCount];
}
