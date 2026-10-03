// Body-free collaborator/type fragments; original module ownership, not standalone compilation.
// Original type owner: apps/cli/packages/core/src/memory/extraction.ts
type MemoryExtractionExecutionStatus = "success" | "no-op" | "error" | "aborted";
export interface MemoryExtractionSnapshot {
    boundaryMessageId: MessageId;
    durableMessages: readonly MessageWithParts[];
    memoryRoot: string;
    workingDirectory: string;
    workspaceRoot: string;
}
interface MemoryExtractionExecutionInput {
    abortSignal: AbortSignal;
    messageCount: number;
    snapshot: MemoryExtractionSnapshot;
}
export interface MemoryExtractionScheduler<TSnapshot extends MemoryExtractionSnapshot = MemoryExtractionSnapshot> {
    drain(): Promise<void>;
    getCursor(): MessageId | undefined;
    hasPendingWork(): boolean;
    schedule(snapshot: TSnapshot | Promise<TSnapshot>): void;
    shutdown(): void;
}
export declare function buildMemoryExtractionPrompt(input: {
    manifest: readonly MemoryManifestEntry[];
    messageCount: number;
}): string;
export declare function createMemoryExtractionScheduler<TSnapshot extends MemoryExtractionSnapshot = MemoryExtractionSnapshot>(execute: (input: Omit<MemoryExtractionExecutionInput, "snapshot"> & {
    snapshot: TSnapshot;
}) => Promise<MemoryExtractionExecutionStatus>): MemoryExtractionScheduler<TSnapshot>;
// Original type owner: apps/cli/packages/core/src/memory/memory-agent-loop.ts
export declare function runMemoryAgentLoop(input: {
    abortSignal?: AbortSignal;
    executeTool: (toolCall: ExecutableToolCall, options: {
        abortSignal?: AbortSignal;
    }) => Promise<ToolExecutionResult>;
    maxTurns: number;
    messages: readonly ModelInputMessage[];
    model: Model;
    rootDir: string;
    tools: readonly ModelToolContract[];
    workingDirectory: string;
    workspaceRoot: string;
}): Promise<MemoryAgentLoopResult>;
// Original type owner: apps/cli/packages/core/src/memory/recall/manifest.ts
export declare function scanMemoryManifest(input: {
    fileSystem: FileSystemPort;
    rootDir: string;
    signal?: AbortSignal;
}): Promise<MemoryManifestEntry[]>;
// Original type owner: apps/cli/packages/core/src/memory/recall/types.ts
export type MemoryRecallType = (typeof MEMORY_RECALL_TYPES)[number];
export interface MemoryManifestEntry {
    description?: string;
    filePath: string;
    filename: string;
    mtimeMs: number;
    type?: MemoryRecallType;
}
// Original type owner: apps/cli/packages/contracts/src/rewind/index.ts
export declare function selectActiveConversationBranch<T extends {
    info: {
        id: MessageId;
    };
}>(messages: readonly T[], options?: ActiveConversationBranchOptions): T[];
// Original type owner: apps/cli/packages/core/src/runtime/helpers/project-memory-agent.ts
export interface ProjectMemoryAgentContext {
    causation?: AgentTelemetryCausation;
    memoryRoot: string;
    providerEntries: readonly RuntimeMessageEntry[];
    midConversationSystem: AgentRuntimeInternal["config"]["midConversationSystem"];
    model: Model;
    operation: ModelApiOperation;
    readFileState: ReadFileStateMap;
    tools: readonly ModelToolContract[];
    traceContext: TraceContext;
    workingDirectory: string;
    workspaceRoot: string;
}
export declare function captureProjectMemoryAgentContext(runtime: AgentRuntimeInternal, input: {
    memoryRoot: string;
    model?: Model;
    operation: ModelApiOperation;
    traceContext: TraceContext;
}): ProjectMemoryAgentContext;
export declare function buildProjectMemoryAgentProviderMessages(runtime: AgentRuntimeInternal, context: ProjectMemoryAgentContext, prompt: string): ModelInputMessage[];
export declare function createProjectMemoryAgentToolExecutor(runtime: AgentRuntimeInternal, context: ProjectMemoryAgentContext): any;
// Original type owner: apps/cli/packages/core/src/runtime/helpers/project-memory.ts
export declare function resolveEnabledProjectMemoryRoot(config: AgentRuntimeConfig, workspacePath: string): string | undefined;
