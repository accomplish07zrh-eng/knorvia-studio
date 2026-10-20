// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-02 B14/B15：C2 接缝与单一 admission 的可判定断言。
//
// 这两条是 kernel-switch 的准入项，因此必须在**本包合并前**就能判定：
//   - B14（C2）：legacy 端口对 4 个方法走同一实现、7 个回 -32031；
//                且**未注册时 legacy 侧仍是 -32031**（反向断言，不依赖 legacy 实现）。
//   - B15：全部输入经 CommandInbox；不存在绕过 admission 的第二条写入路径。
//
// 走公开入口：只 import bootstrap 自己的公开子路径与 kernel-bridge 的包内导出
// （后者供组合根与测试使用，见合同 interface.md §四）。
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir as systemTempRoot } from "node:os";
import { join as joinPathSegments } from "node:path";
import { pathToFileURL as asModuleUrl } from "node:url";
import { repoRoot as checkoutRoot } from "./entry.mjs";
import { strict as assertStrict } from "node:assert";
import { test as nodeTest } from "node:test";

/** 包内导出的源码入口；实现阶段这些模块就在 bootstrap 包里。 */
const BRIDGE_SOURCE_DIR = joinPathSegments(
  checkoutRoot,
  "apps/cli/packages/bootstrap/src/kernel-bridge",
);

/**
 * 动态 import 一个包内 TS 模块（测试经 tsx 解析 TypeScript）。
 *
 * @param relative - 相对 `kernel-bridge/` 的模块路径。
 * @returns 该模块的命名空间。
 */
async function loadBridgeModule(relative) {
  return import(asModuleUrl(joinPathSegments(BRIDGE_SOURCE_DIR, relative)).href);
}

/** 造一个记录调用的假执行器：验证「两条路径共用同一实现」而不触碰真实 DSH。 */
function recordingExecutor() {
  const calls = [];
  return {
    calls,
    sendText: async (request) => {
      calls.push({ method: "sendText", request });
      return { sessionId: request.sessionId, admitted: "queue", queuePosition: 1 };
    },
    stop: async (request) => {
      calls.push({ method: "stop", request });
      return { sessionId: request.sessionId, stopped: true };
    },
    compact: async (request) => {
      calls.push({ method: "compact", request });
      return { sessionId: request.sessionId, compacted: true };
    },
    createSession: async (request) => {
      calls.push({ method: "createSession", request });
      return { sessionId: request.sessionId };
    },
  };
}

nodeTest("B14 C2：4 个旧协议回合方法转到同一个 KernelTurnExecutor", async () => {
  const { createLegacyTurnPort } = await loadBridgeModule("legacy-port/index.ts");
  const executor = recordingExecutor();
  const port = createLegacyTurnPort(executor);

  const cases = [
    ["session/send", { sessionId: "sess_1", text: "hello" }, "sendText"],
    ["session/stop", { sessionId: "sess_1" }, "stop"],
    ["session/cancelBackgroundTask", { sessionId: "sess_1" }, "stop"],
    ["session/compact", { sessionId: "sess_1" }, "compact"],
  ];
  for (const [method, params, expectedCall] of cases) {
    const outcome = await port.execute({ method, params });
    assertStrict.equal(
      outcome.kind,
      "result",
      `${method} 必须返回 result；实际=${JSON.stringify(outcome)}`,
    );
    const last = executor.calls.at(-1);
    assertStrict.equal(
      last.method,
      expectedCall,
      `${method} 必须走 KernelTurnExecutor.${expectedCall}（C2：两条路径同一实现）`,
    );
  }
  // 4 个方法共用了同一个 executor 实例：调用序列是 4 条，不是 4 份实现。
  assertStrict.equal(executor.calls.length, 4, "每个方法恰好调一次执行器");
});

nodeTest("B14 C2：归 kernel-bridge-03 的 7 个方法回 -32031 capability 缺席", async () => {
  const { createLegacyTurnPort } = await loadBridgeModule("legacy-port/index.ts");
  const executor = recordingExecutor();
  const port = createLegacyTurnPort(executor);

  const notOurs = [
    "session/fork",
    "session/goal",
    "session/setModel",
    "session/setThoughtLevel",
    "session/setMode",
    "session/resume",
    "session/subscribe",
  ];
  for (const method of notOurs) {
    const outcome = await port.execute({ method, params: { sessionId: "sess_1" } });
    assertStrict.equal(
      outcome.kind,
      "error",
      `${method} 必须回错误（不伪造成功）；实际=${JSON.stringify(outcome)}`,
    );
    assertStrict.equal(outcome.code, -32031, `${method} 必须回 -32031（capability 缺席）`);
  }
  assertStrict.equal(executor.calls.length, 0, "未交付的 7 个方法不得触碰执行器（不得伪造成功）");
});

nodeTest("B14 C2 反向断言：端口未注册时 legacy 侧仍是 -32031", async () => {
  // 这条不依赖 legacy 实现：只要「没有把端口注册进去」，4 个方法就必须保持缺席。
  // 实现方式：不调用 registerLegacyExecutionPort（本包也不自己维护注册表），
  // 因此 legacy 路由拿不到端口 → 按 behavior B10 回 -32031。
  const legacy = await loadBridgeModule("legacy-port/index.ts");
  assertStrict.equal(
    typeof legacy.createLegacyTurnPort,
    "function",
    "本包只提供「造端口」的能力，不提供「注册」——注册归组合根调 legacy 的注册函数",
  );
  // 本包不得自带注册表 / 不得自带 route：否则会出现第二个端口所有者。
  for (const forbidden of ["registerLegacyExecutionPort", "routeLegacyMethod"]) {
    assertStrict.equal(
      Object.hasOwn(legacy, forbidden),
      false,
      `本包不得导出自有的 ${forbidden}（端口注册表与路由的唯一所有者是 kernel-bridge-legacy）`,
    );
  }
});

nodeTest("B15 单一 admission：输入只经 CommandInbox 进入，引擎不自建第二条写入路径", async () => {
  const engineModule = await loadBridgeModule("bridge-engine.ts");
  assertStrict.equal(
    typeof engineModule.BridgeEngine,
    "function",
    "bridge-engine 必须导出 BridgeEngine",
  );

  // 反结构断言：引擎的命令入口只有一个（handleCommand → CommandInbox.handle），
  // 回合分支只经 execute() 委派给分派模块，绝不在别处直接 append DSH 收件箱。
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(joinPathSegments(BRIDGE_SOURCE_DIR, "bridge-engine.ts"), "utf8"),
  );
  // 引擎必须通过 inbox.handle 收命令。
  assertStrict.match(source, /this\.inbox\.handle\(/u, "命令必须经 CommandInbox.handle 准入");
  // 引擎本身不得直接操作 DSH 收件箱（那是 turn-executor 的唯一职责）。
  assertStrict.equal(
    /inbox\.append\(/u.test(source),
    false,
    "bridge-engine 不得直接 append DSH 收件箱（第二条写入路径）",
  );
  // 回合分支必须**委派**给分派模块，而不是在引擎里各写一份。
  assertStrict.match(
    source,
    /dispatchTurnCommand\(/u,
    "回合命令必须委派给 dispatchTurnCommand（唯一分派点）",
  );
});

nodeTest("B15 单一 admission：并发两条 sendText 按 admission 顺序执行", async () => {
  const { BridgeEngine } = await loadBridgeModule("bridge-engine.ts");
  const sandbox = await mkdtemp(joinPathSegments(systemTempRoot(), "kernel-bridge-02-admission-"));
  const workspace = joinPathSegments(sandbox, "ws");
  await mkdir(workspace, { recursive: true });

  // 最小 context：只需要 sessions.create 与 on()。用真实 DSH 服务会引入无关依赖，
  // 这里只断言「准入顺序」，不测 DSH 内部。
  const created = [];
  const context = {
    sessions: {
      create(id) {
        created.push(id);
        return { header: { id } };
      },
    },
    on() {
      return () => {};
    },
  };
  const order = [];
  const executor = {
    sendText: async (request) => {
      order.push(request.text);
      return { sessionId: request.sessionId, admitted: "queue", queuePosition: order.length };
    },
    stop: async () => ({ sessionId: "x", stopped: true }),
    compact: async () => ({ sessionId: "x", compacted: true }),
    createSession: async (request) => ({ sessionId: request.sessionId }),
  };
  const engine = new BridgeEngine({
    context,
    writeFrame() {},
    turnExecutor: executor,
  });
  try {
    const created1 = await engine.handleCommand({
      commandId: "cmd-create",
      clientId: "test",
      sessionId: null,
      type: "createSession",
      payload: { workspaceId: workspace },
      issuedAt: Date.now(),
    });
    assertStrict.equal(
      created1.status,
      "accepted",
      `建会话必须 accepted；实际=${JSON.stringify(created1)}`,
    );
    const sessionId = created1.result.sessionId;
    // 并发投递两条：准入是串行的，执行顺序必须与投递顺序一致。
    const first = engine.handleCommand({
      commandId: "cmd-a",
      clientId: "test",
      sessionId,
      type: "sendText",
      payload: { text: "first" },
      issuedAt: Date.now(),
    });
    const second = engine.handleCommand({
      commandId: "cmd-b",
      clientId: "test",
      sessionId,
      type: "sendText",
      payload: { text: "second" },
      issuedAt: Date.now(),
    });
    const [ackA, ackB] = await Promise.all([first, second]);
    assertStrict.equal(
      ackA.status,
      "accepted",
      `第一条必须 accepted；实际=${JSON.stringify(ackA)}`,
    );
    assertStrict.equal(
      ackB.status,
      "accepted",
      `第二条必须 accepted；实际=${JSON.stringify(ackB)}`,
    );
    assertStrict.deepEqual(
      order,
      ["first", "second"],
      "执行顺序必须与投递顺序一致（单一串行 admission）",
    );
  } finally {
    await engine.dispose();
    await rm(sandbox, { recursive: true, force: true });
  }
});
