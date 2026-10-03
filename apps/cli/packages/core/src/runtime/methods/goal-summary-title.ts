import { traceContextToLogContext } from "../deps.js";
import type { TraceContext } from "../deps.js";
import type { AgentTelemetryCausation } from "@knorvia/contracts";
import type { AgentRuntimeInternal } from "../internal.js";
import {
  GOAL_SUMMARY_TITLE_QUERY_SOURCE,
  generateTitleCandidate,
  normalizeTitleInput,
} from "./title-generation-sidecar.js";

function canGenerate(this: AgentRuntimeInternal, input: string, targetID: string): boolean {
  if (this.config.titleGeneration?.enabled === false) return false;
  if (!this.config.titleGeneration) return false;
  if (!this.sessionStore) return false;
  if (this.config.parentSessionId) return false;
  if (this.config.taskType && this.config.taskType !== "interactive") return false;
  if (!targetID.trim()) return false;
  return normalizeTitleInput(input).length > 0;
}

export function maybeStartGoalSummaryTitleGeneration(
  this: AgentRuntimeInternal,
  input: string,
  targetID: string,
  options?: { traceContext?: TraceContext },
): boolean {
  const traceContext = options?.traceContext ?? this.rootTraceContext;
  if (!canGenerate.call(this, input, targetID)) {
    this.logger?.debug("Goal summary title generation skipped", {
      ...traceContextToLogContext(traceContext),
      event: "goal_summary_title_generation.skipped",
      module: "core.runtime",
      reason: "not_eligible",
      targetId: targetID,
    });
    this.trackResidencyBlockingWork(
      persistFallbackGoalSummaryTitle.call(this, {
        objective: input,
        reason: "generation_not_eligible",
        targetID,
        traceContext,
      }),
    ).catch((error) => {
      this.logger?.warn("Goal summary title fallback persistence failed", {
        ...traceContextToLogContext(traceContext),
        errorMessage: error instanceof Error ? error.message : String(error),
        event: "goal_summary_title_generation.fallback_failed",
        module: "core.runtime",
        status: "failed",
        targetId: targetID,
      });
    });
    return false;
  }

  const causation = this.agentTelemetry.captureCausation();
  const generation = requestGoalTitle
    .call(this, input, targetID, traceContext, causation)
    .catch(async (error) => {
      this.logger?.warn("Goal summary title generation failed", {
        ...traceContextToLogContext(traceContext),
        errorMessage: error instanceof Error ? error.message : String(error),
        event: "goal_summary_title_generation.failed",
        module: "core.runtime",
        status: "failed",
        targetId: targetID,
      });
      await persistFallbackGoalSummaryTitle.call(this, {
        objective: input,
        reason: "model_error",
        targetID,
        traceContext,
      });
    });
  this.trackResidencyBlockingWork(generation).catch((error) => {
    this.logger?.warn("Goal summary title fallback persistence failed", {
      ...traceContextToLogContext(traceContext),
      errorMessage: error instanceof Error ? error.message : String(error),
      event: "goal_summary_title_generation.fallback_failed",
      module: "core.runtime",
      status: "failed",
      targetId: targetID,
    });
  });
  return true;
}

async function requestGoalTitle(
  this: AgentRuntimeInternal,
  input: string,
  targetID: string,
  traceContext: TraceContext,
  causation?: AgentTelemetryCausation,
): Promise<void> {
  const previous = await this.sessionStore?.readTarget({ sessionID: this.sessionId });
  if (!previous || previous.targetID !== targetID) {
    this.logger?.debug("Goal summary title generation skipped", {
      ...traceContextToLogContext(traceContext),
      event: "goal_summary_title_generation.skipped",
      module: "core.runtime",
      reason: "stale_target_before_request",
      targetId: targetID,
    });
    return;
  }
  this.logger?.info("Goal summary title generation started", {
    ...traceContextToLogContext(traceContext),
    event: "goal_summary_title_generation.started",
    module: "core.runtime",
    status: "started",
    targetId: targetID,
  });
  const generated = await generateTitleCandidate.call(this, input, {
    causation,
    querySource: GOAL_SUMMARY_TITLE_QUERY_SOURCE,
    traceContext,
  });
  if (!generated) {
    await persistFallbackGoalSummaryTitle.call(this, {
      objective: input,
      reason: "empty_model_title",
      targetID,
      traceContext,
    });
    return;
  }
  await persistGeneratedGoalSummaryTitle.call(this, {
    targetID,
    title: generated.title,
    traceContext: generated.traceContext,
  });
}

export async function persistGeneratedGoalSummaryTitle(
  this: AgentRuntimeInternal,
  input: { targetID: string; title: string; traceContext: TraceContext },
): Promise<void> {
  const previous = await this.sessionStore?.readTarget({ sessionID: this.sessionId });
  if (!previous || previous.targetID !== input.targetID) {
    this.logger?.debug("Goal summary title generation skipped", {
      ...traceContextToLogContext(input.traceContext),
      event: "goal_summary_title_generation.skipped",
      module: "core.runtime",
      reason: "stale_target_before_write",
      targetId: input.targetID,
    });
    return;
  }
  if (previous.summaryTitle === input.title) {
    this.logger?.debug("Goal summary title generation skipped", {
      ...traceContextToLogContext(input.traceContext),
      event: "goal_summary_title_generation.skipped",
      module: "core.runtime",
      reason: "unchanged_title",
      targetId: input.targetID,
      titleLength: input.title.length,
    });
    return;
  }
  const updated = await this.sessionStore?.updateTargetSummaryTitle({
    sessionID: this.sessionId,
    summaryTitle: input.title,
    targetID: input.targetID,
  });
  if (!updated || updated.targetID !== input.targetID || updated.summaryTitle !== input.title) {
    this.logger?.debug("Goal summary title generation skipped", {
      ...traceContextToLogContext(input.traceContext),
      event: "goal_summary_title_generation.skipped",
      module: "core.runtime",
      reason: "target_changed_during_write",
      targetId: input.targetID,
    });
    return;
  }
  this.logger?.info("Goal summary title generation completed", {
    ...traceContextToLogContext(input.traceContext),
    event: "goal_summary_title_generation.completed",
    module: "core.runtime",
    status: "completed",
    targetId: input.targetID,
    titleLength: input.title.length,
  });
  await this.recordTargetChanged({
    action: "summary_updated",
    previousTarget: previous,
    source: "runtime",
    target: updated,
    traceContext: input.traceContext,
  });
}

export async function persistFallbackGoalSummaryTitle(
  this: AgentRuntimeInternal,
  input: { objective: string; reason: string; targetID: string; traceContext: TraceContext },
): Promise<void> {
  const objective = normalizeTitleInput(input.objective);
  if (!objective) return;
  const title = objective.length <= 100 ? objective : objective.slice(0, 97).trim() + "...";
  const previous = await this.sessionStore?.readTarget({ sessionID: this.sessionId });
  if (!previous || previous.targetID !== input.targetID) {
    this.logger?.debug("Goal summary title fallback skipped", {
      ...traceContextToLogContext(input.traceContext),
      event: "goal_summary_title_generation.fallback_skipped",
      module: "core.runtime",
      reason: "stale_target_before_write",
      targetId: input.targetID,
    });
    return;
  }
  if (previous.summaryTitle?.trim()) {
    this.logger?.debug("Goal summary title fallback skipped", {
      ...traceContextToLogContext(input.traceContext),
      event: "goal_summary_title_generation.fallback_skipped",
      module: "core.runtime",
      reason: "existing_title",
      targetId: input.targetID,
    });
    return;
  }
  const updated = await this.sessionStore?.updateTargetSummaryTitle({
    sessionID: this.sessionId,
    summaryTitle: title,
    targetID: input.targetID,
  });
  if (!updated || updated.targetID !== input.targetID || updated.summaryTitle !== title) {
    this.logger?.debug("Goal summary title fallback skipped", {
      ...traceContextToLogContext(input.traceContext),
      event: "goal_summary_title_generation.fallback_skipped",
      module: "core.runtime",
      reason: "target_changed_during_write",
      targetId: input.targetID,
    });
    return;
  }
  this.logger?.info("Goal summary title fallback persisted", {
    ...traceContextToLogContext(input.traceContext),
    event: "goal_summary_title_generation.fallback_persisted",
    module: "core.runtime",
    reason: input.reason,
    status: "completed",
    targetId: input.targetID,
    titleLength: title.length,
  });
  await this.recordTargetChanged({
    action: "summary_updated",
    previousTarget: previous,
    source: "runtime",
    target: updated,
    traceContext: input.traceContext,
  });
}
