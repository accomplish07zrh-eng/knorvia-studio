import type { SessionGoal, TodoItem, TraceContext, TurnState, ToolSchedule } from "../deps.js";
import type { ResumeSessionOptions, ResumeSessionResult } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
export declare function toScheduleState(
  this: AgentRuntimeInternal,
  schedule: ToolSchedule,
): TurnState["scheduledTools"];
export declare function resumeFromStore(
  this: AgentRuntimeInternal,
  options?: ResumeSessionOptions,
): Promise<ResumeSessionResult>;
export declare function readSessionTodosForContext(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<TodoItem[]>;
export declare function readSessionTargetForContext(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<SessionGoal | null>;
export declare function injectTargetStateIntoMessageHistory(
  this: AgentRuntimeInternal,
  target: SessionGoal | null,
): void;
//# sourceMappingURL=resume.d.ts.map
