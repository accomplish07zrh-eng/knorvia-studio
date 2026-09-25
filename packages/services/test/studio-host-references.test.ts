import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { createStudioWorkspaceManager } from "../src/studio-runtime/adapters/workspaceManager.js";
import { admitStudioCommand, requiredRun } from "../src/studio-runtime/app/commandAdmission.js";
import { executeStudioWorkflow } from "../src/studio-runtime/app/workflowExecutor.js";
import { workflowText } from "../src/studio-runtime/app/workflowSteps.js";
import {
  resolveStudioWorkflowBindings,
  studioReferenceEvidence,
  studioReferenceOrigin,
  studioReferenceOwnership,
  studioReferencePathReason,
  studioReferenceVersionVerdict,
  studioReferenceWorkspace,
  STUDIO_REFERENCE_VERSION,
} from "../src/studio-runtime/domain/reference.js";
import {
  resolveStudioWorkflowParams,
  validateStudioWorkflow,
  validateStudioWorkflowPermissions,
} from "../src/studio-runtime/domain/workflowGraph.js";
import { STUDIO_WORKFLOW_PARAMS_KEY } from "../src/studio-runtime/workflowTypes.js";
import { harness, success, workflow } from "./studio-orchestration-support.js";

const clock = {
  now: Date.now,
  id: randomUUID,
  delay: (ms: number, signal?: AbortSignal) => sleep(ms, undefined, { signal }),
};
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function database() {
  const root = mkdtempSync(join(tmpdir(), "knorvia-host-reference-"));
  return new StudioDatabase(join(root, "runtime.sqlite"));
}

/* ------------------------------------------------------------------ *
 * 引用拒绝矩阵
 * ------------------------------------------------------------------ */

test("reference path problems are classified into distinct, testable reasons", () => {
  assert.equal(studioReferencePathReason("../secret.txt"), "traversal");
  assert.equal(studioReferencePathReason("a/../../b"), "traversal");
  assert.equal(studioReferencePathReason("a//b"), "traversal");
  assert.equal(studioReferencePathReason("/etc/passwd"), "absolute-path");
  assert.equal(studioReferencePathReason("C:/Users/x"), "absolute-path");
  assert.equal(studioReferencePathReason("a\\b"), "absolute-path");
  assert.equal(studioReferencePathReason("notes.txt:stream"), "dangerous-name");
  assert.equal(studioReferencePathReason("con"), "dangerous-name");
  assert.equal(studioReferencePathReason("a/aux.log"), "dangerous-name");
  assert.equal(studioReferencePathReason("report."), "dangerous-name");
  assert.equal(studioReferencePathReason(""), "malformed");
  assert.equal(studioReferencePathReason("x".repeat(2000)), "malformed");
  assert.equal(studioReferencePathReason("notes/design.md"), undefined);
});

test("reference origin rejects foreign runs, foreign steps and workspace mismatch", () => {
  const ref = {
    kind: "workspace-file",
    name: "design",
    runId: "run-1",
    stepId: "workflow:n1:attempt:0",
    relativePath: "out/design.md",
  };
  assert.deepEqual(studioReferenceOrigin(ref, { runId: "run-1" }), {
    ok: true,
    kind: "workspace-file",
    relativePath: "out/design.md",
  });
  assert.equal(studioReferenceOrigin(ref, { runId: "run-2" }).reason, "foreign-task");
  assert.equal(
    studioReferenceOwnership(ref, { runId: "run-1", stepOwners: ["workflow:n2:"] }).reason,
    "foreign-step",
  );
  assert.equal(
    studioReferenceOrigin({ ...ref, relativePath: "../escape.md" }, { runId: "run-1" }).reason,
    "traversal",
  );
  assert.equal(
    studioReferenceOrigin({ ...ref, relativePath: "C:/x.md" }, { runId: "run-1" }).reason,
    "absolute-path",
  );
  assert.equal(
    studioReferenceOrigin({ ...ref, relativePath: "notes.txt:stream" }, { runId: "run-1" }).reason,
    "dangerous-name",
  );
  assert.equal(studioReferenceOrigin({ kind: "other" }, { runId: "run-1" }).reason, "malformed");
  assert.equal(
    studioReferenceWorkspace({ workspaceIdentity: "identity-a", referenceWorkspaceIdentity: "b" })
      .reason,
    "workspace-mismatch",
  );
  assert.equal(studioReferenceWorkspace({ workspaceIdentity: "a" }).ok, true);
});

test("reference evidence distinguishes missing, changed and unsupported versions", () => {
  const ref = {
    kind: "workspace-file" as const,
    name: "design",
    runId: "run-1",
    stepId: "workflow:n1:attempt:0",
    relativePath: "out/design.md",
    sha256: sha256("content"),
  };
  assert.equal(studioReferenceEvidence(ref, { exists: false, sha256: null }).reason, "missing");
  assert.equal(studioReferenceEvidence(ref, undefined).reason, "missing");
  assert.equal(
    studioReferenceEvidence(ref, { exists: true, sha256: sha256("other") }).reason,
    "changed",
  );
  assert.equal(studioReferenceEvidence(ref, { exists: true, sha256: sha256("content") }).ok, true);
  assert.equal(studioReferenceEvidence(ref, { exists: true, sha256: null }).reason, "missing");
  assert.equal(
    studioReferenceVersionVerdict(STUDIO_REFERENCE_VERSION + 1, STUDIO_REFERENCE_VERSION).reason,
    "unsupported-version",
  );
  assert.equal(studioReferenceVersionVerdict(0, STUDIO_REFERENCE_VERSION).ok, true);
});

test("structured references stay unverified without host evidence and reject path escapes", async () => {
  const outcomes = new Map([
    [
      "n1",
      {
        status: "succeeded",
        text: "ok",
        version: 1,
        outputs: [
          {
            kind: "workspace-file" as const,
            name: "design",
            runId: "run-1",
            stepId: "workflow:n1:attempt:0",
            relativePath: "out/design.md",
            sha256: sha256("content"),
          },
        ],
      },
    ],
  ]);
  // 没有 fileVersion 的宿主读不到证据：必须失败关闭，不能当作"未变化"。
  await assert.rejects(
    resolveStudioWorkflowBindings({
      sources: ["{{ref.design}}"],
      outcomes,
      host: { runId: "run-1" },
    }),
    /host evidence/,
  );
  await assert.rejects(
    resolveStudioWorkflowBindings({
      sources: ["{{ref.design}}"],
      outcomes,
      host: {
        runId: "run-1",
        fileVersion: async () => sha256("changed"),
      },
    }),
    /changed since it was recorded/,
  );
  await assert.rejects(
    resolveStudioWorkflowBindings({
      sources: ["{{ref.design}}"],
      outcomes,
      host: { runId: "run-2", fileVersion: async () => sha256("content") },
    }),
    /belongs to another run/,
  );
  // 非前置节点的产出即使在结果里可见也不能用。
  await assert.rejects(
    resolveStudioWorkflowBindings({
      sources: ["{{ref.design}}"],
      outcomes,
      ancestors: new Set(["n0"]),
      host: { runId: "run-1", fileVersion: async () => sha256("content") },
    }),
    /unavailable before execution/,
  );
  const resolved = await resolveStudioWorkflowBindings({
    sources: ["{{ref.design}}"],
    outcomes,
    host: { runId: "run-1", fileVersion: async () => sha256("content") },
  });
  assert.equal(resolved.get("design"), "out/design.md");
});

/* ------------------------------------------------------------------ *
 * 执行期解析：缺失引用在调用内核前失败，旧文本展开保持不变
 * ------------------------------------------------------------------ */

test("output references expand before execution while legacy node text keeps working", async () => {
  const graph = workflow(
    ["start", "agent", "agent", "end"],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  );
  graph.nodes[1]!.data.outputNames = ["design"];
  graph.nodes[2]!.data.prompt = "Use {{ref.design}} and {{n1}}";
  assert.deepEqual(validateStudioWorkflow(graph), []);
  const h = harness(async () => ({
    status: "succeeded",
    text: "NODE-TEXT",
    resultKnown: true,
    version: 1,
    outputs: [{ kind: "text", name: "design", text: "BLUE" }],
  }));
  h.port.reference = { runId: "run-1", workspaceIdentity: "/project" };
  assert.equal((await executeStudioWorkflow(graph, "seed", h.port)).status, "succeeded");
  assert.match(h.calls[1]!.prompt, /BLUE/);
  assert.match(h.calls[1]!.prompt, /NODE-TEXT/);
});

test("a missing output reference fails the node before any kernel call", async () => {
  const graph = workflow(
    ["start", "agent", "agent", "end"],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  );
  graph.nodes[1]!.data.outputNames = ["design"];
  graph.nodes[2]!.data.prompt = "Use {{ref.design}}";
  const h = harness(async () => success("no outputs here"));
  h.port.reference = { runId: "run-1", workspaceIdentity: "/project" };
  const result = await executeStudioWorkflow(graph, "seed", h.port);
  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /ref\.design/);
  assert.equal(h.calls.length, 1);
});

test("declared output names and parameters are validated at definition time", () => {
  const graph = workflow(
    ["start", "agent", "agent", "end"],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  );
  graph.nodes[1]!.data.outputNames = ["notes"];
  graph.nodes[2]!.data.params = [{ name: "topic", type: "text", required: true }];
  assert.deepEqual(validateStudioWorkflow(graph), []);
  graph.nodes[2]!.data.prompt = "Read {{param.topic}} then {{ref.notes}}";
  assert.deepEqual(validateStudioWorkflow(graph), []);
  graph.nodes[2]!.data.prompt = "Read {{param.missing}}";
  assert.ok(validateStudioWorkflow(graph).some((issue) => issue.includes("unknown parameter")));
  graph.nodes[2]!.data.prompt = "Read {{ref.missing}}";
  assert.ok(validateStudioWorkflow(graph).some((issue) => issue.includes("unavailable output")));
  graph.nodes[2]!.data.prompt = "Task";
  graph.nodes[2]!.data.params = [{ name: "topic", type: "nope" }];
  assert.ok(
    validateStudioWorkflow(graph).some((issue) => issue.includes("Unknown parameter type")),
  );
  graph.nodes[2]!.data.params = [
    { name: "topic", type: "text" },
    { name: "topic", type: "text" },
  ];
  assert.ok(validateStudioWorkflow(graph).some((issue) => issue.includes("duplicate parameter")));
  graph.nodes[2]!.data.params = [{ name: "topic", type: "text", default: "x".repeat(4001) }];
  assert.ok(validateStudioWorkflow(graph).some((issue) => issue.includes("parameter default")));
});

test("parameter resolution applies defaults, freezes shapes and rejects missing required values", () => {
  const graph = workflow(
    ["start", "agent", "end"],
    [
      [0, 1],
      [1, 2],
    ],
  );
  graph.nodes[1]!.data.params = [
    { name: "topic", type: "text", default: "release" },
    { name: "count", type: "number" },
    { name: "dry", type: "boolean", default: "false" },
    { name: "owner", type: "text", required: true },
  ];
  assert.deepEqual(resolveStudioWorkflowParams(graph, { owner: "me" }).issues, []);
  // 未提交且无默认值的非必填参数不会凭空变成空字符串。
  assert.deepEqual(resolveStudioWorkflowParams(graph, { owner: "me" }).values, {
    topic: "release",
    dry: "false",
    owner: "me",
  });
  assert.ok(resolveStudioWorkflowParams(graph, {}).issues.some((issue) => issue.includes("owner")));
  assert.ok(
    resolveStudioWorkflowParams(graph, { owner: "me", count: "abc" }).issues.some((issue) =>
      issue.includes("must be a number"),
    ),
  );
  assert.ok(
    resolveStudioWorkflowParams(graph, { owner: "me", dry: "maybe" }).issues.some((issue) =>
      issue.includes("true or false"),
    ),
  );
  assert.ok(
    resolveStudioWorkflowParams(graph, { owner: "x".repeat(4001) }).issues.some((issue) =>
      issue.includes("Invalid parameter value"),
    ),
  );
  assert.deepEqual(resolveStudioWorkflowParams(graph, []).issues, ["Invalid workflow parameters."]);
});

/* ------------------------------------------------------------------ *
 * 提交受理：冻结参数、排队前拒绝
 * ------------------------------------------------------------------ */

function workflowWithParams() {
  const graph = workflow(
    ["start", "agent", "end"],
    [
      [0, 1],
      [1, 2],
    ],
  );
  graph.id = "flow-params";
  graph.nodes[1]!.data.prompt = "Topic: {{param.topic}}";
  graph.nodes[1]!.data.params = [
    { name: "topic", type: "text", default: "baseline" },
    { name: "owner", type: "text", required: true },
  ];
  return graph;
}

function save(
  db: StudioDatabase,
  definition: ReturnType<typeof workflow>,
  commandId = randomUUID(),
) {
  admitStudioCommand(db, clock, { commandId, type: "save-workflow", workflow: definition });
}

test("submitted parameters are resolved once and reused after a resume", () => {
  const db = database();
  save(db, workflowWithParams());
  const runId = admitStudioCommand(db, clock, {
    commandId: randomUUID(),
    type: "send",
    kind: "workflow",
    targetId: "flow-params",
    text: "go",
    params: { owner: "me" },
  }).id;
  const run = requiredRun(db, runId);
  assert.deepEqual(JSON.parse(run.checkpoint.values[STUDIO_WORKFLOW_PARAMS_KEY]!), {
    topic: "baseline",
    owner: "me",
  });
  // resume 复用被冻结的值：之后修改界面草稿不会改变已经受理的运行。
  run.state = "failed";
  run.resultKnown = true;
  db.transaction(() => db.write("run", run.id, run, run.targetId));
  admitStudioCommand(db, clock, {
    commandId: randomUUID(),
    type: "resume",
    runId,
    retryUncertain: false,
  });
  assert.deepEqual(
    JSON.parse(requiredRun(db, runId).checkpoint.values[STUDIO_WORKFLOW_PARAMS_KEY]!),
    { topic: "baseline", owner: "me" },
  );
  db.close();
});

test("a missing required parameter is rejected before a run record exists", () => {
  const db = database();
  save(db, workflowWithParams());
  assert.throws(
    () =>
      admitStudioCommand(db, clock, {
        commandId: randomUUID(),
        type: "send",
        kind: "workflow",
        targetId: "flow-params",
        text: "go",
        params: {},
      }),
    /owner/,
  );
  assert.equal(db.list("active").length, 0);
  assert.equal(db.list("run").length, 0);
  db.close();
});

function readOnlyWorkflow(kernel: "knorvia" | "codex" = "knorvia") {
  const graph = workflow(
    ["start", "agent", "end"],
    [
      [0, 1],
      [1, 2],
    ],
  );
  graph.id = "flow-readonly";
  graph.nodes[1]!.data.kernel = kernel;
  graph.nodes[1]!.data.permission = "read-only";
  return graph;
}

test("a read-only requirement is rejected before queueing when the kernel cannot guarantee it", () => {
  const definition = readOnlyWorkflow("knorvia");
  assert.ok(validateStudioWorkflow(definition).length === 0);
  assert.ok(validateStudioWorkflowPermissions(definition, undefined).length);
  const db = database();
  save(db, definition);
  assert.throws(
    () =>
      admitStudioCommand(db, clock, {
        commandId: randomUUID(),
        type: "send",
        kind: "workflow",
        targetId: "flow-readonly",
        text: "go",
      }),
    /cannot guarantee it/,
  );
  assert.equal(db.list("active").length, 0);
  db.close();
});

test("the discovered kernel version tightens the pre-run capability check", () => {
  const definition = readOnlyWorkflow("codex");
  // 版本未知时沿用矩阵的既有声明。
  assert.deepEqual(validateStudioWorkflowPermissions(definition, undefined), []);
  // 已发现版本低于已核验下限时失败关闭，不允许按声明放行。
  assert.ok(
    validateStudioWorkflowPermissions(definition, undefined, { codex: "0.100.0" }).length > 0,
  );
  assert.deepEqual(
    validateStudioWorkflowPermissions(definition, undefined, { codex: "0.151.0" }),
    [],
  );
  // 用户授权可以收紧节点要求，但不能放宽它。
  assert.ok(validateStudioWorkflowPermissions(readOnlyWorkflow("codex"), "ask").length === 0);
});

test("legacy text workflows without new fields validate and expand unchanged", () => {
  const graph = workflow(
    ["start", "agent", "agent", "end"],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  );
  graph.nodes[2]!.data.prompt = "Use {{n1}} and {{input}}";
  assert.deepEqual(validateStudioWorkflow(graph), []);
  const outcomes = new Map([["n1", { status: "succeeded", text: "UP", resultKnown: true }]]);
  assert.equal(workflowText(graph.nodes[2]!.data.prompt, "seed", "", outcomes), "Use UP and seed");
  assert.throws(() => workflowText("{{param.topic}}", "seed", "", outcomes, { params: {} }));
});

/* ------------------------------------------------------------------ *
 * 跨隔离目录导入
 * ------------------------------------------------------------------ */

test("importFile copies a cross-directory input, records its source and never writes it back", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "knorvia-import-data-"));
  const project = mkdtempSync(join(tmpdir(), "knorvia-import-project-"));
  const outside = mkdtempSync(join(tmpdir(), "knorvia-import-source-"));
  const source = join(outside, "input.txt");
  writeFileSync(source, "hello");
  const before = statSync(source);
  const manager = createStudioWorkspaceManager(dataDir);
  const working = await manager.prepare({
    runId: "run-1",
    stepId: "step-1",
    sourcePath: project,
    mode: "isolated",
  });
  assert.ok(!working.includes(outside));
  const receipt = await manager.importFile!({
    runId: "run-1",
    stepId: "step-1",
    sourcePath: source,
    name: "inputs/input.txt",
  });
  assert.equal(receipt.path, "inputs/input.txt");
  assert.equal(receipt.size, 5);
  assert.equal(receipt.hash, sha256("hello"));
  assert.equal(await readFile(join(working, "inputs/input.txt"), "utf8"), "hello");
  // 源文件永不被写回：内容、哈希与修改时间都不变。
  const after = statSync(source);
  assert.equal(readFileSync(source, "utf8"), "hello");
  assert.equal(after.mtimeMs, before.mtimeMs);
  assert.equal(sha256(readFileSync(source, "utf8")), receipt.hash);
  // 来源记录写进快照元数据。
  const [workspace] = await readdir(join(dataDir, "workspaces"));
  const metadata = JSON.parse(
    await readFile(join(dataDir, "workspaces", workspace!, "metadata.json"), "utf8"),
  );
  assert.equal(metadata.imports["inputs/input.txt"].sourcePath, source);
  assert.equal(metadata.imports["inputs/input.txt"].hash, receipt.hash);
  assert.equal(metadata.imports["inputs/input.txt"].size, 5);
  // 复制后的真实版本可以被重新读取，用于引用校验。
  assert.deepEqual(await manager.referenceVersion!("run-1", "step-1", "inputs/input.txt"), {
    path: "inputs/input.txt",
    hash: receipt.hash,
  });
  assert.deepEqual(await manager.referenceVersion!("run-1", "step-1", "missing.txt"), {
    path: "missing.txt",
    hash: null,
  });
  await assert.rejects(
    manager.importFile!({
      runId: "run-1",
      stepId: "step-1",
      sourcePath: join(dataDir, "secret.txt"),
      name: "secret.txt",
    }),
    /storage cannot be imported/,
  );
  await assert.rejects(
    manager.importFile!({
      runId: "run-1",
      stepId: "step-1",
      sourcePath: source,
      name: "../escape.txt",
    }),
    /Unsafe workspace path/,
  );
  await assert.rejects(
    manager.importFile!({
      runId: "run-1",
      stepId: "step-1",
      sourcePath: source,
      name: "notes.txt:ads",
    }),
    /Unsafe workspace path/,
  );
  await assert.rejects(
    manager.referenceVersion!("run-1", "step-1", "../escape.txt"),
    /Unsafe workspace path/,
  );
});

test("dangerous links inside a workspace are rejected when re-read", async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), "knorvia-link-data-"));
  const project = mkdtempSync(join(tmpdir(), "knorvia-link-project-"));
  const outside = mkdtempSync(join(tmpdir(), "knorvia-link-outside-"));
  writeFileSync(join(outside, "target.txt"), "outside");
  const manager = createStudioWorkspaceManager(dataDir);
  const working = await manager.prepare({
    runId: "run-2",
    stepId: "step-2",
    sourcePath: project,
    mode: "isolated",
  });
  try {
    symlinkSync(join(outside, "target.txt"), join(working, "link.txt"));
  } catch {
    t.skip("this platform does not allow creating symlinks in the test sandbox");
    return;
  }
  await assert.rejects(manager.referenceVersion!("run-2", "step-2", "link.txt"));
});
