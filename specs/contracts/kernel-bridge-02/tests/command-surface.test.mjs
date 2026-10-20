// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-02 B1 的冻结面：回合命令字面量与既有骨架不变量。
//
// 这些用例在**合同阶段即可通过**（不依赖本包实现）：
//   (a) 五个回合命令字面量确实存在于 v4 的命令面（不是自造名）；
//   (b) `sendText` 的交付意愿取值集合就是 `startNow`/`queue`/`guide`（`guide` 即 steer）；
//   (c) 本包不新增 v4 方法名——`V4_METHODS` 及其取值集合不因本包变化；
//   (d) 未知方法仍返回 -32601（default 分支行为不变）。
// 「回合命令不再 unsupported」「帧序列」等随实现落地的断言见 behavior.md B2–B16。
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  commandEnvelope,
  makeTempDir,
  newCommandId,
  removeTempDir,
  spawnBridgeApp,
} from "./_protocol.mjs";
import {
  acceptsRequestedDelivery,
  loadCommandTypes,
  loadSendTextSchema,
  loadV4Methods,
} from "./_shared-probe.mjs";

/** 本包承诺实现的五个回合命令字面量。 */
const TURN_COMMANDS = ["createSession", "sendText", "stop", "compact", "resolveInteraction"];

/** 不得出现在命令面里的自造名。 */
const FABRICATED_NAMES = ["cancelTurn", "steer"];

test("B1 五个回合命令字面量存在于 v4 命令面", async () => {
  const types = await loadCommandTypes();
  for (const name of TURN_COMMANDS) {
    assert.ok(types.includes(name), `命令面必须含 ${name}；实际=${types.slice().sort().join(",")}`);
  }
  for (const name of FABRICATED_NAMES) {
    assert.equal(
      types.includes(name),
      false,
      `${name} 不是命令：取消是 stop，steer 是 sendText.requestedDelivery`,
    );
  }
});

test("B1 命令面共 34 个，与计划书口径一致", async () => {
  const types = await loadCommandTypes();
  assert.equal(
    types.length,
    34,
    `v4 命令必须恰好 34 个（计划书「v4 命令 34 种」）；实际=${types.length}`,
  );
});

test("B1 sendText 的交付意愿三义：startNow / queue / guide 合法，其他值非法", async () => {
  // 只看 schema 的实际解析行为，不依赖 zod 内部结构。
  for (const value of ["startNow", "queue", "guide"]) {
    const accepted = await acceptsRequestedDelivery(value);
    assert.equal(accepted, true, `requestedDelivery 必须接受 ${value}`);
  }
  for (const value of ["steer", "queued", "auto", "enqueue"]) {
    const accepted = await acceptsRequestedDelivery(value);
    assert.equal(
      accepted,
      false,
      `${value} 不得被 requestedDelivery 接受（guide 才是 steer，queue 才是入队）`,
    );
  }
  // 缺省也是合法的：admission 会按 inputRouting 裁决。
  const schema = await loadSendTextSchema();
  assert.equal(
    schema.safeParse({ text: "probe" }).success,
    true,
    "requestedDelivery 缺省时 payload 仍须合法",
  );
  assert.equal(schema.safeParse({}).success, false, "sendText 的 text 是必填");
});

test("B1 本包不新增 v4 方法名：V4_METHODS 的取值集合是冻结的", async () => {
  const methods = await loadV4Methods();
  assert.ok(methods.length > 6, `V4_METHODS 应有多条方法；实际=${methods.length}`);
  assert.ok(methods.includes("v4/command"), "必须含 v4/command");
  // 反向断言：本包不引入「回合专用」的新方法名。
  for (const invented of ["v4/turn/send", "v4/turn/stop", "v4/conversation/sendText"]) {
    assert.equal(
      methods.includes(invented),
      false,
      `${invented} 不得出现在 V4_METHODS（回合能力经 v4/command 的 type 分派）`,
    );
  }
});

test("B1 未知 v4 方法仍返回 -32601（default 分支行为不变）", async () => {
  const home = await makeTempDir("kernel-bridge-02-methods-");
  const workspace = join(home, "workspace");
  await mkdir(workspace, { recursive: true });
  const app = await spawnBridgeApp({ cwd: workspace, home });
  try {
    const response = await app.request("v4/not-a-method", {});
    assert.equal(
      response.error?.code,
      -32601,
      `未知方法必须是 -32601；实际=${JSON.stringify(response)}`,
    );
  } finally {
    try {
      await app.close();
    } catch {
      // 收尾失败不掩盖首个错误。
    }
    await removeTempDir(home);
  }
});

test("B1 回合命令的信封可按冻结形状构造", async () => {
  // 只断言信封本身可构造且字段名正确；不驱动回合（那需要实现落地）。
  const envelope = commandEnvelope({
    commandId: newCommandId("shape"),
    sessionId: "session-probe",
    type: "sendText",
    payload: { text: "hello", requestedDelivery: "queue" },
  });
  assert.equal(envelope.type, "sendText");
  assert.equal(envelope.payload.text, "hello");
  assert.equal(envelope.payload.requestedDelivery, "queue");
  assert.equal(envelope.clientId, "bridge-02-contract");
  assert.ok(typeof envelope.commandId === "string" && envelope.commandId.length > 0);
});
