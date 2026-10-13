// SPDX-License-Identifier: Apache-2.0
// 失败归类与恢复建议：把任意抛出物归一成 WorkflowFailure 的 kind/code/retryable，并给出可展示的
// 恢复动作。分类规则集中在两张表里（核心错误类型表 + 文本线索表），避免长的分支链。
import {
  CoreErrorType,
  isCoreError,
  type ExpertWorkflowRunSnapshot,
  type WorkflowActivitySnapshot,
  type WorkflowFailure,
  type WorkflowRecoveryAction,
} from "@knorvia/contracts";

const MAX_CHAIN_DEPTH = 8;

/** 核心错误类型 → 失败类别（类别名是协议值，不可改动）。 */
const CORE_ERROR_KINDS: ReadonlyMap<CoreErrorType, WorkflowFailure["kind"]> = new Map([
  [CoreErrorType.ModelContextExceeded, "model_context"],
  [CoreErrorType.ModelRateLimited, "rate_limit"],
  [CoreErrorType.ModelTimeout, "timeout"],
  [CoreErrorType.PermissionDenied, "permission"],
  [CoreErrorType.PermissionTimeout, "permission"],
  [CoreErrorType.ToolExecutionFailed, "tool"],
  [CoreErrorType.ToolTimeout, "tool"],
  [CoreErrorType.ToolMaxCalls, "tool"],
  [CoreErrorType.ConfigurationError, "configuration"],
  [CoreErrorType.TurnCancelled, "cancelled"],
]);

/** 文本线索 → 失败类别；按表内顺序优先匹配。 */
const TEXT_KIND_HINTS: readonly (readonly [clue: string, kind: WorkflowFailure["kind"]])[] = [
  ["rate", "rate_limit"],
  ["timeout", "timeout"],
  ["context", "model_context"],
  ["auth", "auth"],
  ["not_configured", "auth"],
  ["permission", "permission"],
  ["tool", "tool"],
  ["network", "network"],
  ["proxy", "network"],
  ["tls", "network"],
  ["provider", "provider"],
  ["model_request_failed", "provider"],
];

/** 这几类失败不该被自动重试。 */
const NON_RETRYABLE_KINDS: ReadonlySet<WorkflowFailure["kind"]> = new Set([
  "auth",
  "cancelled",
  "configuration",
]);

const asRecord = (candidate: unknown): Record<string, unknown> =>
  candidate !== null && typeof candidate === "object" ? (candidate as Record<string, unknown>) : {};

const asText = (candidate: unknown): string => (typeof candidate === "string" ? candidate : "");

/** 沿 cause 链收集抛出物，最多 8 层并去重（自引用链不能无限展开）。 */
function errorChain(thrown: unknown): unknown[] {
  const chain: unknown[] = [];
  const visited = new WeakSet<object>();
  let node: unknown = thrown;
  for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth += 1) {
    if (node === null || node === undefined) break;
    chain.push(node);
    if (typeof node !== "object") break;
    if (visited.has(node)) break;
    visited.add(node);
    node = (node as { cause?: unknown }).cause;
  }
  return chain;
}

/** 单个抛出物的归类；无法归类时返回 undefined，由调用方继续看下一层。 */
function classify(entry: unknown): WorkflowFailure["kind"] | undefined {
  if (isCoreError(entry)) {
    const known = CORE_ERROR_KINDS.get(entry.type);
    if (known !== undefined) return known;
  }
  const record = asRecord(entry);
  const context = asRecord(record.context);
  const clue = [asText(record.code), asText(record.type), asText(record.reason ?? context.reason)]
    .join(" ")
    .toLowerCase();
  if (clue.trim() === "") return undefined;
  for (const [needle, kind] of TEXT_KIND_HINTS) {
    if (clue.includes(needle)) return kind;
  }
  return undefined;
}

function failureKind(thrown: unknown): WorkflowFailure["kind"] {
  for (const entry of errorChain(thrown)) {
    const kind = classify(entry);
    if (kind !== undefined) return kind;
  }
  return "unknown";
}

function failureCode(thrown: unknown): string | undefined {
  for (const entry of errorChain(thrown)) {
    const code = asText(asRecord(entry).code || asRecord(entry).type);
    if (code !== "") return code;
  }
  return undefined;
}

/** 显式 retryable 字段优先；否则按类别判断，默认可重试。 */
function isRetryable(kind: WorkflowFailure["kind"], thrown: unknown): boolean {
  if (NON_RETRYABLE_KINDS.has(kind)) return false;
  for (const entry of errorChain(thrown)) {
    const record = asRecord(entry);
    if (typeof record.retryable === "boolean") return record.retryable;
    const context = asRecord(record.context);
    if (typeof context.retryable === "boolean") return context.retryable;
  }
  return true;
}

const scopeEntries = (source: {
  activityId?: string;
  nodeId?: string;
  phase?: string;
  sessionId?: string;
  traceId?: string;
  turnId?: string;
}): Record<string, unknown> =>
  Object.fromEntries(
    [
      ["activityId", source.activityId],
      ["nodeId", source.nodeId],
      ["phase", source.phase],
      ["sessionId", source.sessionId],
      ["traceId", source.traceId],
      ["turnId", source.turnId],
    ].filter(([, value]) => Boolean(value)),
  );

export function latestWorkflowActivity(
  input: ExpertWorkflowRunSnapshot,
): WorkflowActivitySnapshot | undefined {
  for (let index = input.activities.length - 1; index >= 0; index -= 1) {
    const activity = input.activities[index];
    if (activity === undefined) continue;
    const isRelevant =
      activity.status === "failed" ||
      activity.status === "active" ||
      activity.phase === input.currentPhase;
    if (isRelevant) return activity;
  }
  return undefined;
}

export function workflowFailureFromError(
  thrown: unknown,
  summary: string,
  source?: WorkflowActivitySnapshot,
): WorkflowFailure {
  const kind = failureKind(thrown);
  const code = failureCode(thrown);
  const scope = source === undefined ? {} : scopeEntries(source);
  return {
    ...scope,
    ...(code === undefined ? {} : { code }),
    kind,
    message: summary,
    recoverable: kind !== "cancelled",
    retryable: isRetryable(kind, thrown),
  } as WorkflowFailure;
}

export function workflowRecoveryActions(record: WorkflowFailure): WorkflowRecoveryAction[] {
  const scope = scopeEntries(record);
  const choices: readonly (readonly [WorkflowRecoveryAction["action"], string, boolean])[] = [
    ["retry", "Retry", false],
    ["retry_with_current_model", "Retry with current model", false],
    ["cancel", "Cancel workflow", true],
  ];
  return choices.map(([action, label, destructive]) => ({
    action,
    label,
    ...(destructive ? { destructive: true } : {}),
    ...scope,
  })) as WorkflowRecoveryAction[];
}
