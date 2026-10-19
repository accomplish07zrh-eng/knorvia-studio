// SPDX-License-Identifier: Apache-2.0
// S20/S21/S22/S23/S24/S25/S26：跨窗口广播的 descriptor 面、send 线格式与校验顺序、
// 入站投递与过滤（去重/防回环边界）、进程内 claim 的 reservation/commit/release 与有界保留、
// 经 parentPort 的 claim 请求协议、无响应预算与迟到 token 的补偿释放。
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { importDeep, services, servicesNode } from "./entry.mjs";

const { createBroadcastService } = servicesNode;

/** 假的 host parentPort：记录上行线消息，并可主动注入下行消息。 */
function makeFakePort() {
  const posted = [];
  const listeners = [];
  return {
    posted,
    listeners,
    throwOnPost: false,
    on(event, listener) {
      assert.equal(event, "message");
      listeners.push(listener);
    },
    postMessage(message) {
      // 先记账再抛错：让「写不出去」的分支也能被断言核对。
      posted.push(message);
      if (this.throwOnPost) throw new Error("port is closing");
      if (this.replyTo && message.type === "broadcast-claim-request") {
        this.emit(this.replyTo(message));
      }
    },
    emit(data) {
      for (const listener of [...listeners]) listener({ data });
    },
  };
}

describe("S20 广播 descriptor 与服务面（broadcast/broadcast.ts）", () => {
  it("descriptor 冻结 broadcast 频道；无 parentPort 的实例提供六个方法与本地 claim 表", async () => {
    const deep = await importDeep("broadcast/broadcast.ts");
    assert.equal(deep.IBroadcastService, services.IBroadcastService);
    assert.deepEqual(Object.keys(deep.IBroadcastService), ["channelName"]);
    // 频道名是兼容面上的冻结线值（packages/shared/src/channels.ts:84）。
    assert.equal(deep.IBroadcastService.channelName, "broadcast");
    assert.notEqual(deep.IBroadcastService.channelName, services.ICredentialService.channelName);

    const service = createBroadcastService(null);
    assert.deepEqual(Object.keys(service).sort(), [
      "acquireClaim",
      "commitClaim",
      "onMessage",
      "releaseClaim",
      "send",
      "tryClaim",
    ]);

    const delivered = [];
    service.onMessage((message) => delivered.push(message));
    const claim = await service.acquireClaim("  s20-key  ");
    assert.equal(claim.status, "acquired");
    assert.equal(claim.lease.key, "s20-key");
    assert.equal(typeof claim.lease.token, "string");
    assert.equal(await service.tryClaim("s20-key"), false);
    await service.releaseClaim(claim.lease);
    assert.equal(await service.tryClaim("s20-key"), true);

    assert.deepEqual(delivered, []);
    await service.send({ channel: "state:theme", payload: "dark" });
    assert.deepEqual(delivered, [{ channel: "state:theme", payload: "dark" }]);
  });
});

describe("S21 send 上行（broadcast/broadcastService.ts）", () => {
  it("先校验后产生副作用：channel 归一化、未知字段剥离、本地回声与上行共用同一对象", async () => {
    const port = makeFakePort();
    const service = createBroadcastService(port);
    const delivered = [];
    service.onMessage((message) => delivered.push(message));

    await assert.rejects(() => service.send({ channel: "   ", payload: 1 }));
    await assert.rejects(() => service.send({ channel: "ok", payload: 1, sourceWindowId: 1.5 }));
    await assert.rejects(() => service.send({ payload: 1 }));
    // schema 失败既不本地回声也不上行。
    assert.deepEqual(port.posted, []);
    assert.deepEqual(delivered, []);

    const payload = { theme: "dark" };
    await service.send({
      channel: "  state:theme  ",
      payload,
      sourceWindowId: 3,
      notInSchema: "drop-me",
    });
    assert.deepEqual(port.posted, [
      { type: "broadcast", message: { channel: "state:theme", payload, sourceWindowId: 3 } },
    ]);
    assert.equal(delivered.length, 1);
    // 消费端看到的本地回声与 main 收到的是同一个已校验对象。
    assert.equal(delivered[0], port.posted[0].message);
    assert.equal("notInSchema" in delivered[0], false);
    assert.equal(delivered[0].channel, "state:theme");
  });

  it("本地回声早于上行 post（重入顺序），且没有 parentPort 时只回声不抛错", async () => {
    const port = makeFakePort();
    const service = createBroadcastService(port);
    const order = [];
    service.onMessage((message) => {
      order.push(message.channel);
      if (message.channel === "outer") void service.send({ channel: "inner", payload: 2 });
    });
    await service.send({ channel: "outer", payload: 1 });
    assert.deepEqual(order, ["outer", "inner"]);
    // 内层广播的上行线消息先记录，证明 send 是「先 fire 再 postMessage」。
    assert.deepEqual(
      port.posted.map((wire) => wire.message.channel),
      ["inner", "outer"],
    );

    const localOnly = createBroadcastService(null);
    const localSeen = [];
    localOnly.onMessage((message) => localSeen.push(message.channel));
    await localOnly.send({ channel: "local", payload: 1 });
    assert.deepEqual(localSeen, ["local"]);

    // 上行失败不像 claim 控制消息那样被吞：send 会把错误交给调用方，但回声已经发生。
    const brokenPort = makeFakePort();
    brokenPort.throwOnPost = true;
    const brokenService = createBroadcastService(brokenPort);
    const brokenSeen = [];
    brokenService.onMessage((message) => brokenSeen.push(message.channel));
    await assert.rejects(
      () => brokenService.send({ channel: "c", payload: 1 }),
      /port is closing/u,
    );
    assert.deepEqual(brokenSeen, ["c"]);
  });
});

describe("S22 入站投递与过滤（broadcast/broadcastService.ts）", () => {
  it("只有合法 broadcast envelope 才投递；不做 sourceWindowId 过滤、不做去重，越界字段被剥离", async () => {
    const port = makeFakePort();
    const service = createBroadcastService(port);
    const delivered = [];
    const second = [];
    service.onMessage((message) => delivered.push(message));
    const disposable = service.onMessage((message) => second.push(message));
    assert.equal(port.listeners.length, 1, "多个订阅者共用一个 parentPort 监听");

    port.emit({
      type: "broadcast",
      message: { channel: "state:locale", payload: "en-US", sourceWindowId: 7, junk: "strip" },
    });
    assert.deepEqual(delivered, [{ channel: "state:locale", payload: "en-US", sourceWindowId: 7 }]);
    assert.deepEqual(second, delivered);
    // 连 sourceWindowId 与自身相同的消息也照投：排除发送源是 BroadcastHub 的边界，去重是消费端责任。
    port.emit({
      type: "broadcast",
      message: { channel: "state:locale", payload: "en-US", sourceWindowId: 7 },
    });
    assert.equal(delivered.length, 2);

    for (const junk of [
      undefined,
      null,
      "broadcast",
      { type: "broadcast" },
      { type: "broadcast", message: { channel: "   ", payload: 1 } },
      { type: "broadcast", message: { channel: "ok", payload: 1, sourceWindowId: 2.5 } },
      { type: "other", message: { channel: "ok", payload: 1 } },
      { type: "broadcast-claim-request", requestId: "r", key: "k" },
      { type: "broadcast-claim-result", requestId: "unknown", status: "acquired", claimToken: "t" },
    ]) {
      port.emit(junk);
    }
    assert.equal(delivered.length, 2, "非法或无关线消息既不投递也不抛错");

    disposable.dispose();
    port.emit({ type: "broadcast", message: { channel: "after-dispose", payload: 1 } });
    assert.equal(delivered.length, 3);
    assert.equal(second.length, 2);
  });
});

describe("S23 本地 claim 的 token 语义（broadcast/broadcastService.ts）", () => {
  it("错误 token 撬不动别人的 reservation；commit 后 release 是 no-op 并进入 committed 终态", async () => {
    const service = createBroadcastService(null);
    const first = await service.acquireClaim("token-key");
    assert.equal(first.status, "acquired");

    const busy = await service.acquireClaim("token-key");
    assert.equal(busy.status, "busy");
    assert.ok(Number.isInteger(busy.retryAfterMs) && busy.retryAfterMs >= 0);
    const laterBusy = await service.acquireClaim("token-key");
    assert.equal(laterBusy.status, "busy");
    // 重试提示随剩余 reservation 时间收敛，不会越等越长。
    assert.ok(laterBusy.retryAfterMs <= busy.retryAfterMs);

    await service.releaseClaim({ key: "token-key", token: `${first.lease.token}-oops` });
    assert.equal((await service.acquireClaim("token-key")).status, "busy");
    await service.releaseClaim({ key: "other-key", token: first.lease.token });
    assert.equal((await service.acquireClaim("token-key")).status, "busy");

    await service.commitClaim(first.lease);
    await service.releaseClaim(first.lease);
    assert.deepEqual(await service.acquireClaim("token-key"), { status: "committed" });
    assert.equal(await service.tryClaim("token-key"), false);
    // committed 是终态：重复 commit 也不会把它降级回 reservation。
    await service.commitClaim(first.lease);
    assert.deepEqual(await service.acquireClaim("token-key"), { status: "committed" });
  });

  it("release 用正确 token 才归还名额；空 key 与自身 reservation 之外的操作不产生占用", async () => {
    const service = createBroadcastService(null);
    assert.deepEqual(await service.acquireClaim("   "), { status: "unavailable" });
    assert.deepEqual(await service.acquireClaim(""), { status: "unavailable" });

    const lease = await service.acquireClaim("  reusable  ");
    assert.equal(lease.status, "acquired");
    await service.releaseClaim(lease.lease);
    const again = await service.acquireClaim("reusable");
    assert.equal(again.status, "acquired");
    assert.notEqual(again.lease.token, lease.lease.token);
    await service.releaseClaim(again.lease);
    assert.equal(await service.tryClaim("reusable"), true);
    // 并发 tryClaim 只有一个赢家。
    const winners = await Promise.all([
      service.tryClaim("race-key"),
      service.tryClaim("race-key"),
      service.tryClaim("race-key"),
    ]);
    assert.deepEqual(winners.filter((value) => value).length, 1);
    assert.deepEqual(await service.acquireClaim("race-key"), { status: "committed" });
  });
});

describe("S24 本地 claim 表的有界保留（broadcast/broadcastService.ts）", () => {
  it("claim 表按最早占用挤出：新键仍可判定为已占用，被挤出的旧键可重新占用", async () => {
    const service = createBroadcastService(null);
    const keys = Array.from({ length: 1100 }, (_unused, index) => `bounded-${index}`);
    for (const key of keys) {
      assert.equal(await service.tryClaim(key), true, key);
    }
    // 最近一批仍在表里：重复占用必须判定为已占用。
    for (const key of keys.slice(-5)) {
      assert.equal(await service.tryClaim(key), false, key);
    }
    // 最早一批已被挤出：说明这张表有界且按插入顺序回收，不会无限增长。
    for (const key of keys.slice(0, 5)) {
      assert.equal(await service.tryClaim(key), true, key);
    }
  });
});

describe("S25 经 parentPort 的 claim 协议（broadcast/broadcastService.ts）", () => {
  it("claim 走 request/result 线协议：key 归一化、token 与 retryAfterMs 取自响应，控制消息吞错", async (t) => {
    let sequence = 0;
    t.mock.method(globalThis.crypto, "randomUUID", () => `synthetic-request-${++sequence}`);
    const port = makeFakePort();
    const service = createBroadcastService(port);

    const pending = service.acquireClaim("  remote-key  ");
    assert.deepEqual(port.posted, [
      { type: "broadcast-claim-request", requestId: "synthetic-request-1", key: "remote-key" },
    ]);
    port.emit({
      type: "broadcast-claim-result",
      requestId: "synthetic-request-1",
      status: "acquired",
      claimToken: "tok-1",
      junk: "strip-me",
    });
    assert.deepEqual(await pending, {
      status: "acquired",
      lease: { key: "remote-key", token: "tok-1" },
    });
    const postsAfterResolve = port.posted.length;
    // 待响应记录在同步回调前就撤销：重复响应不再产生任何线消息。
    port.emit({
      type: "broadcast-claim-result",
      requestId: "synthetic-request-1",
      status: "acquired",
      claimToken: "tok-1",
    });
    assert.equal(port.posted.length, postsAfterResolve);

    const busy = service.acquireClaim("busy-key");
    port.emit({
      type: "broadcast-claim-result",
      requestId: "synthetic-request-2",
      status: "busy",
      retryAfterMs: 1234,
    });
    assert.deepEqual(await busy, { status: "busy", retryAfterMs: 1234 });

    const committed = service.acquireClaim("committed-key");
    port.emit({
      type: "broadcast-claim-result",
      requestId: "synthetic-request-3",
      status: "committed",
    });
    assert.deepEqual(await committed, { status: "committed" });

    // commit/release 是 fire-and-forget：端口写失败也不 reject（与 send 相反）。
    port.throwOnPost = true;
    await service.commitClaim({ key: "k", token: "t" });
    await service.releaseClaim({ key: "k", token: "t" });
    assert.deepEqual(port.posted.at(-1), {
      type: "broadcast-claim-release",
      key: "k",
      claimToken: "t",
    });

    // 请求写不出去：立即 unavailable，且不留可被迟到响应解开的等待记录。
    assert.deepEqual(await service.acquireClaim("unreachable-key"), { status: "unavailable" });
    const attempted = port.posted.at(-1);
    assert.equal(attempted.type, "broadcast-claim-request");
    const postsBeforeGhost = port.posted.length;
    port.throwOnPost = false;
    port.emit({
      type: "broadcast-claim-result",
      requestId: attempted.requestId,
      status: "acquired",
      claimToken: "ghost-token",
    });
    assert.equal(port.posted.length, postsBeforeGhost);
  });

  it("同步重入的响应（postMessage 内直接回信）能正常定论，重复响应不再动作", async () => {
    const port = makeFakePort();
    port.replyTo = (message) => ({
      type: "broadcast-claim-result",
      requestId: message.requestId,
      status: "acquired",
      claimToken: "synchronous-token",
    });
    const service = createBroadcastService(port);

    assert.deepEqual(await service.acquireClaim(" sync-key "), {
      status: "acquired",
      lease: { key: "sync-key", token: "synchronous-token" },
    });
    assert.deepEqual(
      port.posted.map((wire) => wire.type),
      ["broadcast-claim-request"],
    );
    port.emit({
      type: "broadcast-claim-result",
      requestId: port.posted[0].requestId,
      status: "acquired",
      claimToken: "synchronous-token",
    });
    assert.equal(port.posted.length, 1);
  });
});

describe("S26 claim 预算与迟到 token（broadcast/broadcastService.ts）", () => {
  it("无响应时按预算返回 unavailable；畸形响应不提前定论；迟到的 acquired 补发 release", async (t) => {
    // Node 24 的 MockTimers 只需声明 setTimeout，clearTimeout 会一并被接管。
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let sequence = 0;
    t.mock.method(globalThis.crypto, "randomUUID", () => `timeout-request-${++sequence}`);
    const port = makeFakePort();
    const service = createBroadcastService(port);

    const first = service.acquireClaim(" timeout-key ");
    const request = port.posted.at(-1);
    assert.equal(request.type, "broadcast-claim-request");
    assert.equal(request.key, "timeout-key");

    let settled = null;
    first.then((value) => {
      settled = value;
    });
    // 不合 schema 的响应（负 retryAfterMs）被忽略：不能凭它提前给出结论。
    port.emit({
      type: "broadcast-claim-result",
      requestId: request.requestId,
      status: "busy",
      retryAfterMs: -5,
    });
    t.mock.timers.tick(1);
    assert.equal(settled, null);

    t.mock.timers.tick(2000);
    assert.deepEqual(await first, { status: "unavailable" });

    // 超时后 main 才回「acquired」：本进程没拿到 lease，必须替它释放 reservation。
    port.emit({
      type: "broadcast-claim-result",
      requestId: request.requestId,
      status: "acquired",
      claimToken: "late-token",
    });
    assert.deepEqual(port.posted.at(-1), {
      type: "broadcast-claim-release",
      key: "timeout-key",
      claimToken: "late-token",
    });
    const postsAfterLate = port.posted.length;
    port.emit({
      type: "broadcast-claim-result",
      requestId: request.requestId,
      status: "acquired",
      claimToken: "late-token",
    });
    assert.equal(port.posted.length, postsAfterLate, "重复的迟到响应不再释放第二次");

    // 清理定时器到点只是丢弃等待记录，不产生线消息；服务仍可继续发起新的申请。
    t.mock.timers.tick(7000);
    assert.equal(port.posted.length, postsAfterLate);
    const next = service.acquireClaim("next-key");
    const nextRequest = port.posted.at(-1);
    assert.equal(nextRequest.key, "next-key");
    port.emit({
      type: "broadcast-claim-result",
      requestId: nextRequest.requestId,
      status: "committed",
    });
    assert.deepEqual(await next, { status: "committed" });
  });
});
