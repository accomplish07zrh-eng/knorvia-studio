// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-02 B9：`resolveInteraction` 从 **v4 协议面**可达，不只是内部能力。
//
// 为什么要单独一个文件：实现阶段我犯过一次错 —— `turn-approval.ts` 的
// `requestTurnApproval` / `TurnApprovalRegistry` 都实现并测试通过了，但
// `bridge-engine.ts` 的 `case` 里**没有** `resolveInteraction`，于是这条命令在
// v4 协议面上仍然回 `unsupported`。「能力模块完成 ≠ 协议面可达」，本文件锁住后者：
// 它从 `handleCommand`（协议入口）发命令，断言真的落到 `settle`。
import { strict as strictAssert } from "node:assert";
import { join as combinePath } from "node:path";
import { pathToFileURL as urlOf } from "node:url";
import { repoRoot as checkoutRoot } from "./entry.mjs";
import { test as caseTest } from "node:test";

/** 包内模块的源码目录。 */
const BRIDGE_DIR = combinePath(checkoutRoot, "apps/cli/packages/bootstrap/src/kernel-bridge");

/** 交互已被解决：冻结面规定的 noop 原因码（`command.ts` L171）。 */
const ALREADY_RESOLVED = "proto.alreadyResolved";

/**
 * 载入一个包内 TS 模块。
 *
 * @param relative - 相对 `kernel-bridge/` 的路径。
 * @returns 模块命名空间。
 */
async function loadModule(relative) {
  return import(urlOf(combinePath(BRIDGE_DIR, relative)).href);
}

/**
 * 最小 context。
 *
 * 注意 `sessions` 是**属性访问**（`context.sessions.create(...)`），不是 `ctx.get("sessions")`——
 * 引擎按 DSH 的 Cordis 服务风格直接取属性，因此这里用属性而非 map 查找。
 */
function minimalContext() {
  const sessions = {
    create(id) {
      return { header: { id } };
    },
  };
  return { sessions, get: () => undefined, on: () => () => {} };
}

/**
 * 造一条 v4 `resolveInteraction` 命令信封。
 *
 * @param sessionId - 已存在的会话。
 * @param interactionId - 要闭合的交互标识。
 * @param optionId - 选中的选项（审批的「同意」分支用 `allow-once`）。
 * @param commandId - 幂等键。
 * @returns 可供 `handleCommand` 使用的原始信封。
 */
function resolveEnvelope(sessionId, interactionId, optionId, commandId) {
  const payload = { interactionId, answer: { optionId } };
  return {
    type: "resolveInteraction",
    commandId,
    clientId: "client-1",
    sessionId,
    payload,
    issuedAt: 1_700_000_000_000,
  };
}

/**
 * 在一次性引擎上跑一段断言，结束后必定释放引擎。
 *
 * `resolveInteraction` 的**协议面**要求信封带非空 `sessionId`（`commandEnvelopeSchema`
 * 里只有 `createSession` 允许 null），且 `CommandInbox` 会先裁决会话存在性，
 * 所以每个用例都要先建出一个会话。把这套样板（建引擎 + 建会话 + 释放）收在一处，
 * 用例本身只表达断言。
 *
 * @param body - 拿到 `{ engine, sessionId }` 后的断言体。
 * @returns 断言体的返回值。
 */
async function withEngine(body) {
  const { BridgeEngine } = await loadModule("bridge-engine.ts");
  const engine = new BridgeEngine({ context: minimalContext(), writeFrame() {} });
  try {
    const created = await engine.handleCommand({
      type: "createSession",
      commandId: "cmd-create-session",
      clientId: "client-1",
      sessionId: null,
      payload: { workspaceId: "ws-fixture" },
      issuedAt: 1_700_000_000_000,
    });
    strictAssert.equal(
      created.status,
      "accepted",
      `建会话应 accepted；实际=${JSON.stringify(created)}`,
    );
    return await body({ engine, sessionId: created.result.sessionId });
  } finally {
    await engine.dispose();
  }
}

caseTest("B9 已登记的交互：从 v4 协议面 resolveInteraction 能到达 settle", async () => {
  await withEngine(async ({ engine, sessionId }) => {
    const outcomes = [];
    engine.approvals.register("interaction-live", (outcome) => outcomes.push(outcome));

    const ack = await engine.handleCommand(
      resolveEnvelope(sessionId, "interaction-live", "allow-once", "cmd-resolve-1"),
    );

    // 关键断言 1：协议面可达 —— 不是 unsupported。
    strictAssert.notEqual(
      ack.reasonCode,
      "unsupported",
      "resolveInteraction 必须从协议面可达，不得再走 unsupported",
    );
    strictAssert.equal(
      ack.status,
      "accepted",
      `已登记交互应 accepted；实际=${JSON.stringify(ack)}`,
    );
    // 关键断言 2：真的闭合了，且决定被送到收敛回调。
    strictAssert.deepEqual(outcomes, ["allowed-once"], "应答必须真的落到 settle 并授权");
    strictAssert.equal(engine.approvals.size, 0, "闭合后不得残留未决请求");
  });
});

caseTest("B9 未登记的交互：回 proto.alreadyResolved noop（冻结语义，不自造原因码）", async () => {
  await withEngine(async ({ engine, sessionId }) => {
    const ack = await engine.handleCommand(
      resolveEnvelope(sessionId, "interaction-never-registered", "allow-once", "cmd-resolve-2"),
    );
    strictAssert.equal(ack.status, "noop", `未登记交互必须 noop；实际=${JSON.stringify(ack)}`);
    strictAssert.equal(ack.reasonCode, ALREADY_RESOLVED, "必须用冻结的 reasonCode，不得自造");
  });
});

caseTest("B9 晚到的第二个应答：noop，且不改写首个决定", async () => {
  await withEngine(async ({ engine, sessionId }) => {
    const outcomes = [];
    engine.approvals.register("interaction-once", (outcome) => outcomes.push(outcome));

    const first = await engine.handleCommand(
      resolveEnvelope(sessionId, "interaction-once", "allow-once", "cmd-first"),
    );
    const second = await engine.handleCommand(
      resolveEnvelope(sessionId, "interaction-once", "deny", "cmd-second"),
    );

    strictAssert.equal(first.status, "accepted", "首个应答必须 accepted");
    strictAssert.equal(second.status, "noop", "晚到应答必须 noop");
    strictAssert.equal(second.reasonCode, ALREADY_RESOLVED, "晚到用冻结 reasonCode");
    strictAssert.deepEqual(outcomes, ["allowed-once"], "决定不得被后续应答改写");
  });
});

caseTest("B9 引擎关闭时未决审批被结算（resolveInteraction 与关闭路径同源）", async () => {
  // 这个用例要自己控制 dispose 的时机（断言发生在关闭**之后**），因此不走 withEngine。
  const { BridgeEngine } = await loadModule("bridge-engine.ts");
  const engine = new BridgeEngine({ context: minimalContext(), writeFrame() {} });
  const outcomes = [];
  engine.approvals.register("interaction-on-close", (outcome) => outcomes.push(outcome));
  await engine.dispose();
  strictAssert.deepEqual(outcomes, ["unavailable"], "关闭时必须按 fail closed 结算未决审批");
});
