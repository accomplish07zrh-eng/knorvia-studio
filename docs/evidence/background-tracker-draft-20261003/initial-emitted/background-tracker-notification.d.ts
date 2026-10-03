import { type TraceContext } from "@knorvia/contracts";
import type { ExecutableToolCall } from "../types.js";
import { type TaskSnapshot } from "./background-tracker-projection.js";
import type { ToolExecutorDeps } from "./types.js";
export declare function enqueueTerminalNotification(deps: ToolExecutorDeps, call: ExecutableToolCall, taskId: string, status: string, traceContext: TraceContext, snapshot?: TaskSnapshot, launch?: Record<string, unknown>): void;
//# sourceMappingURL=background-tracker-notification.d.ts.map