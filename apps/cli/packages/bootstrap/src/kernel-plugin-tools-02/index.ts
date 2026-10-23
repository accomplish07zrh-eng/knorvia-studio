// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// kernel-plugin-tools-02 插件入口：注册离峰族 / 会话上下文 / 进入计划模式共 4 个工具。
//
// 依据：`specs/contracts/kernel-plugin-tools-02/interface.md` §一 / §二。
//
// ⚠️ 本包只做三件事：注册工具、校验参数、调注入的服务/端口。
//   审批、超时、结果序列化由 DSH 承担。
import type { Context } from "@deepseek-ai/cordis";
import type { OffPeakPort } from "@knorvia/contracts";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { ToolCapabilityDeclaration } from "../kernel-plugin-policy/capability-resolver.js";
import { executeEnterPlanMode, type PlanModeControllerLike } from "./enter-plan-mode.js";
import { executeOffPeakCreate, executeOffPeakList } from "./off-peak.js";
import { executeReadSessionContext, type SessionContextSource } from "./session-context.js";

/** 工具超时（interface.md 第一层）。 */
export const TOOLS_02_TIMEOUT_MS = 30_000;

/**
 * 能力声明的字段顺序（契约词汇，见 `ToolCapabilityDeclaration`）。
 *
 * 与 `tools-01` 同一种表达方式：**键名与取值分表** ——
 * 改字段和改取值必须两处都动，是更强的防漂移约束。
 */
const CAPABILITY_FIELDS = [
  "readOnly",
  "destructive",
  "needsApproval",
  "sideEffectScope",
  "riskLevel",
] as const;

/**
 * 四个工具的能力取值，顺序与 {@link CAPABILITY_FIELDS} 一一对应。
 *
 * 四档（interface.md §二 第二层表）：
 *   · `offPeakCreate`  — 写工作区、需审批、中风险
 *   · `offPeakList`    — 只读、免审批、低风险
 *   · `readSession`    — 只读、免审批、低风险
 *   · `enterPlanMode`  — 只改会话状态、需审批、中风险
 *
 * ⚠️ `enterPlanMode` 的 `sideEffectScope` 是 `"session"` 而不是 `"workspace"` ——
 * 它不改工作区文件，只改会话的计划模式状态。
 */
const CAPABILITY_VALUES = {
  offPeakCreate: [false, false, true, "workspace", "medium"],
  offPeakList: [true, false, false, "none", "low"],
  readSession: [true, false, false, "none", "low"],
  enterPlanMode: [false, false, true, "session", "medium"],
} as const;

type CapabilityTier = keyof typeof CAPABILITY_VALUES;

/** 把字段表与取值表 zip 成一条声明。 */
function capabilityOf(tier: CapabilityTier): ToolCapabilityDeclaration {
  const values = CAPABILITY_VALUES[tier];
  return Object.fromEntries(
    CAPABILITY_FIELDS.map((field, index) => [field, values[index]]),
  ) as ToolCapabilityDeclaration;
}

/** 四个工具的能力声明表（interface.md §二 第二层的断言对象）。 */
export const TOOLS_02_CAPABILITIES: Readonly<Record<string, ToolCapabilityDeclaration>> =
  Object.freeze({
    OffPeakCreate: capabilityOf("offPeakCreate"),
    OffPeakList: capabilityOf("offPeakList"),
    ReadSessionContext: capabilityOf("readSession"),
    EnterPlanMode: capabilityOf("enterPlanMode"),
  });

/**
 * DSH 工具定义的元数据（第一层）。
 *
 * 全部 `isConcurrencySafe: () => false` ——
 * 离峰配置与计划模式状态都不是并发安全的（interface.md §二 第一层）。
 */
function toolMetadata(): {
  readonly timeoutMs: number;
  readonly isConcurrencySafe: (args: unknown) => boolean;
} {
  return { timeoutMs: TOOLS_02_TIMEOUT_MS, isConcurrencySafe: () => false };
}

/** 插件配置（interface.md §一）。 */
export interface KernelPluginTools02Config {
  /** 取离峰端口；返回 undefined 表示当前会话不支持（B8）。 */
  readonly getOffPeakPort: () => OffPeakPort | undefined;
  /** 取会话上下文源；返回 undefined 表示不支持（B8）。 */
  readonly getSessionContextSource: () => SessionContextSource | undefined;
  /** 取计划模式控制器；返回 undefined 表示不支持（B8）。 */
  readonly getPlanModeController: () => PlanModeControllerLike | undefined;
  /** 取当前调用的会话 id。 */
  readonly sessionIdOf?: (ctx: Context) => string | undefined;
  /** 取当前调用的 agent（`EnterPlanMode` 需要）。 */
  readonly agentOf?: (ctx: Context) => unknown;
  /** 当前调用是否处于自动化轮次（B9 的写保护输入）。 */
  readonly automationTurnOf?: (ctx: Context) => boolean;
}

/** 统一的输出投影。 */
function renderJson(value: unknown): { type: "text"; text: string }[] {
  return [{ type: "text", text: JSON.stringify(value) }];
}

/**
 * 输出 schema（与 tools-01 一致）。
 *
 * 用 `{ type: "object", additionalProperties: true }` ——
 * 表达「任意键、任意 JSON 值」，与「返回记录」的语义一致。
 */
const OUTPUT_SCHEMA = { type: "object", additionalProperties: true } as const;

/**
 * 把执行结果对齐到 DSH 的 `JsonValue` 输出类型。
 *
 * 理由与 `tools-01` 相同：DSH 的推断类型是 `Record<string, JsonValue>`，
 * 而执行体返回 `Record<string, unknown>`（字段类型更宽）。运行时完全兼容。
 */
function asToolOutput(value: object): Record<string, never> {
  return value as unknown as Record<string, never>;
}

/** 4 个工具的参数声明。 */
const OFF_PEAK_CREATE_PARAMETERS = {
  title: { type: "string", description: "A short label for the off-peak window." },
  windowStart: { type: "string", description: "Start of the preferred window." },
  windowEnd: { type: "string", description: "End of the preferred window." },
  startHour: { type: "number", description: "Start hour of the daily window." },
  endHour: { type: "number", description: "End hour of the daily window." },
} as const;

/**
 * 插件入口。
 *
 * 在 `apply` 内注册四个工具，不做别的事。
 */
export function apply(ctx: Context, config: KernelPluginTools02Config): void {
  const offPeakContext = () => ({
    getOffPeakPort: config.getOffPeakPort,
    ...(config.automationTurnOf === undefined
      ? {}
      : { automationTurn: config.automationTurnOf(ctx) }),
  });

  ctx.tools.register(
    defineTool({
      name: "OffPeakCreate",
      description:
        "Create an off-peak window so scheduled work runs when the service is cheaper and less busy. Window boundaries must be given in pairs.",
      parameters: OFF_PEAK_CREATE_PARAMETERS,
      output: { schema: OUTPUT_SCHEMA, render: (_args, value) => renderJson(value) },
      ...toolMetadata(),
      execute: async (args, _exec) =>
        asToolOutput(await executeOffPeakCreate(args as Record<string, unknown>, offPeakContext())),
    }),
  );

  ctx.tools.register(
    defineTool({
      name: "OffPeakList",
      description: "List the off-peak windows configured for this workspace. Read-only.",
      parameters: {},
      output: { schema: OUTPUT_SCHEMA, render: (_args, value) => renderJson(value) },
      ...toolMetadata(),
      execute: async (_args, _exec) => asToolOutput(await executeOffPeakList(offPeakContext())),
    }),
  );

  ctx.tools.register(
    defineTool({
      name: "ReadSessionContext",
      description:
        "Read the current session context: the todo projection and the additional context attached to this session. Read-only.",
      parameters: {},
      output: { schema: OUTPUT_SCHEMA, render: (_args, value) => renderJson(value) },
      ...toolMetadata(),
      execute: async (_args, _exec) =>
        asToolOutput(
          await executeReadSessionContext({
            getSessionContextSource: config.getSessionContextSource,
            sessionId: config.sessionIdOf?.(ctx) ?? "",
          }),
        ),
    }),
  );

  ctx.tools.register(
    defineTool({
      name: "EnterPlanMode",
      description:
        "Enter plan mode so the approach can be agreed before code is written. After entering, explore and design, then leave with exit_plan_mode when the plan is ready.",
      parameters: {},
      output: { schema: OUTPUT_SCHEMA, render: (_args, value) => renderJson(value) },
      ...toolMetadata(),
      execute: async (_args, _exec) =>
        asToolOutput(
          executeEnterPlanMode({
            getPlanModeController: config.getPlanModeController,
            agent: config.agentOf?.(ctx),
          }),
        ),
    }),
  );
}

export {
  executeEnterPlanMode,
  PlanModeEnterCancelledError,
  type EnterPlanModeResult,
  type PlanModeControllerLike,
  type PlanModeSetOutcome,
} from "./enter-plan-mode.js";
export {
  executeOffPeakCreate,
  executeOffPeakList,
  windowPairViolations,
  type OffPeakCallContext,
} from "./off-peak.js";
export {
  executeReadSessionContext,
  type ReadSessionContextResult,
  type SessionContextSource,
} from "./session-context.js";
export { ENTER_PLAN_MODE_GUIDANCE, EXIT_PLAN_MODE_GUIDANCE } from "./plan-mode-guidance.js";
