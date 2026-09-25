import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { createStudioWorkspaceManager } from "../src/studio-runtime/adapters/workspaceManager.js";
import type { StudioKernelRegistry, StudioWorkspacePort } from "../src/studio-runtime/app/ports.js";
import {
  readStudioRunOutcome,
  studioRestartDisplay,
  STUDIO_ACCEPTANCE_KIND,
} from "../src/studio-runtime/app/runOutcomeProjection.js";
import { applyStudioWorkspaceChanges } from "../src/studio-runtime/app/workspaceReview.js";
import { studioProjectKey } from "../src/studio-runtime/domain/projectIdentity.js";
import type { StoredRun } from "../src/studio-runtime/app/storePort.js";
import { readStudioTimeline } from "../src/studio-runtime/app/runtimeProjections.js";
import type { StudioApplyAcceptance, StudioMessage } from "../src/studio-runtime/types.js";

const PROJECT_KEY = studioProjectKey("D:/p");

const HOST_HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);
const steps = (
  stepId: string,
  step: Partial<import("../src/studio-runtime/workflowTypes.js").StudioStepResult> = {},
) => ({
  steps: {
    [stepId]: { status: "succeeded" as const, text: "", resultKnown: true, ...step },
  },
  values: {},
  completedRounds: 0,
});

function database(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "knorvia-delivery-"));
  const db = new StudioDatabase(join(directory, "runtime.sqlite"));
  t.after(() => {
    try {
      db.close();
    } catch {
      /* 已关闭 */
    }
    rmSync(directory, { recursive: true, force: true });
  });
  return db;
}

function seed(
  db: StudioDatabase,
  run: Partial<StoredRun> = {},
  step: Partial<import("../src/studio-runtime/workflowTypes.js").StudioStepResult> = {},
) {
  db.transaction(() =>
    db.write(
      "run",
      "run",
      {
        id: "run",
        targetId: "group",
        kind: "group",
        state: "succeeded",
        input: "",
        createdAt: 1,
        updatedAt: 1,
        attempt: 1,
        resultKnown: true,
        checkpoint: steps("step", step),
        ...run,
      },
      "group",
    ),
  );
  return db.read<StoredRun>("run", "run")!;
}

function accept(db: StudioDatabase, overrides: Partial<StudioApplyAcceptance> = {}) {
  const acceptance: StudioApplyAcceptance = {
    version: 1,
    runId: "run",
    stepId: "step",
    projectKey: PROJECT_KEY,
    operationId: "op-1",
    acceptedAt: 10,
    paths: ["a.txt"],
    fileVersions: [{ path: "a.txt", afterHash: HOST_HASH }],
    creation: null,
    confirmation: "host-verified",
    result: "accepted",
    journalState: "complete",
    ...overrides,
  };
  db.transaction(() =>
    db.write(
      STUDIO_ACCEPTANCE_KIND,
      `${acceptance.runId}:${acceptance.stepId}:${acceptance.operationId}`,
      acceptance,
      acceptance.runId,
    ),
  );
  return acceptance;
}

function workspaces(overrides: Partial<StudioWorkspacePort> = {}): StudioWorkspacePort {
  return {
    prepare: async ({ sourcePath }) => sourcePath,
    changes: async () => [],
    apply: async () => ({
      operationId: "op-host",
      files: [{ path: "a.txt", afterHash: HOST_HASH }],
      journalState: "complete",
    }),
    versions: async (_runId, _stepId, paths) => paths.map((path) => ({ path, hash: HOST_HASH })),
    ...overrides,
  };
}

const kernels = (remote?: unknown): StudioKernelRegistry => ({
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
  ...(remote ? { remoteWorkspace: () => remote as never } : {}),
});

function deps(db: StudioDatabase, port: StudioWorkspacePort, remote?: unknown) {
  let counter = 0;
  return {
    db,
    kernels: kernels(remote),
    workspaces: port,
    process: { id: process.pid, alive: (pid: number) => pid === process.pid },
    clock: { now: () => 100, id: () => `token-${++counter}`, delay: async () => {} },
  };
}

test("model prose and kernel tool state never lift a delivery above unverified", (t) => {
  const db = database(t);
  const run = seed(db, {}, { text: "测试全部通过，交付完成。" });
  const tools: StudioMessage[] = [
    {
      id: "t:tool:1",
      targetId: "group",
      runId: "run",
      turnId: "turn",
      sender: "codex",
      kind: "tool",
      text: "ok",
      name: "shell",
      state: "succeeded",
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  const outcome = readStudioRunOutcome(db, run, {
    toolMessages: tools,
    turnSteps: new Map([["turn", "step"]]),
  });
  assert.equal(outcome.outcome, "unverified");
  assert.deepEqual(outcome.steps[0]?.evidence, ["kernel-tool-state", "model-claim"]);
  // 没有消息记录时只是少一条低优先级证据，结论不变。
  assert.equal(readStudioRunOutcome(db, run).outcome, "unverified");
});

test("host-observed isolation is produced, host-verified acceptance is checked", (t) => {
  const db = database(t);
  const run = seed(
    db,
    {},
    { changesSummary: "1 个文件有实际变化（相对于成员隔离基线）：\nmodified: a.txt" },
  );
  db.transaction(() => {
    db.write(
      "workspace",
      "run:step",
      { runId: "run", stepId: "step", path: "D:/p", sourcePath: "D:/p" },
      "run",
    );
    db.write("workspace-head", "run:step", { stepId: "step", path: "D:/p" }, "run");
  });
  assert.equal(readStudioRunOutcome(db, run).outcome, "produced");
  accept(db);
  const checked = readStudioRunOutcome(db, run);
  assert.equal(checked.outcome, "checked");
  assert.deepEqual(checked.steps[0]?.evidence, ["host-hash", "apply-journal"]);
  assert.equal(checked.steps[0]?.acceptance?.operationId, "op-1");
  assert.equal(checked.restart, undefined);
  // 远端返回的摘要不是 Host 核验。
  const remote = readStudioRunOutcome(db, run);
  assert.equal(remote.steps[0]?.acceptance?.confirmation, "host-verified");
});

test("unknown results and unrecovered applies are never shown as accepted", (t) => {
  const db = database(t);
  const known = seed(db);
  db.transaction(() =>
    db.write("workspace", "run:step", {
      runId: "run",
      stepId: "step",
      path: "D:/p",
      sourcePath: "D:/p",
    }),
  );
  accept(db);
  db.transaction(() =>
    db.write("apply-lock", PROJECT_KEY, { token: "t", pid: 1, recoveryRequired: true }),
  );
  const withLock = readStudioRunOutcome(db, known);
  assert.equal(withLock.restart, "applied-refresh-failed");

  // 结果未知的任务即使有已接受记录，也先按"部分/未知"显示。
  const unknownRun = seed(db, { state: "interrupted", resultKnown: false });
  const outcome = readStudioRunOutcome(db, unknownRun);
  assert.equal(outcome.outcome, "unknown");
  assert.equal(outcome.restart, "partial-unknown");
});

test("creation output hash is host evidence, bare references stay produced", (t) => {
  const db = database(t);
  const ref = (sha256?: string) => ({
    status: "succeeded" as const,
    text: "",
    resultKnown: true,
    version: 1,
    outputs: [
      {
        kind: "creation-output" as const,
        name: "clip",
        creationJobId: "job-1",
        outputId: "out-1",
        ...(sha256 ? { sha256 } : {}),
      },
    ],
  });
  const hashed = seed(db, {}, ref(HOST_HASH));
  assert.equal(readStudioRunOutcome(db, hashed).outcome, "checked");
  db.transaction(() => db.remove("run", "run"));
  const bare = seed(db, {}, ref());
  assert.equal(readStudioRunOutcome(db, bare).outcome, "unverified");
  assert.deepEqual(readStudioRunOutcome(db, bare).steps[0]?.evidence, ["creation-record"]);
});

test("restart display reports later modification from hashes or from review conflicts", () => {
  const acceptance = {
    version: 1 as const,
    runId: "run",
    stepId: "step",
    projectKey: PROJECT_KEY,
    operationId: "op-1",
    acceptedAt: 10,
    paths: ["a.txt"],
    fileVersions: [{ path: "a.txt", afterHash: HOST_HASH }],
    creation: null,
    confirmation: "host-verified" as const,
    result: "accepted" as const,
    journalState: "complete" as const,
  };
  assert.equal(studioRestartDisplay({ acceptances: [acceptance] }), null);
  assert.equal(
    studioRestartDisplay({ acceptances: [acceptance], currentFileHashes: { "a.txt": HOST_HASH } }),
    null,
  );
  assert.equal(
    studioRestartDisplay({ acceptances: [acceptance], currentFileHashes: { "a.txt": OTHER_HASH } }),
    "accepted-later-modified",
  );
  assert.equal(
    studioRestartDisplay({
      acceptances: [acceptance],
      observedChanges: [
        { path: "a.txt", kind: "modified", before: "x", after: "y", conflict: true },
      ],
    }),
    "accepted-later-modified",
  );
  assert.equal(
    studioRestartDisplay({
      acceptances: [acceptance],
      currentFileHashes: { "a.txt": HOST_HASH },
      applyLock: { recoveryRequired: true },
    }),
    "applied-refresh-failed",
  );
  assert.equal(
    studioRestartDisplay({ acceptances: [{ ...acceptance, result: "remote-unverified" }] }),
    "applied-refresh-failed",
  );
  assert.equal(
    studioRestartDisplay({ acceptances: [acceptance], resultKnown: false }),
    "partial-unknown",
  );
  assert.equal(
    studioRestartDisplay({
      acceptances: [acceptance],
      journals: [{ state: "applying" }],
    }),
    "partial-unknown",
  );
});

test("the host receipt operation id is the apply journal transaction id", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "knorvia-delivery-apply-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "project");
  const data = join(root, "data");
  mkdirSync(source);
  writeFileSync(join(source, "a.txt"), "original\n");
  const manager = createStudioWorkspaceManager(data);
  const working = await manager.prepare({
    runId: "run",
    stepId: "step",
    sourcePath: source,
    mode: "isolated",
  });
  writeFileSync(join(working, "a.txt"), "edited\n");
  const receipt = await manager.apply("run", "step", ["a.txt"]);
  assert.ok(receipt, "本地应用必须返回回执");
  assert.equal(receipt.files.length, 1);
  assert.equal(receipt.journalState, "complete");
  const workspaceDir = join(data, "workspaces", readdirSync(join(data, "workspaces"))[0]!);
  assert.ok(readdirSync(workspaceDir).includes(`apply-${receipt.operationId}.json`));
  // 独立重读返回的当前哈希必须等于回执记录的 afterHash（否则验收会显示"之后被修改"）。
  const versions = await manager.versions!("run", "step", ["a.txt"]);
  assert.equal(versions[0]?.hash, receipt.files[0]?.afterHash);
});

test("acceptance carries the creation job references of the step", async (t) => {
  const db = database(t);
  seed(
    db,
    {},
    {
      version: 1,
      outputs: [
        {
          kind: "creation-output",
          name: "clip",
          creationJobId: "job-9",
          outputId: "out-9",
          sha256: HOST_HASH,
        },
      ],
    },
  );
  db.transaction(() => {
    db.write(
      "workspace",
      "run:step",
      { runId: "run", stepId: "step", path: "D:/p", sourcePath: "D:/p" },
      "run",
    );
  });
  await applyStudioWorkspaceChanges(deps(db, workspaces()), {
    runId: "run",
    stepId: "step",
    paths: ["a.txt"],
  });
  const row = db.list<StudioApplyAcceptance>(STUDIO_ACCEPTANCE_KIND, { scope: "run" })[0];
  assert.deepEqual(row?.creation, { jobId: "job-9", outputIds: ["out-9"] });
});

test("acceptance is written only after an independent re-read and released with the lock", async (t) => {
  const db = database(t);
  seed(db);
  db.transaction(() => {
    db.write(
      "workspace",
      "run:step",
      { runId: "run", stepId: "step", path: "D:/p", sourcePath: "D:/p" },
      "run",
    );
  });
  let versionReads = 0;
  const port = workspaces({
    versions: async (_runId, _stepId, paths) => {
      versionReads++;
      return paths.map((path) => ({ path, hash: HOST_HASH }));
    },
  });
  await applyStudioWorkspaceChanges(deps(db, port), {
    runId: "run",
    stepId: "step",
    paths: ["a.txt"],
  });
  assert.equal(versionReads, 1);
  const rows = db.list<StudioApplyAcceptance>(STUDIO_ACCEPTANCE_KIND, { scope: "run" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.result, "accepted");
  assert.equal(rows[0]?.confirmation, "host-verified");
  assert.equal(rows[0]?.operationId, "op-host");
  assert.deepEqual(rows[0]?.fileVersions, [{ path: "a.txt", afterHash: HOST_HASH }]);
  assert.equal(rows[0]?.journalState, "complete");
  assert.equal(db.read("apply-lock", PROJECT_KEY), undefined);
  // 验收记录不会被当成任务终态：run/step 仍是唯一所有者。
  assert.equal(db.read<StoredRun>("run", "run")?.state, "succeeded");
});

test("failed verification writes no accepted row and keeps the recovery lock", async (t) => {
  const db = database(t);
  seed(db);
  db.transaction(() => {
    db.write(
      "workspace",
      "run:step",
      { runId: "run", stepId: "step", path: "D:/p", sourcePath: "D:/p" },
      "run",
    );
  });
  const port = workspaces({
    versions: async () => {
      throw new Error("re-read unavailable");
    },
  });
  await assert.rejects(
    applyStudioWorkspaceChanges(deps(db, port), { runId: "run", stepId: "step", paths: ["a.txt"] }),
    /验收核验失败/,
  );
  assert.equal(db.list(STUDIO_ACCEPTANCE_KIND, { scope: "run" }).length, 0);
  const lock = db.read<{ recoveryRequired?: boolean; token: string }>("apply-lock", PROJECT_KEY);
  assert.equal(lock?.recoveryRequired, true);
  const restarted = readStudioRunOutcome(db, db.read<StoredRun>("run", "run")!);
  assert.equal(restarted.restart, "applied-refresh-failed");
  assert.equal(restarted.outcome, "unknown");
});

test("a port without re-read support keeps host-journal evidence only", async (t) => {
  const db = database(t);
  seed(db);
  db.transaction(() => {
    db.write(
      "workspace",
      "run:step",
      { runId: "run", stepId: "step", path: "D:/p", sourcePath: "D:/p" },
      "run",
    );
  });
  const port = workspaces();
  delete (port as { versions?: unknown }).versions;
  await applyStudioWorkspaceChanges(deps(db, port), {
    runId: "run",
    stepId: "step",
    paths: ["a.txt"],
  });
  const row = db.list<StudioApplyAcceptance>(STUDIO_ACCEPTANCE_KIND, { scope: "run" })[0];
  assert.equal(row?.confirmation, "host-journal");
  assert.equal(row?.result, "accepted");
});

test("remote applies are recorded as returned summaries the local host cannot verify", async (t) => {
  const db = database(t);
  seed(db);
  db.transaction(() => {
    db.write(
      "workspace",
      "run:step",
      {
        runId: "run",
        stepId: "step",
        path: "/srv/p",
        sourcePath: "/srv/p",
        remoteKernelId: "ssh:box:codex",
      },
      "run",
    );
  });
  let localApplies = 0;
  const port = workspaces({
    apply: async () => {
      localApplies++;
      return undefined;
    },
  });
  const remote = {
    agentWorkspaceChanges: async () => [],
    applyAgentWorkspaceChanges: async () => undefined,
  };
  await applyStudioWorkspaceChanges(deps(db, port, remote), {
    runId: "run",
    stepId: "step",
    paths: ["a.txt"],
  });
  assert.equal(localApplies, 0);
  const row = db.list<StudioApplyAcceptance>(STUDIO_ACCEPTANCE_KIND, { scope: "run" })[0];
  assert.equal(row?.confirmation, "remote-returned");
  assert.equal(row?.result, "remote-unverified");
  assert.deepEqual(row?.fileVersions, []);
  const outcome = readStudioRunOutcome(db, db.read<StoredRun>("run", "run")!);
  assert.notEqual(outcome.outcome, "checked");
  // 本地 Host 没有远端 journal、也没有远端哈希，没有任何本地证据能提升结论。
  assert.deepEqual(outcome.steps[0]?.evidence, ["none"]);
  assert.equal(outcome.steps[0]?.acceptance?.confirmation, "remote-returned");
  assert.equal(outcome.restart, "applied-refresh-failed");
});

test("the timeline payload carries the additive delivery outcome", (t) => {
  const db = database(t);
  seed(db, {}, { text: "我改好了文件。" });
  const timeline = readStudioTimeline(db, 100, "group");
  assert.equal(timeline.runs[0]?.outcome?.outcome, "unverified");
  assert.deepEqual(timeline.runs[0]?.outcome?.steps[0]?.evidence, ["model-claim"]);
});

// 回归：旧运行可能没有 checkpoint（StudioRun.checkpoint 是可选字段）。
// 投影必须只依赖 workspace-head 等既有记录，不能在缺 checkpoint 时抛错。
test("runs without a checkpoint are still projected instead of throwing", (t) => {
  const db = database(t);
  seed(db, { checkpoint: undefined } as Partial<StoredRun>);
  const outcome = readStudioRunOutcome(db, db.read<StoredRun>("run", "run")!);
  assert.deepEqual(outcome.steps, []);
  assert.equal(outcome.outcome, "unverified");
  assert.doesNotThrow(() => readStudioTimeline(db, 100, "group"));
});
