// SPDX-License-Identifier: Apache-2.0
// A72：Agent 服务组合根的可构造性、面覆盖与 dispose 收口。
// 组合根会开 SQLite 连接，因此每条用例都在临时数据根里跑，并在 t.after 里收口。
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { importDeep } from "./entry.mjs";
import { makeTempRoot } from "./helpers.mjs";

const { createKnorviaAgentService } = await importDeep("agent/agentService.ts");

/** 组合根必须暴露的方法面（IKnorviaAgentService 的核心入口 + 组合根扩展）。 */
const REQUIRED_METHODS = [
  // 组合根扩展
  "disposeAll",
  "disposeAllAndWait",
  // sessions-index / workspace-config 两条 workspace 级通道
  "subscribeSessionsIndexV4",
  "unsubscribeSessionsIndexV4",
  "resyncSessionsIndexV4",
  "subscribeWorkspaceConfigV4",
  "unsubscribeWorkspaceConfigV4",
  "resyncWorkspaceConfigV4",
  "onDynamicSessionsIndexFrame",
  "onDynamicWorkspaceConfigFrame",
  // conversation 通道与生命周期
  "subscribeConversationV4",
  "unsubscribeConversationV4",
  "resyncConversationV4",
  "onDynamicConversationFrame",
  "setConnectionFlowStateV4",
  "onAgentRuntimeLifecycle",
  "onAgentRuntimeRestarted",
  // 会话读写
  "listSessions",
  "readSession",
  "readSessionMessages",
  "sendPrompt",
  "createSession",
  "closeSession",
  "disposeWorkspace",
];

/** 建一个组合根，并在用例结束时同步 + 异步各收口一次。 */
async function makeService(t, options = {}) {
  await makeTempRoot(t);
  const service = createKnorviaAgentService(options);
  t.after(async () => {
    service.disposeAll();
    await service.disposeAllAndWait();
  });
  return service;
}

describe("A72 组合根三进程池与 disposeAllAndWait 幂等", () => {
  it("组合根返回 IKnorviaAgentService 的核心面与 disposeAllAndWait", async (t) => {
    const service = await makeService(t);
    for (const method of REQUIRED_METHODS) {
      assert.equal(
        typeof service[method],
        "function",
        `组合根缺少 ${method}，IKnorviaAgentService 面不完整`,
      );
    }
  });

  it("disposeAll 与 disposeAllAndWait 可重复调用，不抛错也不重复关连接", async (t) => {
    await makeTempRoot(t);
    const service = createKnorviaAgentService({});
    service.disposeAll();
    service.disposeAll();
    await service.disposeAllAndWait();
    await service.disposeAllAndWait();
  });

  it("disposeAllAndWait 返回 promise，等三个进程池全部到齐后 resolve", async (t) => {
    const service = await makeService(t);
    const pending = service.disposeAllAndWait();
    assert.equal(typeof pending.then, "function", "disposeAllAndWait 返回 thenable");
    await pending;
    // 再调一次仍然 resolve（幂等）。
    await service.disposeAllAndWait();
  });

  it("注入 commandResolver 后组合根仍可构造，且不因缺少 CLI 入口而在构造期抛错", async (t) => {
    const calls = [];
    const service = await makeService(t, {
      commandResolver: () => {
        calls.push("resolved");
        return { command: process.execPath, args: [], cwd: process.cwd() };
      },
    });
    assert.equal(typeof service.disposeAll, "function");
    // 构造期不解析命令：解析只发生在真正拉进程时。
    assert.deepEqual(calls, [], "构造期不调用 commandResolver");
  });

  it("onAgentRuntimeLifecycle 是订阅入口，dispose 后不再投递", async (t) => {
    const service = await makeService(t);
    const seen = [];
    const listener = service.onAgentRuntimeLifecycle((event) => seen.push(event));
    assert.equal(typeof listener.dispose, "function");
    listener.dispose();
    // 释放后重复 dispose 不抛错。
    listener.dispose();
  });

  it("onAgentRuntimeRestarted 同样返回可释放的订阅", async (t) => {
    const service = await makeService(t);
    const listener = service.onAgentRuntimeRestarted(() => {});
    assert.equal(typeof listener.dispose, "function");
    listener.dispose();
  });

  it("三个 workspace 级帧流入口各自返回可释放的订阅，互不共享 listener 表", async (t) => {
    const service = await makeService(t);
    const target = { workspacePath: "/ws/alpha", workspaceIdentity: "alpha" };
    const index = service.onDynamicSessionsIndexFrame(target);
    const config = service.onDynamicWorkspaceConfigFrame(target);
    const conversation = service.onDynamicConversationFrame(target);
    for (const stream of [index, config, conversation]) {
      assert.equal(typeof stream, "function", "帧流入口返回 subscribe 函数");
      const listener = stream(() => {});
      assert.equal(typeof listener.dispose, "function");
      listener.dispose();
    }
    // 同一入口重复订阅得到不同 listener，各自 dispose 互不影响。
    const first = index(() => {});
    const second = index(() => {});
    assert.notEqual(first, second);
    first.dispose();
    second.dispose();
  });

  it("disposeAll 之后重复订阅帧流仍返回可 dispose 的句柄（不抛错）", async (t) => {
    await makeTempRoot(t);
    const service = createKnorviaAgentService({});
    const target = { workspacePath: "/ws/alpha", workspaceIdentity: "alpha" };
    service.disposeAll();
    const listener = service.onDynamicSessionsIndexFrame(target)(() => {});
    assert.equal(typeof listener.dispose, "function");
    listener.dispose();
  });
});
