import type {
  BashInput,
  BashOutput,
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

function performanceStatus(result: ExecutionResult): ToolCommandStatus {
  if (result.timedOut) return "timed_out";
  if (result.cancelled) return "cancelled";
  if (result.status === "completed" && result.exitCode !== undefined && result.exitCode !== 0) {
    return "failed";
  }
  return result.status;
}

function executionTelemetry(
  input: BashInput,
  result: ExecutionResult,
  progressTiming: BashProgressTiming | undefined,
): ToolExecutionTelemetry | undefined {
  const outputBytes = result.stdout.bytes + result.stderr.bytes;
  const firstOutputMs = progressTiming?.firstOutputMs;
  return compactToolExecutionTelemetry({
    detail: {
      kind: "command",
      command: {
        runMs: roundNonNegativeMs(result.durationMs),
        firstOutputMs,
        noOutputMs: firstOutputMs ?? roundNonNegativeMs(result.durationMs),
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        outputBytes,
        category: classifyCommand(input.command),
        ...classifySafeCommandIdentity(input.command),
        status: performanceStatus(result),
        hash: commandHash(input.command),
      },
    },
  });
}

export async function toBashOutput(
  result: ExecutionResult,
  input: BashInput,
  context: ToolExecutionContext,
  options: { progressTiming?: BashProgressTiming; stderrSuffix?: string } = {},
): Promise<BashOutput> {
  const stdoutPath = result.stdout.artifactPath;
  const stderrPath = result.stderr.artifactPath;
  const persistedPath = stdoutPath ?? stderrPath;
  const stdoutArtifactBytes = result.stdout.artifactBytes;
  const stderrArtifactBytes = result.stderr.artifactBytes;
  const persistedOutputSize = persistedPath
    ? (stdoutPath ? result.stdout.bytes : 0) + (stderrPath ? result.stderr.bytes : 0)
    : undefined;
  const stderr = appendBashCwdStderrSuffix(
    result.stderr.text || result.error?.message || "", options.stderrSuffix,
  );
  const returnCodeInterpretation = interpretBashReturnCode(input.command, result);
  const providerError = isBashProviderErrorStatus({
    exitCode: result.exitCode,
    returnCodeInterpretation,
    status: result.status,
  });
  const capturedStdout = result.stdout.text;
  const image = providerError ? undefined : await prepareBashImageOutput({
    artifactPath: stdoutPath,
    artifactSize: stdoutArtifactBytes,
    inline: capturedStdout,
  }, context);
  const stdout = image?.stdout ?? capturedStdout;
  const isImage = image !== undefined;
  const ghRateLimitHint = providerError
    ? undefined : getGhRateLimitHint(input.command, result.stdout.text);
  const output = {
    stdout,
    stderr,
    interrupted: result.timedOut || result.cancelled,
    isImage,
    noOutputExpected: isSilentBashCommand(input.command),
    status: result.status,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    cancelled: result.cancelled,
    stdoutTruncated: result.stdout.truncated,
    stderrTruncated: result.stderr.truncated,
    stdoutBytes: result.stdout.bytes,
    stderrBytes: result.stderr.bytes,
    rawOutputPath: persistedPath,
    dangerouslyDisableSandbox: input.dangerouslyDisableSandbox,
    returnCodeInterpretation,
    persistedOutputPath: persistedPath,
    stdoutPersistedOutputPath: stdoutPath,
    stderrPersistedOutputPath: stderrPath,
    persistedOutputSize,
    stdoutPersistedOutputSize: stdoutArtifactBytes,
    stderrPersistedOutputSize: stderrArtifactBytes,
    ...(ghRateLimitHint ? { ghRateLimitHint } : {}),
  };
  const progressTiming = options.progressTiming;
  const telemetry = executionTelemetry(input, result, progressTiming);
  return attachToolExecutionTelemetry(output, telemetry);
}

export function createBashBackgroundPerformanceTelemetry(
  input: BashInput,
): ToolExecutionTelemetry | undefined {
  return compactToolExecutionTelemetry({
    detail: {
      kind: "command",
      command: {
        category: classifyCommand(input.command),
        ...classifySafeCommandIdentity(input.command),
        status: "backgrounded",
        hash: commandHash(input.command),
      },
    },
  });
}

export function createEmptyBashPerformanceTelemetry(
  input: BashInput,
): ToolExecutionTelemetry | undefined {
  return compactToolExecutionTelemetry({
    detail: {
      kind: "command",
      command: {
        category: "empty",
        count: 0,
        name: "empty",
        status: "completed",
        hash: commandHash(input.command),
      },
    },
  });
}
