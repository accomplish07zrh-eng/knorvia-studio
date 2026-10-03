import { type TraceContext, type TurnId } from "@knorvia/contracts";
import type { ExecutableToolCall } from "../types.js";
import type { ToolExecutorDeps } from "./types.js";
export declare class BackgroundTaskTracker {
  constructor(deps: ToolExecutorDeps);
  trackBackgroundTask(
    toolCall: ExecutableToolCall,
    output: unknown,
    traceContext: TraceContext,
    turnId: TurnId | undefined,
  ): Promise<void>;
}
