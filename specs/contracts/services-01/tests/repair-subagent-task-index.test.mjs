// SPDX-License-Identifier: Apache-2.0
// A71：repairSubagentTaskIndex 的权威身份确认、64 条批量边界与 isCurrent 失效短路。
// 只经公开导出调用，repo 与 agentService 都用最小假实现，断言落在「写了哪些行」上。
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { importDeep } from "./entry.mjs";

const { repairSubagentTaskIndex } = await importDeep("agent/repairSubagentTaskIndex.ts");

const WORKSPACE = { workspacePath: "/ws/alpha", workspaceIdentity: "alpha" };

/** 造一条 repo 行。 */
const row = (taskId) => ({ taskId, provider: "knorvia" });

/** 造一条会话；默认是本 workspace 的 subagent_child。 */
const session = (sessionId, overrides = {}) => ({
  sessionId,
  sessionKind: "subagent_child",
  workspace: { workspacePath: "/ws/alpha", workspaceIdentity: "alpha" },
  ...overrides,
});

/**
 * 最小假环境：`sessionsById` 决定回查结果，`removed` 记录 onRemoved 次数。
 */
function harness({ rows, sessionsById, isCurrent = () => true }) {
  const calls = { listTaskMetas: [], listSessions: [], updateTaskState: [], onRemoved: 0 };
  const state = { current: isCurrent() };
  return {
    calls,
    state,
    params: {
      target: WORKSPACE,
      visibleSessionIds: new Set(),
      agentService: {
        async listSessions(params) {
          calls.listSessions.push(params);
          return (params.sessionIds ?? []).flatMap((id) => sessionsById[id] ?? []);
        },
      },
      taskIndexRepo: {
        async listTaskMetas(params) {
          calls.listTaskMetas.push(params);
          return rows;
        },
        async updateTaskState(params) {
          calls.updateTaskState.push(params);
        },
      },
      isCurrent: () => state.current,
      onRemoved: () => {
        calls.onRemoved += 1;
      },
    },
  };
}

describe("A71 权威身份确认与批量边界", () => {
  it("只删「不可见 + subagent_child + 本批 + 同 workspace」的行，且不碰 Agent 转录", async () => {
    const { params, calls } = harness({
      rows: [row("child-1"), row("main-1"), row("foreign-1"), row("other-kind")],
      sessionsById: {
        "child-1": [session("child-1")],
        "main-1": [session("main-1", { sessionKind: "main" })],
        "foreign-1": [
          session("foreign-1", {
            workspace: { workspacePath: "/ws/beta", workspaceIdentity: "beta" },
          }),
        ],
        "other-kind": [session("other-kind", { sessionKind: "subagent_parent" })],
      },
    });
    await repairSubagentTaskIndex(params);

    assert.deepEqual(
      calls.updateTaskState.map((call) => call.taskId),
      ["child-1"],
      "只有身份确认的 subagent_child 被标删",
    );
    assert.deepEqual(calls.updateTaskState[0], {
      ...WORKSPACE,
      taskId: "child-1",
      patch: { deleted: true },
    });
    assert.equal(calls.onRemoved, 1, "每删一行回调一次");
    assert.equal(calls.listTaskMetas.length, 1);
    assert.equal(calls.listTaskMetas[0].provider, "knorvia");
    assert.deepEqual(calls.listTaskMetas[0], { ...WORKSPACE, provider: "knorvia" });
    // 回查参数：只查不可见 id，带 includeArchived 与 existing-only。
    assert.deepEqual(calls.listSessions[0], {
      ...WORKSPACE,
      sessionIds: ["child-1", "main-1", "foreign-1", "other-kind"],
      includeArchived: true,
      runtimePolicy: "existing-only",
    });
  });

  it("可见会话与 workspaceIdentity 为空的 target 都按身份 key 比较，不被误删", async () => {
    // target 只有 workspacePath：身份 key 回落到路径。
    const { params, calls } = harness({
      rows: [row("kept"), row("path-only")],
      sessionsById: {
        kept: [session("kept")],
        "path-only": [session("path-only", { workspace: { workspacePath: "/ws/alpha" } })],
      },
    });
    params.visibleSessionIds = new Set(["kept"]);
    params.target = { workspacePath: "/ws/alpha" };
    await repairSubagentTaskIndex(params);
    assert.deepEqual(
      calls.updateTaskState.map((call) => call.taskId),
      ["path-only"],
      "可见会话不回查；身份 key 用路径比较仍然匹配",
    );
    assert.deepEqual(calls.listSessions[0].sessionIds, ["path-only"]);
  });

  it("按 64 条一批回查；批间检查 isCurrent，失效后不再发起后续批次", async () => {
    const rows = Array.from({ length: 130 }, (_, index) => row(`s-${index}`));
    const { params, calls, state } = harness({ rows, sessionsById: {} });
    // 第一批回查后置为失效：第二批的入口检查应直接 return。
    const original = params.agentService.listSessions;
    params.agentService.listSessions = async (input) => {
      const result = await original(input);
      state.current = false;
      return result;
    };
    await repairSubagentTaskIndex(params);
    assert.deepEqual(
      calls.listSessions.map((call) => call.sessionIds.length),
      [64],
      "130 条只发了第一批 64 条就因失效停手",
    );
    assert.equal(calls.updateTaskState.length, 0);
  });

  it("全部批次跑完时，130 条拆成 64/64/2", async () => {
    const rows = Array.from({ length: 130 }, (_, index) => row(`s-${index}`));
    const { params, calls } = harness({ rows, sessionsById: {} });
    await repairSubagentTaskIndex(params);
    assert.deepEqual(
      calls.listSessions.map((call) => call.sessionIds.length),
      [64, 64, 2],
    );
    assert.equal(calls.updateTaskState.length, 0, "回查无结果时不写任何行");
  });

  it("每条命中之后也检查 isCurrent：失效即停手，不再继续写同一批", async () => {
    const { params, calls, state } = harness({
      rows: [row("a"), row("b")],
      sessionsById: { a: [session("a")], b: [session("b")] },
    });
    params.taskIndexRepo.updateTaskState = async (input) => {
      calls.updateTaskState.push(input);
      state.current = false;
    };
    await repairSubagentTaskIndex(params);
    assert.deepEqual(
      calls.updateTaskState.map((call) => call.taskId),
      ["a"],
      "写第一行后失效，第二行不再写",
    );
    assert.equal(calls.onRemoved, 0, "失效后不再回调 onRemoved");
  });

  it("listSessions 抛错直接上抛，不静默跳过", async () => {
    const { params } = harness({ rows: [row("a")], sessionsById: {} });
    params.agentService.listSessions = async () => {
      throw new Error("old agent does not support sessionIds");
    };
    await assert.rejects(
      () => repairSubagentTaskIndex(params),
      /old agent does not support sessionIds/u,
    );
  });

  it("没有不可见行时不发任何回查请求", async () => {
    const { params, calls } = harness({ rows: [row("only")], sessionsById: {} });
    params.visibleSessionIds = new Set(["only"]);
    await repairSubagentTaskIndex(params);
    assert.deepEqual(calls.listSessions, []);
    assert.deepEqual(calls.updateTaskState, []);
  });

  it("回查返回不属于本批的会话时忽略（防越批删除）", async () => {
    const { params, calls } = harness({
      rows: [row("a")],
      sessionsById: { a: [session("a"), session("smuggled")] },
    });
    await repairSubagentTaskIndex(params);
    assert.deepEqual(
      calls.updateTaskState.map((call) => call.taskId),
      ["a"],
      "同一响应里夹带的非本批 id 不被删除",
    );
  });
});
