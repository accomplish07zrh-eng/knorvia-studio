import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { KernelRun } from "../src/studio-runtime/adapters/kernels/kernelRun.js";
import {
  deferred,
  type ProtocolProcess,
} from "../src/studio-runtime/adapters/kernels/processTransport.js";
import type {
  StudioKernelAdapter,
  StudioKernelSink,
  StudioConversation,
} from "../src/studio-runtime/contract.js";
import type { StudioWorkspacePort } from "../src/studio-runtime/app/ports.js";
import type { StoredRun } from "../src/studio-runtime/app/storePort.js";
import { pendingStudioSteering } from "../src/studio-runtime/app/pendingInbox.js";
import { expireRunInteractions } from "../src/studio-runtime/app/runExecutor.js";
import { studioProjectKey } from "../src/studio-runtime/domain/projectIdentity.js";
import { validateStudioCommand } from "../src/studio-runtime/domain/validation.js";
import type { StudioCommand } from "../src/studio-runtime/contract.js";

function fixture(adapter: StudioKernelAdapter, workspaces?: StudioWorkspacePort) {
  const db = new StudioDatabase(join(mkdtempSync(join(tmpdir(), "studio-polish-")), "db.sqlite"));
  const service = new StudioRuntimeService({
    db,
    clock: {
      now: Date.now,
      id: randomUUID,
      delay: (ms, signal) => sleep(ms, undefined, { signal }),
    },
    kernels: {
      adapter: () => adapter,
      inspect: async () => [],
      manage: async () => {
        throw new Error("unused");
      },
      dispose: async () => {},
    },
    workspaces: workspaces ?? {
      prepare: async () => "D:/project",
      changes: async () => [],
      apply: async () => {},
    },
    process: { id: process.pid, alive: (pid) => pid === process.pid },
    onDidChange: () => ({ dispose() {} }),
    notify() {},
  });
  return { db, service };
}
async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 5000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("Timed out");
    await sleep(5);
  }
}
async function start(service: StudioRuntimeService) {
  await service.command({
    commandId: randomUUID(),
    type: "create-conversation",
    id: "chat",
    kernel: "codex",
    workspacePath: "D:/project",
  });
  await service.command({
    commandId: randomUUID(),
    type: "send",
    kind: "chat",
    targetId: "chat",
    text: "first",
    selection: { model: "first-model", reasoningEffort: "low" },
  });
  service.tick();
}

test("RPC rejects a truthy non-boolean retry acknowledgement and unknown installation action before work", async () => {
  for (const value of ["false", "true", 1, {}, undefined])
    assert.throws(
      () =>
        validateStudioCommand({
          commandId: "retry",
          type: "resume",
          runId: "run",
          retryUncertain: value,
        } as unknown as StudioCommand),
      /确认/,
    );
  const { service } = fixture({
    run: async () => {
      throw new Error("unused");
    },
  });
  try {
    await assert.rejects(
      service.manageKernel({ kernel: "codex", action: "unknown" } as never),
      /未知内核管理/,
    );
    await assert.rejects(
      service.manageKernel({ kernel: "unknown", action: "install" } as never),
      /未知内核/,
    );
  } finally {
    await service.disposeAllAndWait();
  }
});

test("late native session acknowledgement preserves the newer queued chat selection", async () => {
  let sink: StudioKernelSink | undefined;
  const finish = deferred<void>();
  const { db, service } = fixture({
    run: async (_turn, output) => {
      sink = output;
      await finish.promise;
      return { status: "succeeded", text: "", resultKnown: true };
    },
  });
  try {
    await start(service);
    await until(() => !!sink);
    await service.command({
      commandId: randomUUID(),
      type: "send",
      kind: "chat",
      targetId: "chat",
      text: "second",
      selection: { model: "second-model", reasoningEffort: "medium" },
    });
    await sink!.emit({ type: "session", sessionId: "native-session" });
    const saved = db.read<StudioConversation>("conversation", "chat")!;
    assert.deepEqual(saved.selection, { model: "second-model", reasoningEffort: "medium" });
    assert.equal(saved.nativeSessionId, "native-session");
  } finally {
    finish.resolve();
    await service.disposeAllAndWait();
  }
});

test("pending inbox and interaction expiry remain complete beyond the historical page limit", async () => {
  const { db, service } = fixture({
    run: async () => {
      throw new Error("unused");
    },
  });
  try {
    db.transaction(() => {
      db.write(
        "steering",
        "oldest",
        { id: "oldest", text: "first correction", state: "pending" },
        "run",
      );
      db.write(
        "interaction",
        "old-question",
        { id: "old-question", runId: "run", status: "pending" },
        "group",
      );
    });
    db.transaction(() => {
      for (let i = 0; i < 1200; i++) {
        db.write(
          "steering",
          `consumed-${i}`,
          { id: `consumed-${i}`, text: "historical", state: "consumed" },
          "run",
        );
        db.write(
          "interaction",
          `answered-${i}`,
          { id: `answered-${i}`, runId: "run", status: "answered" },
          "group",
        );
      }
    });
    db.transaction(() =>
      db.write(
        "steering",
        "newest",
        { id: "newest", text: "last correction", state: "pending" },
        "run",
      ),
    );
    assert.deepEqual(
      pendingStudioSteering(db, "run").map((item) => item.id),
      ["oldest", "newest"],
    );
    db.transaction(() => expireRunInteractions(db, { id: "run", targetId: "group" } as StoredRun));
    assert.equal(db.read<{ status: string }>("interaction", "old-question")?.status, "expired");
  } finally {
    await service.disposeAllAndWait();
  }
});

test("unresolved failed application retains the project gate until in-process recovery succeeds", async () => {
  let canRecover = false;
  const { db, service } = fixture(
    {
      run: async () => {
        throw new Error("unused");
      },
    },
    {
      prepare: async () => "D:/project",
      apply: async () => {
        throw new Error("rollback conflict");
      },
      changes: async () => {
        if (!canRecover) throw new Error("recovery conflict");
        return [];
      },
    },
  );
  try {
    db.transaction(() => {
      db.write("run", "run", { id: "run", targetId: "group", kind: "group", state: "succeeded" });
      db.write("workspace", "run:step", {
        runId: "run",
        stepId: "step",
        path: "D:/isolated",
        sourcePath: "D:/project",
      });
    });
    await assert.rejects(
      service.applyWorkspaceChanges({ runId: "run", stepId: "step", paths: ["file.txt"] }),
      /rollback conflict/,
    );
    assert.equal(
      db.read<{ recoveryRequired: boolean }>("apply-lock", studioProjectKey("D:/project"))
        ?.recoveryRequired,
      true,
    );
    await service.command({
      commandId: randomUUID(),
      type: "create-conversation",
      id: "chat",
      kernel: "codex",
      workspacePath: "D:/project",
    });
    const send = {
      commandId: randomUUID(),
      type: "send" as const,
      kind: "chat" as const,
      targetId: "chat",
      text: "write",
    };
    await assert.rejects(service.command(send), /应用|中断/);
    await assert.rejects(
      service.workspaceChanges({ runId: "run", stepId: "step" }),
      /recovery conflict/,
    );
    canRecover = true;
    await service.workspaceChanges({ runId: "run", stepId: "step" });
    assert.equal(db.read("apply-lock", studioProjectKey("D:/project")), undefined);
    await service.command(send);
  } finally {
    await service.disposeAllAndWait();
  }
});

test("native withdrawal expires just that persisted question while the turn and sibling question stay live", async () => {
  let native: KernelRun | undefined;
  let withdrawn = false;
  const finish = deferred<void>();
  const { service } = fixture({
    run: async (turn, sink) => {
      native = new KernelRun(turn, sink);
      native.process = { wait: (promise: Promise<unknown>) => promise } as ProtocolProcess;
      const old = native
        .ask({
          id: "withdrawn",
          kind: "approval",
          title: "Old request",
          choices: ["allow-once", "deny"],
        })
        .catch(() => {
          withdrawn = true;
        });
      const sibling = native
        .ask({
          id: "sibling",
          kind: "approval",
          title: "Current request",
          choices: ["allow-once", "deny"],
        })
        .catch(() => {});
      await finish.promise;
      native.finish("succeeded");
      await Promise.all([old, sibling]);
      return { status: "succeeded", text: "", resultKnown: true };
    },
  });
  try {
    await start(service);
    await until(async () => (await service.timeline("chat")).interactions.length === 2);
    const before = (await service.timeline("chat")).interactions;
    const old = before.find((item) => item.title === "Old request")!;
    const sibling = before.find((item) => item.title === "Current request")!;
    native!.invalidate("withdrawn");
    await until(() => withdrawn);
    await until(
      async () =>
        (await service.timeline("chat")).interactions.find((item) => item.id === old.id)?.status ===
        "expired",
    );
    const timeline = await service.timeline("chat");
    assert.equal(timeline.interactions.find((item) => item.id === sibling.id)?.status, "pending");
    assert.equal(timeline.runs[0]!.state, "waiting");
    await assert.rejects(
      service.command({
        commandId: randomUUID(),
        type: "answer",
        interactionId: old.id,
        answer: { decision: "allow-once" },
      }),
      /失效/,
    );
    await assert.rejects(
      service.command({
        commandId: randomUUID(),
        type: "answer",
        interactionId: sibling.id,
        answer: { decision: "allow-session" },
      }),
      /不支持/,
    );
    await service.command({
      commandId: randomUUID(),
      type: "answer",
      interactionId: sibling.id,
      answer: { decision: "allow-once" },
    });
  } finally {
    finish.resolve();
    await service.disposeAllAndWait();
  }
});
