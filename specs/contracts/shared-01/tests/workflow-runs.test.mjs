// SPDX-License-Identifier: Apache-2.0
// shared-01 契约测试：workflow runs 状态面（B31–B37）。黑盒只走 `@knorvia/shared/protocol-v4`。
import assert from "node:assert/strict";
import test from "node:test";
import { protocolV4 } from "./entry.mjs";

const {
  WORKFLOW_RUNS_LIMITS,
  workflowRunSchema,
  workflowRunsStateSchema,
  amendWorkflowRunSettingsPayloadSchema,
  amendWorkflowRunSettingsResultSchema,
  workflowRunSettingsRejectionReasonSchema,
  WORKFLOW_RUN_SETTINGS_REJECTED_FAULT_PREFIX,
  reduceWorkflowRunsState,
  serializeWorkflowArtifact,
} = protocolV4;

const EXPECTED_LIMITS = {
  maxRuns: 8,
  maxActors: 256,
  maxNodes: 256,
  maxReports: 64,
  maxReportPreviewLength: 2048,
  maxResultPreviewLength: 2048,
  maxErrorLength: 2048,
  maxPendingQuestions: 32,
  maxQuestionLength: 2048,
  maxConcurrencyKeyLength: 256,
  maxSubagentModelLength: 256,
  maxConcurrencyCeiling: 1024,
  maxActorNameLength: 128,
  maxArtifacts: 32,
  maxPhases: 32,
  maxPhaseNameLength: 128,
  maxInstructionsHeadLength: 240,
  maxLastToolNameLength: 64,
  maxLastToolTargetLength: 120,
};

function minimalRun(overrides = {}) {
  return {
    runId: "r1",
    status: "pending",
    usage: { spentTokens: 0, nodesUsed: 0 },
    actors: [],
    nodes: [],
    lastEventSequence: 0,
    ...overrides,
  };
}

test("B31 workflowRuns 限额常量表：数字即契约", () => {
  assert.deepEqual({ ...WORKFLOW_RUNS_LIMITS }, EXPECTED_LIMITS);
});

test("B32 run 状态 schema：最小对象通过、可选键整组缺席、数组零条允许", () => {
  const parsed = workflowRunSchema.safeParse(minimalRun());
  assert.equal(parsed.success, true, "最小 run");
  for (const key of [
    "reports",
    "pendingQuestions",
    "concurrency",
    "artifacts",
    "phases",
    "phaseNames",
    "subagentModel",
    "error",
    "resultPreview",
    "stopReason",
    "truncated",
    "currentPhase",
  ]) {
    assert.equal(key in parsed.data, false, `旧 CLI 少发一个键是退化：${key} 缺席`);
  }
  const full = minimalRun({
    toolCallId: "tc-1",
    status: "running",
    resumedFrom: "r0",
    reports: [],
    pendingQuestions: [],
    artifacts: [],
    phases: [],
    phaseNames: ["build"],
    resumable: true,
    resultPreview: "done",
    error: "boom",
    concurrencyCeiling: 8,
    subagentModel: "prov/model",
    truncated: false,
    currentPhase: "build",
  });
  assert.equal(workflowRunSchema.safeParse(full).success, true, "带全可选键的完整对象");
  assert.equal(
    workflowRunSchema.safeParse(minimalRun({ resumable: true })).success,
    true,
    "resumable 只能是字面 true",
  );
  assert.equal(
    workflowRunSchema.safeParse(minimalRun({ resumable: false })).success,
    false,
    "false 不在场（键整体缺席）",
  );
  assert.equal(
    workflowRunSchema.safeParse(minimalRun({ status: "paused" })).success,
    false,
    "status 封闭",
  );
  const runs = Array.from({ length: 9 }, (_, index) => minimalRun({ runId: `r${index}` }));
  assert.equal(
    workflowRunsStateSchema.safeParse({ revision: 0, runs }).success,
    false,
    "runs 超过 maxRuns=8 拒绝",
  );
  assert.equal(
    workflowRunsStateSchema.safeParse({ revision: 0, runs: runs.slice(0, 8) }).success,
    true,
  );
  assert.equal(
    workflowRunsStateSchema.safeParse({ revision: -1, runs: [] }).success,
    false,
    "revision 非负",
  );
});

function issuePaths(result) {
  return result.error.issues.map((issue) => JSON.stringify(issue.path));
}

test("B33 run 状态 schema：长度与枚举的边界拒绝都给出对应 path", () => {
  const rejections = [
    [minimalRun({ runId: "x".repeat(129) }), ["runId"]],
    [minimalRun({ toolCallId: "x".repeat(129) }), ["toolCallId"]],
    [minimalRun({ error: "x".repeat(2049) }), ["error"]],
    [minimalRun({ resultPreview: "x".repeat(2049) }), ["resultPreview"]],
    [minimalRun({ status: "paused" }), ["status"]],
    [minimalRun({ stopReason: "paused" }), ["stopReason"]],
    [minimalRun({ resumedFrom: "x".repeat(129) }), ["resumedFrom"]],
    [minimalRun({ supersededBy: "x".repeat(129) }), ["supersededBy"]],
    [minimalRun({ subagentModel: "x".repeat(257) }), ["subagentModel"]],
    [minimalRun({ concurrencyCeiling: 1025 }), ["concurrencyCeiling"]],
    [minimalRun({ concurrencyCeiling: 0 }), ["concurrencyCeiling"]],
    [minimalRun({ currentPhase: "x".repeat(129) }), ["currentPhase"]],
    [
      minimalRun({
        actors: [{ siteId: "s".repeat(65), ordinal: 0, status: "running" }],
      }),
      ["actors", 0, "siteId"],
    ],
    [
      minimalRun({
        actors: [{ siteId: "s", ordinal: 0, status: "running", name: "x".repeat(129) }],
      }),
      ["actors", 0, "name"],
    ],
    [
      minimalRun({
        actors: [{ siteId: "s", ordinal: 0, status: "sleeping" }],
      }),
      ["actors", 0, "status"],
    ],
    [
      minimalRun({
        nodes: [{ siteId: "s", ordinal: 0, phase: "paused" }],
      }),
      ["nodes", 0, "phase"],
    ],
    [
      minimalRun({
        nodes: [{ siteId: "s", ordinal: 0, phase: "settled", outcome: "unknown" }],
      }),
      ["nodes", 0, "outcome"],
    ],
    [
      minimalRun({
        nodes: [{ siteId: "s", ordinal: 0, phase: "queued", instructionsHead: "x".repeat(241) }],
      }),
      ["nodes", 0, "instructionsHead"],
    ],
    [
      minimalRun({
        nodes: [
          {
            siteId: "s",
            ordinal: 0,
            phase: "settled",
            lastTool: { name: "x".repeat(65), target: "t" },
          },
        ],
      }),
      ["nodes", 0, "lastTool", "name"],
    ],
    [
      minimalRun({
        nodes: [
          {
            siteId: "s",
            ordinal: 0,
            phase: "settled",
            lastTool: { name: "tool", target: "x".repeat(121) },
          },
        ],
      }),
      ["nodes", 0, "lastTool", "target"],
    ],
    [
      minimalRun({
        reports: [{ siteId: "s", ordinal: 0, preview: "x".repeat(2049) }],
      }),
      ["reports", 0, "preview"],
    ],
    [
      minimalRun({
        pendingQuestions: [{ qid: "x".repeat(129), question: "q" }],
      }),
      ["pendingQuestions", 0, "qid"],
    ],
    [
      minimalRun({
        pendingQuestions: [{ qid: "q", question: "x".repeat(2049) }],
      }),
      ["pendingQuestions", 0, "question"],
    ],
    [
      minimalRun({
        pendingQuestions: [{ qid: "q", question: "q", actorName: "x".repeat(129) }],
      }),
      ["pendingQuestions", 0, "actorName"],
    ],
    [
      minimalRun({
        concurrency: { cap: 0, ceiling: 4 },
      }),
      ["concurrency", "cap"],
    ],
    [
      minimalRun({
        phases: [{ name: "x".repeat(129), rounds: 1 }],
      }),
      ["phases", 0, "name"],
    ],
    [
      minimalRun({
        phases: [{ name: "p", rounds: 0 }],
      }),
      ["phases", 0, "rounds"],
    ],
  ];
  for (const [value, path] of rejections) {
    const result = workflowRunSchema.safeParse(value);
    assert.equal(result.success, false, `应拒绝 path=${JSON.stringify(path)}`);
    assert.ok(
      issuePaths(result).includes(JSON.stringify(path)),
      `issue path 应含 ${JSON.stringify(path)}，实际 ${JSON.stringify(result.error.issues.map((issue) => issue.path))}`,
    );
  }
});

const REJECTION_REASONS = [
  "not_found",
  "not_configurable",
  "unchanged",
  "script_missing",
  "model_unavailable",
  "compile_failed",
  "missing_boundaries",
  "start_failed",
];

test("B34 run 设置调整命令：三态载荷、结果形态与 8 项拒绝词表", () => {
  assert.equal(
    amendWorkflowRunSettingsPayloadSchema.safeParse({ workId: "w-1" }).success,
    true,
    "两项设置都缺席 = 沿用",
  );
  assert.equal(
    amendWorkflowRunSettingsPayloadSchema.safeParse({ workId: "w-1", subagentModel: null }).success,
    true,
    "null = 回默认（会话模型）",
  );
  assert.equal(
    amendWorkflowRunSettingsPayloadSchema.safeParse({ workId: "w-1", subagentModel: "p/m" })
      .success,
    true,
    "值 = 设定",
  );
  assert.equal(
    amendWorkflowRunSettingsPayloadSchema.safeParse({ workId: "w-1", subagentModel: "" }).success,
    false,
    "空串拒绝",
  );
  assert.equal(
    amendWorkflowRunSettingsPayloadSchema.safeParse({
      workId: "w-1",
      subagentModel: "x".repeat(257),
    }).success,
    false,
    "超 256 拒绝",
  );
  assert.equal(
    amendWorkflowRunSettingsPayloadSchema.safeParse({ workId: "w-1", maxConcurrency: 0 }).success,
    false,
    "0 拒绝",
  );
  assert.equal(
    amendWorkflowRunSettingsPayloadSchema.safeParse({ workId: "w-1", maxConcurrency: -1 }).success,
    false,
    "负数拒绝",
  );
  assert.equal(
    amendWorkflowRunSettingsPayloadSchema.safeParse({ workId: "w-1", maxConcurrency: 1.5 }).success,
    false,
    "非整数拒绝",
  );
  assert.equal(
    amendWorkflowRunSettingsPayloadSchema.safeParse({ workId: "w-1", maxConcurrency: null })
      .success,
    true,
    "null = 解除本 run 的界",
  );

  const result = amendWorkflowRunSettingsResultSchema.safeParse({
    type: "amendWorkflowRunSettings",
    runId: "r-1",
    toolCallId: "settings-1",
  });
  assert.equal(result.success, true);
  assert.equal(
    amendWorkflowRunSettingsResultSchema.safeParse({
      type: "amendWorkflowRunSettings",
      runId: "r-1",
      toolCallId: "settings-1",
      supersededRunId: "r-0",
    }).success,
    true,
    "supersededRunId 可缺席",
  );
  assert.equal(
    amendWorkflowRunSettingsResultSchema.safeParse({ type: "other", runId: "r-1", toolCallId: "t" })
      .success,
    false,
    "type 是字面量",
  );
  assert.equal(
    amendWorkflowRunSettingsResultSchema.safeParse({
      type: "amendWorkflowRunSettings",
      runId: "",
      toolCallId: "t",
    }).success,
    false,
    "runId 非空",
  );

  assert.deepEqual(
    [...workflowRunSettingsRejectionReasonSchema.options],
    REJECTION_REASONS,
    "拒绝词表固定 8 项",
  );
  for (const reason of REJECTION_REASONS) {
    assert.equal(workflowRunSettingsRejectionReasonSchema.safeParse(reason).success, true, reason);
  }
  assert.equal(workflowRunSettingsRejectionReasonSchema.safeParse("notFound").success, false);
  assert.equal(
    WORKFLOW_RUN_SETTINGS_REJECTED_FAULT_PREFIX,
    "fault.command.workflowRunSettingsRejected.",
  );
});

function settledRun() {
  return minimalRun({
    status: "stopped",
    stopReason: "user",
    usage: { spentTokens: 900, nodesUsed: 5 },
    error: "previous failure",
    resultPreview: "previous preview",
    pendingQuestions: [{ qid: "q1", question: "?" }],
    resumable: true,
    concurrency: { cap: 4, ceiling: 8, cooldownMs: 100 },
    concurrencyCeiling: 8,
    subagentModel: "prov/model",
    resumedFrom: "r0",
    lastEventSequence: 7,
  });
}

test("B35 run-started 归约：残影剥除、用量归零、lineage 搬运与幂等", () => {
  const previous = { revision: 1, runs: [settledRun()] };
  const envelope = {
    runId: "r1",
    eventType: "run-started",
    sequence: 8,
    toolCallId: "tc-1",
    payload: {
      resumedFrom: "r0",
      subagentModel: "prov/model",
      concurrencyCeiling: 8,
      caps: { maxConcurrency: 2 },
    },
  };
  const next = reduceWorkflowRunsState(previous, envelope);
  assert.ok(next, "JSON 可见变化 → 新 revision");
  assert.equal(next.revision, 2);
  const run = next.runs[0];
  assert.equal(run.status, "running");
  assert.deepEqual(run.usage, { spentTokens: 0, nodesUsed: 0 }, "用量归零");
  for (const key of ["error", "resultPreview", "pendingQuestions", "resumable", "stopReason"]) {
    assert.equal(key in run, false, `上一世结算残影 ${key} 被剥除`);
  }
  assert.equal(run.resumedFrom, "r0", "lineage 沿用");
  assert.equal(run.subagentModel, "prov/model", "本 run 的条件不剥除");
  assert.deepEqual(
    run.concurrency,
    { cap: 4, ceiling: 8, cooldownMs: 100, limit: 2 },
    "共享桶水位保留，本 run 的 limit 随载荷落到桶上",
  );
  assert.equal(run.concurrencyCeiling, 8, "天花板随载荷更新");
  assert.equal(run.lastEventSequence, 8, "sequence 抬升");

  const again = reduceWorkflowRunsState(next, envelope);
  assert.equal(again, null, "同一事件重复喂入无 JSON 可见变化 → null");

  const noCeiling = reduceWorkflowRunsState(
    { revision: 1, runs: [settledRun()] },
    {
      runId: "r1",
      eventType: "run-started",
      sequence: 8,
      payload: {},
    },
  );
  assert.equal(noCeiling.runs[0].subagentModel, "prov/model", "载荷读不出时沿用已知值");
  assert.equal(noCeiling.runs[0].resumedFrom, "r0", "载荷缺席时沿用已知 lineage");
  assert.deepEqual(
    noCeiling.runs[0].concurrency,
    { cap: 4, ceiling: 8, cooldownMs: 100 },
    "无 ceiling 时不碰并发键",
  );

  const oversizedModel = reduceWorkflowRunsState(
    { revision: 1, runs: [settledRun()] },
    {
      runId: "r1",
      eventType: "run-started",
      sequence: 8,
      payload: { subagentModel: "x".repeat(257) },
    },
  );
  assert.equal(
    oversizedModel.runs[0].subagentModel,
    "prov/model",
    "超长子代理模型整条丢弃、沿用已知值（不截断）",
  );
});

test("B36 run-settled 归约：停止原因白名单、lineage 条件与未知状态兜底", () => {
  const previous = { revision: 1, runs: [settledRun()] };
  const settled = reduceWorkflowRunsState(previous, {
    runId: "r1",
    eventType: "run-settled",
    sequence: 9,
    payload: {
      status: "stopped",
      stopReason: "superseded",
      supersededBy: "r9",
      error: { message: "new failure" },
      resumable: true,
    },
  });
  const run = settled.runs[0];
  assert.equal(run.status, "stopped");
  assert.equal(run.stopReason, "superseded");
  assert.equal(run.supersededBy, "r9", "stopReason=superseded 且 id 非空时 lineage 在场");
  assert.equal(run.error, "new failure");
  assert.equal(run.resumable, true, "载荷为真时在场");
  assert.equal("pendingQuestions" in run, false, "结算事件清空停驻问题");
  assert.deepEqual(
    run.concurrency,
    { cap: 4, ceiling: 8 },
    "cooldown 随终态摘除，cap/ceiling 留存",
  );

  const withoutStop = settledRun();
  delete withoutStop.stopReason;
  const previousWithoutStop = { revision: 1, runs: [withoutStop] };
  const badStop = reduceWorkflowRunsState(previousWithoutStop, {
    runId: "r1",
    eventType: "run-settled",
    sequence: 9,
    payload: { status: "stopped", stopReason: "explode", supersededBy: "r9" },
  });
  assert.equal(
    "stopReason" in badStop.runs[0],
    false,
    "白名单外的停止原因按载荷缺席处理（整帧不丢）",
  );
  assert.equal("supersededBy" in badStop.runs[0], false, "不是 superseded 就没有替代指针");

  const keepKnownStop = reduceWorkflowRunsState(previous, {
    runId: "r1",
    eventType: "run-settled",
    sequence: 9,
    payload: { status: "stopped", stopReason: "explode", supersededBy: "r9" },
  });
  assert.equal(
    keepKnownStop.runs[0].stopReason,
    "user",
    "载荷读不出时不覆盖已知值（上一世的 stopReason 保留）",
  );
  assert.equal("supersededBy" in keepKnownStop.runs[0], false, "读不出的 lineage 不在场");

  const unknown = reduceWorkflowRunsState(previous, {
    runId: "r1",
    eventType: "run-settled",
    sequence: 9,
    payload: { status: "paused" },
  });
  assert.equal(unknown.runs[0].status, "errored", "不认识的 status 归 errored");
  assert.equal(
    unknown.runs[0].error,
    "run settled with an unrecognized status: paused",
    "无错误信息时给出固定提示语",
  );

  const longError = reduceWorkflowRunsState(previous, {
    runId: "r1",
    eventType: "run-settled",
    sequence: 9,
    payload: { status: "errored", error: { message: "e".repeat(3000) } },
  });
  assert.equal(longError.runs[0].error.length, 2048, "错误文案截到 maxErrorLength");

  const noChange = reduceWorkflowRunsState(previous, {
    runId: "missing-run",
    eventType: "run-settled",
    sequence: 9,
    payload: { status: "completed" },
  });
  assert.ok(noChange, "未知 runId 也会新建投影卡");

  assert.equal(
    reduceWorkflowRunsState(previous, { eventType: "run-settled", sequence: 9 }),
    null,
    "缺 runId 返回 null",
  );
  assert.equal(
    reduceWorkflowRunsState(previous, { runId: "r1", sequence: 9 }),
    null,
    "缺 eventType 返回 null",
  );
});

test("B37 脚本产物序列化：string 原样、其余 pretty JSON、退化路径不抛错", () => {
  assert.equal(serializeWorkflowArtifact(undefined), undefined, "undefined → 字段整体缺席");
  assert.equal(serializeWorkflowArtifact("plain"), "plain");
  assert.deepEqual(
    serializeWorkflowArtifact({ a: 1, b: [2] }),
    JSON.stringify({ a: 1, b: [2] }, null, 2),
  );
  assert.equal(serializeWorkflowArtifact(42), "42");
  assert.equal(serializeWorkflowArtifact(null), "null");
  const fn = function sample() {};
  assert.equal(serializeWorkflowArtifact(fn), String(fn), "函数退 String(value)");
  assert.equal(
    serializeWorkflowArtifact(Symbol("s")),
    String(Symbol("s")),
    "symbol 退 String(value)",
  );
  const circular = { name: "loop" };
  circular.self = circular;
  assert.equal(
    serializeWorkflowArtifact(circular),
    String(circular),
    "循环引用退 String(value)，不抛错",
  );
});
