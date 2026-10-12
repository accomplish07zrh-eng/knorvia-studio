// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

export function createToolModelStatusSink(
  context: Pick<ToolExecutionContext, "emitEvent" | "sessionId" | "turnId" | "traceId">,
): ModelStatusSink | undefined {
  throw new Error("not implemented: core-tool-01");
}

export function withDefaultToolModelStatusSink(
  model: Model | undefined,
  sink: ModelStatusSink | undefined,
): Model | undefined {
  throw new Error("not implemented: core-tool-01");
}
