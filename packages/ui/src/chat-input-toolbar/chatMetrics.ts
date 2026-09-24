import type { SessionDebugSnapshot, KnorviaContextUsageBreakdownItem } from "@knorvia/shared";
import type { ConversationSnapshot, TurnHeaderRow } from "@knorvia/shared/protocol-v4";
import type { StudioTimeline } from "@knorvia/services";

export interface ChatMetrics {
  rounds: number;
  roundsAtLeast: boolean;
  steps?: number;
  tokensPerSecond?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheHitRate?: number;
  contextUsedTokens?: number;
  contextMaxTokens?: number;
  contextBreakdown?: KnorviaContextUsageBreakdownItem[];
  scope: "session" | "request" | "turn" | "reported";
}

export function metricNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function metricTotal(
  input: number | undefined,
  output: number | undefined,
): number | undefined {
  const left = metricNumber(input);
  const right = metricNumber(output);
  return left !== undefined && right !== undefined ? metricNumber(left + right) : undefined;
}

export function nativeChatMetrics(
  snapshot: ConversationSnapshot,
  debug: { rounds: Readonly<SessionDebugSnapshot["rounds"]> },
): ChatMetrics {
  const headers = snapshot.rows.window.filter(
    (row): row is TurnHeaderRow => row.kind === "turnHeader" && row.executionKind !== "controlOnly",
  );
  const latest = headers.at(-1);
  const rounds = latest
    ? debug.rounds.filter(
        (round) =>
          round.recordedAt >= latest.startedAt &&
          (latest.endedAt === undefined || round.recordedAt <= latest.endedAt),
      )
    : [];
  const usage = snapshot.usage;
  const hasUsage =
    usage.cumulative.inputTokens > 0 ||
    usage.cumulative.outputTokens > 0 ||
    debug.rounds.length > 0;
  const firstObserved = debug.rounds[0];
  const truncatedSteps = Boolean(
    firstObserved &&
    firstObserved.requestIndex > 1 &&
    latest &&
    latest.startedAt < firstObserved.recordedAt,
  );
  return {
    rounds: headers.length,
    roundsAtLeast: snapshot.rows.firstRowId !== snapshot.rows.window[0]?.rowId,
    steps: rounds.length && !truncatedSteps ? rounds.length : undefined,
    tokensPerSecond: metricNumber(rounds.at(-1)?.tokensPerSecond),
    inputTokens: hasUsage ? metricNumber(usage.cumulative.inputTokens) : undefined,
    outputTokens: hasUsage ? metricNumber(usage.cumulative.outputTokens) : undefined,
    cacheHitRate: metricNumber(usage.contextWindow?.cache?.hitRate),
    contextUsedTokens: metricNumber(usage.contextWindow?.usedTokens),
    contextMaxTokens: metricNumber(usage.contextWindow?.maxTokens),
    contextBreakdown: usage.contextWindow?.breakdown,
    scope: "session",
  };
}

export function externalChatMetrics(timeline: StudioTimeline): ChatMetrics {
  const latest = timeline.runs[0];
  const usage = timeline.usage?.runId === latest?.id ? timeline.usage : undefined;
  const inputTokens = metricNumber(usage?.inputTokens);
  const cached = metricNumber(usage?.cacheReadTokens);
  return {
    rounds: timeline.runs.length,
    roundsAtLeast: timeline.runs.length >= 100,
    steps: metricNumber(usage?.modelSteps),
    inputTokens,
    outputTokens: metricNumber(usage?.outputTokens),
    cacheHitRate:
      inputTokens !== undefined && inputTokens > 0 && cached !== undefined && cached <= inputTokens
        ? cached / inputTokens
        : undefined,
    contextUsedTokens: metricNumber(usage?.contextUsedTokens),
    contextMaxTokens: metricNumber(usage?.contextMaxTokens),
    scope: usage?.scope ?? "reported",
  };
}
