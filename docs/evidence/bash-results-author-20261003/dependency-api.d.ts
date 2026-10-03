// Type declarations only; implementations are excluded author inputs.
import type { BashInput, BashOutput, ExecutionResult, ToolCommandStatus, ToolExecutionTelemetry, ModelMessageContent } from "@knorvia/contracts";
import type { ToolExecutionContext } from "../types.js";
export type PublicTypes = { input: BashInput; output: BashOutput; result: ExecutionResult; commandStatus: ToolCommandStatus; telemetry: ToolExecutionTelemetry; content: ModelMessageContent; context: ToolExecutionContext };
export type OutputDependencies = {
  appendBashCwdStderrSuffix: typeof import("./bash-cwd-policy.js").appendBashCwdStderrSuffix;
  getGhRateLimitHint: typeof import("./bash-gh-rate-limit.js").getGhRateLimitHint;
  prepareBashImageOutput: typeof import("./bash-image-output.js").prepareBashImageOutput;
  interpretBashReturnCode: typeof import("./bash-semantics.js").interpretBashReturnCode;
  isBashProviderErrorStatus: typeof import("./bash-semantics.js").isBashProviderErrorStatus;
  isSilentBashCommand: typeof import("./bash-semantics.js").isSilentBashCommand;
  attachToolExecutionTelemetry: typeof import("./tool-perf.js").attachToolExecutionTelemetry;
  classifyCommand: typeof import("./tool-perf.js").classifyCommand;
  classifySafeCommandIdentity: typeof import("./tool-perf.js").classifySafeCommandIdentity;
  commandHash: typeof import("./tool-perf.js").commandHash;
  compactToolExecutionTelemetry: typeof import("./tool-perf.js").compactToolExecutionTelemetry;
  roundNonNegativeMs: typeof import("./tool-perf.js").roundNonNegativeMs;
};
export type ContentDependencies = {
  BashOutputSchema: typeof import("@knorvia/contracts").BashOutputSchema;
  parseImageDataUrl: typeof import("@knorvia/contracts").parseImageDataUrl;
  formatPersistedOutputEnvelope: typeof import("../result-persistence-format.js").formatPersistedOutputEnvelope;
  isBashProviderErrorStatus: typeof import("./bash-semantics.js").isBashProviderErrorStatus;
};
