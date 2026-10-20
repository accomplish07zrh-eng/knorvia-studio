// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// B17：反向请求应答行的判定，与迟到/无法匹配应答的处置。
//
// 为什么单独一个文件：这条行为在合同阶段没有断言，是实现阶段被「串行链死锁」暴露出来的
// （见 acceptance「首次失败与修正」第 4、5 条）。它测的是**协议边界**：哪一行算「对反向
// 请求的应答」，以及匹配不到的时候必须丢弃而不是报错。断言全部走公开协议入口。
//
// 两个引擎的差异是有意的，分别按各自既有语义断言（不跳过、不放宽）：
//   - 旧运行时由自身 dispatch 直接处理应答行，信封校验严格 → `id:null` 回 -32600
//     `invalid-message`（这是 B1 的既有行为）；新运行时由桥的应答快速路径丢弃它。
//   - 「result 里含 method 键」只在新运行时有意义：旧实现不走这段判定，且它的
//     `sessionRuntimePreferencesResultSchema` 是 strict 的，多一个键会被拒。
//
// 清理纪律同 _protocol.mjs：子进程与临时目录由 app.registerCleanup(t) 统一注册。

import assert from "node:assert/strict";
import test from "node:test";
import { activeEngine } from "./entry.mjs";
import {
  expectResult,
  isError,
  makeTempWorkspace,
  spawnAppServer,
  workspaceRef,
} from "./_protocol.mjs";

const INVALID_REQUEST = -32600;

/** 应答体：result 里故意带一个 `method` 键（只在新运行时用，见文件头）。 */
const REPLY_WITH_METHOD_KEY = {
  nativeSearchEnhancementsEnabled: false,
  memoryEnabled: false,
  askUserQuestionAutoResolutionEnabled: true,
  tool: { method: "bash" },
};

/**
 * B17a：create 会触发一次反向请求并拿到应答后完成；新运行时的应答判定不看子串。
 *
 * 实现阶段的首版缺陷是 `line.includes('"method"')`：`result` 里含 `method` 键的**合法应答**
 * 被判成 request 塞进串行链，于是链上等它的 create 永远等不到结算 → 挂到 15s 超时。
 * 这里用带 `method` 键的应答体重放该形态：判定正确则 create 正常返回。
 */
test("B17a create 触发反向请求并在应答后完成（dsh 下应答可含 method 键）", async (t) => {
  const { home, workspace } = await makeTempWorkspace("kbl-reply-method-");
  const engine = activeEngine();
  const app = await spawnAppServer({
    workspace,
    home,
    engine,
    // 只有新运行时的桥做结构判定；旧实现的 strict schema 不接受额外键。
    ...(engine === "dsh" ? { replyBody: REPLY_WITH_METHOD_KEY } : {}),
  });
  app.registerCleanup(t, [home]);

  const created = await app.request(
    "session/create",
    { workspace: workspaceRef(workspace) },
    { timeoutMs: 30_000 },
  );
  const snapshot = expectResult(created, "session/create");
  assert.equal(typeof snapshot.session.sessionId, "string");

  // 反向请求确实发生过（否则本用例测不到应答判定）。
  assert.ok(
    app.reverseRequests.includes("session/requestRuntimePreferences"),
    `expected a reverse request during create, saw: ${JSON.stringify(app.reverseRequests)}`,
  );
});

/**
 * B17b：顶层带 `method` 的行是 request/notification，不是应答。
 *
 * 正向对照：同一条连接上真正的请求仍必须被正常应答，证明判定没有把请求吃掉；
 * 客户端 notification（有 method 无 id）不得产生任何响应行。
 */
test("B17b 顶层带 method 的行按 request 处理，同连接上请求仍被应答", async (t) => {
  const { home, workspace } = await makeTempWorkspace("kbl-reply-req-");
  const app = await spawnAppServer({ workspace, home, engine: activeEngine() });
  app.registerCleanup(t, [home]);

  const capabilities = await app.request("runtime/capabilities", {});
  const result = expectResult(capabilities, "runtime/capabilities");
  assert.equal(typeof result.independentPlanState, "boolean");

  const before = app.messages.length;
  const idBeforeRequest = app.requestCount();
  app.writeRaw(JSON.stringify({ method: "client/some-notification", params: {} }));

  // 再发一个请求：它被正常应答，说明 notification 没有打断连接状态机。
  const list = await app.request("session/list", { workspace: workspaceRef(workspace) });
  expectResult(list, "session/list");

  // 通知不产生响应行：新增的响应行只能是上面那次 session/list 的应答。
  const responsesAfter = app.messages
    .slice(before)
    .filter((message) => "result" in message || "error" in message);
  assert.deepEqual(
    responsesAfter.map((message) => message.id),
    [`c-${idBeforeRequest + 1}-session-list`],
    "the notification must not produce a response line",
  );
});

/**
 * B17c：匹配不到任何在途反向请求的应答必须被安全处置，不得中断连接。
 *
 * 两个引擎的处置**一致**，也正是 B1 与应答快速路径的合流点：
 *   - `id:null` 不是合法信封（协议 id 只接受 string|number）→ 落回 `handleLine` 的严格校验，
 *     回 -32600 `invalid-message`（B1 的既有行为）。
 *   - 从未发出过的 `server-<n>` 是合法 response 但匹配不到在途请求 → 静默丢弃。
 * 关键断言：无论哪种，连接都必须继续可用，且不产生额外的错误行。
 */
test("B17c 无法匹配的在途应答被安全处置，连接继续可用", async (t) => {
  const { home, workspace } = await makeTempWorkspace("kbl-reply-late-");
  const app = await spawnAppServer({ workspace, home, engine: activeEngine() });
  app.registerCleanup(t, [home]);

  // 正向对照：先证明协议面在工作。
  expectResult(await app.request("runtime/capabilities", {}), "runtime/capabilities");
  const errorsBefore = app.messages.filter((message) => isError(message)).length;

  // id:null 的解析错误回执 + 从未发出过的 server id。
  app.writeRaw(JSON.stringify({ id: null, error: { code: -32700, message: "Parse error" } }));
  app.writeRaw(
    JSON.stringify({
      id: "server-99999",
      result: { ignored: true, method: "looks-like-a-request" },
    }),
  );

  // 等 `id:null` 的拒绝先到（协议面按到达顺序写行，但两行是异步消费的）。
  // 这里用 waitFor 而不是紧跟断言：不等就等于赌竞态，单跑会过、门禁里会偶发红。
  const rejected = await app.waitFor(
    (message) => message.id === "invalid-message" && message.error !== undefined,
    { label: "invalid-message for the null-id envelope" },
  );
  assert.equal(rejected.error.code, INVALID_REQUEST);

  // 这些行之后，协议面仍然可用。
  const list = await app.request("session/list", { workspace: workspaceRef(workspace) });
  expectResult(list, "session/list");

  // 只有 `id:null` 那行被信封校验拒掉（固定伪 id），stray response 静默丢弃。
  const newErrors = app.messages.filter((message) => isError(message)).slice(errorsBefore);
  assert.deepEqual(
    newErrors.map((message) => [message.id, message.error.code]),
    [["invalid-message", INVALID_REQUEST]],
    "null-id envelope is rejected by B1; the stray server response is dropped silently",
  );
});
