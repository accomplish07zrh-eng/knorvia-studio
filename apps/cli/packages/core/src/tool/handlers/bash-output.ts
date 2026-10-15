// SPDX-License-Identifier: Apache-2.0
// bash 输出投影与命令 span 遥测：执行端口的原始结果折算成 BashOutput——
// 截断路径、字节数、退出码读数、gh 限流提示与图片探测都在这里收口；
// 同时生成命令执行的性能 span（类别、安全名、状态、哈希）。
import type {
  BashInput,
  BashOutput,
  CommandExecutionTelemetry,
  ExecutionResult,
  ToolCommandStatus,
  ToolExecutionTelemetry,
} from "@knorvia/contracts";
import type { ToolExecutionContext } from "../types.js";
import { appendBashCwdStderrSuffix } from "./bash-cwd-policy.js";
import { getGhRateLimitHint } from "./bash-gh-rate-limit.js";
import { prepareBashImageOutput } from "./bash-image-output.js";
import {
  interpretBashReturnCode,
  isBashProviderErrorStatus,
  isSilentBashCommand,
} from "./bash-semantics.js";
import {
  attachToolExecutionTelemetry,
  classifyCommand,
  classifySafeCommandIdentity,
  commandHash,
  compactToolExecutionTelemetry,
  roundNonNegativeMs,
} from "./tool-perf.js";

export interface BashProgressTiming {
  firstOutputMs?: number;
}

// span 状态优先级：超时 > 取消 > 非零退出（completed 时）> 端口终态。
function spanStatusFor(outcome: ExecutionResult): ToolCommandStatus {
  if (outcome.timedOut) return "timed_out";
  if (outcome.cancelled) return "cancelled";
  const nonZeroCompleted =
    outcome.status === "completed" && outcome.exitCode !== undefined && outcome.exitCode !== 0;
  if (nonZeroCompleted) return "failed";
  return outcome.status;
}

function buildCommandSpan(
  spec: BashInput,
  outcome: ExecutionResult,
  timing: BashProgressTiming | undefined,
): ToolExecutionTelemetry | undefined {
  const totalBytes = outcome.stdout.bytes + outcome.stderr.bytes;
  const firstOutputMs = timing?.firstOutputMs;
  const spanFields: Record<string, unknown> = {
    runMs: roundNonNegativeMs(outcome.durationMs),
    firstOutputMs,
    noOutputMs: firstOutputMs ?? roundNonNegativeMs(outcome.durationMs),
    exitCode: outcome.exitCode,
    timedOut: outcome.timedOut,
    outputBytes: totalBytes,
    category: classifyCommand(spec.command),
    ...classifySafeCommandIdentity(spec.command),
    status: spanStatusFor(outcome),
    hash: commandHash(spec.command),
  };
  return wrapCommandSpan(spanFields);
}

// 三类 span（运行中/空命令/后台）共用的外层形状：detail.kind 恒为 command。
function wrapCommandSpan(spanFields: Record<string, unknown>): ToolExecutionTelemetry | undefined {
  const commandSpan = spanFields as CommandExecutionTelemetry;
  return compactToolExecutionTelemetry({ detail: { kind: "command", command: commandSpan } });
}

export async function toBashOutput(
  outcome: ExecutionResult,
  spec: BashInput,
  ctx: ToolExecutionContext,
  overrides: { progressTiming?: BashProgressTiming; stderrSuffix?: string } = {},
): Promise<BashOutput> {
  const stdoutArtifact = outcome.stdout.artifactPath;
  const stderrArtifact = outcome.stderr.artifactPath;
  const persistedArtifact = stdoutArtifact ?? stderrArtifact;
  const combinedPersistedSize =
    persistedArtifact === undefined
      ? undefined
      : (stdoutArtifact === undefined ? 0 : outcome.stdout.bytes) +
        (stderrArtifact === undefined ? 0 : outcome.stderr.bytes);
  const mergedStderr = appendBashCwdStderrSuffix(
    outcome.stderr.text || outcome.error?.message || "",
    overrides.stderrSuffix,
  );
  const reading = interpretBashReturnCode(spec.command, outcome);
  const failedReading = isBashProviderErrorStatus({
    exitCode: outcome.exitCode,
    returnCodeInterpretation: reading,
    status: outcome.status,
  });
  const capturedStdout = outcome.stdout.text;
  const image = failedReading
    ? undefined
    : await probeImageOutput(stdoutArtifact, outcome.stdout.artifactBytes, capturedStdout, ctx);
  const ghRateLimitHint = failedReading
    ? undefined
    : getGhRateLimitHint(spec.command, outcome.stdout.text);

  const projection: Record<string, unknown> = {
    stdout: image?.stdout ?? capturedStdout,
    stderr: mergedStderr,
    interrupted: outcome.timedOut || outcome.cancelled,
    isImage: image !== undefined,
    noOutputExpected: isSilentBashCommand(spec.command),
    status: outcome.status,
    exitCode: outcome.exitCode,
    signal: outcome.signal,
    timedOut: outcome.timedOut,
    cancelled: outcome.cancelled,
    stdoutTruncated: outcome.stdout.truncated,
    stderrTruncated: outcome.stderr.truncated,
    stdoutBytes: outcome.stdout.bytes,
    stderrBytes: outcome.stderr.bytes,
    rawOutputPath: persistedArtifact,
    dangerouslyDisableSandbox: spec.dangerouslyDisableSandbox,
    returnCodeInterpretation: reading,
    persistedOutputPath: persistedArtifact,
    stdoutPersistedOutputPath: stdoutArtifact,
    stderrPersistedOutputPath: stderrArtifact,
    persistedOutputSize: combinedPersistedSize,
    stdoutPersistedOutputSize: outcome.stdout.artifactBytes,
    stderrPersistedOutputSize: outcome.stderr.artifactBytes,
  };
  if (ghRateLimitHint) projection.ghRateLimitHint = ghRateLimitHint;

  const span = buildCommandSpan(spec, outcome, overrides.progressTiming);
  return attachToolExecutionTelemetry(projection as unknown as BashOutput, span);
}

async function probeImageOutput(
  artifactPath: string | undefined,
  artifactSize: number | undefined,
  captured: string,
  ctx: ToolExecutionContext,
): Promise<{ stdout: string } | undefined> {
  return prepareBashImageOutput({ artifactPath, artifactSize, inline: captured }, ctx);
}

export function createBashBackgroundPerformanceTelemetry(
  spec: BashInput,
): ToolExecutionTelemetry | undefined {
  const spanFields: Record<string, unknown> = {
    category: classifyCommand(spec.command),
    ...classifySafeCommandIdentity(spec.command),
    status: "backgrounded",
    hash: commandHash(spec.command),
  };
  return wrapCommandSpan(spanFields);
}

export function createEmptyBashPerformanceTelemetry(
  spec: BashInput,
): ToolExecutionTelemetry | undefined {
  const spanFields: Record<string, unknown> = {
    category: "empty",
    count: 0,
    name: "empty",
    status: "completed",
    hash: commandHash(spec.command),
  };
  return wrapCommandSpan(spanFields);
}
