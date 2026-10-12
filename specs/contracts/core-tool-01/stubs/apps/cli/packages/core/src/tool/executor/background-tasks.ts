// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

function notImplemented(name: string): never {
  throw new Error("not implemented: core-tool-01: " + name);
}

export class BackgroundTaskTracker {
  private readonly trackedTaskIds: never = notImplemented("trackedTaskIds");
  constructor(private readonly deps: ToolExecutorDeps) {
    throw new Error("not implemented: core-tool-01");
  }
  async trackBackgroundTask(
    toolCall: ExecutableToolCall,
    output: unknown,
    traceContext: TraceContext,
    turnId: TurnId | undefined,
  ): Promise<void> {
    throw new Error("not implemented: core-tool-01");
  }
}
