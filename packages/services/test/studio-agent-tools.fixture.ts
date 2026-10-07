import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Event } from "@knorvia/rpc";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import type {
  StudioKernelAdapter,
  StudioKernelTurn,
  StudioKernelSink,
} from "../src/studio-runtime/contract.js";
import type { StudioAgentTools } from "../src/studio-runtime/agentToolTypes.js";

export async function fixture(
  adapter?: StudioKernelAdapter,
  options: {
    permission?: "ask" | "full-access" | "read-only";
    artifactCount?: number;
    policy?: Partial<import("../src/studio-runtime/agentToolTypes.js").StudioAgentPolicy>;
  } = {},
) {
  const path = await mkdtemp(join(tmpdir(), "knorvia-agent-tools-"));
  let now = 1000;
  const db = new StudioDatabase(join(path, "runtime.sqlite"));
  let tools!: StudioAgentTools;
  let sink!: StudioKernelSink;
  let caller!: StudioKernelTurn;
  let finishParent!: () => void;
  const paths: string[] = [];
  const children: Array<{
    turn: StudioKernelTurn;
    sink: StudioKernelSink;
    signal: AbortSignal;
    tools: StudioAgentTools;
  }> = [];
  const service = new StudioRuntimeService({
    db,
    clock: {
      id: randomUUID,
      now: () => now,
      delay: async (_ms, signal) => {
        signal?.throwIfAborted();
        await new Promise((resolve) => setTimeout(resolve, 1));
      },
    },
    kernels: {
      adapter: () => ({
        async run(turn, targetSink, signal) {
          if (turn.conversationId.includes("parent")) {
            caller = turn;
            sink = targetSink;
            tools = service.agentTools(turn, targetSink, signal);
            await new Promise<void>((resolve) => {
              finishParent = resolve;
              signal.addEventListener("abort", () => resolve(), { once: true });
            });
            return {
              status: signal.aborted ? "cancelled" : "succeeded",
              text: "",
              resultKnown: true,
            };
          }
          children.push({
            turn,
            sink: targetSink,
            signal,
            tools: service.agentTools(turn, targetSink, signal),
          });
          return adapter
            ? adapter.run(turn, targetSink, signal)
            : { status: "succeeded", text: "complete ".repeat(2000), resultKnown: true };
        },
      }),
      options: async () => ({
        models: [{ id: "child-model", label: "Child", reasoning: [{ id: "high", label: "High" }] }],
      }),
      inspect: async () => [],
      manage: async () => {
        throw new Error("unused");
      },
      dispose: async () => {},
    },
    workspaces: {
      prepare: async ({ sourcePath, runId }) => {
        const placed = join(sourcePath, runId);
        paths.push(placed);
        return placed;
      },
      changes: async () =>
        Array.from({ length: options.artifactCount ?? 0 }, (_, i) => ({
          path: `reports/file-${i}.txt`,
          kind: "added" as const,
          before: null,
          after: "report",
        })),
      apply: async () => {},
    },
    onDidChange: Event.None,
    notify: () => {},
    agentPolicy: { retryMs: 100, timeoutMs: 10000, ...options.policy },
  });
  await service.command({
    commandId: "cfg",
    type: "configure",
    kernel: "codex",
    config: {
      executablePath: "",
      permission: options.permission ?? "full-access",
      model: "child-model",
    },
  });
  db.transaction(() =>
    db.write("kernel-status", "codex", {
      id: "codex",
      installed: true,
      capabilities: {
        resume: true,
        approval: true,
        questions: true,
        readOnly: true,
        fullAccess: true,
      },
    }),
  );
  await service.command({
    commandId: "parent-create",
    type: "create-conversation",
    id: "parent",
    kernel: "codex",
    workspacePath: path,
  });
  const parent = await service.command({
    commandId: "parent-send",
    type: "send",
    kind: "chat",
    targetId: "parent",
    text: "delegate",
  });
  service.tick();
  await until(() => Boolean(tools));
  return {
    path,
    db,
    service,
    parent,
    paths,
    children,
    completeParent: () => finishParent(),
    get tools() {
      return tools;
    },
    get sink() {
      return sink;
    },
    get caller() {
      return caller;
    },
    now: (value: number) => {
      now = value;
    },
    async close() {
      await service.disposeAllAndWait();
      await rm(path, { recursive: true, force: true });
    },
  };
}
export async function until(check: () => boolean) {
  for (let i = 0; i < 500; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error("test did not settle");
}
