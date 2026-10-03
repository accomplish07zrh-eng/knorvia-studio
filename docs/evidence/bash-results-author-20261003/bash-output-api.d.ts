import { type BashInput, type BashOutput, type ExecutionResult, type ToolExecutionTelemetry } from "@knorvia/contracts";
import type { ToolExecutionContext } from "../types.js";
export interface BashProgressTiming {
    firstOutputMs?: number;
}
export declare function toBashOutput(result: ExecutionResult, input: BashInput, context: ToolExecutionContext, options?: {
    progressTiming?: BashProgressTiming;
    stderrSuffix?: string;
}): Promise<BashOutput>;
export declare function createBashBackgroundPerformanceTelemetry(input: BashInput): ToolExecutionTelemetry | undefined;
export declare function createEmptyBashPerformanceTelemetry(input: BashInput): ToolExecutionTelemetry | undefined;
