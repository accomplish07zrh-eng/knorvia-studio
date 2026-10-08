// 本次独立合成 CLI：只读写测试临时目录，经真实 stdin/stdout 交互，不加载用户配置。
const { appendFileSync } = require("node:fs");
const { createInterface } = require("node:readline");
const [kind, scenario] = process.argv.slice(2);
const send = (m, newline = true) => process.stdout.write(JSON.stringify(m) + (newline ? "\n" : ""));
const notice = (method, params) => send({ method, params });
const reply = (id, result) =>
  kind === "claude"
    ? send({
        type: "control_response",
        response: { subtype: "success", request_id: id, response: result },
      })
    : send({ id, result });
const params = (turnId = "current") => ({ threadId: "root", turnId });
const option = { label: "Blue", description: "Use the blue option, preserving its explanation" };
const question = {
  id: "q",
  question: "Choose a color",
  options: [option, "Legacy"],
  multiSelect: true,
};
let promptId;
function end() {
  if (kind === "codex") {
    notice("item/agentMessage/delta", { ...params(), itemId: "answer", delta: "current answer" });
    notice("turn/completed", { ...params(), turn: { id: "current", status: "completed" } });
  } else if (kind === "claude")
    send({
      type: "result",
      subtype: scenario === "failed-unresolved" ? "error_during_execution" : "success",
      is_error: scenario === "failed-unresolved",
    });
  else reply(promptId, { stopReason: "end_turn" });
}
function approval(turnId = "current", id = "approval") {
  send({
    id,
    method: "item/commandExecution/requestApproval",
    params: {
      ...params(turnId),
      command: scenario === "approval-long" ? "x".repeat(30000) : "echo fixture",
      cwd: "/fixture/project",
      reason: "Needs review",
      kind: "execute",
      context: { source: "fixture", authorization: "dummy-secret" },
      availableDecisions: ["accept", "decline"],
    },
  });
}
function codexStart(id) {
  if (scenario === "before-ack") {
    notice("item/agentMessage/delta", { ...params("old"), itemId: "old", delta: "STALE" });
    notice("item/agentMessage/delta", { ...params(), itemId: "answer", delta: "early " });
    approval("old", "old-approval");
  }
  if (scenario === "buffer-count" || scenario === "buffer-bytes") {
    for (let i = 0; i < (scenario === "buffer-count" ? 260 : 3); i++)
      notice("item/agentMessage/delta", {
        ...params(),
        itemId: "large",
        delta: "x".repeat(scenario === "buffer-count" ? 1 : 400000),
      });
  }
  if (scenario === "ack-terminal") {
    process.stdout.write(
      [
        { id, result: { turn: { id: "current" } } },
        {
          method: "item/agentMessage/delta",
          params: { ...params(), itemId: "answer", delta: "current answer" },
        },
        {
          method: "turn/completed",
          params: { ...params(), turn: { id: "current", status: "completed" } },
        },
      ]
        .map(JSON.stringify)
        .join("\n") + "\n",
    );
    return;
  }
  reply(id, { turn: scenario === "missing-id" ? {} : { id: "current" } });
  if (scenario === "stale-delta")
    notice("item/agentMessage/delta", { ...params("old"), itemId: "old", delta: "STALE" });
  if (scenario === "stale-tool")
    notice("item/completed", {
      ...params("old"),
      item: { id: "old-tool", type: "commandExecution", status: "completed" },
    });
  if (scenario === "stale-terminal")
    notice("turn/completed", { threadId: "root", turn: { id: "old", status: "completed" } });
  if (scenario === "stale-approval") approval("old", "old-approval");
  if (scenario === "conflict-started") {
    notice("turn/started", { threadId: "root", turn: { id: "intruder" } });
    notice("item/agentMessage/delta", {
      ...params("intruder"),
      itemId: "intruder",
      delta: "STALE",
    });
  }
  if (scenario === "thread-fence") {
    send({
      id: "child-approval",
      method: "item/commandExecution/requestApproval",
      params: { ...params(), threadId: "child", command: "unsafe" },
    });
    notice("item/agentMessage/delta", { ...params(), threadId: "child", delta: "STALE" });
  }
  if (scenario === "question") {
    send({
      id: "question",
      method: "item/tool/requestUserInput",
      params: { ...params(), questions: [question] },
    });
    return;
  }
  if (scenario === "approval" || scenario === "approval-long") return approval();
  if (scenario === "same-id-old") {
    approval();
    approval("old", "approval");
    notice("serverRequest/resolved", { ...params("old"), requestId: "approval" });
    return;
  }
  if (scenario === "legacy")
    notice("item/agentMessage/delta", { threadId: "root", itemId: "answer", delta: "legacy " });
  if (scenario === "withdraw") {
    notice("item/agentMessage/delta", { ...params(), itemId: "answer", delta: "before " });
    approval();
    notice("serverRequest/resolved", { ...params(), requestId: "approval" });
  }
  if (scenario === "tool-unknown")
    notice("item/completed", {
      ...params(),
      item: {
        id: "tool",
        type: "commandExecution",
        command: "echo hello",
        status: "vendor_pending",
        aggregatedOutput: "out",
      },
    });
  notice("thread/tokenUsage/updated", {
    threadId: "root",
    tokenUsage: { last: { inputTokens: 7 } },
  });
  // 独立事件回合可暴露启动响应 Promise 与当前 stdout 批次之间的竞态。
  setTimeout(end, 40);
}
function acpPrompt(id) {
  promptId = id;
  if (scenario === "question")
    return send({
      id: "question",
      method: "_x.ai/ask_user_question",
      params: { sessionId: "root", questions: [question] },
    });
  if (scenario === "approval")
    return send({
      id: "approval",
      method: "session/request_permission",
      params: {
        sessionId: "root",
        cwd: "/fixture/project",
        reason: "Needs review",
        context: { source: "fixture" },
        toolCall: { title: "Tool", kind: "execute", rawInput: { command: "echo hello" } },
        options: [
          { kind: "allow_once", optionId: "yes" },
          { kind: "reject_once", optionId: "no" },
        ],
      },
    });
  const update = (value) => notice("session/update", { sessionId: "root", update: value });
  update({
    sessionUpdate: "tool_call",
    toolCallId: "tool",
    title: "Read fixture",
    status: "in_progress",
    rawInput: { path: "file" },
    rawOutput: { value: "raw" },
    content: [{ type: "content", content: { type: "text", text: "typed" } }],
  });
  update({ sessionUpdate: "tool_call_update", toolCallId: "tool", status: "vendor_pending" });
  if (scenario === "explicit-empty")
    update({ sessionUpdate: "tool_call_update", toolCallId: "tool", rawOutput: "", content: [] });
  end();
}
function claudePrompt() {
  send({ type: "system", session_id: "root", subtype: "init" });
  if (scenario === "question")
    return send({
      type: "control_request",
      request_id: "question",
      request: {
        subtype: "can_use_tool",
        tool_name: "AskUserQuestion",
        input: { questions: [question] },
      },
    });
  if (scenario === "approval")
    return send({
      type: "control_request",
      request_id: "approval",
      request: {
        subtype: "can_use_tool",
        tool_name: "Read",
        input: { path: "file" },
        cwd: "/fixture/project",
        reason: "Needs review",
        kind: "read",
        context: { source: "fixture" },
      },
    });
  if (scenario === "discarded") {
    send({ type: "stream_event", event: { type: "message_start", message: { id: "a" } } });
    send({
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "discarded", name: "Read", input: {} },
      },
    });
    send({
      type: "assistant",
      message: { id: "a", content: [{ type: "text", text: "Revised plan" }] },
    });
  }
  send({
    type: "assistant",
    session_id: "root",
    message: {
      id: "a",
      content: [{ type: "tool_use", id: "tool", name: "Read", input: { path: "file" } }],
    },
  });
  if (scenario === "cancel")
    return send({
      type: "control_request",
      request_id: "approval",
      request: {
        subtype: "can_use_tool",
        tool_name: "Read",
        tool_use_id: "tool",
        input: { path: "file" },
      },
    });
  if (scenario === "withdraw") {
    send({
      type: "control_request",
      request_id: "approval",
      request: { subtype: "can_use_tool", tool_name: "Read", tool_use_id: "tool", input: {} },
    });
    send({ type: "control_cancel_request", request_id: "approval" });
  }
  if (scenario === "eof-failure") {
    process.stdout.write('{"type":"result"');
    return process.stdout.end(() => process.exit(0));
  }
  if (scenario === "eof-complete") {
    send({
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "tool", content: "out" }] },
    });
    send({ type: "result", subtype: "success", is_error: false }, false);
    return process.stdout.end(() => process.exit(0));
  }
  setTimeout(end, 40);
}
createInterface({ input: process.stdin }).on("line", (line) => {
  const m = JSON.parse(line);
  appendFileSync("wire.jsonl", line + "\n");
  const method = kind === "claude" ? m.request?.subtype : m.method;
  const id = kind === "claude" ? m.request_id : m.id;
  if (method === "initialize")
    return reply(
      id,
      kind === "acp" || kind === "grok"
        ? { protocolVersion: 1, authMethods: [], agentCapabilities: { loadSession: true } }
        : {},
    );
  if (method === "thread/start" || method === "thread/resume") {
    if (scenario === "legacy")
      send({
        method: "thread/tokenUsage/updated",
        params: { tokenUsage: { last: { inputTokens: 17 } } },
      });
    return reply(id, { thread: { id: "root" } });
  }
  if (method === "config/read")
    return reply(id, { config: { model: "fixture", model_reasoning_effort: "low" } });
  if (method === "model/list")
    return reply(id, {
      data: [
        {
          model: "fixture",
          supportedReasoningEfforts: [{ reasoningEffort: "low" }],
          defaultReasoningEffort: "low",
        },
      ],
      nextCursor: null,
    });
  if (method === "turn/start") return codexStart(id);
  if (method === "session/new") return reply(id, { sessionId: "root" });
  if (method === "session/prompt") return acpPrompt(id);
  if (kind === "claude" && m.type === "user") return claudePrompt();
  if (method === "interrupt") {
    reply(id, {});
    return send({ type: "result", subtype: "error_during_execution", is_error: true });
  }
  if (method === "turn/interrupt") {
    reply(id, {});
    return notice("turn/completed", {
      ...params(),
      turn: { id: "current", status: "interrupted" },
    });
  }
  if (m.type === "control_response" || (!method && m.id)) {
    if (["question", "approval", "approval-long"].includes(scenario)) setTimeout(end, 10);
    if (scenario === "same-id-old" && m.result?.decision === "accept") setTimeout(end, 10);
  }
});
