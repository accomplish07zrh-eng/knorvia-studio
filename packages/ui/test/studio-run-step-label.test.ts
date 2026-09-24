import assert from "node:assert/strict";
import test from "node:test";
import type { StudioGroupDefinition, StudioRun, StudioWorkflowDefinition } from "@knorvia/services";
import { studioRunStepLabel } from "../src/studio/runtime/studioRunStepLabel.js";

const workflow: StudioWorkflowDefinition = {
  id: "workflow",
  name: "Workflow",
  workspacePath: "D:/project",
  updatedAt: 1,
  nodes: [
    {
      id: "answer",
      position: { x: 0, y: 0 },
      data: {
        kind: "agent",
        label: "Luna 回复",
        kernel: "codex",
        prompt: "Reply",
        condition: "",
        retryCount: 2,
        retryDelay: 0,
        joinPolicy: "all",
      },
    },
  ],
  edges: [],
};
const group: StudioGroupDefinition = {
  id: "team",
  name: "Team",
  goal: "Review",
  members: ["knorvia", "codex"],
  host: "knorvia",
  sharedSummary: "",
  mode: "task",
  workspaceMode: "isolated",
  createdAt: 1,
  updatedAt: 1,
};
const run = (kind: StudioRun["kind"], definition?: StudioRun["definition"]): StudioRun => ({
  id: "run",
  targetId: "target",
  kind,
  definition,
  input: "",
  state: "succeeded",
  createdAt: 1,
  updatedAt: 1,
  attempt: 1,
  checkpoint: { steps: {}, values: {}, completedRounds: 0 },
});

test("workflow labels come from the frozen definition and hide the initial attempt suffix", () => {
  const value = run("workflow", workflow);
  assert.equal(studioRunStepLabel(value, "workflow:answer:attempt:0", "zh-CN"), "Luna 回复");
  assert.equal(
    studioRunStepLabel(value, "workflow:answer:attempt:1", "zh-CN"),
    "Luna 回复 · 第 2 次尝试",
  );
  assert.equal(
    studioRunStepLabel(value, "workflow:answer:attempt:2", "en-US"),
    "Luna 回复 · Attempt 3",
  );
});

test("node IDs containing separators match exactly; unnamed and missing nodes use ordinary labels", () => {
  const definition = structuredClone(workflow);
  definition.nodes[0]!.id = "answer:attempt:0";
  definition.nodes[0]!.data.label = "";
  const value = run("workflow", definition);
  assert.equal(
    studioRunStepLabel(value, "workflow:answer:attempt:0:attempt:0", "zh-CN"),
    "Agent 任务",
  );
  assert.equal(studioRunStepLabel(value, "workflow:answer:attempt:0", "zh-CN"), "工作流步骤");
  assert.equal(
    studioRunStepLabel(run("workflow"), "workflow:answer:attempt:0", "en-US"),
    "Workflow step",
  );
});

test("group manual and host phases display only members present in the run definition", () => {
  const value = run("group", group);
  assert.equal(studioRunStepLabel(value, "group:manual:codex", "zh-CN"), "Codex 回复");
  assert.equal(studioRunStepLabel(value, "group:manual:claude-code", "zh-CN"), "群聊步骤");
  assert.equal(studioRunStepLabel(value, "group:plan:0:response:0", "zh-CN"), "Knorvia · 安排任务");
  assert.equal(
    studioRunStepLabel(value, "group:review:1:response:1", "zh-CN"),
    "Knorvia · 复核结果 · 第 2 轮 · 第 2 次尝试",
  );
  assert.equal(
    studioRunStepLabel(value, "group:steering:1:response:0", "en-US"),
    "Knorvia · Adjust tasks",
  );
});

test("group task descriptions are used only when both the round and task identity match", () => {
  const value = run("group", group);
  value.checkpoint.plan = {
    version: 1,
    round: 1,
    tasks: [{ id: "review", member: "codex", instruction: "核对\n提交文件" }],
  };
  assert.equal(
    studioRunStepLabel(value, "group:round:1:task:review", "zh-CN"),
    "Codex · 核对 提交文件 · 第 2 轮",
  );
  assert.equal(
    studioRunStepLabel(value, "group:round:0:task:review", "zh-CN"),
    "群聊任务 · 第 1 轮",
  );
  assert.equal(
    studioRunStepLabel(value, "group:round:1:task:missing", "en-US"),
    "Group task · Round 2",
  );
});

test("malformed plans and unknown step formats remain readable without exposing identifiers", () => {
  const value = run("group", group);
  for (const plan of [
    null,
    [],
    { version: 2, round: 1, tasks: [] },
    { version: 1, round: 1, tasks: [null, "bad"] },
  ]) {
    value.checkpoint.plan = plan;
    assert.equal(
      studioRunStepLabel(value, "group:round:1:task:raw-internal-id", "zh-CN"),
      "群聊任务 · 第 2 轮",
    );
  }
  assert.equal(studioRunStepLabel(value, "unknown:internal:value", "zh-CN"), "群聊步骤");
  assert.equal(studioRunStepLabel(run("chat"), "reply", "zh-CN"), "回复");
  assert.equal(studioRunStepLabel(run("chat"), "unknown:internal:value", "en-US"), "Chat step");
});
