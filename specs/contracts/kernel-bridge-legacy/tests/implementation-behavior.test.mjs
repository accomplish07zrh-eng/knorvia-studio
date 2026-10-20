// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// B10–B15：实现阶段的能力缺席语义、反向请求、interaction 六方法、通知形状与触发点。
//
// 这批断言在合同阶段标着「（实现阶段）」，实现阶段补齐并转绿（Lead 2026-10-20 要求）。
// 全部走公开协议入口（spawn app-server，只读写 NDJSON），不 import 桥内部模块。
//
// 清理纪律同 _protocol.mjs：子进程与临时目录由 app.registerCleanup(t) 统一注册。

import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPUTER_USE_NOTIFICATION,
  HOST_DIRECTED_METHODS,
  LEGACY_NOTIFICATIONS,
} from "../fixtures/request-script.mjs";
import { activeEngine } from "./entry.mjs";
import {
  expectResult,
  isError,
  makeTempWorkspace,
  spawnAppServer,
  workspaceRef,
} from "./_protocol.mjs";

const CAPABILITY_ABSENT = -32031;
const METHOD_NOT_FOUND = -32601;

/** 既有 fault 词表（不得新增 reasonCode，B10）。 */
const CAPABILITY_UNSUPPORTED_FAULT = "fault.command.capabilityUnsupported";

/** 端口未注册时应回 capability 缺席的 12 个回合类方法。 */
const PORT_BACKED = [
  "session/resume",
  "session/subscribe",
  "session/send",
  "session/stop",
  "session/cancelBackgroundTask",
  "session/fork",
  "session/compact",
  "session/goal",
  "session/setModel",
  "session/setThoughtLevel",
  "session/setMode",
  "session/close",
];

/** 12 个端口方法的 schema 合法最小参数（sessionId 用刚创建的活会话）。 */
function portParams(sessionId) {
  const sel = { providerId: "fixture-provider", modelId: "fixture-model" };
  return {
    "session/resume": { sessionId },
    "session/subscribe": { sessionId, deliveryKind: "desktop-continuous" },
    "session/send": { sessionId, content: "fixture" },
    "session/stop": { sessionId },
    "session/cancelBackgroundTask": { sessionId, taskId: "task_fixture" },
    "session/fork": { sessionId },
    "session/compact": { sessionId },
    "session/goal": { sessionId, action: "show" },
    "session/setModel": { sessionId, model: sel },
    "session/setThoughtLevel": { sessionId, thoughtLevel: "high" },
    "session/setMode": { sessionId, mode: "build" },
    "session/close": { sessionId },
  };
}

/**
 * B10：执行端口未注册时，12 个回合类方法必须回 -32031 + 既有 fault 词表。
 *
 * 断言四条，缺一不可：① 码是 -32031；② `data.reasonCode` 是既有词表，不是新造的；
 * ③ 不是 `accepted`/空白结果（不得伪造成功）；④ 消息非空且不透出 DSH 字样。
 *
 * 只在新运行时上断言：旧运行时这批方法由真实运行时承担，不存在「端口未注册」这个状态。
 */
test("B10 端口未注册时回合方法回 -32031 + 既有 capability 词表，不伪造成功", async (t) => {
  const { home, workspace } = await makeTempWorkspace("kbl-port-");
  const app = await spawnAppServer({ workspace, home, engine: activeEngine() });
  app.registerCleanup(t, [home]);

  // 用活会话：先把「会话不存在 → -32004」这条分支排除掉，才测得到端口语义。
  const created = expectResult(
    await app.request("session/create", { workspace: workspaceRef(workspace) }),
    "session/create",
  );
  const sessionId = created.session.sessionId;
  const params = portParams(sessionId);
  const engine = activeEngine();

  for (const method of PORT_BACKED) {
    const response = await app.request(method, params[method]);
    if (engine === "legacy") {
      // 旧运行时没有「执行端口」这一层：这 12 个方法由真实运行时承担，
      // 因此**绝不得**回 capability 缺席（否则等于把已实现的能力报成缺失）。
      // 这条断言同时守住方法表：若 PORT_BACKED 误收了非端口方法，这里会红。
      assert.ok(
        !isError(response) || response.error.code !== CAPABILITY_ABSENT,
        `${method}: the legacy engine implements this method; -32031 means the port table is wrong`,
      );
      continue;
    }

    // 新运行时：端口未注册 → -32031 + 既有 fault 词表，且不得伪造成功。
    assert.ok(isError(response), `${method}: port-backed method must not return a result`);
    assert.equal(
      response.error.code,
      CAPABILITY_ABSENT,
      `${method}: expected capability-absent -32031, got ${JSON.stringify(response.error)}`,
    );
    assert.equal(
      response.error.data?.reasonCode,
      CAPABILITY_UNSUPPORTED_FAULT,
      `${method}: must reuse the existing fault vocabulary, got ${JSON.stringify(response.error.data)}`,
    );
    assert.equal(
      typeof response.error.message === "string" && response.error.message.length > 0,
      true,
      `${method}: error message must be non-empty`,
    );
    assert.doesNotMatch(
      response.error.message,
      /deepseek|dsh/iu,
      `${method}: user-visible message must not leak DSH branding`,
    );
  }
});

/**
 * B11：`session/create` 发起一次 `session/requestRuntimePreferences` 反向请求，
 * scope 为 `runtime-materialization`，Host 应答后 create 正常完成。
 */
test("B11 create 发起 runtime-materialization 反向请求并在应答后完成", async (t) => {
  const { home, workspace } = await makeTempWorkspace("kbl-prefs-");
  const app = await spawnAppServer({ workspace, home, engine: activeEngine() });
  app.registerCleanup(t, [home]);

  const created = await app.request(
    "session/create",
    { workspace: workspaceRef(workspace) },
    { timeoutMs: 30_000 },
  );
  const snapshot = expectResult(created, "session/create");
  assert.equal(typeof snapshot.session.sessionId, "string");

  // 反向请求必须真的发出过（否则本断言在无反向通道的实现上也会过）。
  assert.ok(
    app.reverseRequests.includes("session/requestRuntimePreferences"),
    `expected session/requestRuntimePreferences, saw ${JSON.stringify(app.reverseRequests)}`,
  );
  // 且 scope 是物化档（B11 冻结的取值之一）。
  assert.ok(
    app.reverseScopes.includes("runtime-materialization"),
    `expected scope runtime-materialization, saw ${JSON.stringify(app.reverseScopes)}`,
  );
});

/**
 * B12：`interaction/*` 六个方法在客户端方向仍是 -32601（方向不可反），
 * 且同连接上客户端方向方法可用（正向对照，防「空实现也通过」）。
 */
test("B12 interaction 六方法方向不可反，同连接上客户端方法可用", async (t) => {
  const { home, workspace } = await makeTempWorkspace("kbl-interaction-");
  const app = await spawnAppServer({ workspace, home, engine: activeEngine() });
  app.registerCleanup(t, [home]);

  // 正向对照：协议面真的在应答。
  expectResult(await app.request("runtime/capabilities", {}), "runtime/capabilities");

  const interactionMethods = HOST_DIRECTED_METHODS.filter((method) =>
    method.startsWith("interaction/"),
  );
  assert.equal(interactionMethods.length, 6, "interaction/* must be exactly 6 methods");
  for (const method of interactionMethods) {
    const response = await app.request(method, {});
    assert.ok(isError(response), `${method}: must not return a result on the client face`);
    assert.equal(
      response.error.code,
      METHOD_NOT_FOUND,
      `${method}: host-directed method must stay -32601, got ${JSON.stringify(response.error)}`,
    );
  }
});

/**
 * B13：`plugins/operationProgress` 通知形状为 `{ operationId, state }`，
 * 且在对应请求处理期间发出（不可合并、不可跳序）。
 *
 * 两引擎分开断言，都不断言别人的实现：
 *   - dsh：触发点由本包在 `plugins/list` 里新增 → 必须真的发出 running→done。
 *   - 旧运行时：目录刷新走它自己的协议栈，不经过本包发射器 → 只断言一个**更弱但真实**
 *     的不变量：它还发出来的话，形状必须符合共享 schema（不得出现新 state）。
 */
test("B13 plugins/operationProgress 通知形状与触发点", async (t) => {
  const { home, workspace } = await makeTempWorkspace("kbl-progress-");
  const app = await spawnAppServer({ workspace, home, engine: activeEngine() });
  app.registerCleanup(t, [home]);

  // plugins/list 是目录类长操作：处理期间应发 running，完成后应发 done。
  const listed = await app.request("plugins/list", { workspace: workspaceRef(workspace) });
  expectResult(listed, "plugins/list");

  const progress = app.messages.filter((message) => message.method === "plugins/operationProgress");

  if (activeEngine() === "legacy") {
    // 旧运行时：不强求条数（那不是本包的行为），但发出来的必须合规。
    for (const notification of progress) {
      assert.equal(typeof notification.params.operationId, "string");
      assert.ok(
        ["queued", "running", "refreshing", "done", "failed"].includes(notification.params.state),
        `unexpected state ${JSON.stringify(notification.params.state)}`,
      );
    }
    return;
  }

  assert.ok(progress.length >= 2, `expected at least running+done, got ${progress.length}`);
  for (const notification of progress) {
    const params = notification.params;
    assert.equal(typeof params.operationId, "string");
    assert.ok(params.operationId.length > 0, "operationId must be non-empty");
    assert.ok(
      ["queued", "running", "refreshing", "done", "failed"].includes(params.state),
      `unexpected state ${JSON.stringify(params.state)}`,
    );
  }
  // 顺序：running 必须早于 done（不可跳序）。
  const states = progress.map((notification) => notification.params.state);
  assert.ok(
    states.indexOf("running") < states.indexOf("done"),
    `unexpected order ${JSON.stringify(states)}`,
  );
});

/**
 * B14：7 个服务端通知名冻结，且**本包拥有的触发点真的会发**。
 *
 * 分工（写进 known-differences D8）：
 *   - 本包触发：`plugins/operationProgress`（B13 的插件目录刷新起止）；
 *   - 按 D1 缺席：`startup/storageState`（DSH 不写旧 sqlite，不伪造迁移进度）；
 *   - 归后续包：`process/{mcpTelemetry,mcpResourceSamples,toolExecResource,resourceSample}`
 *     （依赖 MCP 进程与资源采样器，归 kernel-dsh-builtins / kernel-plugin-*）；
 *     `interaction/providerRuntimeHeadersCancelled` 的触发点在运行时 headers 请求方，
 *     本包提供 `onCancelled` 钩子与发射器（见 host-request-book）。
 *
 * 断言分两半：① 名字表冻结 7 个唯一名（纯静态，两引擎都成立）；
 * ② **本包触发点确有其名**（对 stdout 观测，防「名字在但永不发」）。
 * 旧运行时不经过本包的 B13 发射点（目录刷新走它自己的协议栈），故第 ② 半只在 dsh 断言。
 */
test("B14 通知名冻结 7 个，本包触发点确有发出", async (t) => {
  // ① 名字表自洽：7 个唯一名（纯静态，不依赖引擎）。
  assert.equal(LEGACY_NOTIFICATIONS.length, 7);
  assert.equal(new Set(LEGACY_NOTIFICATIONS).size, 7);

  const { home, workspace } = await makeTempWorkspace("kbl-notify-");
  const app = await spawnAppServer({ workspace, home, engine: activeEngine() });
  app.registerCleanup(t, [home]);

  expectResult(await app.request("runtime/capabilities", {}), "runtime/capabilities");
  expectResult(
    await app.request("plugins/list", { workspace: workspaceRef(workspace) }),
    "plugins/list",
  );

  const emitted = new Set(
    app.messages
      .filter((message) => message.method !== undefined && message.id === undefined)
      .map((message) => message.method),
  );
  // 无论哪个引擎，发出的通知名都必须是冻结表中的名字（不得新造）。
  for (const method of emitted) {
    assert.ok(
      LEGACY_NOTIFICATIONS.includes(method),
      `emitted notification ${method} is not in the frozen 7-name table: ${JSON.stringify([...emitted])}`,
    );
  }

  if (activeEngine() === "dsh") {
    // ② 本包触发点：dsh 下 plugins/list 是长操作，处理期间必须有进度通知。
    assert.ok(
      emitted.has("plugins/operationProgress"),
      `plugins/operationProgress must actually be emitted on dsh, saw ${JSON.stringify([...emitted])}`,
    );
    // D1：dsh 不得伪造存储迁移进度。
    assert.equal(
      emitted.has("startup/storageState"),
      false,
      "D1: dsh engine must not fabricate storage migration progress",
    );
  }
});

/**
 * B15：`computer-use/operation-event` 是借方法名的 CLI→Host 通知，
 * 客户端方向必须 -32601（不是请求）。
 */
test("B15 computer-use/operation-event 在客户端方向是 -32601", async (t) => {
  const { home, workspace } = await makeTempWorkspace("kbl-cua-");
  const app = await spawnAppServer({ workspace, home, engine: activeEngine() });
  app.registerCleanup(t, [home]);

  expectResult(await app.request("runtime/capabilities", {}), "runtime/capabilities");

  const response = await app.request(COMPUTER_USE_NOTIFICATION, {});
  assert.ok(isError(response), "computer-use/operation-event must not return a result");
  assert.equal(
    response.error.code,
    METHOD_NOT_FOUND,
    `expected -32601 for the borrowed notification name, got ${JSON.stringify(response.error)}`,
  );
});
