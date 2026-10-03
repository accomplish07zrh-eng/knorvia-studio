import {
  CoreErrorType,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
  EnterPlanModeInputSchema,
  ExitPlanModeInputSchema,
  createCoreError,
} from "@knorvia/contracts";
import type { ToolExecutionContext } from "../types.js";
import { persistPlanBeforeExit } from "./plan-mode-persistence.js";
import {
  planModeToolTrace,
  projectPlanModeTransition,
  type PlanModeIntent,
} from "./plan-mode-projection.js";

type Operation = PlanModeIntent["kind"];
const TOOL_NAMES = { enter: ENTER_PLAN_MODE_TOOL_NAME, exit: EXIT_PLAN_MODE_TOOL_NAME };
const INACTIVE_MESSAGE =
  "You are not in plan mode. This tool is only for exiting plan mode after writing a plan. If your plan was already approved, continue with implementation.";

function intent(operation: Operation, input: unknown): PlanModeIntent {
  if (operation === "enter") {
    EnterPlanModeInputSchema.parse(input);
    return { kind: "enter" };
  }
  return { kind: "exit", input: ExitPlanModeInputSchema.parse(input) };
}

function transitionInput(context: ToolExecutionContext) {
  return { toolCallId: context.toolCallId, traceContext: planModeToolTrace(context) };
}

// Distinct port methods retain their native failure expressions and receivers.
// Both are effects selected by the same operation owner after admission.
const transition = {
  enter: (context: ToolExecutionContext) =>
    context.sessionModePort!.enterPlanMode(transitionInput(context)),
  exit: (context: ToolExecutionContext) =>
    context.sessionModePort!.exitPlanMode(transitionInput(context)),
};

class PlanModeOperation {
  constructor(
    private readonly operation: Operation,
    private readonly input: unknown,
    private readonly context: ToolExecutionContext,
  ) {}

  async run() {
    const context = this.context;
    const request = intent(this.operation, this.input);
    const toolName = TOOL_NAMES[request.kind];
    if (!context.sessionModePort) {
      throw createCoreError(
        CoreErrorType.ConfigurationError,
        `SessionModePort is not configured for ${toolName}`,
        {
          context: { toolCallId: context.toolCallId, toolName },
          recoverable: false,
        },
      );
    }
    if (request.kind === "exit") {
      if (
        !(context.sessionModePort.isPlanEnabled?.() ?? context.sessionModePort.getMode() === "plan")
      ) {
        throw createCoreError(CoreErrorType.InvalidStateTransition, INACTIVE_MESSAGE, {
          context: { toolCallId: context.toolCallId, toolName: EXIT_PLAN_MODE_TOOL_NAME },
          recoverable: true,
        });
      }
      await persistPlanBeforeExit(context, request.input.plan);
    }
    const result = await transition[request.kind](context);
    return projectPlanModeTransition(request, result);
  }
}

export function executePlanMode(
  operation: Operation,
  input: unknown,
  context: ToolExecutionContext,
) {
  return new PlanModeOperation(operation, input, context).run();
}
