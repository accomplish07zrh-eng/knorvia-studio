// Exposed-source replacement of Cron admission/effect ownership; retained contracts are unchanged.
import {
  CronCreateInputSchema,
  CronDeleteInputSchema,
  CronListInputSchema,
  CronUpdateInputSchema,
  type CronAutomation,
  type CronCreateInput,
  type CronCreateOutput,
  type CronDeleteInput,
  type CronDeleteOutput,
  type CronListOutput,
  type CronUpdateInput,
  type CronUpdateOutput,
} from "@knorvia/contracts";
import type { ToolExecutionContext, ToolHandler } from "../types.js";

type Operation = "create" | "list" | "update" | "delete";
type MutationName = "CronCreate" | "CronUpdate" | "CronDelete";
type ToolName = MutationName | "CronList";
interface Admission {
  rejectAutomationTurn(context: ToolExecutionContext, name: MutationName): void;
  requirePort(context: ToolExecutionContext, name: ToolName): void;
}
const admission = {
  create: { name: "CronCreate", mutation: true, schema: CronCreateInputSchema },
  list: { name: "CronList", mutation: false, schema: CronListInputSchema },
  update: { name: "CronUpdate", mutation: true, schema: CronUpdateInputSchema },
  delete: { name: "CronDelete", mutation: true, schema: CronDeleteInputSchema },
} as const;

type Effect =
  | {
      kind: "automation";
      confirmation: "Created" | "Updated";
      invoke: () => Promise<CronAutomation>;
    }
  | { kind: "list"; invoke: () => Promise<CronAutomation[]> }
  | { kind: "delete"; input: CronDeleteInput; invoke: () => Promise<boolean> };

function admit(
  operation: Operation,
  input: unknown,
  context: ToolExecutionContext,
  guards: Admission,
): Effect {
  const rule = admission[operation];
  if (rule.mutation) guards.rejectAutomationTurn(context, rule.name);
  const request = rule.schema.parse(input);
  guards.requirePort(context, rule.name);
  // Invocation closures preserve late context/port reads and the port method's receiver.
  switch (operation) {
    case "create":
      return {
        kind: "automation",
        confirmation: "Created",
        invoke: () =>
          context.automationPort!.create(request as CronCreateInput, {
            // 会话内创建定时任务时模型来自当前 runtime，而不是模型可控的工具入参。
            ...(context.model
              ? { model: `${context.model.providerId}/${context.model.modelId}` }
              : {}),
            // 会话内创建的 cron 固定复用当前 session，后续触发不再新建 session。
            sessionId: context.sessionId,
          }),
      };
    case "update":
      return {
        kind: "automation",
        confirmation: "Updated",
        invoke: () => context.automationPort!.update(request as CronUpdateInput),
      };
    case "list":
      return { kind: "list", invoke: () => context.automationPort!.list() };
    case "delete":
      return {
        kind: "delete",
        input: request as CronDeleteInput,
        invoke: () => context.automationPort!.delete(request as CronDeleteInput),
      };
  }
}

const modelFields = [
  "automationId",
  "title",
  "cronExpr",
  "prompt",
  "enabled",
  "lifecycleStatus",
  "nextRunAt",
  "lastRunAt",
  "runCount",
  "recurring",
  "maxRuns",
  // 工具输出曾在此处重新投影 automation 时遗漏 scheduleRule，导致 CronCreate /
  // CronUpdate / CronList 虽收到真实间隔仍只展示兼容 cron，错误显示成每小时或每天。
  "scheduleRule",
] as const satisfies readonly (keyof CronAutomation)[];
function modelAutomation(value: CronAutomation): CronAutomation {
  return Object.fromEntries(
    modelFields.map((field) => [field, value[field]]),
  ) as unknown as CronAutomation;
}
function complete(
  effect: Effect,
  value: CronAutomation | CronAutomation[] | boolean,
): CronCreateOutput | CronUpdateOutput | CronListOutput | CronDeleteOutput {
  switch (effect.kind) {
    case "automation": {
      const automation = value as CronAutomation;
      return {
        automation: modelAutomation(automation),
        message: `${effect.confirmation} automation ${automation.automationId}.`,
      };
    }
    case "list":
      return { automations: (value as CronAutomation[]).map(modelAutomation) };
    case "delete": {
      const deleted = value as boolean;
      return {
        deleted,
        id: effect.input.id,
        message: deleted
          ? `Deleted automation ${effect.input.id}.`
          : `Automation ${effect.input.id} was not found in the current workspace.`,
      };
    }
  }
}
export function createCronHandler(operation: Operation, guards: Admission): ToolHandler {
  return async (input, context) => {
    const effect = admit(operation, input, context, guards);
    return complete(effect, await effect.invoke());
  };
}
