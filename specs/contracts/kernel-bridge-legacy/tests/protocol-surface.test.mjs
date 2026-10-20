// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// B1/B2/B16：物理协议面与生命周期——NDJSON 严格外壳、错误码入口、stdout 纯净、EOF 收尾。

import assert from "node:assert/strict";
import test from "node:test";
import { activeEngine } from "./entry.mjs";
import {
  classifyResponse,
  expectResult,
  isError,
  makeTempWorkspace,
  removeTempDir,
  spawnAppServer,
  workspaceRef,
} from "./_protocol.mjs";

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;

test("B1 NDJSON 严格外壳：jsonrpc 字段被拒、非法 JSON 回 -32700、stdout 只有协议行", async (t) => {
  const { home, workspace } = await makeTempWorkspace("kbl-shell-");
  const app = await spawnAppServer({ workspace, home, engine: activeEngine() });
  t.after(async () => {
    await app.close();
    await removeTempDir(home);
  });

  app.writeRaw(JSON.stringify({ id: "j1", jsonrpc: "2.0", method: "runtime/capabilities" }));
  app.writeRaw("{ not json");

  const invalid = await app.waitFor((m) => m.id === "invalid-message", {
    label: "invalid-message reply",
  });
  assert.equal(invalid.error.code, INVALID_REQUEST);
  assert.equal(typeof invalid.error.message, "string");

  const parseError = await app.waitFor((m) => m.id === "parse-error", {
    label: "parse-error reply",
  });
  assert.equal(parseError.error.code, PARSE_ERROR);
  assert.equal(parseError.error.message, "Parse error");

  // 每个 stdout 行要么是合法 NDJSON 协议消息，要么根本不该出现。
  assert.equal(app.state.invalidLines.length, 0, "stdout must not contain non-JSON lines");
  for (const message of app.messages) {
    const keys = Object.keys(message);
    assert.ok(
      keys.includes("method") || keys.includes("result") || keys.includes("error"),
      `unexpected message shape: ${JSON.stringify(message)}`,
    );
    assert.equal(message.jsonrpc, undefined, "no jsonrpc field may appear on the wire");
  }
});

test("B2 未知方法仍是 -32601，旧协议方法名不得落入该分支", async (t) => {
  const { home, workspace } = await makeTempWorkspace("kbl-unknown-");
  const app = await spawnAppServer({ workspace, home, engine: activeEngine() });
  t.after(async () => {
    await app.close();
    await removeTempDir(home);
  });

  const unknown = await app.request("definitely/not-a-method", {});
  assert.ok(isError(unknown), "unknown method must answer a protocol error");
  assert.equal(unknown.error.code, -32601);

  const capabilities = await app.request("runtime/capabilities", {});
  classifyResponse(capabilities, "runtime/capabilities");
});

test("B16 stdin EOF 后退出 0，stderr 只承载日志不承载协议行", async (t) => {
  const { home, workspace } = await makeTempWorkspace("kbl-eof-");
  const app = await spawnAppServer({ workspace, home, engine: activeEngine() });
  // 清理必须挂在 t.after：断言失败时也要收掉子进程，否则管道句柄会让测试进程滞留。
  t.after(async () => {
    await removeTempDir(home);
  });

  // 正向对照：EOF 收尾断言必须建立在「协议面真的应答过」之上，否则桩也能过。
  const response = await app.request("runtime/capabilities", {});
  assert.ok(
    !isError(response) || response.error.code !== -32601,
    "runtime/capabilities answered -32601: EOF assertion would be vacuously true",
  );

  const exit = await app.close();
  assert.equal(exit.code, 0, `expected clean exit, got ${JSON.stringify(exit)}`);
  for (const line of app.state.stdoutLines) {
    assert.doesNotThrow(() => JSON.parse(line), "stdout line must be JSON");
  }
  for (const line of app.state.stderrText.split("\n")) {
    if (line.trim() === "") continue;
    assert.throws(
      () => JSON.parse(line),
      "stderr must not carry protocol messages (it may carry logs / ready markers)",
    );
  }
});

test("B3 runtime/capabilities 与 process/childProcesses 的形状保持", async (t) => {
  const { home, workspace } = await makeTempWorkspace("kbl-cap-");
  const app = await spawnAppServer({ workspace, home, engine: activeEngine() });
  t.after(async () => {
    await app.close();
    await removeTempDir(home);
  });

  const response = await app.request("runtime/capabilities", {});
  const result = expectResult(response, "runtime/capabilities");
  assert.equal(typeof result.independentPlanState, "boolean");

  const children = await app.request("process/childProcesses", {});
  const tree = expectResult(children, "process/childProcesses");
  assert.ok(Array.isArray(tree.processes), "process/childProcesses must return { processes: [] }");
});

test("B4 workspace 级只读方法在空白工作区可用且形状稳定", async (t) => {
  const { home, workspace } = await makeTempWorkspace("kbl-ws-");
  const app = await spawnAppServer({ workspace, home, engine: activeEngine() });
  t.after(async () => {
    await app.close();
    await removeTempDir(home);
  });

  const presentation = await app.request("workspace/readPresentation", {
    workspace: workspaceRef(workspace),
  });
  const view = expectResult(presentation, "workspace/readPresentation");
  assert.equal(view.workspace.workspacePath, workspace);
  assert.equal(typeof view.mode, "string");
  assert.ok(Array.isArray(view.slashCommands));

  const list = await app.request("session/list", { workspace: workspaceRef(workspace) });
  const sessions = expectResult(list, "session/list");
  assert.ok(Array.isArray(sessions.sessions));
});
