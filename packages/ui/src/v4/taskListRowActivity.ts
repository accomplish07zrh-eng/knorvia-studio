// SPDX-License-Identifier: Apache-2.0
// Source-exposed activity/field-authority candidate; retained API/sidecar, rights review pending.
import type { KnorviaTaskMeta } from "@knorvia/shared";
import type {
  PendingInteractionSummary,
  SessionSummary,
  SessionWorkflowActivity,
} from "@knorvia/shared/protocol-v4";

// UI-only sidecar：不进入 shared task meta/schema，也不写回 tasks-index。
// 字段名使用明确的内部前缀，避免调用方把它误当成持久化 task 属性。
const TASK_LIST_ROW_ACTIVITY_FIELD = "__sessionActivity" as const;

export interface TaskListRowActivity {
  phase: SessionSummary["phase"];
  lastActivityAt: number;
  hasBackgroundWork: boolean;
  pendingInteractions?: PendingInteractionSummary;
  /** 侧栏工作流运行行的数据；无 run 时缺席。 */
  workflowActivity?: SessionWorkflowActivity;
}

export type TaskListMetaWithActivity = KnorviaTaskMeta & {
  [TASK_LIST_ROW_ACTIVITY_FIELD]: TaskListRowActivity;
};

export function attachTaskListRowActivity<T extends KnorviaTaskMeta>(
  task: T,
  activity: TaskListRowActivity,
): T & TaskListMetaWithActivity {
  return {
    ...task,
    [TASK_LIST_ROW_ACTIVITY_FIELD]: activity,
  };
}

export function getTaskListRowActivity(task: KnorviaTaskMeta): TaskListRowActivity | null {
  const activity = (task as Partial<TaskListMetaWithActivity>)[TASK_LIST_ROW_ACTIVITY_FIELD];
  return activity ?? null;
}

const activePhases = new Set<SessionSummary["phase"]>(["prewarming", "running"]);
const attentionPriority = [
  {
    kind: "userInput",
    accepts: (summary: PendingInteractionSummary) => summary.userInputCount > 0,
  },
  { kind: "permission", accepts: (_summary: PendingInteractionSummary) => true },
] as const;

/** Running phase or strict background work owns the activity layer; stale task status does not. */
export function isTaskListRowActive(task: KnorviaTaskMeta): boolean {
  const phase = getTaskListRowActivity(task)?.phase;
  return (
    (phase !== undefined && activePhases.has(phase)) ||
    getTaskListRowActivity(task)?.hasBackgroundWork === true
  );
}

export function getTaskListAttention(
  task: KnorviaTaskMeta,
): { kind: "permission" | "userInput"; count: number } | null {
  const summary = getTaskListRowActivity(task)?.pendingInteractions;
  if (!summary) {
    return null;
  }
  const count = summary.permissionCount + summary.userInputCount;
  if (count === 0) {
    return null;
  }
  return {
    kind: attentionPriority.find((policy) => policy.accepts(summary))!.kind,
    count,
  };
}

type MembershipFacts = {
  activityTask: KnorviaTaskMeta;
  membershipTask: KnorviaTaskMeta;
  activity: TaskListRowActivity;
  membershipOwnsUnread: boolean;
};

const membershipAuthorities = {
  createdAt: (facts: MembershipFacts) => facts.activityTask.createdAt,
  updatedAt: (facts: MembershipFacts) => facts.activity.lastActivityAt,
  status: (facts: MembershipFacts) => facts.activityTask.status,
  unreadAt: (facts: MembershipFacts) =>
    facts.membershipOwnsUnread ? facts.membershipTask.unreadAt : facts.activityTask.unreadAt,
};

export function mergeTaskListMembershipFields(
  activityTask: KnorviaTaskMeta,
  membershipTask: KnorviaTaskMeta,
): KnorviaTaskMeta {
  const activity = getTaskListRowActivity(activityTask);
  if (!activity) return membershipTask;
  const facts = {
    activityTask,
    membershipTask,
    activity,
    membershipOwnsUnread: Object.prototype.hasOwnProperty.call(membershipTask, "unreadAt"),
  };
  const merged = { ...activityTask, ...membershipTask };
  // 字段权威按既有读取顺序投影；spread 保留 metadata own/symbol 与 __proto__ 安全边界。
  const fields = Object.fromEntries(
    Object.entries(membershipAuthorities).map(([field, resolve]) => [field, resolve(facts)]),
  ) as Pick<KnorviaTaskMeta, "createdAt" | "updatedAt" | "status" | "unreadAt">;
  return attachTaskListRowActivity({ ...merged, ...fields }, activity);
}
