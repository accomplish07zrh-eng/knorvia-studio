// SPDX-License-Identifier: Apache-2.0
import type { TestContext } from "node:test";
import fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { Event } from "@knorvia/rpc";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { createStudioWorkspaceManager } from "../src/studio-runtime/adapters/workspaceManager.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import type { StudioKernelTurn, StudioKernelTurnResult } from "../src/studio-runtime/contract.js";

export async function workspaceReviewFixture(
  t: Pick<TestContext, "after">,
  options: { result?: StudioKernelTurnResult } = {},
) {
  const root = await fs.mkdtemp(join(tmpdir(), "knorvia-review-"));
  const source = join(root, "source");
  await fs.mkdir(source);
  await fs.writeFile(join(source, "a.txt"), "dirty source\nold\n");
  const workspaces = createStudioWorkspaceManager(join(root, "snapshots"));
  const working = await workspaces.prepare({
    runId: "group-review",
    stepId: "codex",
    sourcePath: source,
    mode: "isolated",
  });
  await fs.writeFile(join(working, "a.txt"), "dirty source\nnew\n");
  const db = new StudioDatabase(join(root, "runtime.sqlite"));
  const definition = {
    id: "review",
    name: "Review",
    goal: "",
    sharedSummary: "",
    members: ["knorvia", "codex"],
    host: "knorvia",
    mode: "manual",
    workspaceMode: "isolated",
    workspacePath: source,
    updatedAt: 1,
  };
  db.transaction(() => {
    db.write("group", "review", definition);
    db.write(
      "run",
      "original",
      {
        id: "original",
        kind: "group",
        targetId: "review",
        definition,
        input: "original",
        state: "succeeded",
        attempt: 1,
        checkpoint: { steps: {}, values: {}, completedRounds: 0 },
        createdAt: 1,
        updatedAt: 1,
      },
      "review",
    );
    db.write(
      "workspace",
      "original:step",
      { runId: "group-review", stepId: "codex", sourcePath: source, path: working },
      "original",
    );
    db.write(
      "turn",
      "turn",
      {
        id: "turn",
        runId: "original",
        stepId: "step",
        kernel: "codex",
        memberId: "codex",
        conversationId: "group:review:codex",
        workspacePath: working,
        permission: "ask",
        nativeSessionId: "native-original",
        state: "succeeded",
        attempt: 1,
      },
      "original",
    );
    db.write("session", `group:review:codex:${working}`, {
      id: `group:review:codex:${working}`,
      nativeSessionId: "native-original",
      workspacePath: working,
    });
  });
  const calls: StudioKernelTurn[] = [];
  const service = new StudioRuntimeService({
    db,
    workspaces,
    clock: {
      now: Date.now,
      id: randomUUID,
      delay: (ms, signal) => sleep(ms, undefined, { signal }),
    },
    kernels: {
      adapter: () => ({
        run: async (turn) => {
          calls.push(turn);
          if (options.result) return options.result;
          await fs.writeFile(join(working, "a.txt"), "agent corrected\n");
          return {
            status: "succeeded",
            text: "done",
            resultKnown: true,
            nativeSessionId: "native-original",
          };
        },
      }),
      inspect: async () => [],
      manage: async () => {
        throw new Error("unused");
      },
      dispose: async () => {},
    },
    onDidChange: Event.None,
    notify: () => {},
  });
  t.after(async () => {
    await service.disposeAllAndWait();
    await fs.rm(root, { recursive: true, force: true });
  });
  const changes = await service.workspaceChanges({ runId: "original", stepId: "step" });
  const save = (body = "please correct") =>
    service.command({
      type: "workspace-review",
      action: "save-comment",
      commandId: randomUUID(),
      runId: "original",
      stepId: "step",
      baseRevision: 0,
      commentId: "comment",
      body,
      anchor: {
        path: "a.txt",
        side: "new",
        startLine: 2,
        endLine: 2,
        version: changes[0]!.version!,
      },
    });
  return { service, db, root, source, working, calls, changes, save, workspaces };
}
