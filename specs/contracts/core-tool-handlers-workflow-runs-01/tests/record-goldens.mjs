// SPDX-License-Identifier: Apache-2.0
// core-tool-handlers-workflow-runs-01 金样录制器：用**当前（旧）实现**对固定输入快照跑出
// summary / 模型面 / 情势块 / 活动行 / 恢复与应答文案的输出真值，写入 fixtures/workflow-runs-goldens.json。
// 替换阶段起该文件是「旧实现真值」，fixtures.test.ts 用新实现逐字节比对（金样往返）。
//
// 用法（仓库根，旧实现在位时执行一次）：
//   node --import tsx specs/contracts/core-tool-handlers-workflow-runs-01/tests/record-goldens.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "..", "fixtures", "workflow-runs-goldens.json");
const handlers = join(
  here,
  "..",
  "..",
  "..",
  "..",
  "apps",
  "cli",
  "packages",
  "core",
  "src",
  "tool",
  "handlers",
);
const load = (name) => import(pathToFileURL(join(handlers, name)).href);

const { buildWorkflowRunSummary } = await load("get-workflow-run-summary.ts");
const { formatGetWorkflowRunModelContent } = await load("get-workflow-run-format.ts");
const {
  formatWorkflowRunHealthBlock,
  formatWorkflowRunPhasesBlock,
  formatWorkflowRunSubagentsBlock,
  formatWorkflowRunLogTailBlock,
} = await load("get-workflow-run-format-roster.ts");
const { renderWorkflowRunActivity } = await load("get-workflow-run-activity-program.ts");

// —— 固定输入快照（合成数据，无真实用户内容） ——
const NOW = 1_760_000_000_000; // 钉住的 generatedAt（一切相对年龄对它算）
const MINUTE = 60_000;

function baseHealth(overrides = {}) {
  return {
    lastProgressAt: NOW - 2 * MINUTE,
    concurrency: { effective: 2, cap: 4, reason: "provider quota", since: NOW - 10 * MINUTE },
    consecutiveFailures: 1,
    cachedSteps: 3,
    pendingQuestionsKnown: true,
    ...overrides,
  };
}

const RUNNING = {
  runId: "dwfr-golden-run",
  label: "nightly index rebuild",
  labelSource: "script",
  status: "running",
  ownedByThisSession: true,
  generatedAt: NOW,
  createdAt: NOW - 30 * MINUTE,
  updatedAt: NOW - MINUTE,
  maxConcurrency: 4,
  subagentModel: "prov/mod$high",
  usage: {
    spentTokens: 12345,
    nodesObserved: 9,
    nodesRunning: 2,
    nodesCompleted: 6,
    nodesFailed: 1,
  },
  health: baseHealth(),
  phases: [
    {
      name: "collect",
      state: "done",
      rounds: 1,
      nodesSettled: 3,
      nodesRunning: 0,
      enteredAt: NOW - 30 * MINUTE,
      exitedAt: NOW - 20 * MINUTE,
    },
    {
      name: "merge",
      state: "running",
      rounds: 2,
      nodesSettled: 3,
      nodesRunning: 2,
      enteredAt: NOW - 20 * MINUTE,
    },
    { name: "publish", state: "ahead", rounds: 0, nodesSettled: 0, nodesRunning: 0 },
  ],
  subagents: [
    {
      siteId: "collector",
      ordinal: 0,
      name: "indexer",
      state: "executing",
      phaseName: "merge",
      stepsSettled: 3,
      stepsFailed: 0,
      tokens: 4200,
      lastProgressAt: NOW - MINUTE,
      currentAsk: {
        siteId: "collector",
        ordinal: 0,
        actorSeq: 2,
        instructionsHead: "rebuild the shard index",
        startedAt: NOW - 4 * MINUTE,
        turn: 3,
        toolCalls: 2,
        lastTool: { name: "grep", target: "src/", at: NOW - MINUTE },
      },
    },
    {
      siteId: "merger",
      ordinal: 1,
      state: "waiting",
      phaseName: "merge",
      stepsSettled: 3,
      stepsFailed: 1,
      tokens: 8145,
      wait: { cause: "backoff", reason: "provider 429", retryAfterMs: 30_000, since: NOW - MINUTE },
    },
    {
      siteId: "asker",
      ordinal: 2,
      state: "parked",
      phaseName: "merge",
      stepsSettled: 2,
      stepsFailed: 0,
      tokens: 100,
      parkedOn: "dwfq-golden-1",
      currentAsk: {
        siteId: "asker",
        ordinal: 2,
        actorSeq: 1,
        instructionsHead: "pick the winner",
        startedAt: NOW - 5 * MINUTE,
      },
    },
    {
      siteId: "idle",
      ordinal: 3,
      state: "waiting",
      stepsSettled: 0,
      stepsFailed: 0,
      tokens: 0,
      wait: { cause: "slot", since: NOW - 2 * MINUTE },
    },
  ],
  subagentsTruncated: true,
  pendingQuestions: [
    {
      qid: "dwfq-golden-1",
      actor: "asker",
      actorName: "asker",
      question: "Two shards conflict on `name`; which wins?",
      askedAt: NOW - 5 * MINUTE,
      context: "shard A has the newer timestamp",
    },
  ],
  logTail: [
    { sequence: 1, message: "collect finished", at: NOW - 21 * MINUTE },
    { sequence: 2, message: "merge started", at: NOW - 20 * MINUTE },
    { sequence: 3, message: "429 from provider, backing off" },
  ],
  artifacts: [
    { title: "Index report", kind: "document", primary: true, updatedAt: NOW - 3 * MINUTE },
    { title: "Live dashboard", kind: "dashboard", updatedAt: NOW - MINUTE },
  ],
};

const COMPLETED = {
  runId: "dwfr-golden-done",
  label: "finished run",
  labelSource: "name",
  status: "completed",
  ownedByThisSession: false,
  generatedAt: NOW,
  createdAt: NOW - 60 * MINUTE,
  updatedAt: NOW - 10 * MINUTE,
  usage: { spentTokens: 900, nodesObserved: 4, nodesRunning: 0, nodesCompleted: 4, nodesFailed: 0 },
  health: baseHealth({
    lastProgressAt: NOW - 10 * MINUTE,
    pendingQuestionsKnown: true,
    leftoverRunning: 1,
    consecutiveFailures: 0,
    cachedSteps: 4,
  }),
  phases: [
    {
      name: "only",
      state: "done",
      rounds: 1,
      nodesSettled: 4,
      nodesRunning: 1,
      enteredAt: NOW - 60 * MINUTE,
      exitedAt: NOW - 10 * MINUTE,
    },
  ],
  subagents: [
    {
      siteId: "solo",
      ordinal: 0,
      state: "unfinished",
      stepsSettled: 4,
      stepsFailed: 0,
      tokens: 900,
      currentAsk: { siteId: "solo", ordinal: 0, actorSeq: 4, startedAt: NOW - 11 * MINUTE },
    },
  ],
  logTail: [{ sequence: 9, message: "done", at: NOW - 10 * MINUTE }],
  result: "null",
  artifacts: [
    { title: "Final doc", kind: "document", primary: true, updatedAt: NOW - 10 * MINUTE },
  ],
};

const STOPPED = {
  runId: "dwfr-golden-stopped",
  label: "stopped run",
  labelSource: "script",
  status: "stopped",
  stopReason: "provider",
  ownedByThisSession: true,
  generatedAt: NOW,
  createdAt: NOW - 20 * MINUTE,
  updatedAt: NOW - 5 * MINUTE,
  usage: { spentTokens: 10, nodesObserved: 1, nodesRunning: 0, nodesCompleted: 0, nodesFailed: 1 },
  health: baseHealth({ pendingQuestionsKnown: false, consecutiveFailures: 2 }),
  logTail: [],
  error: { code: "model_request_failed", message: "provider quota exhausted" },
  scriptPath: "workflows/golden.dwf.ts",
};

const SUPERSEDED = {
  ...STOPPED,
  runId: "dwfr-golden-super",
  stopReason: "superseded",
  supersededBy: "dwfr-golden-successor",
  error: undefined,
};

const summary = {};
const modelContent = {};
for (const [key, snap] of Object.entries({ RUNNING, COMPLETED, STOPPED, SUPERSEDED })) {
  const facts = { ...snap };
  summary[key] = buildWorkflowRunSummary(facts);
  modelContent[key] = formatGetWorkflowRunModelContent({ ...facts, summary: summary[key] });
}

const rosterBlocks = {
  healthRunning: formatWorkflowRunHealthBlock({ ...RUNNING, summary: summary.RUNNING }, false),
  healthCompleted: formatWorkflowRunHealthBlock({ ...COMPLETED, summary: summary.COMPLETED }, true),
  phases: formatWorkflowRunPhasesBlock({ ...RUNNING, summary: summary.RUNNING }, false),
  subagents: formatWorkflowRunSubagentsBlock({ ...RUNNING, summary: summary.RUNNING }),
  logTail: formatWorkflowRunLogTailBlock({ ...RUNNING, summary: summary.RUNNING }),
  logTailEmpty: formatWorkflowRunLogTailBlock({ ...STOPPED, summary: summary.STOPPED }),
};

const askedAtByQid = new Map([["dwfq-golden-1", NOW - 5 * MINUTE]]);
const activities = {};
for (const subagent of RUNNING.subagents) {
  activities[`${subagent.siteId}@${subagent.ordinal}`] = renderWorkflowRunActivity(
    subagent,
    NOW,
    askedAtByQid,
  );
}

const guidance = {
  resumeResponse:
    "The workflow run dwfr-golden-stopped has been resumed and is running in the background. It is still running — you will be notified with the final output when it completes. Do not wait for it or poll it with TaskOutput; continue with other work unless the user asked you to wait.",
  resolveResponse:
    "Answer delivered for question dwfq-golden-1. The subagent that asked has resumed its turn with your answer; the run keeps going as before.",
};

const goldens = {
  contract: "core-tool-handlers-workflow-runs-01",
  recordedWith: "pre-replacement implementation (inherited sources at origin/main 5f878295)",
  generatedAtNow: NOW,
  inputs: { RUNNING, COMPLETED, STOPPED, SUPERSEDED },
  summary,
  modelContent,
  rosterBlocks,
  activities,
  guidance,
};
writeFileSync(outPath, `${JSON.stringify(goldens, null, 2)}\n`, "utf8");
console.log(`wrote ${outPath}`);
