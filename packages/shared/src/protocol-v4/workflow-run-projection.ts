import {
  upsertBoundedByArtifactId,
  workflowArtifactSummary,
} from "./workflow-runs-artifacts.js";
import { reduceConcurrencyChanged, withoutCooldown } from "./workflow-runs-concurrency.js";
import { readRunIdField, readWorkflowRunStopReason } from "./workflow-runs-lineage.js";
import { reduceNodeProgress } from "./workflow-runs-node-progress.js";
import { reducePhaseEntered, reduceRunLaunched } from "./workflow-runs-phases.js";
import { reduceRunStarted } from "./workflow-runs-started.js";
import { WORKFLOW_RUNS_LIMITS, type WorkflowRunState } from "./workflow-runs.js";
import { workflowRecord, workflowReference, workflowText } from "./workflow-run-collections.js";
import {
  deriveWorkflowActors,
  projectWorkflowActor,
  projectWorkflowNode,
  workflowNodePhase,
} from "./workflow-run-nodes.js";
import {
  projectWorkflowQuestion,
  projectWorkflowReport,
  removeWorkflowQuestions,
} from "./workflow-run-observations.js";

export interface WorkflowRunDerivedFields {
  actorSessionId?: string;
  toolCallId?: string;
  sequence: number;
}

/** 一次 envelope 的写入 owner；所有 helper 都读这份当前 run，不另保存观察缓存。 */
class WorkflowRunDraft {
  private current: WorkflowRunState;

  constructor(base: WorkflowRunState, private readonly derived: WorkflowRunDerivedFields) {
    this.current = {
      ...base,
      ...(derived.toolCallId && !base.toolCallId ? { toolCallId: derived.toolCallId } : {}),
      lastEventSequence: derived.sequence,
    };
  }

  advance(eventType: string, payload: Record<string, unknown>): WorkflowRunState {
    const run = this.current;
    const phase = workflowNodePhase(eventType);
    if (phase !== undefined) {
      this.current = projectWorkflowNode(run, eventType, phase, payload);
      return this.current;
    }
    switch (eventType) {
      case "run-started":
        this.current = reduceRunStarted(run, payload);
        break;
      case "actor-created":
        this.current = projectWorkflowActor(run, payload, this.derived.actorSessionId);
        break;
      case "node-progress": {
        const ref = workflowReference(payload.instance);
        if (ref) this.current = reduceNodeProgress(run, ref, payload);
        break;
      }
      case "report":
        this.current = projectWorkflowReport(run, payload);
        break;
      case "escalation-raised":
        this.current = projectWorkflowQuestion(run, payload);
        break;
      case "escalation-resolved": {
        const qid = workflowText(payload.qid);
        if (qid !== undefined) this.current = removeWorkflowQuestions(run, qid);
        break;
      }
      case "artifact-published":
        this.publishArtifact(payload);
        break;
      case "usage-updated":
        if (typeof payload.spentTokens === "number") {
          this.current = { ...run, usage: { ...run.usage, spentTokens: payload.spentTokens } };
        }
        break;
      case "concurrency-changed":
        this.current = reduceConcurrencyChanged(run, payload);
        break;
      case "phase-entered":
        this.current = reducePhaseEntered(run, payload);
        break;
      case "run-launched":
        this.current = reduceRunLaunched(run, payload);
        break;
      case "run-settled":
        this.settle(payload);
        break;
      // artifact-failed/log/未知事件只消费 journal 水位，不创建投影卡或工作步数。
      default:
        break;
    }
    return this.current;
  }

  private publishArtifact(payload: Record<string, unknown>): void {
    const summary = workflowArtifactSummary(payload.artifact);
    if (summary === undefined) return;
    const run = this.current;
    const result = upsertBoundedByArtifactId(
      run.artifacts ?? [],
      summary,
      WORKFLOW_RUNS_LIMITS.maxArtifacts,
    );
    this.current = {
      ...run,
      artifacts: result.list,
      ...(result.truncated || run.truncated ? { truncated: true } : {}),
    };
  }

  private settle(payload: Record<string, unknown>): void {
    const status = payload.status;
    const error = workflowRecord(payload.error);
    const message = typeof error?.message === "string" ? error.message : undefined;
    const run = withoutCooldown(removeWorkflowQuestions(this.current));
    const stopReason = status === "stopped" ? readWorkflowRunStopReason(payload.stopReason) : undefined;
    const supersededBy = stopReason === "superseded" ? readRunIdField(payload.supersededBy) : undefined;
    const terminal = status === "completed" || status === "errored" || status === "stopped";
    const resultMessage = terminal
      ? message
      : message ?? `run settled with an unrecognized status: ${String(status)}`;
    // 结算到达必须落终态；旧/未知词不能把 cold replay 留成可取消的 running 卡片。
    this.current = deriveWorkflowActors({
      ...run,
      status: terminal ? status : "errored",
      ...(stopReason === undefined ? {} : { stopReason }),
      ...(supersededBy === undefined ? {} : { supersededBy }),
      ...(resultMessage === undefined
        ? {}
        : { error: resultMessage.slice(0, WORKFLOW_RUNS_LIMITS.maxErrorLength) }),
      ...(payload.resumable === true ? { resumable: true as const } : {}),
    });
  }
}

export function projectWorkflowRun(
  base: WorkflowRunState,
  eventType: string,
  payload: Record<string, unknown>,
  derived: WorkflowRunDerivedFields,
): WorkflowRunState {
  return new WorkflowRunDraft(base, derived).advance(eventType, payload);
}
