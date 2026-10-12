// SPDX-License-Identifier: Apache-2.0
// B17：session mailbox Hook 登记项。
import assert from "node:assert/strict";
import test from "node:test";
import { hooks } from "./entry.mjs";
import { makeHookInput, makeMailbox } from "../fixtures/builders.mjs";

const messages = [
  {
    content: "first <body>",
    createdAt: "2026-01-01T00:00:01.000Z",
    fromSessionId: "session-2",
    messageId: 'msg-"1"',
  },
  {
    content: "second",
    createdAt: "2026-01-01T00:00:02.000Z",
    fromSessionId: "session-3",
    messageId: "msg-2",
  },
];

test("B17 登记项形状：三个事件、内部 descriptor 与 drain 参数", async () => {
  const mailbox = makeMailbox([]);
  const registrations = hooks.createSessionMailboxHookRegistrations({
    mailbox,
    sessionId: "session-1",
  });
  assert.deepEqual(
    registrations.map((registration) => registration.event),
    ["UserPromptSubmit", "PostToolUse", "Stop"],
  );
  for (const registration of registrations) {
    assert.equal(registration.source, "builtin.sessionMailbox.drain");
    assert.equal(registration.matcher, undefined);
    assert.equal(registration.timeoutMs, undefined);
    assert.deepEqual(registration.descriptor, {
      clientVisible: false,
      commandDisplay: "Session mailbox",
      executionMode: "foreground",
      executionType: "process",
      sourceKind: "internal",
      timeoutMs: 60_000,
    });
  }

  const controller = new AbortController();
  const empty = await registrations[0].callback(
    makeHookInput({ hookEventName: "UserPromptSubmit" }),
    {
      hookIndex: 0,
      signal: controller.signal,
    },
  );
  assert.equal(empty, undefined);
  assert.deepEqual(mailbox.calls, [
    { input: { limit: 20, sessionId: "session-1" }, options: { signal: controller.signal } },
  ]);
});

test("B17 UserPromptSubmit/Stop 返回 additionalContext，Stop 额外 continue:true", async () => {
  const registrations = hooks.createSessionMailboxHookRegistrations({
    mailbox: makeMailbox(messages),
    sessionId: "session-1",
  });
  const [promptRegistration, , stopRegistration] = registrations;

  const promptResult = await promptRegistration.callback(
    makeHookInput({ hookEventName: "UserPromptSubmit" }),
    { hookIndex: 0 },
  );
  assert.equal(promptResult.continue, undefined);
  assert.equal(promptResult.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  const context = promptResult.hookSpecificOutput.additionalContext;
  assert.ok(
    context.includes('<session-message source="mailbox" message_id="msg-&quot;1&quot;"'),
    context,
  );
  assert.ok(context.includes('from_session="session-2"'), context);
  assert.ok(context.includes('created_at="2026-01-01T00:00:01.000Z"'), context);
  assert.ok(
    context.includes("For reference only. Verify against raw source before acting."),
    context,
  );
  assert.ok(context.includes("first <body>"), context);
  assert.ok(context.includes("</session-message>"), context);
  assert.ok(context.includes("\n\n<session-message"), "多条消息之间空行分隔");

  const stopResult = await stopRegistration.callback(makeHookInput({ hookEventName: "Stop" }), {
    hookIndex: 0,
  });
  assert.equal(stopResult.continue, true);
  assert.equal(stopResult.hookSpecificOutput.hookEventName, "Stop");
  assert.equal(stopResult.hookSpecificOutput.additionalContext, context);
});

test("B17 PostToolUse 逐条入队 pending input且不产生上下文", async () => {
  const mailbox = makeMailbox(messages);
  const queued = [];
  const registrations = hooks.createSessionMailboxHookRegistrations({
    enqueuePendingInput: async (input, traceContext) => {
      queued.push({ input, traceContext });
    },
    mailbox,
    sessionId: "session-1",
  });
  const postToolRegistration = registrations[1];
  const result = await postToolRegistration.callback(
    makeHookInput({ hookEventName: "PostToolUse", toolCallId: "tool-1", toolName: "Bash" }),
    { hookIndex: 0 },
  );
  assert.equal(result, undefined);
  assert.equal(queued.length, 2, "每条消息单独入队");
  assert.equal(queued[0].traceContext.sessionId, "session-1");
  assert.equal(queued[0].traceContext.traceId, "trace-1");
  assert.equal(queued[0].traceContext.turnId, "turn-1");
  assert.ok(queued[0].input.includes("first <body>"));
  assert.ok(queued[0].input.includes("msg-&quot;1&quot;"));
  assert.equal(queued[1].input.includes("second"), true);

  const withoutEnqueue = hooks.createSessionMailboxHookRegistrations({
    mailbox: makeMailbox(messages),
    sessionId: "session-1",
  })[1];
  const fallback = await withoutEnqueue.callback(makeHookInput({ hookEventName: "PostToolUse" }), {
    hookIndex: 0,
  });
  assert.equal(fallback.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.ok(fallback.hookSpecificOutput.additionalContext.includes("first <body>"));
});
