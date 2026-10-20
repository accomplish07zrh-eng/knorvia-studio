// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-02 B14（C2 的落地验证）：执行端口**真的注册上了**，旧协议方法不再 capability 缺席。
//
// 与 `turn-seam.test.mjs` 的分工：
//   - `turn-seam` 验「端口对象本身行为正确」+「未注册时 legacy 仍回 -32031」（反向断言）；
//   - 本文件验「注册之后」：legacy 的路由真的把 4 个方法交给了本包执行器，
//     而 7 个未交付的方法仍回 -32031。
//
// 走公开入口：legacy 的注册面（`registerLegacyExecutionPort` / `currentLegacyExecutionPort`），
// 都是 kernel-bridge-legacy 合同 §四 冻结的包内导出。
import { strict as strictAssert } from "node:assert";
import { join as combinePath } from "node:path";
import { pathToFileURL as moduleUrlFor } from "node:url";
import { repoRoot as projectRoot } from "./entry.mjs";
import { test as caseTest } from "node:test";

/** 包内模块的源码目录。 */
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

/** 造一个可辨认的假执行器：验证「路由真的交给了本包」。 */
function stubExecutor() {
  const seen = [];
  const record = (method, request) => {
    seen.push({ method, sessionId: request.sessionId });
  };
  return {
    seen,
    sendText: async (request) => {
      record("sendText", request);
      return { sessionId: request.sessionId, admitted: "queue", queuePosition: 1 };
    },
    stop: async (request) => {
      record("stop", request);
      return { sessionId: request.sessionId, stopped: true };
    },
    compact: async (request) => {
      record("compact", request);
      return { sessionId: request.sessionId, compacted: true };
    },
    createSession: async (request) => ({ sessionId: request.sessionId }),
  };
}

/** 最小 context：legacy 路由只需要会话登记表与可选 logger。 */
function minimalContext() {
  return { get: () => undefined, on: () => () => {} };
}

/**
 * 注册端口并在断言块结束后自动解绑。
 *
 * @param body - 拿到「已注册的端口」后的断言体。
 * @returns 断言体自身的返回值。
 */
async function withRegisteredPort(body) {
  const { registerTurnExecutionPort } = await loadModule("legacy-port/register.ts");
  const executor = stubExecutor();
  const registered = registerTurnExecutionPort(executor);
  try {
    const legacy = await loadModule("legacy/index.js");
    return await body({ executor, port: legacy.currentLegacyExecutionPort(), legacy });
  } finally {
    registered.release();
  }
}

caseTest("C2 注册后：旧协议 4 个方法经路由落到本包执行器", async () => {
  await withRegisteredPort(async ({ executor, port }) => {
    strictAssert.notEqual(port, undefined, "注册后 currentLegacyExecutionPort() 必须能取到端口");

    const sendOutcome = await port.execute({
      method: "session/send",
      params: { sessionId: "sess_c2", text: "hello" },
    });
    strictAssert.equal(sendOutcome.kind, "result", "session/send 必须返回 result");
    strictAssert.deepEqual(executor.seen.at(-1), { method: "sendText", sessionId: "sess_c2" });

    const stopOutcome = await port.execute({
      method: "session/stop",
      params: { sessionId: "sess_c2" },
    });
    strictAssert.equal(stopOutcome.kind, "result", "session/stop 必须返回 result");
    strictAssert.deepEqual(executor.seen.at(-1), { method: "stop", sessionId: "sess_c2" });

    const compactOutcome = await port.execute({
      method: "session/compact",
      params: { sessionId: "sess_c2" },
    });
    strictAssert.equal(compactOutcome.kind, "result", "session/compact 必须返回 result");
    strictAssert.deepEqual(executor.seen.at(-1), { method: "compact", sessionId: "sess_c2" });

    const cancelOutcome = await port.execute({
      method: "session/cancelBackgroundTask",
      params: { sessionId: "sess_c2" },
    });
    strictAssert.equal(cancelOutcome.kind, "result", "cancelBackgroundTask 必须返回 result");
    strictAssert.deepEqual(executor.seen.at(-1), { method: "stop", sessionId: "sess_c2" });
  });
});

caseTest("C2 注册后：未交付的 7 个方法仍是 -32031（不因注册而变得可用）", async () => {
  const undelivered = [
    "session/fork",
    "session/goal",
    "session/setModel",
    "session/setThoughtLevel",
    "session/setMode",
    "session/resume",
    "session/subscribe",
  ];
  await withRegisteredPort(async ({ executor, port }) => {
    for (const method of undelivered) {
      const outcome = await port.execute({ method, params: { sessionId: "sess_c2" } });
      strictAssert.equal(outcome.kind, "error", `${method} 必须仍是错误`);
      strictAssert.equal(outcome.code, -32031, `${method} 必须仍是 -32031`);
    }
    strictAssert.equal(executor.seen.length, 0, "7 个未交付方法不得触碰执行器");
  });
});

caseTest("C2 解绑后：端口重新变为缺席（-32031 的可逆性）", async () => {
  const { registerTurnExecutionPort } = await loadModule("legacy-port/register.ts");
  const legacy = await loadModule("legacy/index.js");
  const first = registerTurnExecutionPort(stubExecutor());
  first.release();
  strictAssert.equal(
    legacy.currentLegacyExecutionPort(),
    undefined,
    "release() 后必须回到「没有端口」的状态",
  );
  // 再注册一次应当成功（不是「已经注册过」的残留）。
  const again = registerTurnExecutionPort(stubExecutor());
  const presentAgain = legacy.currentLegacyExecutionPort() !== undefined;
  again.release();
  strictAssert.equal(presentAgain, true, "解绑后必须可以重新注册");
});

caseTest("C2 重复注册被拒绝（单一所有者）", async () => {
  const { registerTurnExecutionPort } = await loadModule("legacy-port/register.ts");
  const owner = registerTurnExecutionPort(stubExecutor());
  let rejected = false;
  try {
    registerTurnExecutionPort(stubExecutor());
  } catch (error) {
    rejected = /already registered/u.test(error.message);
  } finally {
    owner.release();
  }
  strictAssert.equal(rejected, true, "第二个端口必须被拒绝（legacy 的单一所有者约束）");
});

caseTest("C2 引擎在 start() 里自动注册端口，dispose() 解绑", async () => {
  const { BridgeEngine } = await loadModule("bridge-engine.ts");
  const legacy = await loadModule("legacy/index.js");
  const engine = new BridgeEngine({ context: minimalContext(), writeFrame() {} });
  strictAssert.equal(legacy.currentLegacyExecutionPort(), undefined, "建档前不应有端口");
  engine.start();
  const presentAfterStart = legacy.currentLegacyExecutionPort() !== undefined;
  await engine.dispose();
  const absentAfterDispose = legacy.currentLegacyExecutionPort() === undefined;
  strictAssert.equal(presentAfterStart, true, "start() 必须把本包执行器注册成 legacy 的端口（C2）");
  strictAssert.equal(absentAfterDispose, true, "dispose() 必须解绑端口（不留悬挂的能力注入）");
});
