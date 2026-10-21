// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-03 B6–B11：**队列 5 条命令的行为断言**。
//
// 与合同阶段 `command-surface.test.mjs` 的分工：
//   - 那个测「协议面事实」（34 条命令存在、payload 是 zod）；
//   - 本文件测「队列行为」（身份映射、返回值权威、位次一致）。
//
// 三条不变量（known-differences.md §五）：
//   ① `replace`/`remove` 的布尔返回值是**唯一权威**——`false` 时映射必须收敛且命令按拒绝处理；
//   ② `order.queuePosition` 只数 `nextTurn`（`nextStep` 是 steer 通道，不进 order）；
//   ③ `sendQueuedNow` 必须 `keepInbox: true` + 等 idle，且失败要显式。
//
// 断言强度纪律：每条否定性断言都配肯定性对照，避免「空实现也能过」。
import { strict as strictAssert } from "node:assert";
import { join as combinePath } from "node:path";
import { pathToFileURL as moduleUrlFor } from "node:url";
import { repoRootPath as projectRoot } from "./entry.mjs";
import { test as caseTest } from "node:test";

/** 包内模块源码目录。 */
const BRIDGE_DIR = combinePath(projectRoot, "apps/cli/packages/bootstrap/src/kernel-bridge");

/**
 * 载入一个包内 TS 模块。
 *
 * @param relative - 相对 `kernel-bridge/` 的路径。
 * @returns 模块命名空间。
 */
async function loadModule(relative) {
  return import(moduleUrlFor(combinePath(BRIDGE_DIR, relative)).href);
}

/**
 * 造一个可控的 DSH 收件箱替身。
 *
 * 关键点：`remove` / `replace` 的返回值**由测试直接控制**——这正是为了验证
 * 「返回值是唯一权威」这条不变量：我们要能模拟「DSH 说这项已不在队列」。
 *
 * @returns 替身 + 它的两个列表（供断言）。
 */
function fakeInbox() {
  const state = {
    nextTurn: [],
    nextStep: [],
    /** 下一次 remove 的返回值；默认 true。 */
    removeResult: true,
    /** 下一次 replace 的返回值；默认 true。 */
    replaceResult: true,
    /** 记录调用，便于断言「没做的事」。 */
    calls: [],
  };
  const harness = {
    get nextTurn() {
      return state.nextTurn;
    },
    get nextStep() {
      return state.nextStep;
    },
    remove(messageId) {
      state.calls.push({ op: "remove", messageId });
      if (!state.removeResult) return false;
      state.nextTurn = state.nextTurn.filter((item) => item.id !== messageId);
      state.nextStep = state.nextStep.filter((item) => item.id !== messageId);
      return true;
    },
    replace(messageId, newMessage) {
      state.calls.push({ op: "replace", messageId, newMessage });
      if (!state.replaceResult) return false;
      state.nextTurn = state.nextTurn.map((item) =>
        item.id === messageId ? { ...item, text: newMessage } : item,
      );
      return true;
    },
    splice(target, start, deleteCount, inserted) {
      state.calls.push({ op: "splice", target, start, deleteCount, inserted });
      const list = target === "next-turn" ? state.nextTurn : state.nextStep;
      // `start === -1` 表示队尾（与实现约定一致）。
      const at = start < 0 ? list.length : start;
      list.splice(at, deleteCount, ...inserted);
      return [];
    },
  };
  return { state, harness };
}

/**
 * 造一个身份账本 + 宿主 + 一个已登记的队列项。
 *
 * @returns 账本、宿主、替身状态与那一项的 id。
 */
async function setupWithOneItem() {
  const { QueueLedger } = await loadModule("queue-ledger.ts");
  const ledger = new QueueLedger();
  const { state, harness } = fakeInbox();
  const host = { inboxFor: () => harness };
  // 模拟 `sendText.queue` 入队：先落到 DSH，再登记身份。
  const messageId = "msg-1";
  state.nextTurn.push({ id: messageId, text: "original" });
  const queueItemId = ledger.register("next-turn", messageId);
  return { ledger, host, state, queueItemId, messageId };
}

caseTest("B6 editQueueItem 原位替换，位次不变", async () => {
  const { editQueueItem } = await loadModule("queue-ops.ts");
  const { ledger, host, state, queueItemId } = await setupWithOneItem();
  const result = editQueueItem(ledger, host, "sess_1", queueItemId, "edited");
  strictAssert.equal(result.ok, true, "在队项必须能改");
  strictAssert.equal(state.nextTurn.length, 1, "原位替换不改变队列长度");
  strictAssert.equal(state.nextTurn[0].text, "edited", "DSH 侧的文案已更新");
  strictAssert.equal(result.queuePosition, 1, "位次仍为 1（不是重新入队）");
});

caseTest("B6 editQueueItem：DSH 说不在队列时必须拒绝，且映射收敛", async () => {
  const { editQueueItem } = await loadModule("queue-ops.ts");
  const { ledger, host, state, queueItemId } = await setupWithOneItem();
  // 模拟「该项已被 drain」：DSH 的 replace 返回 false。
  state.replaceResult = false;
  const result = editQueueItem(ledger, host, "sess_1", queueItemId, "edited");
  strictAssert.equal(result.ok, false, "replace 返回 false 时必须拒绝，不能静默成功");
  strictAssert.equal(result.reasonCode, "guard.queueItemNotEditable", "原因码必须是冻结值");
  strictAssert.equal(ledger.get(queueItemId), undefined, "映射必须跟着收敛（不留悬挂身份）");
});

caseTest("B7 deleteQueueItem 移除后其余项相对位次不变", async () => {
  const { QueueLedger } = await loadModule("queue-ledger.ts");
  const { deleteQueueItem } = await loadModule("queue-ops.ts");
  const { state, harness } = fakeInbox();
  const ledger = new QueueLedger();
  const host = { inboxFor: () => harness };
  for (const id of ["m1", "m2", "m3"]) state.nextTurn.push({ id, text: id });
  const q1 = ledger.register("next-turn", "m1");
  const q2 = ledger.register("next-turn", "m2");
  const q3 = ledger.register("next-turn", "m3");

  const result = deleteQueueItem(ledger, host, "sess_1", q2);

  strictAssert.equal(result.ok, true, "在队项必须能删");
  strictAssert.equal(ledger.positionOf(q1), 1, "前一项位次不变");
  strictAssert.equal(ledger.positionOf(q3), 2, "后一项位次前移一位（相对顺序不变）");
  strictAssert.equal(ledger.get(q2), undefined, "被删项的映射已消失");
  strictAssert.deepEqual(
    state.nextTurn.map((item) => item.id),
    ["m1", "m3"],
    "DSH 侧只剩 m1、m3",
  );
});

caseTest("B8 reorderQueueItem 把项移到锚点之前，且**项不丢失**", async () => {
  const { QueueLedger } = await loadModule("queue-ledger.ts");
  const { reorderQueueItem } = await loadModule("queue-ops.ts");
  const { state, harness } = fakeInbox();
  const ledger = new QueueLedger();
  const host = { inboxFor: () => harness };
  for (const id of ["m1", "m2", "m3"]) state.nextTurn.push({ id, text: id });
  ledger.register("next-turn", "m1");
  const q2 = ledger.register("next-turn", "m2");
  const q3 = ledger.register("next-turn", "m3");

  // 把 m3 移到 m2 之前。
  const result = reorderQueueItem(ledger, host, "sess_1", q3, q2);

  strictAssert.equal(result.ok, true, "移动必须成功");
  // ★ 关键断言：项**没有丢失**（这是我在实现里发现并修掉的缺陷：
  //   第一版 splice 传空数组，等价于「只删不插」）。
  strictAssert.equal(state.nextTurn.length, 3, "移动后队列长度不变（项不丢失）");
  strictAssert.deepEqual(
    state.nextTurn.map((item) => item.id).sort(),
    ["m1", "m2", "m3"],
    "三个项都在（只是顺序变了）",
  );
});

caseTest("B8 reorderQueueItem：锚点不在队列时**不做任何变更**", async () => {
  const { QueueLedger } = await loadModule("queue-ledger.ts");
  const { reorderQueueItem } = await loadModule("queue-ops.ts");
  const { state, harness } = fakeInbox();
  const ledger = new QueueLedger();
  const host = { inboxFor: () => harness };
  state.nextTurn.push({ id: "m1", text: "m1" });
  const q1 = ledger.register("next-turn", "m1");

  const result = reorderQueueItem(ledger, host, "sess_1", q1, "q-not-exist");

  strictAssert.equal(result.ok, false, "锚点不存在必须拒绝");
  strictAssert.equal(state.nextTurn.length, 1, "队列不得被改动（要么全动要么全不动）");
  strictAssert.deepEqual(state.calls, [], "拒绝时不得调用任何 DSH 原语");
  strictAssert.notEqual(ledger.get(q1), undefined, "映射保持不变");
});

caseTest("B10 setAutoDrain 只改 v4 侧状态，不动队列", async () => {
  const { setAutoDrain } = await loadModule("queue-ops.ts");
  const { state, harness } = fakeInbox();
  state.nextTurn.push({ id: "m1", text: "m1" });
  const scheduling = { autoDrain: false };

  const next = setAutoDrain(scheduling, true);

  strictAssert.equal(next.autoDrain, true, "状态已更新");
  strictAssert.deepEqual(state.calls, [], "DSH 无 autoDrain 概念，不得调用任何原语");
  strictAssert.equal(state.nextTurn.length, 1, "队列内容不变");
});

caseTest("B9 sendQueuedNow：成功路径按「取消→等 idle→移除→提交」顺序", async () => {
  const { QueueLedger } = await loadModule("queue-ledger.ts");
  const { sendQueuedNow } = await loadModule("queue-ops.ts");
  const { state, harness } = fakeInbox();
  const ledger = new QueueLedger();
  const order = [];
  const host = {
    inboxFor: () => harness,
    async cancelAndWaitIdle() {
      order.push("cancelAndWaitIdle");
    },
    async promoteToTurn(_sessionId, text) {
      order.push(`promote:${text}`);
    },
  };
  state.nextTurn.push({ id: "msg-1", text: "queued text" });
  const queueItemId = ledger.register("next-turn", "msg-1");

  const result = await sendQueuedNow(ledger, host, "sess_1", queueItemId, () => "queued text");

  strictAssert.equal(result.ok, true, "提升必须成功");
  strictAssert.deepEqual(
    order,
    ["cancelAndWaitIdle", "promote:queued text"],
    "顺序必须是「先取消并等 idle，再提交」——反过来会出现新旧回合交错",
  );
  strictAssert.equal(state.nextTurn.length, 0, "该项已移出队列");
  strictAssert.equal(ledger.get(queueItemId), undefined, "映射已收敛");
});

caseTest("B9 sendQueuedNow：提交失败必须显式失败（不谎报成功）", async () => {
  const { QueueLedger } = await loadModule("queue-ledger.ts");
  const { sendQueuedNow } = await loadModule("queue-ops.ts");
  const { state, harness } = fakeInbox();
  const ledger = new QueueLedger();
  const host = {
    inboxFor: () => harness,
    async cancelAndWaitIdle() {},
    async promoteToTurn() {
      throw new Error("synthetic promote failure");
    },
  };
  state.nextTurn.push({ id: "msg-1", text: "queued text" });
  const queueItemId = ledger.register("next-turn", "msg-1");

  const result = await sendQueuedNow(ledger, host, "sess_1", queueItemId, () => "queued text");

  strictAssert.equal(result.ok, false, "提交失败时不得报告成功");
  strictAssert.equal(
    result.reasonCode,
    "fault.command.queuePromotionCommitFailed",
    "必须用「提升失败」的原因码（不是「不在队列」）",
  );
  strictAssert.match(String(result.message), /synthetic promote failure/u, "必须保留原始失败原因");
});

caseTest("B9 sendQueuedNow：正文不可得时拒绝，不去猜内容", async () => {
  const { QueueLedger } = await loadModule("queue-ledger.ts");
  const { sendQueuedNow } = await loadModule("queue-ops.ts");
  const { state, harness } = fakeInbox();
  const ledger = new QueueLedger();
  const host = {
    inboxFor: () => harness,
    async cancelAndWaitIdle() {
      throw new Error("must not be called");
    },
    async promoteToTurn() {
      throw new Error("must not be called");
    },
  };
  state.nextTurn.push({ id: "msg-1", text: "queued text" });
  const queueItemId = ledger.register("next-turn", "msg-1");

  const result = await sendQueuedNow(ledger, host, "sess_1", queueItemId, () => undefined);

  strictAssert.equal(result.ok, false, "正文不可得必须拒绝");
  strictAssert.equal(
    result.reasonCode,
    "fault.command.queueItemTextUnavailable",
    "原因码必须是「正文不可得」",
  );
  strictAssert.equal(state.nextTurn.length, 1, "拒绝时队列不变（没有动过）");
});

caseTest("B11 位次只数 nextTurn：guide（next-step）不进 order", async () => {
  const { QueueLedger } = await loadModule("queue-ledger.ts");
  const ledger = new QueueLedger();
  ledger.register("next-turn", "m1");
  const guideItem = ledger.register("next-step", "g1");
  const secondTurn = ledger.register("next-turn", "m2");

  strictAssert.equal(ledger.positionOf(secondTurn), 2, "第二个 nextTurn 项位次为 2");
  strictAssert.equal(
    ledger.positionOf(guideItem),
    0,
    "nextStep 项不进 v4 order（位次 0）——这是 U1 的结论",
  );
  strictAssert.equal(ledger.queueSize, 2, "队列规模只数 nextTurn");
});
