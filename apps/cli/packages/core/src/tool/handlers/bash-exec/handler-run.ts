// SPDX-License-Identifier: Apache-2.0
// bash 执行编排：schema 校验 → 空命令短路 → 请求构造 → 后台/前台分派 →
// cwd 跟随 → 输出投影 → read-state 效果。超时与取消都由执行端口按
// runOptions.signal 终止，本层不自建定时器。
import {
  BashInputSchema,
  CoreErrorType,
  createCoreError,
  type BackgroundExecutionStartResult,
  type BashInput,
  type BashOutput,
  type ExecutionRequest,
  type ExecutionResult,
  type ExecutionRunOptions,
} from "@knorvia/contracts";
import type { BashTimeoutPolicy } from "../../bash-timeout-policy.js";
import type { ToolEntry, ToolExecutionContext, ToolHandler } from "../../types.js";
import {
  supportsBashBackgroundLifecycle,
  type BashBackgroundLifecycleResult,
} from "../bash-background-lifecycle.js";
import { isBashAutoBackgroundEligible } from "../bash-background-policy.js";
import { decideBashCwdPolicy } from "../bash-cwd-policy.js";
import {
  createBashBackgroundPerformanceTelemetry,
  createEmptyBashPerformanceTelemetry,
  toBashOutput,
  type BashProgressTiming,
} from "../bash-output.js";
import { applyBashReadFileStateEffects } from "../bash-read-file-state.js";
import { attachToolExecutionTelemetry } from "../tool-perf.js";
import { closeCommandSpan, openCommandSpan } from "./command-span.js";
import { buildExecutionRequest, publishProgressEvent } from "./request-build.js";

// 支持后台生命周期的执行端口（能力判定在 bash-background-lifecycle）。
type LifecycleCapableExecutor = NonNullable<ToolExecutionContext["executionPort"]> & {
  runBashWithBackgroundLifecycle(
    request: ExecutionRequest,
    lifecycle: { mode: string },
    options?: ExecutionRunOptions,
  ): Promise<BashBackgroundLifecycleResult>;
};

const TOOL_LABEL = "Bash";
const IDLE_TURN_BACKGROUND_REFUSAL =
  "Idle-time tasks do not support background commands. Run this command in the foreground without run_in_background.";
const MISSING_EXECUTOR_MESSAGE = "ExecutionPort is not configured for Bash tool";
const NO_LIFECYCLE_MESSAGE = "ExecutionPort does not support the Bash background lifecycle";

// 空命令输出的事实表：全零状态 + 透传沙箱旗标。
const BLANK_OUTPUT_FACTS: ReadonlyArray<readonly [string, unknown]> = [
  ["stdout", ""],
  ["stderr", ""],
  ["interrupted", false],
  ["isImage", false],
  ["noOutputExpected", false],
  ["status", "completed"],
];
// 后台输出的事实表：只补充任务标识与落盘路径。
const BACKGROUND_OUTPUT_FACTS: ReadonlyArray<readonly [string, unknown]> = [
  ["stdout", ""],
  ["stderr", ""],
  ["interrupted", false],
  ["status", "backgrounded"],
];

export function createBashToolHandler(timeoutPolicy: BashTimeoutPolicy): ToolHandler {
  return (payload, ctx) => runBashCall(payload, ctx, timeoutPolicy);
}

export {
  createTimeoutBudgetResolver,
  customizeInputSchema,
  describeWithPolicy,
  resolveReadOnlyCapability,
} from "./tool-profile.js";

async function runBashCall(
  payload: unknown,
  ctx: ToolExecutionContext,
  timeoutPolicy: BashTimeoutPolicy,
): Promise<BashOutput> {
  const validated = BashInputSchema.parse(payload) as BashInput;
  const executor = ctx.executionPort;
  if (!executor) failConfiguration(ctx, MISSING_EXECUTOR_MESSAGE);

  if (validated.command.trim().length === 0) {
    const idleSpan = openCommandSpan(validated, ctx);
    idleSpan?.finishCompleted();
    return blankOutput(validated);
  }

  const request = buildExecutionRequest(validated, ctx, timeoutPolicy);
  const progressClock: BashProgressTiming = {};
  const span = openCommandSpan(validated, ctx);
  const runOptions = buildRunOptions(ctx, progressClock, span);

  // 闲时（off-peak）turn 不带执行模型预算：后台命令退出后的通知轮询会退化成
  // 完整 agent loop 落到用户套餐上。与 subagent 侧的 BACKGROUND_UNAVAILABLE 对称，
  // 闲时既拒绝显式后台，也关闭「超时自动转后台」的兜底。
  const idleTurn = ctx.offPeakTurn === true;
  if (validated.run_in_background && idleTurn) throwIdleTurnRefusal(ctx);
  const autoBackgroundWorthy = !idleTurn && isBashAutoBackgroundEligible(validated);
  const lifecycleExecutor = supportsBashBackgroundLifecycle(executor) ? executor : undefined;
  if (validated.run_in_background && !lifecycleExecutor) {
    failConfiguration(ctx, NO_LIFECYCLE_MESSAGE);
  }

  const dispatch = () =>
    dispatchExecution(executor, lifecycleExecutor, request, runOptions, {
      explicit: validated.run_in_background === true,
      autoOnTimeout: autoBackgroundWorthy,
    });
  const settled = span ? await settleWithinSpan(span, dispatch) : await dispatch();

  if (settled.kind === "backgrounded") {
    return backgroundedOutput(settled.task, validated);
  }
  const outcome = settled.result;
  const stderrSuffix = await settleWorkingDirectory(outcome, ctx);
  const output = await toBashOutput(outcome, validated, ctx, {
    progressTiming: progressClock,
    stderrSuffix,
  });
  await applyReadStateEffects(validated.command, ctx, output, outcome);
  return output;
}

type DispatchModes = { explicit: boolean; autoOnTimeout: boolean };

// 分派：显式后台 > 超时自动后台 > 前台运行。
async function dispatchExecution(
  executor: NonNullable<ToolExecutionContext["executionPort"]>,
  lifecycleExecutor: LifecycleCapableExecutor | undefined,
  request: ExecutionRequest,
  runOptions: ExecutionRunOptions,
  modes: DispatchModes,
) {
  if (modes.explicit && lifecycleExecutor) {
    const explicitMode = { mode: "explicit" as const };
    return lifecycleExecutor.runBashWithBackgroundLifecycle(request, explicitMode, runOptions);
  }
  if (modes.autoOnTimeout && lifecycleExecutor) {
    const timeoutMode = { mode: "auto_on_timeout" as const };
    return lifecycleExecutor.runBashWithBackgroundLifecycle(request, timeoutMode, runOptions);
  }
  return { kind: "foreground" as const, result: await executor.run(request, runOptions) };
}

async function settleWithinSpan(
  span: NonNullable<ReturnType<typeof openCommandSpan>>,
  dispatch: () => Promise<
    | { kind: "backgrounded"; task: BackgroundExecutionStartResult }
    | { kind: "foreground"; result: ExecutionResult }
  >,
) {
  const observed = await dispatch();
  if (observed.kind === "backgrounded") {
    span.finishBackgrounded();
    return observed;
  }
  closeCommandSpan(span, observed.result);
  return observed;
}

// cwd 跟随：命令成功后保留项目内落点；离开项目边界则重置回会话根，
// 并把重置文案作为 stderr 后缀交还调用方。
async function settleWorkingDirectory(
  outcome: ExecutionResult,
  ctx: ToolExecutionContext,
): Promise<string | undefined> {
  const decision = decideBashCwdPolicy({
    status: outcome.status,
    exitCode: outcome.exitCode,
    resolvedCwd: outcome.resolvedCwd,
    workspaceRoot: ctx.workspaceRoot,
    runtimeScope: ctx.runtimeScope,
  });
  const followed = decision.nextWorkingDirectory;
  if (followed) await ctx.setWorkingDirectory?.(followed);
  return decision.stderrSuffix;
}

async function applyReadStateEffects(
  cmd: string,
  ctx: ToolExecutionContext,
  output: BashOutput,
  outcome: ExecutionResult,
): Promise<void> {
  await applyBashReadFileStateEffects({ command: cmd, context: ctx, output, result: outcome });
}

function failConfiguration(ctx: ToolExecutionContext, message: string): never {
  throw createCoreError(CoreErrorType.ConfigurationError, message, failureFacts(ctx, false));
}

function throwIdleTurnRefusal(ctx: ToolExecutionContext): never {
  throw createCoreError(
    CoreErrorType.ToolExecutionFailed,
    IDLE_TURN_BACKGROUND_REFUSAL,
    failureFacts(ctx, true),
  );
}

function failureFacts(ctx: ToolExecutionContext, recoverable: boolean) {
  return { context: { toolCallId: ctx.toolCallId, toolName: TOOL_LABEL }, recoverable };
}

function blankOutput(spec: BashInput): BashOutput {
  const fields = new Map<string, unknown>(BLANK_OUTPUT_FACTS);
  fields.set("dangerouslyDisableSandbox", spec.dangerouslyDisableSandbox);
  const projection = Object.fromEntries(fields) as unknown as BashOutput;
  return attachToolExecutionTelemetry(projection, createEmptyBashPerformanceTelemetry(spec));
}

function backgroundedOutput(task: BackgroundExecutionStartResult, spec: BashInput): BashOutput {
  const fields = new Map<string, unknown>(BACKGROUND_OUTPUT_FACTS);
  fields.set("backgroundTaskId", task.taskId);
  fields.set("rawOutputPath", task.outputPath);
  fields.set("persistedOutputPath", task.outputPath);
  fields.set("stdoutPersistedOutputPath", task.stdoutPersistedOutputPath);
  fields.set("stderrPersistedOutputPath", task.stderrPersistedOutputPath);
  fields.set("dangerouslyDisableSandbox", spec.dangerouslyDisableSandbox);
  const projection = Object.fromEntries(fields) as unknown as BashOutput;
  return attachToolExecutionTelemetry(projection, createBashBackgroundPerformanceTelemetry(spec));
}

function buildRunOptions(
  ctx: ToolExecutionContext,
  progressClock: BashProgressTiming,
  span: ReturnType<typeof openCommandSpan>,
): ExecutionRunOptions {
  return {
    signal: ctx.abortSignal,
    onEvent: async (event) => {
      if (event.type !== "progress") return;
      const producedBytes = event.stdoutBytes + event.stderrBytes;
      const firstOutputSoFar = progressClock.firstOutputMs !== undefined;
      if (!firstOutputSoFar && producedBytes > 0) {
        progressClock.firstOutputMs = Math.max(0, Math.round(event.elapsedMs));
        span?.markFirstOutput();
      }
      await publishProgressEvent(event, ctx);
    },
  };
}
