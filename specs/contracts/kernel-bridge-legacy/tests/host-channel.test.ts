// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// B18：反向请求通道访问器（`channelForHostRequests`）的生命周期与窄接口约束。
//
// 为什么单独一组：`LegacyHostChannel` 在 #230 交付时只有类型、没有实现——当时它唯一的使用者
// 是本包自己（`runtime-preferences.ts`）。`kernel-plugin-credentials` 作为**调用方**接入后，
// 才需要一条公开路径。本文件守住 Lead 2026-10-20 裁决（方案 A）的四条验收要求：
//   B18a attach 前返回 undefined（不抛错）
//   B18b attach 后返回可用通道，且**只**含 request / notify（不外露桥的管理面）
//   B18c 通过通道发 request → 写到 stdout 且收到 Host 应答后兑现（走桥的唯一反向请求簿）
//   B18d detach 后再调用 → 按「无客户端」失败（-32020），不崩溃
//   B18e 通道的 notify 写 CLI→Host 通知（不占请求 id）
//
// 进程内单元测试：要验证的是「通道对象的形状与生命周期」，不是线上协议面。
// 线上协议面由 B1–B17 的 spawn 黑盒用例覆盖。

import assert from "node:assert/strict";
import test from "node:test";
import { Context } from "@deepseek-ai/cordis";
import { loadLegacy } from "./legacy-entry.mjs";

/** Host 应答必须能被运行时校验（#124 口径：不信任类型签名）。 */
const OBJECT_SCHEMA = {
  parse(value) {
    assert.equal(typeof value, "object", "reverse-request reply must be an object");
    assert.notEqual(value, null, "reverse-request reply must not be null");
    return value;
  },
};

/** 可观测的假传输：记录写出的每一行。 */
function createSink() {
  const written = [];
  return {
    written,
    write(message) {
      written.push(message);
    },
  };
}

async function createBridge() {
  const { createLegacyBridge } = await loadLegacy("index");
  const { LEGACY_ERROR_CODES } = await loadLegacy("errors");
  return { bridge: createLegacyBridge(new Context()), LEGACY_ERROR_CODES };
}

test("B18a attach 前 channelForHostRequests 返回 undefined（不抛错）", async () => {
  const { bridge } = await createBridge();
  try {
    assert.equal(bridge.channelForHostRequests(), undefined);
  } finally {
    bridge.dispose();
  }
});

test("B18b attach 后返回窄通道：只有 request / notify，不外露桥的管理面", async () => {
  const { bridge } = await createBridge();
  try {
    bridge.attach(createSink());
    const channel = bridge.channelForHostRequests();
    assert.notEqual(channel, undefined, "attach 之后必须能拿到通道");

    for (const name of ["request", "notify"]) {
      assert.equal(typeof channel[name], "function", `${name} must be a function`);
    }
    // 桥的内部管理方法绝不能出现在通道上——否则调用方能改通道状态或伪造应答结算。
    for (const hidden of ["setChannel", "settleFromClient", "dispose", "pendingCount"]) {
      assert.equal(hidden in channel, false, `${hidden} must not leak through the narrow channel`);
    }
  } finally {
    bridge.dispose();
  }
});

test("B18c 通过通道发 request 会写到 stdout，Host 应答后兑现", async () => {
  const { bridge } = await createBridge();
  try {
    const sink = createSink();
    bridge.attach(sink);
    const channel = bridge.channelForHostRequests();
    assert.notEqual(channel, undefined);

    const pending = channel.request(
      "interaction/requestProviderRuntimeHeaders",
      { requestId: "fixture-request" },
      OBJECT_SCHEMA,
      { timeoutMs: 5_000 },
    );

    assert.equal(sink.written.length, 1, "exactly one reverse request line");
    const line = sink.written[0];
    assert.equal(line.method, "interaction/requestProviderRuntimeHeaders");
    // id 用的是桥的唯一 server-<n> 序（单一所有者，不与客户端 id 撞）。
    assert.match(String(line.id), /^server-\d+$/u, `unexpected reverse id ${line.id}`);

    // 模拟 Host 应答：交给桥的结算入口（线上由 entry.ts 的应答快速路径调用）。
    assert.equal(bridge.settleHostRequest(line.id, { result: { headersApplied: true } }), true);
    assert.deepEqual(await pending, { headersApplied: true });
    // 兑现后不得残留 pending（B11 资源释放）。
    assert.equal(bridge.pendingHostRequests(), 0);
  } finally {
    bridge.dispose();
  }
});

test("B18d detach 后再用通道：按「无客户端」失败（-32020），不崩溃", async () => {
  const { bridge, LEGACY_ERROR_CODES } = await createBridge();
  try {
    bridge.attach(createSink());
    const channel = bridge.channelForHostRequests();
    assert.notEqual(channel, undefined);

    // detach 之后，之前拿到的通道引用仍在调用方手里；调用它必须得到明确的「无客户端」，
    // 而不是解引用崩溃或静默成功（安全红线：拿不到必须失败明确）。
    bridge.detach();

    await assert.rejects(
      async () =>
        await channel.request("interaction/requestProviderRuntimeHeaders", {}, OBJECT_SCHEMA),
      (error) => {
        assert.equal(
          error.code,
          LEGACY_ERROR_CODES.clientRequestUnavailable,
          `expected -32020 for a detached channel, got ${JSON.stringify(error.code)}`,
        );
        return true;
      },
    );

    // detach 后不再提供通道（新调用方拿不到，旧引用按上面失败）。
    assert.equal(bridge.channelForHostRequests(), undefined);
  } finally {
    bridge.dispose();
  }
});

test("B18e 通道的 notify 写 CLI→Host 通知（不占请求 id）", async () => {
  const { bridge } = await createBridge();
  try {
    const sink = createSink();
    bridge.attach(sink);
    const channel = bridge.channelForHostRequests();
    assert.notEqual(channel, undefined);

    channel.notify("computer-use/operation-event", { kind: "turn-started" });
    assert.equal(sink.written.length, 1);
    const line = sink.written[0];
    assert.equal(line.method, "computer-use/operation-event");
    assert.equal("id" in line, false, "a notification must not carry a request id");
  } finally {
    bridge.dispose();
  }
});
