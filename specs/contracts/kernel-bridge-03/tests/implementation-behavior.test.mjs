// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-03 B20–B23 + B24：**实现阶段**的行为断言。
//
// 与合同阶段 `capability-gaps.test.mjs` 的分工：
//   - 那个测「夹具与合同声明自洽」（10 条缺口、归属包在计划书清单内）；
//   - 本文件测「实现真的这么做了」：缺口命令回 `capabilityAbsent`、端口表 12 行都落到执行器。
//
// 这是「合同 → 实现」的落地验证：合同说「回专门 reasonCode」，实现必须真的回；
// 合同说「12/12 端口」，实现必须真的 12 行都通。
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

/** 合同冻结的能力缺失 reasonCode。 */
const CAPABILITY_ABSENT = "fault.command.capabilityAbsent";

/** 实现进度语义的 reasonCode：缺口命令**不得**用它。 */
const UNSUPPORTED = "unsupported";

caseTest("B20–B23 实现：10 条缺口命令都回 capabilityAbsent，且都不回 accepted", async () => {
  const { CAPABILITY_GAP_COMMANDS, capabilityAbsentOutcome, isCapabilityGapCommand } =
    await loadModule("capability-gap.ts");

  // 肯定性对照：集合非空，否则下面的遍历恒真。
  strictAssert.ok(CAPABILITY_GAP_COMMANDS.size >= 10, "缺口集合必须至少有 10 条");

  for (const [command, owner] of CAPABILITY_GAP_COMMANDS) {
    strictAssert.equal(isCapabilityGapCommand(command), true, `${command} 应被识别为缺口命令`);
    const outcome = capabilityAbsentOutcome(command);
    // ① reasonCode 是冻结值，不是 unsupported。
    strictAssert.equal(outcome.reasonCode, CAPABILITY_ABSENT, `${command} 必须回冻结的能力缺失码`);
    strictAssert.notEqual(outcome.reasonCode, UNSUPPORTED, `${command} 不得回 unsupported`);
    // ③ 不伪造成功。
    strictAssert.equal(outcome.status, "failed", `${command} 不得回 accepted`);
    // 说明里点明归属包（便于定位「去哪个包找实现」）。
    // 字段名是 `message`——它必须是 `CommandExecutionOutcome` 的字段，
    // 否则说明会在投递到 ACK 时被丢掉（我在实现里踩过这个坑）。
    strictAssert.match(outcome.message, new RegExp(owner, "u"), `${command} 的说明必须点明归属包`);
  }
});

caseTest("B20–B23 实现：非缺口命令不被误判为缺口", async () => {
  const { isCapabilityGapCommand } = await loadModule("capability-gap.ts");
  // 肯定性对照：这些是**可实现**的命令，必须返回 false——
  // 否则「把不该缺口的命令也报缺口」会骗过 B25 的收口断言。
  for (const command of ["sendText", "stop", "forkAssistant", "editQueueItem", "renameSession"]) {
    strictAssert.equal(isCapabilityGapCommand(command), false, `${command} 不是缺口命令`);
  }
});

caseTest("B24 实现：端口表恰好 12 行，且含 session/close", async () => {
  const { createLegacyTurnPort } = await loadModule("legacy-port/index.ts");
  strictAssert.equal(typeof createLegacyTurnPort, "function", "必须导出 createLegacyTurnPort");

  // 用「未注册的方法回 -32031」来**间接**数表规模：
  // 表里的方法会走到执行器（这里执行器是替身，全部成功），表外的方法回 -32031。
  // 这样即使表没有对外导出，也能验证「哪些方法被接管」。
  const handled = [
    "session/send",
    "session/stop",
    "session/cancelBackgroundTask",
    "session/compact",
    "session/resume",
    "session/subscribe",
    "session/fork",
    "session/goal",
    "session/setModel",
    "session/setThoughtLevel",
    "session/setMode",
    "session/close",
  ];
  const seen = [];
  const executor = {
    async sendText(request) {
      seen.push(`sendText:${request.sessionId}`);
      return { sessionId: request.sessionId };
    },
    async stop(request) {
      seen.push(`stop:${request.sessionId}`);
      return { sessionId: request.sessionId };
    },
    async compact(request) {
      seen.push(`compact:${request.sessionId}`);
      return { sessionId: request.sessionId };
    },
    async resumeSession() {
      seen.push("resumeSession");
      return {};
    },
    async subscribeSession() {
      seen.push("subscribeSession");
      return {};
    },
    async forkSession() {
      seen.push("forkSession");
      return { sessionId: "forked" };
    },
    async setGoal() {
      seen.push("setGoal");
      return {};
    },
    async setModel() {
      seen.push("setModel");
      return {};
    },
    async setThoughtLevel() {
      seen.push("setThoughtLevel");
      return {};
    },
    async setMode() {
      seen.push("setMode");
      return {};
    },
    async closeSession() {
      seen.push("closeSession");
      return { closed: true };
    },
  };
  const port = createLegacyTurnPort(executor);

  for (const method of handled) {
    const outcome = await port.execute({
      method,
      params: { sessionId: "sess_1", text: "x", objective: "x" },
    });
    strictAssert.equal(
      outcome.kind,
      "result",
      `${method} 必须走执行器（实际=${JSON.stringify(outcome)}）`,
    );
  }
  // 肯定性对照：12 个方法**全部**到达执行器，没有一个被漏掉。
  strictAssert.equal(seen.length, 12, `12 个方法都必须调用执行器；实际=${seen.length}`);
  // ★ session/close 必须真的调了 closeSession（不是被映射到 stop）。
  strictAssert.ok(seen.includes("closeSession"), "session/close 必须映射到 closeSession");
  strictAssert.ok(!seen.includes("closeSession:stop"), "close 不得被映射到 stop");
});

caseTest("B24 实现：表外的旧协议方法回 -32031（不因扩表而变得可用）", async () => {
  const { createLegacyTurnPort } = await loadModule("legacy-port/index.ts");
  const executor = {
    async sendText() {
      throw new Error("must not be called");
    },
    async stop() {
      throw new Error("must not be called");
    },
    async compact() {
      throw new Error("must not be called");
    },
  };
  const port = createLegacyTurnPort(executor);
  // 这些旧协议方法**不在** C2 的 12 个端口方法里（它们走 legacy 自己的 handler）。
  for (const method of ["workspace/list", "plugin/catalog", "session/unknownMethod"]) {
    const outcome = await port.execute({ method, params: { sessionId: "sess_1" } });
    strictAssert.equal(outcome.kind, "error", `${method} 必须是错误`);
    strictAssert.equal(outcome.code, -32031, `${method} 必须回 -32031（能力缺席）`);
  }
});

caseTest("B24 实现：缺 sessionId 时回 -32602（参数错误，与能力缺席区分）", async () => {
  const { createLegacyTurnPort } = await loadModule("legacy-port/index.ts");
  const executor = {
    async sendText() {
      throw new Error("must not be called");
    },
  };
  const port = createLegacyTurnPort(executor);
  const outcome = await port.execute({ method: "session/send", params: { text: "no session" } });
  strictAssert.equal(outcome.kind, "error", "缺 sessionId 必须是错误");
  strictAssert.equal(
    outcome.code,
    -32602,
    "参数错误用 -32602，**不是** -32031——两者对客户端意义不同",
  );
});
