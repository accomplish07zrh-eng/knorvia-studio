import { selectActiveConversationBranch, type TraceContext } from "../deps.js";
import {
  buildMemoryExtractionPrompt,
  createMemoryExtractionScheduler,
  type MemoryExtractionScheduler,
  type MemoryExtractionSnapshot,
} from "../../memory/extraction.js";
import { runMemoryAgentLoop } from "../../memory/memory-agent-loop.js";
import { scanMemoryManifest } from "../../memory/recall/index.js";
import type { AgentRuntimeInternal } from "../internal.js";
import {
  buildProjectMemoryAgentProviderMessages,
  captureProjectMemoryAgentContext,
  createProjectMemoryAgentToolExecutor,
  type ProjectMemoryAgentContext,
} from "./project-memory-agent.js";
import { resolveEnabledProjectMemoryRoot } from "./project-memory.js";

interface ProjectMemoryExtractionSnapshot
  extends MemoryExtractionSnapshot, ProjectMemoryAgentContext {}

export type ProjectMemoryExtractionScheduler =
  MemoryExtractionScheduler<ProjectMemoryExtractionSnapshot>;

interface ExtractionExecution {
  abortSignal: AbortSignal;
  messageCount: number;
  snapshot: ProjectMemoryExtractionSnapshot;
}

const MAX_EXTRACTION_TURNS = 5;
const DRAIN_TIMEOUT_MS = 60_000;

export function isProjectMemoryEnabled(this: AgentRuntimeInternal): boolean {
  return (
    resolveEnabledProjectMemoryRoot(this.config, this.workspaceRoot) !== undefined
  );
}

export function scheduleProjectMemoryExtraction(
  runtime: AgentRuntimeInternal,
  input: {
    model: ProjectMemoryAgentContext["model"];
    traceContext: TraceContext;
  },
): void {
  if (runtime.shuttingDown) return;
  if (runtime.config.memory?.extractionEnabled === false) return;

  const memoryRoot = resolveEnabledProjectMemoryRoot(
    runtime.config,
    runtime.workspaceRoot,
  );
  if (!memoryRoot) return;
  if (runtime.isRemoteWorkspace()) return;
  if (!runtime.sessionStore || !runtime.fileSystemPort) return;

  const snapshotBase = captureProjectMemoryAgentContext(runtime, {
    memoryRoot,
    model: input.model,
    operation: "project_memory_extract",
    traceContext: input.traceContext,
  });
  const boundaryMessageId = runtime.latestConversationMessageId;
  if (!boundaryMessageId) return;

  const durableMessages = runtime.sessionStore.messages({
    sessionID: runtime.sessionId,
  });
  const session = runtime.sessionStore.getSession(runtime.sessionId);
  const snapshotPromise = Promise.all([durableMessages, session]).then(
    ([messages, scheduledSession]): ProjectMemoryExtractionSnapshot => {
      const active = selectActiveConversationBranch(messages, {
        branchCutAfterMessageId:
          scheduledSession?.revert?.branchCutAfterMessageID,
        rewindCreatedMessageId: scheduledSession?.revert?.createdMessageID,
        rewindKeptMessageIds: scheduledSession?.revert?.keptMessageIDs,
        rewindTargetMessageId: scheduledSession?.revert?.targetMessageID,
      });
      const boundaryIndex = active.findIndex(
        (message) => message.info.id === boundaryMessageId,
      );
      if (boundaryIndex < 0) {
        throw new Error(
          "Extraction boundary is missing from the scheduled active branch",
        );
      }
      return {
        ...snapshotBase,
        boundaryMessageId,
        durableMessages: active.slice(0, boundaryIndex + 1),
      };
    },
  );

  runtime.memoryExtractionScheduler ??=
    createMemoryExtractionScheduler<ProjectMemoryExtractionSnapshot>(
      (extraction) => execute(runtime, extraction),
    );
  runtime.memoryExtractionScheduler.schedule(snapshotPromise);
}

export async function drainMemoryExtractions(
  this: AgentRuntimeInternal,
  timeoutMs: number | null = DRAIN_TIMEOUT_MS,
): Promise<void> {
  const scheduler = this.memoryExtractionScheduler;
  if (!scheduler) return;
  if (timeoutMs === null) {
    await scheduler.drain();
    return;
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      scheduler.drain(),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs);
        timeout.unref?.();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function execute(
  runtime: AgentRuntimeInternal,
  input: ExtractionExecution,
): Promise<"success" | "error" | "aborted"> {
  const telemetry = runtime.agentTelemetry.detached({
    causation: input.snapshot.causation,
    executionKind: "background",
    operation: "project_memory_extract",
    targetKind: "project_memory",
    traceContext: input.snapshot.traceContext,
    trigger: "scheduler",
  });

  return telemetry.run(async (): Promise<"success" | "error" | "aborted"> => {
    try {
      const manifest = await scanMemoryManifest({
        fileSystem: runtime.fileSystemPort!,
        rootDir: input.snapshot.memoryRoot,
        signal: input.abortSignal,
      });
      if (input.abortSignal.aborted) {
        telemetry.finishCancelled("abort_signal");
        return "aborted";
      }

      const prompt = buildMemoryExtractionPrompt({
        manifest,
        messageCount: input.messageCount,
      });
      const providerMessages = buildProjectMemoryAgentProviderMessages(
        runtime,
        input.snapshot,
        prompt,
      );
      const executor = createProjectMemoryAgentToolExecutor(
        runtime,
        input.snapshot,
      );
      await runMemoryAgentLoop({
        abortSignal: input.abortSignal,
        executeTool: (toolCall, options) =>
          executor.execute(toolCall, {
            signal: options.abortSignal,
            traceContext: input.snapshot.traceContext,
          }),
        maxTurns: MAX_EXTRACTION_TURNS,
        messages: providerMessages,
        model: input.snapshot.model,
        rootDir: input.snapshot.memoryRoot,
        tools: input.snapshot.tools,
        workingDirectory: input.snapshot.workingDirectory,
        workspaceRoot: input.snapshot.workspaceRoot,
      });
      telemetry.finishCompleted();
      return "success";
    } catch (error) {
      if (
        input.abortSignal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        telemetry.finishCancelled("abort_signal");
        return "aborted";
      }
      telemetry.finishFailed("execute", "internal", error);
      return "error";
    }
  });
}
