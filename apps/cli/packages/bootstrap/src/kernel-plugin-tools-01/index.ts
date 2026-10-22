// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// kernel-plugin-tools-01 插件入口：注册 cron 族四个工具。
//
// 依据：`specs/contracts/kernel-plugin-tools-01/interface.md` §一 / §二 / §三。
//
// ⚠️ 本包只做三件事：注册工具、校验参数、调端口。
//   审批（`tools/pre-execute` + `dsh-user-approval`）、超时（`dsh-timeout`）、
//   结果序列化（`tools/post-execute`）全部由 DSH 承担。
import type { Context } from "@deepseek-ai/cordis";
import type { AutomationPort } from "@knorvia/contracts";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { cronToolMetadata } from "./cron-declaration.js";
import type { CronCreateArgs, CronUpdateArgs } from "./cron-schema.js";
import {
  executeCronCreate,
  executeCronDelete,
  executeCronList,
  executeCronUpdate,
  type CronCallContext,
} from "./cron-execution.js";

/**
 * 插件配置。
 *
 * 为什么端口用注入而不是 import：插件对宿主零耦合，测试可注入假端口
 * —— 与 `kernel-plugin-credentials` 已确立的形态一致。
 */
export interface KernelPluginToolsConfig {
  /** 取定时任务端口；返回 undefined 表示当前会话不支持定时任务。 */
  readonly getAutomationPort: () => AutomationPort | undefined;
  /** 取当前调用的会话 id（用于创建时绑定会话）。 */
  readonly sessionIdOf?: (ctx: Context) => string | undefined;
  /** 取当前调用的模型标识（`providerId/modelId`）。 */
  readonly modelOf?: (ctx: Context) => string | undefined;
  /** 当前调用是否处于自动化轮次（B10 的写保护输入）。 */
  readonly automationTurnOf?: (ctx: Context) => boolean;
}

/** 模型指引：`CronCreate` 的行为约束（合入 `description`，DSH 无 `guidance` 字段）。 */
const CREATE_GUIDANCE = [
  "Use this tool only when the user explicitly asks for something to be scheduled.",
  "For a relative delay, pass delayMinutes instead of converting it into a cron expression or a clock time yourself; the host computes the schedule from its real clock, and a one-shot time that already passed rolls forward to the next full year.",
  "A cron expression is interpreted in the user's local time zone; do not convert it to UTC.",
  "For a fixed number of runs every N units, pass intervalUnit together with interval (1-200).",
  "Pin a wall-clock month/day/hour/minute only when the user names an absolute date.",
  "recurring=false with maxRuns=N means exactly N runs; recurring=true cannot be combined with maxRuns.",
  "The prompt field states the final work; never ask for another automation to be created.",
  "The title keeps the user's own natural-language schedule phrase; the input carries no workspace path or identity.",
] as const;

/** 构造 `CronCreate` 的 description（B6：不得含 DSH 品牌）。 */
function createDescription(): string {
  return ["Create a scheduled automation for this workspace.", ...CREATE_GUIDANCE].join(" ");
}

/** `CronList` 的 description。 */
const LIST_DESCRIPTION =
  "List the scheduled automations of this workspace. Read-only; safe to call at any time.";

/** `CronUpdate` 的 description。 */
const UPDATE_DESCRIPTION = [
  "Update an existing scheduled automation by id.",
  ...CREATE_GUIDANCE,
].join(" ");

/** `CronDelete` 的 description。 */
const DELETE_DESCRIPTION =
  "Delete a scheduled automation by id. Deleting an automation that no longer exists is not an error.";

/** 8 个可更新字段的参数声明（`CronCreate` 与 `CronUpdate` 共用）。 */
const SCHEDULE_PARAMETERS = {
  cron: { type: "string", description: "Cron expression in the user's local time zone." },
  // B4：`null` 等价于「未给」→ 必须用 `oneOf` 表达，否则 DSH 会在执行体前拒绝。
  delayMinutes: {
    oneOf: [{ type: "number" }, { type: "null" }],
    description: "Relative delay in minutes; the host computes the schedule.",
  },
  prompt: { type: "string", description: "The work to run when the automation fires." },
  title: { type: "string", description: "The user's own schedule phrase." },
  recurring: { type: "boolean", description: "Whether the automation repeats." },
  maxRuns: { type: "number", description: "Exact number of runs for a one-shot series." },
  intervalUnit: {
    type: "string",
    enum: ["minutes", "hours", "days", "weeks", "months", "years"],
    description: "Unit for a fixed interval series.",
  },
  interval: { type: "number", description: "Count of intervalUnit per run (1-200)." },
} as const;

/** 从 `ctx` 组装执行上下文。 */
function callContext(ctx: Context, config: KernelPluginToolsConfig): CronCallContext {
  return {
    getAutomationPort: config.getAutomationPort,
    ...(config.sessionIdOf === undefined ? {} : { sessionId: config.sessionIdOf(ctx) }),
    ...(config.modelOf === undefined ? {} : { model: config.modelOf(ctx) }),
    ...(config.automationTurnOf === undefined
      ? {}
      : { automationTurn: config.automationTurnOf(ctx) }),
  };
}

/** 统一的输出投影：把规范值渲染成一段文本。 */
function renderJson(value: unknown): { type: "text"; text: string }[] {
  return [{ type: "text", text: JSON.stringify(value) }];
}

/**
 * 把执行结果对齐到 DSH 的 `JsonValue` 输出类型。
 *
 * ⚠️ 为什么需要转换：`DefineToolOptions.output.schema` 的推断类型是
 * `Record<string, JsonValue>`（递归 JSON 类型），而本包的执行体返回
 * `Record<string, unknown>`（因为 `CronAutomation` 是接口、字段类型更宽）。
 * 两者在**运行时完全兼容**（都是 lossless JSON），只是 TypeScript 无法自动收窄。
 *
 * 而 `output.schema` 声明为 `{ type: "object", additionalProperties: true }` ——
 * 它表达的正是「任意键、任意 JSON 值」，所以这个转换不会掩盖真实的不匹配。
 */
function asToolOutput(value: object): Record<string, never> {
  return value as unknown as Record<string, never>;
}

/**
 * 输出 schema（四个工具相同）。
 *
 * ⚠️ 用 `{ type: "object", additionalProperties: true }` 而不是 `{ type: "json" }` ——
 * 因为后者的推断类型是 `JsonValue`，而我们的结果是 `Record<string, unknown>`（含 readonly 数组），
 * 两者不兼容。而 `object` + `additionalProperties: true` 允许任意键，
 * 与「返回 automation 记录」的语义一致。
 */
const OUTPUT_SCHEMA = { type: "object", additionalProperties: true } as const;

/**
 * 插件入口（interface.md §一）。
 *
 * 在 `apply` 内注册四个工具，不做别的事。
 */
export function apply(ctx: Context, config: KernelPluginToolsConfig): void {
  const context = (): CronCallContext => callContext(ctx, config);

  ctx.tools.register(
    defineTool({
      name: "CronCreate",
      description: createDescription(),
      parameters: SCHEDULE_PARAMETERS,
      output: {
        schema: OUTPUT_SCHEMA,
        render: (_args, value) => renderJson(value),
      },
      ...cronToolMetadata("CronCreate"),
      execute: async (args, _exec) =>
        asToolOutput(await executeCronCreate(args as CronCreateArgs, context())),
    }),
  );

  ctx.tools.register(
    defineTool({
      name: "CronList",
      description: LIST_DESCRIPTION,
      parameters: {},
      output: {
        schema: OUTPUT_SCHEMA,
        render: (_args, value) => renderJson(value),
      },
      ...cronToolMetadata("CronList"),
      execute: async (_args, _exec) => asToolOutput(await executeCronList(context())),
    }),
  );

  ctx.tools.register(
    defineTool({
      name: "CronUpdate",
      description: UPDATE_DESCRIPTION,
      parameters: {
        id: { type: "string", description: "Identifier of the automation to update." },
        ...SCHEDULE_PARAMETERS,
      },
      output: {
        schema: OUTPUT_SCHEMA,
        render: (_args, value) => renderJson(value),
      },
      ...cronToolMetadata("CronUpdate"),
      execute: async (args, _exec) =>
        asToolOutput(await executeCronUpdate(args as CronUpdateArgs, context())),
    }),
  );

  ctx.tools.register(
    defineTool({
      name: "CronDelete",
      description: DELETE_DESCRIPTION,
      parameters: {
        id: { type: "string", description: "Identifier of the automation to delete." },
      },
      output: {
        schema: OUTPUT_SCHEMA,
        render: (_args, value) => renderJson(value),
      },
      ...cronToolMetadata("CronDelete"),
      execute: async (args, _exec) =>
        asToolOutput(await executeCronDelete(args as { id: string }, context())),
    }),
  );
}

export {
  CRON_TOOL_CAPABILITIES,
  CRON_TOOL_TIMEOUT_MS,
  cronToolMetadata,
} from "./cron-declaration.js";
export {
  CRON_CREATE_CONSTRAINTS,
  CRON_FIELD_CONSTRAINTS,
  CRON_INTERVAL_UNITS,
  CRON_MAX_DELAY_MINUTES,
  CRON_MAX_INTERVAL,
  CRON_MIN_INTERVAL,
  formatViolations,
  violationsOf,
  type CronCreateArgs,
  type CronUpdateArgs,
} from "./cron-schema.js";
export {
  executeCronCreate,
  executeCronDelete,
  executeCronList,
  executeCronUpdate,
  projectAutomation,
  type CronCallContext,
} from "./cron-execution.js";
