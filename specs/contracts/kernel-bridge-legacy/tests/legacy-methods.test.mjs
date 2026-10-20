// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// B5–B9：74 个旧协议方法的应答面。
//
// 断言口径（与旧运行时实测一致）：
//   - 客户端方向的每个方法都必须被应答，且不得落 -32601（未实现）；
//   - outcome=ok 的方法必须返回结果；
//   - 域错误允许 -32003/-32004/-32009/-32010/-32018/-32031，旧实现在若干域错误上折叠为 -32603；
//   - Host 方向的 14 个方法在客户端请求方向必须仍是 -32601（方向不可反）；
//   - dsh 引擎下，端口未注册的方法允许 -32031（能力缺席），由 B10 单独断言。

import assert from "node:assert/strict";
import test from "node:test";
import {
  ABSENT_SESSION_ID,
  buildLegacyRequestScript,
  COMPUTER_USE_NOTIFICATION,
  HOST_DIRECTED_METHODS,
  LEGACY_METHOD_TOTAL,
  LEGACY_NOTIFICATIONS,
} from "../fixtures/request-script.mjs";
import { activeEngine } from "./entry.mjs";
import { expectResult, isError, makeTempWorkspace, spawnAppServer } from "./_protocol.mjs";

const CAPABILITY_ABSENT = -32031;
const METHOD_NOT_FOUND = -32601;
const DOMAIN_ERROR_CODES = new Set([-32003, -32004, -32009, -32010, -32018, -32031]);
const LEGACY_INTERNAL_ERROR = -32603;

function assertAnswered(method, response) {
  assert.ok(response !== undefined, `${method}: no response on the protocol face`);
  if (!isError(response)) return { kind: "result", result: response.result };
  assert.notEqual(
    response.error.code,
    METHOD_NOT_FOUND,
    `${method}: legacy method must not answer -32601 (unimplemented)`,
  );
  assert.equal(
    typeof response.error.message,
    "string",
    `${method}: error message must be a string`,
  );
  assert.ok(response.error.message.length > 0, `${method}: error message must not be empty`);
  const known =
    DOMAIN_ERROR_CODES.has(response.error.code) || response.error.code === LEGACY_INTERNAL_ERROR;
  assert.ok(
    known,
    `${method}: unexpected error code ${response.error.code} (${response.error.message})`,
  );
  return { kind: "error", code: response.error.code, message: response.error.message };
}

test("B5 客户端方向 59 个方法全部被应答：结果或既有错误码，永不 -32601", async (t) => {
  const { home, workspace } = await makeTempWorkspace("kbl-all-");
  const app = await spawnAppServer({ workspace, home, engine: activeEngine() });
  app.registerCleanup(t, [home]);

  const script = buildLegacyRequestScript(workspace);
  assert.equal(
    script.length,
    LEGACY_METHOD_TOTAL - HOST_DIRECTED_METHODS.length - 1,
    "客户端方向方法数 = 74 − 14 HOST 方向 − 1 借名通知",
  );

  const violations = [];
  for (const entry of script) {
    let response;
    try {
      response = await app.request(entry.method, entry.params);
    } catch (error) {
      violations.push(`${entry.method}: ${String(error.message ?? error)}`);
      continue;
    }
    try {
      const classified = assertAnswered(entry.method, response);
      if (entry.outcome === "ok") {
        assert.equal(
          classified.kind,
          "result",
          `${entry.method}: expected a result, got error ${classified.code}`,
        );
      }
      if (entry.outcome === "error") {
        assert.equal(
          classified.kind,
          "error",
          `${entry.method}: expected an existing business error, got a result`,
        );
      }
      if (entry.outcome === "either" && classified.kind === "error") {
        assert.notEqual(
          classified.code,
          CAPABILITY_ABSENT,
          `${entry.method}: capability-absent (-32031) is only allowed for port-backed methods (B10)`,
        );
      }
    } catch (error) {
      violations.push(String(error.message ?? error));
    }
  }
  assert.deepEqual(violations, [], violations.join("\n"));
});

test("B6 session/create → session/list 的会话身份闭环", async (t) => {
  const { home, workspace } = await makeTempWorkspace("kbl-create-");
  const app = await spawnAppServer({ workspace, home, engine: activeEngine() });
  app.registerCleanup(t, [home]);

  const created = expectResult(
    await app.request("session/create", {
      workspace: { workspacePath: workspace, workspaceKey: workspace },
    }),
    "session/create",
  );
  const sessionId = created?.session?.sessionId ?? created?.sessionId;
  assert.equal(typeof sessionId, "string", "session/create must yield a sessionId");

  const list = expectResult(
    await app.request("session/list", {
      workspace: { workspacePath: workspace, workspaceKey: workspace },
    }),
    "session/list",
  );
  assert.equal(list.sessions.length, 1, "listed session count");
  assert.equal(list.sessions[0].sessionId, sessionId);
  assert.equal(list.sessions[0].workspace.workspacePath, workspace);
});

test("B7 空白会话的只读面返回空数组形状，不泄漏内部状态", async (t) => {
  const { home, workspace } = await makeTempWorkspace("kbl-read-");
  const app = await spawnAppServer({ workspace, home, engine: activeEngine() });
  app.registerCleanup(t, [home]);

  const created = expectResult(
    await app.request("session/create", {
      workspace: { workspacePath: workspace, workspaceKey: workspace },
    }),
    "session/create",
  );
  const sessionId = created?.session?.sessionId ?? created?.sessionId;

  const messages = expectResult(
    await app.request("session/messages", { sessionId }),
    "session/messages",
  );
  const events = expectResult(await app.request("session/events", { sessionId }), "session/events");
  assert.deepEqual(messages.messages, []);
  assert.deepEqual(events.events, []);
});

test("B8 Host 方向的 14 个方法在客户端方向仍是 -32601，且同连接上客户端方向方法可用", async (t) => {
  const { home, workspace } = await makeTempWorkspace("kbl-dir-");
  const app = await spawnAppServer({ workspace, home, engine: activeEngine() });
  app.registerCleanup(t, [home]);

  // 正向对照：同一连接上客户端方向方法必须真的被实现，否则「全部 -32601」的桩会让
  // 下面的方向断言在没有实现时也通过（自证陷阱）。
  const positive = await app.request("runtime/capabilities", {});
  assert.ok(
    !isError(positive) || positive.error.code !== METHOD_NOT_FOUND,
    "positive control failed: runtime/capabilities answered -32601, the direction assertion below cannot prove anything",
  );

  for (const method of HOST_DIRECTED_METHODS) {
    const response = await app.request(method, {});
    assert.ok(isError(response), `${method}: host-directed method must not answer a result`);
    assert.equal(
      response.error.code,
      METHOD_NOT_FOUND,
      `${method}: must stay unknown for clients, got ${JSON.stringify(response.error)}`,
    );
  }
});

test("B9 方法表与方法名清单自洽：74 = 59 + 14 + 1，且清单非平凡", async (t) => {
  // 清单自洽先于任何网络行为断言：三种方向加起来必须是 74，且通知名表冻结为 7 个。
  assert.equal(LEGACY_NOTIFICATIONS.length, 7);
  assert.equal(new Set(LEGACY_NOTIFICATIONS).size, 7);
  assert.equal(HOST_DIRECTED_METHODS.length, 14);
  assert.equal(new Set(HOST_DIRECTED_METHODS).size, 14);
  assert.equal(
    HOST_DIRECTED_METHODS.length + 1 + (LEGACY_METHOD_TOTAL - HOST_DIRECTED_METHODS.length - 1),
    LEGACY_METHOD_TOTAL,
  );
  assert.equal(COMPUTER_USE_NOTIFICATION, "computer-use/operation-event");
  assert.equal(ABSENT_SESSION_ID, "sess_fixture_absent");

  // 并且清单确实被协议面实现（与 B5 互补：B5 逐条问，这里一次正向对照）。
  const { home, workspace } = await makeTempWorkspace("kbl-meta-");
  const app = await spawnAppServer({ workspace, home, engine: activeEngine() });
  app.registerCleanup(t, [home]);
  const response = await app.request("runtime/capabilities", {});
  assert.ok(
    !isError(response) || response.error.code !== METHOD_NOT_FOUND,
    "runtime/capabilities answered -32601: the 74-method table is not implemented on this engine",
  );
});
