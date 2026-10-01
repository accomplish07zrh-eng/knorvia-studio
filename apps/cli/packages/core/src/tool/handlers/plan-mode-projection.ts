import type {
  EnterPlanModeOutput,
  EnterPlanModeTransitionResult,
  ExitPlanModeInput,
  ExitPlanModeOutput,
  ExitPlanModeTransitionResult,
} from "@knorvia/contracts";
import type { ToolExecutionContext } from "../types.js";

export type PlanModeIntent = { kind: "enter" } | { kind: "exit"; input: ExitPlanModeInput };
const ENTERED_MESSAGE =
  "Entered plan mode. You should now focus on exploring the codebase and designing an implementation approach.";

export function projectPlanModeTransition(
  intent: PlanModeIntent,
  transition: EnterPlanModeTransitionResult | ExitPlanModeTransitionResult,
): EnterPlanModeOutput | ExitPlanModeOutput {
  if (intent.kind === "enter") {
    return {
      message: ENTERED_MESSAGE,
      mode: transition.mode,
      previousMode: transition.previousMode,
      planEnabled: transition.planEnabled,
      previousPlanEnabled: transition.previousPlanEnabled,
    };
  }
  const exited = transition as ExitPlanModeTransitionResult;
  return {
    allowedPrompts: intent.input.allowedPrompts,
    approved: true,
    planEnabled: exited.planEnabled,
    previousPlanEnabled: exited.previousPlanEnabled,
    mode: exited.mode,
    plan: intent.input.plan,
    previousMode: exited.previousMode,
  };
}

export function planModeToolTrace(context: ToolExecutionContext) {
  return {
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    turnId: context.turnId,
  };
}

// Model-facing prose is retained verbatim, separately from the new operation structure.
export function formatEnterPlanModeModelContent(output: unknown): string {
  const result = output as EnterPlanModeOutput;
  return `${result.message}

In plan mode, you should:
1. Thoroughly explore the codebase to understand existing patterns
2. Identify similar features and architectural approaches
3. Consider multiple approaches and their trade-offs
4. Use AskUserQuestion if you need to clarify the approach
5. Design a concrete implementation strategy
6. When ready, use ExitPlanMode to present your plan for approval

Remember: DO NOT write or edit any files yet. This is a read-only exploration and planning phase.`;
}

export function formatExitPlanModeModelContent(output: unknown): string {
  const result = output as ExitPlanModeOutput;
  const plan = result.plan?.trim();
  if (!plan) return "User has approved exiting plan mode. You can now proceed.";
  return `User has approved your plan. You can now start coding. Start with updating your todo list if applicable.

## Approved Plan:
${plan}`;
}
