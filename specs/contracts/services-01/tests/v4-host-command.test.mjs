// SPDX-License-Identifier: Apache-2.0
// A65–A66：host 侧 v4 命令信封、ACK 六态映射与 CAS 收敛。
// 断言只走公开导出；重试链用假 send 的调用序列验证，不依赖真实网络与 sleep。
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { importDeep } from "./entry.mjs";

const { assertV4CommandAckOk, createHostCommandEnvelope, sendHostCasCommandV4, uuidv7 } =
  await importDeep("agent/v4HostCommand.ts");

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const ack = (status, extra = {}) => ({
  commandId: extra.commandId ?? "cmd-1",
  status,
  revisionAtDecision: extra.revisionAtDecision ?? 7,
  ...extra,
});

describe("A65 uuidv7 与信封构造", () => {
  it("uuidv7 是 RFC 9562 形态：版本位 7、变体位 10、时间戳可还原", () => {
    const now = 1_700_000_000_000;
    const value = uuidv7(now);
    assert.match(value, UUID_V7);
    const hex = value.replace(/-/gu, "");
    const timestamp = Number.parseInt(hex.slice(0, 12), 16);
    assert.equal(timestamp, now, "前 48 bit 是毫秒时间戳");
    // 1000 次生成不重复，且同一毫秒内也各不相同。
    const seen = new Set();
    for (let index = 0; index < 1000; index++) seen.add(uuidv7(now));
    assert.equal(seen.size, 1000);
    // 不同时间戳的字典序与时间序一致（同毫秒内只保证随机）。
    assert.ok(uuidv7(now) < uuidv7(now + 1));
  });

  it("信封固定六键；baseRevision/baseLogEpoch 只在显式给值时出现", () => {
    const plain = createHostCommandEnvelope({
      type: "stop",
      payload: {},
      sessionId: "s-1",
    });
    assert.deepEqual(Object.keys(plain).sort(), [
      "clientId",
      "commandId",
      "issuedAt",
      "payload",
      "sessionId",
      "type",
    ]);
    assert.match(plain.commandId, UUID_V7);
    assert.match(plain.clientId, /^host-services-[0-9a-f-]{36}$/u);
    assert.equal(plain.sessionId, "s-1");
    assert.equal(plain.type, "stop");
    assert.ok(Number.isFinite(plain.issuedAt));

    const withCas = createHostCommandEnvelope({
      type: "setAutoDrain",
      payload: { autoDrain: true },
      sessionId: "s-1",
      baseRevision: 3,
    });
    assert.equal(withCas.baseRevision, 3);
    assert.equal("baseLogEpoch" in withCas, false, "未给 baseLogEpoch 就不出现该键");

    const withEpoch = createHostCommandEnvelope({
      type: "applyFileRewind",
      payload: { target: { kind: "assistant", index: 1 } },
      sessionId: "s-1",
      baseRevision: 0,
      baseLogEpoch: "epoch-1",
    });
    assert.equal(withEpoch.baseRevision, 0, "baseRevision=0 是合法探测值");
    assert.equal(withEpoch.baseLogEpoch, "epoch-1");

    // 显式 commandId/clientId 覆盖默认值（手机 replayable 保留原提交端身份）。
    const explicit = createHostCommandEnvelope({
      type: "stop",
      payload: {},
      sessionId: "s-1",
      commandId: "trace-9",
      clientId: "phone-7",
    });
    assert.equal(explicit.commandId, "trace-9");
    assert.equal(explicit.clientId, "phone-7");

    // sessionId 为 null 是 createSession 的合法形态。
    const created = createHostCommandEnvelope({
      type: "createSession",
      payload: {},
      sessionId: null,
    });
    assert.equal(created.sessionId, null);
  });

  it("CAS 命令缺 baseRevision、row-target 命令缺 baseLogEpoch 都在构造期抛出", () => {
    assert.throws(
      () => createHostCommandEnvelope({ type: "setAutoDrain", payload: {}, sessionId: "s-1" }),
      /command setAutoDrain 是 CAS 命令，必须携带 baseRevision/u,
    );
    assert.throws(
      () =>
        createHostCommandEnvelope({
          type: "switchModelConfig",
          payload: { provider: "p", model: "m", thought: "high" },
          sessionId: "s-1",
        }),
      /command switchModelConfig 是 CAS 命令，必须携带 baseRevision/u,
    );
    // row-target 命令即使带了 baseRevision，仍必须带 baseLogEpoch。
    assert.throws(
      () =>
        createHostCommandEnvelope({
          type: "applyFileRewind",
          payload: { target: { kind: "assistant", index: 0 } },
          sessionId: "s-1",
          baseRevision: 0,
        }),
      /command applyFileRewind 是 row target 命令，必须携带 baseLogEpoch/u,
    );
    // 非 CAS 命令不带 baseRevision 也合法。
    assert.ok(createHostCommandEnvelope({ type: "stop", payload: {}, sessionId: "s-1" }));
  });
});

describe("A66 ACK 六态映射与 CAS 收敛", () => {
  it("accepted/duplicate/noop 原样返回；rejected/stale/failed 抛结构化错误并携带 ack", () => {
    for (const status of ["accepted", "duplicate", "noop"]) {
      const input = ack(status);
      assert.equal(assertV4CommandAckOk("stop", input, "ctx"), input, `${status} 原样返回`);
    }
    for (const status of ["rejected", "stale", "failed"]) {
      assert.throws(
        () => assertV4CommandAckOk("stop", ack(status, { reasonCode: "guard.x" }), "ctx"),
        (error) => {
          assert.equal(error.name, "KnorviaV4CommandRejectedError");
          assert.equal(error.code, "KNORVIA_V4_COMMAND_REJECTED");
          assert.equal(error.commandType, "stop");
          assert.equal(error.ack.status, status);
          assert.equal(error.message, `v4 command stop ${status} (guard.x) — ctx`);
          return true;
        },
      );
    }
    // 无 reasonCode/message 时消息里不出现空括号或空冒号。
    assert.throws(
      () => assertV4CommandAckOk("stop", ack("failed"), "ctx"),
      (error) => error.message === "v4 command stop failed — ctx",
    );
    assert.throws(
      () => assertV4CommandAckOk("stop", ack("rejected", { message: "bad" }), "ctx"),
      (error) => error.message === "v4 command stop rejected: bad — ctx",
    );
  });

  it("CAS 首发 baseRevision=0 探测，stale 用 revisionAtDecision 收敛并换新 commandId", async () => {
    const seen = [];
    const ack = await sendHostCasCommandV4({
      send: async (envelope) => {
        seen.push(envelope);
        return seen.length < 3
          ? { commandId: envelope.commandId, status: "stale", revisionAtDecision: seen.length * 10 }
          : { commandId: envelope.commandId, status: "accepted", revisionAtDecision: 30 };
      },
      type: "setAutoDrain",
      payload: { autoDrain: true },
      sessionId: "s-1",
      contextMessage: "设置 autoDrain",
    });
    assert.equal(ack.status, "accepted");
    assert.deepEqual(
      seen.map((envelope) => envelope.baseRevision),
      [0, 10, 20],
      "首次探测用 0，之后取上次 stale 回报的 revisionAtDecision",
    );
    assert.equal(
      new Set(seen.map((envelope) => envelope.commandId)).size,
      3,
      "每次尝试换新 commandId",
    );
    assert.equal(new Set(seen.map((envelope) => envelope.commandId)).has(ack.commandId), true);
    assert.equal(seen[0].baseLogEpoch, undefined);
  });

  it("非 stale 的拒绝立即抛出，不再重试", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        sendHostCasCommandV4({
          send: async (envelope) => {
            calls += 1;
            return { commandId: envelope.commandId, status: "rejected", revisionAtDecision: 5 };
          },
          type: "setAutoDrain",
          payload: { autoDrain: false },
          sessionId: "s-1",
          contextMessage: "关闭 autoDrain",
        }),
      (error) => error.code === "KNORVIA_V4_COMMAND_REJECTED" && error.ack.status === "rejected",
    );
    assert.equal(calls, 1, "rejected 不重试");
  });

  it("连续 stale 用尽 maxAttempts 后抛出，并带上「放弃重试」与最后一次 ack", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        sendHostCasCommandV4({
          send: async (envelope) => {
            calls += 1;
            return {
              commandId: envelope.commandId,
              status: "stale",
              revisionAtDecision: calls,
            };
          },
          type: "setAutoDrain",
          payload: { autoDrain: true },
          sessionId: "s-1",
          contextMessage: "设置 autoDrain",
          maxAttempts: 3,
        }),
      (error) => {
        assert.equal(error.code, "KNORVIA_V4_COMMAND_REJECTED");
        assert.equal(error.ack.status, "stale");
        assert.equal(error.ack.revisionAtDecision, 3);
        assert.match(error.message, /连续 stale，放弃重试/u);
        return true;
      },
    );
    assert.equal(calls, 3);
  });

  it("duplicate 与 noop 视为幂等成功，不触发重试", async () => {
    for (const status of ["duplicate", "noop"]) {
      let calls = 0;
      const result = await sendHostCasCommandV4({
        send: async (envelope) => {
          calls += 1;
          return { commandId: envelope.commandId, status, revisionAtDecision: 1 };
        },
        type: "pauseGoal",
        payload: {},
        sessionId: "s-1",
        contextMessage: "暂停目标",
      });
      assert.equal(result.status, status);
      assert.equal(calls, 1);
    }
  });
});
