import { type TraceContext } from "../deps.js";
import { type MemoryExtractionScheduler, type MemoryExtractionSnapshot } from "../../memory/extraction.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { type ProjectMemoryAgentContext } from "./project-memory-agent.js";
interface ProjectMemoryExtractionSnapshot extends MemoryExtractionSnapshot, ProjectMemoryAgentContext {
}
export type ProjectMemoryExtractionScheduler = MemoryExtractionScheduler<ProjectMemoryExtractionSnapshot>;
export declare function isProjectMemoryEnabled(this: AgentRuntimeInternal): boolean;
export declare function scheduleProjectMemoryExtraction(runtime: AgentRuntimeInternal, input: {
    model: ProjectMemoryAgentContext["model"];
    traceContext: TraceContext;
}): void;
export declare function drainMemoryExtractions(this: AgentRuntimeInternal, timeoutMs?: number | null): Promise<void>;
export {};
