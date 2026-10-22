// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// UserPromptSubmit 挂载点的契约测试（H1 + H3.5）。
import assert from "node:assert/strict";
import test from "node:test";
import { Context } from "@deepseek-ai/cordis";

async function loadPlugin() {
  const [userPromptSubmit, verdict] = await Promise.all([
    import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/user-prompt-submit.ts"),
    import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/verdict.ts"),
  ]);
  return { userPromptSubmit, verdict };
}

function userMessage(text, id = "m1") {
  return { id, role: "user", content: [{ type: "text", text }], source: { kind: "user" } };
}

function makePayload(texts = ["hello"]) {
  return {
    messages: texts.map((text, index) => userMessage(text, `m${index + 1}`)),
    turn: 1,
    step: 1,
    signal: new AbortController().signal,
  };
}

async function runWaterfall(ctx, payload, downstream) {
  return await ctx.waterfall("agent/pre-step", payload, async () => downstream);
}

test("H3.5 无意见 → 委托（保持当前 messages）", async () => {
  const { userPromptSubmit, verdict } = await loadPlugin();
  const ctx = new Context();
  userPromptSubmit.mountUserPromptSubmit(ctx, { judge: async () => verdict.NO_OPINION });

  const original = [userMessage("hello")];
  const result = await runWaterfall(ctx, makePayload(), { kind: "enter", messages: original });
  assert.equal(result.kind, "enter");
  assert.equal(result.messages.length, 1, "委托应保持原 messages");
});

test("H3.5 deny → reject（阻断用户提交）", async () => {
  const { userPromptSubmit } = await loadPlugin();
  const ctx = new Context();
  userPromptSubmit.mountUserPromptSubmit(ctx, {
    judge: async () => ({ kind: "deny", reason: "blocked by hook" }),
  });

  const result = await runWaterfall(ctx, makePayload(), { kind: "enter", messages: [] });
  assert.equal(result.kind, "reject");
});

test("H3.5 带 context → enter + 原 messages + 注入（enter 是替换语义）", async () => {
  const { userPromptSubmit } = await loadPlugin();
  const ctx = new Context();
  userPromptSubmit.mountUserPromptSubmit(ctx, {
    judge: async () => ({ kind: "allow", context: "hook says: remember X" }),
  });

  const result = await runWaterfall(ctx, makePayload(["original"]), {
    kind: "enter",
    messages: [],
  });
  assert.equal(result.kind, "enter");
  assert.equal(result.messages.length, 2, "应保留原 messages 并追加注入");
  assert.equal(result.messages[0].content[0].text, "original", "原有消息必须在");
  assert.equal(result.messages[1].content[0].text, "hook says: remember X");
  assert.equal(result.messages[1].role, "user", "注入消息是 user 角色");
});

test("H3.5 allow 但无 context → 委托（提交阶段无「允许」语义）", async () => {
  const { userPromptSubmit } = await loadPlugin();
  const ctx = new Context();
  userPromptSubmit.mountUserPromptSubmit(ctx, { judge: async () => ({ kind: "allow" }) });

  const original = [userMessage("hello")];
  const result = await runWaterfall(ctx, makePayload(), { kind: "enter", messages: original });
  assert.equal(result.kind, "enter");
  assert.equal(result.messages.length, 1);
});

test("H3.5 ask → 委托（提交阶段无「审批」语义）", async () => {
  const { userPromptSubmit } = await loadPlugin();
  const ctx = new Context();
  userPromptSubmit.mountUserPromptSubmit(ctx, {
    judge: async () => ({ kind: "ask", reason: "review" }),
  });

  const result = await runWaterfall(ctx, makePayload(), { kind: "reject" });
  assert.equal(result.kind, "reject", "ask 应委托，拿到下游的 reject");
});

test("H3.5 注入消息的字段完整（id/role/content/source）", async () => {
  const { userPromptSubmit } = await loadPlugin();
  const ctx = new Context();
  userPromptSubmit.mountUserPromptSubmit(ctx, {
    judge: async () => ({ kind: "allow", context: "note" }),
  });

  const result = await runWaterfall(ctx, makePayload(), { kind: "enter", messages: [] });
  const injected = result.messages[1];
  assert.equal(typeof injected.id, "string");
  assert.ok(injected.id.length > 0, "id 不能为空");
  assert.equal(injected.role, "user");
  assert.deepEqual(injected.source, { kind: "user" });
  assert.equal(injected.content[0].type, "text");
});

test("H3.5 判定输入映射：messages / turn / step / signal", async () => {
  const { userPromptSubmit } = await loadPlugin();
  const ctx = new Context();

  let seen;
  userPromptSubmit.mountUserPromptSubmit(ctx, {
    judge: async (input) => {
      seen = input;
      return { kind: "deny", reason: "recorded" };
    },
  });

  const signal = new AbortController().signal;
  await runWaterfall(
    ctx,
    { messages: [userMessage("q")], turn: 3, step: 7, signal },
    { kind: "enter", messages: [] },
  );

  assert.equal(seen.messages.length, 1);
  assert.equal(seen.messages[0].content[0].text, "q");
  assert.equal(seen.turn, 3);
  assert.equal(seen.step, 7);
  assert.equal(seen.signal, signal);
});

test("H3.5 reject 后下游不执行（不调 next）", async () => {
  const { userPromptSubmit } = await loadPlugin();
  const ctx = new Context();

  const order = [];
  userPromptSubmit.mountUserPromptSubmit(ctx, {
    judge: async () => {
      order.push("plugin-hook");
      return { kind: "deny", reason: "blocked" };
    },
  });
  ctx.on("agent/pre-step", async (_payload, next) => {
    order.push("downstream");
    return await next();
  });

  await runWaterfall(ctx, makePayload(), { kind: "enter", messages: [] });
  assert.deepEqual(order, ["plugin-hook"], "reject 后下游不应执行");
});

test("H1.3 卸载后监听器注销", async () => {
  const { userPromptSubmit } = await loadPlugin();
  const ctx = new Context();

  let calls = 0;
  const dispose = userPromptSubmit.mountUserPromptSubmit(ctx, {
    judge: async () => {
      calls += 1;
      return { kind: "deny", reason: "blocked" };
    },
  });

  await runWaterfall(ctx, makePayload(), { kind: "enter", messages: [] });
  assert.equal(calls, 1);

  dispose();
  await runWaterfall(ctx, makePayload(), { kind: "enter", messages: [] });
  assert.equal(calls, 1);
});

test("H3.5 空 context 字符串不注入（避免空消息）", async () => {
  const { userPromptSubmit } = await loadPlugin();
  const ctx = new Context();
  userPromptSubmit.mountUserPromptSubmit(ctx, {
    judge: async () => ({ kind: "allow", context: "" }),
  });

  const original = [userMessage("hello")];
  const result = await runWaterfall(ctx, makePayload(), { kind: "enter", messages: original });
  assert.equal(result.kind, "enter");
  assert.equal(result.messages.length, 1, "空字符串不应产生注入消息");
});
