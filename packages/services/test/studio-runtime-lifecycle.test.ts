import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { Event } from "@knorvia/rpc";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { studioProjectKey } from "../src/studio-runtime/domain/projectIdentity.js";
import type { StudioKernelRegistry, StudioWorkspacePort } from "../src/studio-runtime/app/ports.js";
import type { StudioKernelStatus } from "../src/studio-runtime/kernelTypes.js";

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-lifecycle-"));
  const databasePath = join(directory, "runtime.sqlite");
  const db = new StudioDatabase(databasePath);
  const gates: Array<() => void> = [];
  const events: string[] = [];
  let closeCount = 0;
  const close = db.close.bind(db);
  db.close = () => {
    closeCount++;
    events.push("close");
    close();
  };
  const kernels: StudioKernelRegistry = {
    adapter: () => ({
      async run() {
        return { status: "succeeded", text: "", resultKnown: true };
      },
    }),
    inspect: async () => [],
    manage: async () => {
      throw new Error("unused");
    },
    dispose: async () => {},
  };
  const workspaces: StudioWorkspacePort = {
    prepare: async ({ sourcePath }) => sourcePath,
    changes: async () => [],
    apply: async () => {},
  };
  const service = new StudioRuntimeService({
    db,
    kernels,
    workspaces,
    clock: {
      now: Date.now,
      id: randomUUID,
      delay: (ms, signal) => sleep(ms, undefined, { signal }),
    },
    process: { id: process.pid, alive: (pid) => pid === process.pid },
    notify: () => {},
    onDidChange: Event.None,
  });
  db.transaction(() => {
    db.write("run", "run", { id: "run", targetId: "group", kind: "group", state: "succeeded" });
    db.write("workspace", "run:step", {
      runId: "run",
      stepId: "step",
      path: directory,
      sourcePath: directory,
    });
  });
  t.after(async () => {
    for (const release of gates) release();
    await service.disposeAllAndWait().catch(() => {});
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  });
  return {
    db,
    service,
    kernels,
    workspaces,
    directory,
    databasePath,
    events,
    get closeCount() {
      return closeCount;
    },
    gate() {
      let release!: () => void;
      const promise = new Promise<void>((done) => {
        release = done;
      });
      gates.push(release);
      return { promise, release };
    },
    readSaved<T>(kind: string, id: string): T | undefined {
      const saved = new StudioDatabase(databasePath);
      try {
        return saved.read<T>(kind, id);
      } finally {
        saved.close();
      }
    },
  };
}

test("shutdown waits for an accepted file application, clears its lock, and rejects new RPCs", async (t) => {
  const f = await fixture(t);
  const started = f.gate();
  const finish = f.gate();
  f.workspaces.apply = async () => {
    started.release();
    await finish.promise;
    await writeFile(join(f.directory, "applied.txt"), "applied");
    f.events.push("apply");
  };
  const applying = f.service.applyWorkspaceChanges({
    runId: "run",
    stepId: "step",
    paths: ["applied.txt"],
  });
  await started.promise;
  const stopping = f.service.disposeAllAndWait();
  assert.equal(f.service.disposeAllAndWait(), stopping, "shutdown is one shared promise");
  await sleep(10);
  assert.equal(f.closeCount, 0);
  assert.equal(
    f.db.read<{ pid: number }>("apply-lock", studioProjectKey(f.directory))?.pid,
    process.pid,
  );
  const calls = [
    f.service.overview(),
    f.service.timeline("group"),
    f.service.inspectKernels(),
    f.service.kernelOptions({ kernel: "codex" }),
    f.service.manageKernel({ kernel: "codex", action: "install" }),
    f.service.workspaceChanges({ runId: "run", stepId: "step" }),
    f.service.applyWorkspaceChanges({ runId: "run", stepId: "step", paths: ["other.txt"] }),
    f.service.command({
      commandId: randomUUID(),
      type: "configure",
      kernel: "codex",
      config: { executablePath: "", permission: "ask" },
    }),
  ];
  await Promise.all(calls.map((call) => assert.rejects(call, /应用正在退出/)));
  f.service.tick();
  finish.release();
  await applying;
  await stopping;
  assert.deepEqual(f.events, ["apply", "close"]);
  assert.equal(f.closeCount, 1);
  assert.equal(f.readSaved("apply-lock", studioProjectKey(f.directory)), undefined);
  assert.equal(await readFile(join(f.directory, "applied.txt"), "utf8"), "applied");
  await assert.rejects(f.service.overview(), /应用正在退出/);
});

test("failed application still clears its lock before close and keeps its original error", async (t) => {
  const f = await fixture(t);
  const started = f.gate();
  const finish = f.gate();
  f.workspaces.apply = async () => {
    started.release();
    await finish.promise;
    throw new Error("fixture conflict");
  };
  const applying = assert.rejects(
    f.service.applyWorkspaceChanges({ runId: "run", stepId: "step", paths: ["conflict.txt"] }),
    /fixture conflict/,
  );
  await started.promise;
  const stopping = f.service.disposeAllAndWait();
  await sleep(10);
  assert.equal(f.closeCount, 0);
  finish.release();
  await applying;
  await stopping;
  assert.equal(f.readSaved("apply-lock", studioProjectKey(f.directory)), undefined);
  assert.equal(f.closeCount, 1);
});

test("interrupted application recovery finishes its database cleanup before disposal", async (t) => {
  const f = await fixture(t);
  const started = f.gate();
  const finish = f.gate();
  const key = studioProjectKey(f.directory);
  f.db.transaction(() => f.db.write("apply-lock", key, { token: "dead", pid: 2147483647 }));
  f.workspaces.changes = async () => {
    started.release();
    await finish.promise;
    return [];
  };
  const inspecting = f.service.workspaceChanges({ runId: "run", stepId: "step" });
  await started.promise;
  const stopping = f.service.disposeAllAndWait();
  await sleep(10);
  assert.equal(f.closeCount, 0);
  finish.release();
  await inspecting;
  await stopping;
  assert.equal(f.readSaved("apply-lock", key), undefined);
});

test("successful managed installation persists its configuration before the database closes", async (t) => {
  const f = await fixture(t);
  const started = f.gate();
  const finish = f.gate();
  const executablePath = join(f.directory, "new-version", "codex.exe");
  const status: StudioKernelStatus = {
    id: "codex",
    origin: "managed",
    installed: true,
    executablePath,
    capabilities: {
      resume: true,
      approval: true,
      questions: true,
      readOnly: true,
      fullAccess: true,
    },
  };
  f.kernels.manage = async () => {
    started.release();
    await finish.promise;
    return status;
  };
  const installing = f.service.manageKernel({ kernel: "codex", action: "install" });
  await started.promise;
  const stopping = f.service.disposeAllAndWait();
  await sleep(10);
  assert.equal(f.closeCount, 0);
  finish.release();
  assert.equal(await installing, status);
  await stopping;
  assert.equal(
    f.readSaved<{ executablePath: string }>("config", "codex")?.executablePath,
    executablePath,
  );
});

test(
  "kernel cancellation runs concurrently with RPC draining so probes cannot deadlock shutdown",
  { timeout: 2000 },
  async (t) => {
    const f = await fixture(t);
    const cancelled = f.gate();
    let probes = 0;
    f.kernels.inspect = async () => {
      probes++;
      await cancelled.promise;
      throw new Error("probe cancelled");
    };
    f.kernels.options = async () => {
      probes++;
      await cancelled.promise;
      throw new Error("catalog cancelled");
    };
    f.kernels.dispose = async () => {
      assert.equal(probes, 2);
      cancelled.release();
    };
    const inspecting = assert.rejects(f.service.inspectKernels(), /probe cancelled/);
    const options = assert.rejects(
      f.service.kernelOptions({ kernel: "codex" }),
      /catalog cancelled/,
    );
    await f.service.disposeAllAndWait();
    await Promise.all([inspecting, options]);
    assert.equal(f.closeCount, 1);
  },
);

test(
  "shutdown also waits for an active run after cancellation and ignores its late frames",
  { timeout: 2000 },
  async (t) => {
    const f = await fixture(t);
    const started = f.gate();
    const cancelled = f.gate();
    const finish = f.gate();
    f.kernels.adapter = () => ({
      async run(_turn, sink, signal) {
        started.release();
        signal.addEventListener("abort", cancelled.release, { once: true });
        await finish.promise;
        await sink.emit({ type: "text", text: "late" });
        f.events.push("run-stopped");
        return { status: "cancelled", text: "", resultKnown: true };
      },
    });
    await f.service.command({
      commandId: randomUUID(),
      type: "create-conversation",
      id: "chat",
      kernel: "codex",
      workspacePath: f.directory,
    });
    const run = await f.service.command({
      commandId: randomUUID(),
      type: "send",
      kind: "chat",
      targetId: "chat",
      text: "fixture",
    });
    f.service.tick();
    await started.promise;
    const stopping = f.service.disposeAllAndWait();
    await cancelled.promise;
    assert.equal(f.closeCount, 0);
    finish.release();
    await stopping;
    assert.deepEqual(f.events, ["run-stopped", "close"]);
    assert.equal(f.readSaved<{ state: string }>("run", run.id)?.state, "interrupted");
  },
);

test("kernel cleanup failure is reported after draining and closing the database once", async (t) => {
  const f = await fixture(t);
  f.kernels.dispose = async () => {
    throw new Error("kernel cleanup failed");
  };
  const stopping = f.service.disposeAllAndWait();
  await assert.rejects(stopping, /kernel cleanup failed/);
  assert.equal(f.service.disposeAllAndWait(), stopping);
  assert.equal(f.closeCount, 1);
});
