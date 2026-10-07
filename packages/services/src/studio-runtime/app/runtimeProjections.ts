import type { StudioKernelConfig, StudioKernelId, StudioKernelUsage } from "../kernelTypes.js";
import { STUDIO_KERNEL_IDS } from "../domain/validation.js";
import type {
  StudioInteraction,
  StudioMessage,
  StudioOverview,
  StudioTimeline,
  StudioTurnSnapshot,
} from "../types.js";
import type { StudioRepository, StoredRun } from "./storePort.js";
import { studioRunHistory } from "./runQueries.js";
import { readStudioGroupMetrics } from "./groupMetricsProjection.js";
import { projectWorkspaceReview } from "./workspaceReviewProjection.js";
import type { StudioReviewDraft } from "../workspaceReviewTypes.js";
import { readStudioRunOutcome } from "./runOutcomeProjection.js";
import { readStudioAttention } from "./attentionProjection.js";

/** 只读投影：服务快照与时间线由此组装，不写入任何记录。 */
export function studioKernelConfig(
  db: StudioRepository,
  kernel: StudioKernelId,
): StudioKernelConfig {
  return db.read("config", kernel) ?? { executablePath: "", permission: "ask" };
}

export function studioKernelConfigs(
  db: StudioRepository,
): Record<StudioKernelId, StudioKernelConfig> {
  const custom = db.list<{ id: StudioKernelId }>("config-index", { limit: 10_000 });
  return Object.fromEntries(
    [...new Set([...STUDIO_KERNEL_IDS, ...custom.map((entry) => entry.id)])].map((id) => [
      id,
      studioKernelConfig(db, id),
    ]),
  ) as Record<StudioKernelId, StudioKernelConfig>;
}

export function readStudioOverview(db: StudioRepository): StudioOverview {
  return {
    attention: readStudioAttention(db),
    revision: db.revision(),
    configs: studioKernelConfigs(db),
    conversations: db.list("conversation", { all: true }),
    groups: db.list("group", { all: true }),
    workflows: db.list("workflow", { all: true }),
    // 交付结论是只读派生：overview 不扫描消息记录，因此不枚举工具状态证据（它从不改变结论）。
    runs: studioRunHistory(db).map((run) => ({
      ...publicStudioRun(run),
      outcome: readStudioRunOutcome(db, run),
    })),
  };
}

export function readStudioTimeline(
  db: StudioRepository,
  now: number,
  targetId: string,
  before?: number,
  focusRunId?: string,
): StudioTimeline {
  const messages = db
    .list<StudioMessage>("message", { scope: targetId, limit: 500, before })
    .reverse();
  const history = studioRunHistory(db, targetId);
  const focused = focusRunId
    ? db.read<import("./storePort.js").StoredRun>("run", focusRunId)
    : undefined;
  if (focusRunId && (!focused || focused.targetId !== targetId))
    throw new Error("此运行不属于目标会话");
  if (focused && !history.some((run) => run.id === focused.id)) history.push(focused);
  const turns = history
    .filter((run, index) => index < 10 || run.id === focusRunId)
    .flatMap((run) => db.list<StudioTurnSnapshot>("turn", { scope: run.id, limit: 1000 }));
  const turnSteps = new Map(turns.map((turn) => [turn.id, turn.stepId]));
  const runs = history.map((run) => ({
    ...publicStudioRun(run),
    workspaceStepIds: db
      .list<{ stepId: string }>("workspace-head", { scope: run.id, limit: 10000 })
      .map((item) => item.stepId),
    outcome: readStudioRunOutcome(db, run, { toolMessages: messages, turnSteps }),
  }));
  const latestRun = runs[0];
  const latestTurn = latestRun
    ? db.list<{ id: string }>("turn", { scope: latestRun.id, limit: 1 })[0]
    : undefined;
  const usage = latestTurn ? db.read<StudioKernelUsage>("usage", latestTurn.id) : undefined;
  return {
    revision: db.revision(),
    messages,
    reviewDrafts: db
      .list<StudioReviewDraft & { schema?: number }>("workspace-review-draft", {
        scope: targetId,
        all: true,
      })
      .filter((draft) => draft.schema === 1)
      .map((draft) => projectWorkspaceReview(db, draft)),
    nextBefore: messages.length === 500 ? messages[0]?.sequence : undefined,
    interactions: [
      ...new Map(
        [
          ...db.list<StudioInteraction>("interaction", { scope: targetId, limit: 100 }),
          ...db.list<StudioInteraction>("interaction", {
            scope: targetId,
            limit: 10000,
            pendingInteractionsOnly: true,
          }),
        ].map((item) => [item.id, item]),
      ).values(),
    ],
    runs,
    ...(usage && latestRun && latestTurn
      ? { usage: { ...usage, runId: latestRun.id, turnId: latestTurn.id } }
      : {}),
    ...(latestRun?.kind === "group"
      ? { groupMetrics: readStudioGroupMetrics(db, latestRun, now) }
      : {}),
    turns,
  };
}

function publicStudioRun({ workspaceFeedback: _feedback, ...run }: StoredRun) {
  return run;
}
