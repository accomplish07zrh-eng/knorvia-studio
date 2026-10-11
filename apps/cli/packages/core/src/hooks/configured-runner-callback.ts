// SPDX-License-Identifier: Apache-2.0
// 配置 Hook 的执行层：把 HookConfig 变成一次 ExecutionPort 调用，并把执行结果翻译成
// Hook 输出（JSON 或阻断语义）。这里是与外部世界唯一接触的地方。
import {
  CoreErrorType,
  HookEventName,
  HookJSONOutputSchema,
  createCoreError,
  type ExecutionResult,
  type HookConfig,
  type HookInput,
  type HookJSONOutput,
} from "@knorvia/contracts";
import {
  createCompatibleHookStdin,
  createPluginEnvOverlay,
  expandPluginVariables,
} from "./configured-runner-input.js";
import type { ConfiguredHookRunnerOptions, HookCallback, HookCallbackResult } from "./types.js";

const PREVIEW_LIMIT = 4000;
const MAX_SCHEMA_ERRORS = 20;
const EXIT_CODE_BLOCK = 2;

interface ExecutionBudget {
  maxOutputBytes: number;
  timeoutMs: number;
}

/** 执行 trace 的属性：值必须是可序列化的基础类型（ExecutionPort 的约定）。 */
type HookTraceAttributes = Record<string, string | number | boolean>;

type HookOutput = HookJSONOutput | HookCallbackResult | undefined;

function preview(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length <= PREVIEW_LIMIT ? trimmed : `${trimmed.slice(0, PREVIEW_LIMIT)}...`;
}

/** 统一的 schema 违例错误工厂：context 用条目归约，避免逐字段散落。 */
function schemaViolation(event: HookEventName, issues: readonly unknown[]): Error {
  const context = Object.fromEntries([
    ["errors", issues.slice(0, MAX_SCHEMA_ERRORS)],
    ["hookEventName", event],
  ]);
  return createCoreError(
    CoreErrorType.ToolExecutionFailed,
    "Hook stdout failed HookJSONOutput schema validation",
    { context, recoverable: true },
  );
}

/**
 * 解析 stdout：只有 `{` 开头的文本才当作 JSON；解析失败按诊断文本忽略，
 * schema 不符则报可恢复错误（不能让不合规输出悄悄变成放行）。
 */
function parseStdout(stdout: string, event: HookEventName): HookJSONOutput | undefined {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith("{")) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }

  const validation = HookJSONOutputSchema.safeParse(parsed);
  if (!validation.success) throw schemaViolation(event, validation.error.errors);
  return validation.data as HookJSONOutput;
}

type HookSpecificOutput = NonNullable<HookJSONOutput["hookSpecificOutput"]>;
type BlockOutputBuilder = (reason: string) => HookJSONOutput;

/** 按事件给出该事件能理解的阻断输出；未列出的事件用默认形态。 */
const BLOCK_OUTPUT_BUILDERS = new Map<string, BlockOutputBuilder>([
  [
    HookEventName.PreToolUse,
    (reason) => {
      const specific = Object.fromEntries([
        ["hookEventName", HookEventName.PreToolUse],
        ["permissionDecision", "deny"],
        ["permissionDecisionReason", reason],
      ]) as HookSpecificOutput;
      return { continue: false, hookSpecificOutput: specific, reason };
    },
  ],
  [
    HookEventName.PermissionRequest,
    (reason) => {
      const specific = Object.fromEntries([
        ["decision", { behavior: "deny", message: reason }],
        ["hookEventName", HookEventName.PermissionRequest],
      ]) as HookSpecificOutput;
      return { continue: false, hookSpecificOutput: specific, reason };
    },
  ],
  [
    HookEventName.Stop,
    (reason) =>
      Object.fromEntries([
        ["decision", "block"],
        ["reason", reason],
      ]) as HookJSONOutput,
  ],
]);

function exitCodeBlockOutput(input: HookInput, result: ExecutionResult): HookJSONOutput {
  const reason =
    preview(result.stderr.text) ?? preview(result.stdout.text) ?? "Hook blocked execution";
  const build = BLOCK_OUTPUT_BUILDERS.get(input.hookEventName);
  return build === undefined ? { continue: false, reason } : build(reason);
}

/** 把执行诊断附加到输出上；没有诊断时保持原样（可能是 undefined）。 */
function withDiagnostics(output: HookJSONOutput | undefined, result: ExecutionResult): HookOutput {
  const stderrPreview = preview(result.stderr.text);
  const stdoutPreview =
    result.exitCode === EXIT_CODE_BLOCK ? preview(result.stdout.text) : undefined;
  if (!stderrPreview && !stdoutPreview) return output;

  return {
    diagnostics: {
      ...(stderrPreview ? { errorMessage: stderrPreview, stderrPreview } : {}),
      ...(stdoutPreview ? { stdoutPreview } : {}),
    },
    ...(output ? { output } : {}),
    kind: "hookCallbackResult",
  };
}

function resultToOutput(
  input: HookInput,
  result: ExecutionResult,
  event: HookEventName,
): HookOutput {
  if (result.status === "completed" && (result.exitCode ?? 0) === 0)
    return withDiagnostics(parseStdout(result.stdout.text, event), result);

  if (result.exitCode === EXIT_CODE_BLOCK)
    return withDiagnostics(exitCodeBlockOutput(input, result), result);

  const message =
    result.error?.message ??
    preview(result.stderr.text) ??
    `Hook process exited with status ${result.status}`;
  throw createCoreError(CoreErrorType.ToolExecutionFailed, "Hook process failed", {
    cause: new Error(message),
    context: {
      exitCode: result.exitCode,
      hookEventName: event,
      status: result.status,
      stderrPreview: preview(result.stderr.text),
      stdoutPreview: preview(result.stdout.text),
    },
    recoverable: true,
  });
}

function executionRequest(
  options: ConfiguredHookRunnerOptions,
  hook: HookConfig,
  input: HookInput,
  stdin: string,
  budget: ExecutionBudget,
  trace: HookTraceAttributes,
) {
  const workingDirectory = options.getWorkingDirectory();
  const expand = (value: string) =>
    expandPluginVariables(value, hook.plugin, input, workingDirectory);

  return {
    command:
      hook.type === "command"
        ? { command: expand(hook.command), mode: "shell" as const, shell: hook.shell }
        : {
            args: (hook.args ?? []).map(expand),
            file: expand(hook.command),
            mode: "argv" as const,
          },
    cwd: input.cwd || workingDirectory,
    env: createPluginEnvOverlay(hook.plugin, input, workingDirectory),
    outputLimit: {
      maxBufferBytes: budget.maxOutputBytes,
      maxInlineBytes: budget.maxOutputBytes,
      persistOutput: "none" as const,
    },
    stdin,
    timeoutMs: budget.timeoutMs,
    trace: {
      attributes: trace,
      sessionId: input.sessionId,
      traceId: input.traceId,
      turnId: input.turnId,
    },
  };
}

/**
 * 生成一条配置 Hook 的回调。stdin 临时目录在 `finally` 释放；
 * 变量展开抛错时同样释放（展开发生在执行请求构造阶段，仍处于 try 块内）。
 */
export function createConfiguredHookCallback(
  options: ConfiguredHookRunnerOptions,
  event: HookEventName,
  hook: HookConfig,
  matcherIndex: number,
  hookIndex: number,
  budget: ExecutionBudget,
): HookCallback {
  return async (input, context) => {
    const stdin = await createCompatibleHookStdin(input);
    try {
      const result = await options.executionPort.run(
        executionRequest(options, hook, input, stdin.value, budget, {
          hookEventName: event,
          hookIndex,
          matcherIndex,
        }),
        { signal: context.signal },
      );
      return resultToOutput(input, result, event);
    } finally {
      await stdin.cleanup();
    }
  };
}
