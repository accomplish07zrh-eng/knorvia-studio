import { serializeWorkflowArtifact } from "./workflow-artifact.js";
import { countTaggedReport } from "./workflow-runs-artifacts.js";
import {
  WORKFLOW_RUNS_LIMITS,
  type WorkflowRunPendingQuestion,
  type WorkflowRunReport,
  type WorkflowRunState,
} from "./workflow-runs.js";
import {
  BoundedWorkflowRows,
  sameWorkflowInstance,
  workflowPreview,
  workflowReference,
  workflowText,
  type WorkflowInstanceIdentity,
} from "./workflow-run-collections.js";

export function projectWorkflowReport(
  run: WorkflowRunState,
  payload: Record<string, unknown>,
): WorkflowRunState {
  const ref = workflowReference(payload.instance);
  if (!ref) return run;
  const artifactId = workflowText(payload.artifactId);
  const report: WorkflowRunReport = {
    siteId: ref.siteId,
    ordinal: ref.ordinal,
    preview: workflowPreview(
      serializeWorkflowArtifact(payload.item) ?? "",
      WORKFLOW_RUNS_LIMITS.maxReportPreviewLength,
    ),
    ...(artifactId === undefined ? {} : { artifactId }),
  };
  const table = new BoundedWorkflowRows<WorkflowRunReport, WorkflowInstanceIdentity>(
    run.reports ?? [],
    WORKFLOW_RUNS_LIMITS.maxReports,
    (row) => row,
    sameWorkflowInstance,
  );
  const result = table.write(report);
  // 新身份即使被展示 cap 拒收，也沿用既有 tag 计数政策；不能让表预算改引擎事实。
  const artifacts =
    artifactId !== undefined && result.newIdentity
      ? countTaggedReport(run.artifacts, artifactId)
      : run.artifacts;
  return {
    ...run,
    reports: result.rows,
    ...(artifacts === undefined ? {} : { artifacts }),
    ...(result.overflow || run.truncated ? { truncated: true } : {}),
  };
}

export function projectWorkflowQuestion(
  run: WorkflowRunState,
  payload: Record<string, unknown>,
): WorkflowRunState {
  const qid = workflowText(payload.qid);
  const question = workflowText(payload.question);
  if (qid === undefined || question === undefined) return run;
  const actor = workflowReference(payload.actor);
  const actorName = workflowText(payload.actorName)?.slice(0, WORKFLOW_RUNS_LIMITS.maxActorNameLength);
  const context = workflowText(payload.context);
  const askedAt =
    typeof payload.askedAt === "number" && Number.isFinite(payload.askedAt) ? payload.askedAt : undefined;
  const pending: WorkflowRunPendingQuestion = {
    qid,
    ...(actor ? { actorSiteId: actor.siteId, actorOrdinal: actor.ordinal } : {}),
    ...(actorName === undefined ? {} : { actorName }),
    question: workflowPreview(question, WORKFLOW_RUNS_LIMITS.maxQuestionLength),
    ...(context === undefined
      ? {}
      : { context: workflowPreview(context, WORKFLOW_RUNS_LIMITS.maxQuestionLength) }),
    ...(askedAt === undefined ? {} : { askedAt }),
  };
  const table = new BoundedWorkflowRows<WorkflowRunPendingQuestion, string>(
    run.pendingQuestions ?? [],
    WORKFLOW_RUNS_LIMITS.maxPendingQuestions,
    (row) => row.qid,
    (left, right) => left === right,
  );
  const result = table.write(pending);
  return {
    ...run,
    pendingQuestions: result.rows,
    ...(result.overflow || run.truncated ? { truncated: true } : {}),
  };
}

export function removeWorkflowQuestions(run: WorkflowRunState, qid?: string): WorkflowRunState {
  const current = run.pendingQuestions;
  if (current === undefined) return run;
  const remaining = current.filter((question) => qid !== undefined && question.qid !== qid);
  if (remaining.length === current.length) return run;
  const next = { ...run };
  if (remaining.length) next.pendingQuestions = remaining;
  else delete next.pendingQuestions;
  return next;
}
