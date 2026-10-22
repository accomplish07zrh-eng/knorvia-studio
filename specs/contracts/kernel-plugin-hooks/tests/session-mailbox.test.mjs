// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// session-mailbox 的契约测试（B17 的 6 条规格）。
import assert from "node:assert/strict";
import test from "node:test";

async function loadPlugin() {
  return await import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/session-mailbox.ts");
}

function message(overrides = {}) {
  return {
    messageId: "m-1",
    fromSession: "s-other",
    createdAt: "2026-10-23T00:00:00.000Z",
    text: "hello from another session",
    ...overrides,
  };
}

function makeMailbox(messages) {
  const calls = [];
  return {
    calls,
    mailbox: {
      async drainUnread(request, options) {
        calls.push({ request, options });
        return messages;
      },
    },
  };
}

test("B17.1 返回 3 个登记项（UserPromptSubmit / PostToolUse / Stop）", async () => {
  const { createMailboxRegistrations } = await loadPlugin();
  const registrations = createMailboxRegistrations();

  assert.equal(registrations.length, 3);
  assert.deepEqual(
    registrations.map((r) => r.event),
    ["UserPromptSubmit", "PostToolUse", "Stop"],
  );
});

test("B17.1 descriptor 固定", async () => {
  const { createMailboxRegistrations } = await loadPlugin();
  const [registration] = createMailboxRegistrations();

  assert.equal(registration.descriptor.clientVisible, false);
  assert.equal(registration.descriptor.commandDisplay, "Session mailbox");
  assert.equal(registration.descriptor.executionMode, "foreground");
  assert.equal(registration.descriptor.executionType, "process");
  assert.equal(registration.descriptor.sourceKind, "internal");
  assert.equal(registration.descriptor.timeoutMs, 60000);
});

test("B17.1 source 固定 + 无 matcher", async () => {
  const { createMailboxRegistrations } = await loadPlugin();
  for (const registration of createMailboxRegistrations()) {
    assert.equal(registration.source, "builtin.sessionMailbox.drain");
    assert.equal("matcher" in registration, false, "无 matcher");
  }
});

test("B17.2 每次调用 drainUnread({ sessionId, limit: 20 }, { signal })", async () => {
  const { drainMailbox } = await loadPlugin();
  const { calls, mailbox } = makeMailbox([message()]);
  const controller = new AbortController();

  await drainMailbox(mailbox, {
    hookEventName: "UserPromptSubmit",
    sessionId: "s-1",
    signal: controller.signal,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].request.sessionId, "s-1");
  assert.equal(calls[0].request.limit, 20, "limit 必须是 20");
  assert.equal(calls[0].options.signal, controller.signal, "signal 应透传");
});

test("B17.2 无 signal 时不传（或传空对象）", async () => {
  const { drainMailbox } = await loadPlugin();
  const { calls, mailbox } = makeMailbox([]);

  await drainMailbox(mailbox, { hookEventName: "Stop", sessionId: "s-1" });

  assert.equal(calls[0].request.sessionId, "s-1");
});

test("B17.3 未读到消息 → undefined（空数组）", async () => {
  const { drainMailbox } = await loadPlugin();
  const { mailbox } = makeMailbox([]);

  const result = await drainMailbox(mailbox, { hookEventName: "Stop", sessionId: "s-1" });
  assert.equal(result, undefined);
});

test("B17.4 PostToolUse 且有 enqueuePendingInput → 逐条 enqueue（3 条 → 3 次）", async () => {
  const { drainMailbox } = await loadPlugin();
  const messages = [
    message({ messageId: "m-1", text: "first" }),
    message({ messageId: "m-2", text: "second" }),
    message({ messageId: "m-3", text: "third" }),
  ];
  const { mailbox } = makeMailbox(messages);
  const enqueued = [];

  const result = await drainMailbox(mailbox, {
    hookEventName: "PostToolUse",
    sessionId: "s-1",
    traceId: "t-1",
    turnId: "turn-1",
    enqueuePendingInput: (text, metadata) => enqueued.push({ text, metadata }),
  });

  assert.equal(enqueued.length, 3, "3 条消息应触发 3 次 enqueue");
  assert.equal(result, undefined, "不产生 additionalContext");
  assert.ok(enqueued[0].text.includes("first"));
  assert.ok(enqueued[1].text.includes("second"));
  assert.ok(enqueued[2].text.includes("third"));
});

test("B17.4 enqueue 时带 sessionId / traceId / turnId", async () => {
  const { drainMailbox } = await loadPlugin();
  const { mailbox } = makeMailbox([message()]);
  const enqueued = [];

  await drainMailbox(mailbox, {
    hookEventName: "PostToolUse",
    sessionId: "s-1",
    traceId: "t-1",
    turnId: "turn-1",
    enqueuePendingInput: (text, metadata) => enqueued.push(metadata),
  });

  assert.equal(enqueued[0].sessionId, "s-1");
  assert.equal(enqueued[0].traceId, "t-1");
  assert.equal(enqueued[0].turnId, "turn-1");
});

test("B17.4 PostToolUse 但**无** enqueuePendingInput → 走合并分支", async () => {
  const { drainMailbox } = await loadPlugin();
  const { mailbox } = makeMailbox([message()]);

  const result = await drainMailbox(mailbox, {
    hookEventName: "PostToolUse",
    sessionId: "s-1",
  });

  assert.ok(result, "无 enqueue 时应返回 additionalContext");
  assert.equal(result.hookSpecificOutput.hookEventName, "PostToolUse");
});

test("B17.5 其他事件 → 合并成一个 additionalContext（3 条 → 1 个 context）", async () => {
  const { drainMailbox } = await loadPlugin();
  const messages = [
    message({ messageId: "m-1", text: "first" }),
    message({ messageId: "m-2", text: "second" }),
    message({ messageId: "m-3", text: "third" }),
  ];
  const { mailbox } = makeMailbox(messages);

  const result = await drainMailbox(mailbox, {
    hookEventName: "UserPromptSubmit",
    sessionId: "s-1",
  });

  const context = result.hookSpecificOutput.additionalContext;
  const blocks = context.match(/<session-message/gu) ?? [];
  assert.equal(blocks.length, 3, "应含 3 个 session-message 块");
  assert.equal(result.hookSpecificOutput.hookEventName, "UserPromptSubmit");
});

test("B17.5 Stop → 额外带 continue: true", async () => {
  const { drainMailbox } = await loadPlugin();
  const { mailbox } = makeMailbox([message()]);

  const result = await drainMailbox(mailbox, { hookEventName: "Stop", sessionId: "s-1" });
  assert.equal(result.continue, true);
});

test("B17.5 非 Stop → 不带 continue", async () => {
  const { drainMailbox } = await loadPlugin();
  const { mailbox } = makeMailbox([message()]);

  for (const event of ["UserPromptSubmit", "PostToolUse"]) {
    const result = await drainMailbox(mailbox, { hookEventName: event, sessionId: "s-1" });
    assert.equal("continue" in result, false, `${event} 不应带 continue`);
  }
});

test("B17.6 消息格式正确", async () => {
  const { formatSessionMessage } = await loadPlugin();
  const formatted = formatSessionMessage(message());

  assert.ok(formatted.startsWith('<session-message source="mailbox"'), "应有开始标签");
  assert.ok(formatted.includes('message_id="m-1"'));
  assert.ok(formatted.includes('from_session="s-other"'));
  assert.ok(formatted.includes('created_at="2026-10-23T00:00:00.000Z"'));
  assert.ok(formatted.includes("For reference only. Verify against raw source before acting."));
  assert.ok(formatted.includes("hello from another session"));
  assert.ok(formatted.endsWith("</session-message>"));
});

test("B17.6 引用提示与正文之间有**空行**", async () => {
  const { formatSessionMessage } = await loadPlugin();
  const formatted = formatSessionMessage(message());

  assert.ok(
    formatted.includes("acting.\n\nhello from another session"),
    "提示行与正文之间应有空行",
  );
});

test("B17.6 多条之间空行分隔", async () => {
  const { formatSessionMessages } = await loadPlugin();
  const formatted = formatSessionMessages([
    message({ messageId: "m-1" }),
    message({ messageId: "m-2" }),
  ]);

  assert.ok(formatted.includes("</session-message>\n\n<session-message"), "两条之间应有空行");
});

test('B17.6 属性值转义 & " <', async () => {
  const { escapeAttribute } = await loadPlugin();
  assert.equal(escapeAttribute('a&b"c<d'), "a&amp;b&quot;c&lt;d");
});

test("B17.6 属性含特殊字符时被转义（端到端）", async () => {
  const { formatSessionMessage } = await loadPlugin();
  const formatted = formatSessionMessage(
    message({ fromSession: 'evil"<script>', messageId: "a&b" }),
  );

  assert.ok(formatted.includes('from_session="evil&quot;&lt;script>"'), "fromSession 应转义");
  assert.ok(formatted.includes('message_id="a&amp;b"'), "messageId 应转义");
  assert.equal(formatted.includes("<script>"), false, "原始 <script> 不得出现");
});

test("B17.6 正文不转义（只有属性值转义）", async () => {
  const { formatSessionMessage } = await loadPlugin();
  const formatted = formatSessionMessage(message({ text: 'use <div> & "quotes"' }));

  assert.ok(formatted.includes('use <div> & "quotes"'), "正文应原样保留");
});

test("B17.2 drainUnread 抛错时向上传播", async () => {
  const { drainMailbox } = await loadPlugin();
  const mailbox = {
    async drainUnread() {
      throw new Error("mailbox unavailable");
    },
  };

  let caught;
  try {
    await drainMailbox(mailbox, { hookEventName: "Stop", sessionId: "s-1" });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
  assert.equal(caught.message, "mailbox unavailable");
});
