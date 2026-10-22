// SPDX-License-Identifier: Apache-2.0
// kernel-plugin-tools-01 的插件入口：把 cron 族四个工具注册进 DSH 的工具注册表。
//
// 形态对齐 `kernel-plugin-credentials`：导出 `apply(ctx, config)`，
// 在 `apply` 里向 `ctx.tools.register(defineTool(...))` 注册工具。
// 不含权限、超时、结果序列化 —— 那些由 DSH 的 `tools/pre-execute` 与
// `dsh-timeout` / `dsh-output-retention` 承担（见合同 README §二 4）。
import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { AutomationPort, CronCreateInput } from "@knorvia/contracts";
import { cronToolMetadata } from "./cron-declaration.js";
import {
  runCronCreate,
  runCronDelete,
  runCronList,
  runCronUpdate,
  type CronPipeline,
} from "./cron-execution.js";
import {
  CRON_CREATE_PARAMETERS,
  CRON_DELETE_PARAMETERS,
  CRON_LIST_PARAMETERS,
  CRON_UPDATE_PARAMETERS,
  describeViolations,
  fieldViolationsOf,
  violationsOf,
} from "./cron-schema.js";

/**
 * 插件配置。
 *
 * 端口由宿主注入（`getAutomationPort`）而不是让插件去 import 宿主实现 ——
 * 这样插件对宿主零耦合，测试可注入假端口。
 */
export interface KernelPluginToolsConfig {
  /** 取定时任务端口；返回 undefined 表示当前会话不支持定时任务。 */
  readonly getAutomationPort: () => AutomationPort | undefined;
  /** 取当前调用的会话 id（用于创建时绑定会话）。 */
  readonly sessionIdOf?: (ctx: Context) => string | undefined;
  /** 取当前调用的模型标识（`providerId/modelId`）。 */
  readonly modelOf?: (ctx: Context) => string | undefined;
}

const CREATE_GUIDANCE = [
  "Use this only when the user explicitly asks to schedule future automatic work.",
  "For any schedule expressed as a delay from now, set delayMinutes to the whole minutes and omit cron; the host anchors to its real clock, so never compute an absolute time yourself — a self-computed one-shot time that has just passed silently rolls a full year forward.",
  "Use a standard 5-field cron in the user's local timezone for absolute named dates or recurring schedules; do not convert to UTC.",
  "For every N minutes/hours/days/weeks/months/years set intervalUnit and interval together (1-200); supply a legal compatible cron only for the display slots.",
  "Pin month/day/hour/minute only for an absolute wall-clock date the user names outright, and then set recurring=false without maxRuns.",
  "Use recurring=false with maxRuns=N for exactly N runs; recurring=true is indefinite and must not be combined with maxRuns.",
  "Write the final work directly in prompt; never ask the scheduled run to create or schedule another automation.",
  "Keep the user's schedule phrase verbatim in title, and do not include workspace paths or identities.",
] as const;

const LIST_GUIDANCE = [
  "Lists all automations of the current workspace, including completed ones with their history.",
  "Read-only: this call never changes scheduling state.",
] as const;

const UPDATE_GUIDANCE = [
  "Only the fields you pass are changed; omit everything you do not intend to modify.",
  "The same scheduling rules as CronCreate apply to the fields you do change.",
] as const;

const DELETE_GUIDANCE = [
  "Deletes one automation by id; deleting an already-absent automation reports deleted=false instead of failing.",
  "Deletion is permanent and ends the automation's schedule.",
] as const;

/**
 * 把四个 cron 工具注册进 DSH。
 *
 * @param ctx - DSH 的上下文（提供 `ctx.tools`）。
 * @param config - 宿主注入的端口与上下文提取器。
 */
export function apply(ctx: Context, config: KernelPluginToolsConfig): void {
  const pipeline: CronPipeline = {
    port: config.getAutomationPort,
    callContext: (exec) => ({
      sessionId: readSessionId(config, exec),
      model: readModel(config, exec),
    }),
  };

  registerCreate(ctx, pipeline);
  registerList(ctx, pipeline);
  registerUpdate(ctx, pipeline);
  registerDelete(ctx, pipeline);
}

/**
 * 从执行上下文读会话 id。
 *
 * DSH 的 `ToolRunContext` 不直接暴露会话 id 与模型，因此由 config 提供提取器；
 * 未提供时返回 undefined（创建出来的任务不绑定会话，行为与「无会话上下文」一致）。
 *
 * @param config - 插件配置。
 * @param exec - DSH 执行上下文。
 * @returns 会话 id 或 undefined。
 */
function readSessionId(config: KernelPluginToolsConfig, exec: unknown): string | undefined {
  return config.sessionIdOf?.(exec as Context);
}

/**
 * 从执行上下文读模型标识。
 *
 * @param config - 插件配置。
 * @param exec - DSH 执行上下文。
 * @returns `providerId/modelId` 或 undefined。
 */
function readModel(config: KernelPluginToolsConfig, exec: unknown): string | undefined {
  return config.modelOf?.(exec as Context);
}

/** 注册 `CronCreate`。 */
function registerCreate(ctx: Context, pipeline: CronPipeline): void {
  const meta = cronToolMetadata({
    name: "CronCreate",
    readOnly: false,
    needsApproval: true,
    description: "Create a persistent scheduled automation in the current workspace.",
    guidance: CREATE_GUIDANCE,
  });
  ctx.tools.register(
    defineTool({
      name: meta.name,
      description: meta.description,
      parameters: CRON_CREATE_PARAMETERS,
      output: {
        schema: { type: "object", additionalProperties: true },
        render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
      },
      async execute(args, exec) {
        const request = args as CronCreateInput;
        const violations = [...fieldViolationsOf(request), ...violationsOf(request)];
        if (violations.length > 0) throw new Error(describeViolations(violations));
        return runCronCreate(request, exec, pipeline);
      },
    }),
  );
}

/** 注册 `CronList`。 */
function registerList(ctx: Context, pipeline: CronPipeline): void {
  const meta = cronToolMetadata({
    name: "CronList",
    readOnly: true,
    needsApproval: false,
    description: "List the scheduled automations of the current workspace.",
    guidance: LIST_GUIDANCE,
  });
  ctx.tools.register(
    defineTool({
      name: meta.name,
      description: meta.description,
      parameters: CRON_LIST_PARAMETERS,
      output: {
        schema: { type: "object", additionalProperties: true },
        render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
      },
      async execute(_args, exec) {
        return runCronList(exec, pipeline);
      },
    }),
  );
}

/** 注册 `CronUpdate`。 */
function registerUpdate(ctx: Context, pipeline: CronPipeline): void {
  const meta = cronToolMetadata({
    name: "CronUpdate",
    readOnly: false,
    needsApproval: true,
    description: "Change one existing scheduled automation without touching the others.",
    guidance: UPDATE_GUIDANCE,
  });
  ctx.tools.register(
    defineTool({
      name: meta.name,
      description: meta.description,
      parameters: CRON_UPDATE_PARAMETERS,
      output: {
        schema: { type: "object", additionalProperties: true },
        render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
      },
      async execute(args, exec) {
        return runCronUpdate(args as never, exec, pipeline);
      },
    }),
  );
}

/** 注册 `CronDelete`。 */
function registerDelete(ctx: Context, pipeline: CronPipeline): void {
  const meta = cronToolMetadata({
    name: "CronDelete",
    readOnly: false,
    needsApproval: true,
    description: "Delete one scheduled automation of the current workspace.",
    guidance: DELETE_GUIDANCE,
  });
  ctx.tools.register(
    defineTool({
      name: meta.name,
      description: meta.description,
      parameters: CRON_DELETE_PARAMETERS,
      output: {
        schema: { type: "object", additionalProperties: true },
        render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
      },
      async execute(args, exec) {
        return runCronDelete(args as never, exec, pipeline);
      },
    }),
  );
}

export { CRON_CREATE_CONSTRAINTS, CRON_INTERVAL_UNITS, violationsOf } from "./cron-schema.js";
export { CRON_MODEL_BYTES, CRON_TOOL_TIMEOUT_MS, cronToolMetadata } from "./cron-declaration.js";
export type {
  CronCallContext,
  CronOperation,
  CronPipeline,
  CronPortProvider,
} from "./cron-execution.js";
