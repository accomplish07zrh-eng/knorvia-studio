// Synthetic interaction-only consumer contracts; no user-facing port is connected.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CoreErrorType,
  createCoreError,
  SessionEventType,
  type AskUserQuestionInput,
} from "@knorvia/contracts";
import { gate, eventPayload } from "./tool-invocation-fixture.js";
import {
  entry,
  frozen,
  PermissionService,
  protocol,
  questionInvocation,
  ToolDeadline,
  ui,
} from "./ask-user-question-fixture.js";

test("actual executor collects synthetic modified answers before handler and preserves trace/order", async () => {
  for (const label of ["empty answers", "complete", "partial", "reversed answers"]) {
    const c = frozen.cases.find((c) => c.label === label)!;
    const input = structuredClone(c.input) as AskUserQuestionInput;
    delete input.answers;
    const f = questionInvocation(input);
    f.behavior.reply = { decision: "modify", modifiedInput: c.input };
    const result = await f.execute({ traceContext: { traceId: "example-question-trace" } });
    assert.equal(result.success, true, label);
    assert.equal(result.modelContent, c.modelContent, label);
    assert.deepEqual(
      f.events.map((e) => e.type),
      [
        SessionEventType.PermissionRequested,
        SessionEventType.PermissionResolved,
        SessionEventType.ToolCallStarted,
        SessionEventType.ToolCallResult,
      ],
    );
    assert.equal(
      f.timeline.indexOf("prepare") < f.timeline.indexOf(SessionEventType.PermissionRequested),
      true,
    );
    assert.equal(
      f.timeline.indexOf(SessionEventType.PermissionRequested) < f.timeline.indexOf("activate"),
      true,
    );
    assert.equal(
      f.timeline.indexOf(SessionEventType.PermissionResolved) < f.timeline.indexOf("handler"),
      true,
    );
    const { request, options } = f.requests[0];
    assert.equal(request.toolCallId, f.call.id);
    assert.equal(request.toolName, "AskUserQuestion");
    assert.equal(request.traceId, "example-question-trace");
    assert.equal(request.requestId, eventPayload(f.events[0]).requestId);
    assert.equal(eventPayload(f.events[1]).requestId, request.requestId);
    assert.ok(options?.signal instanceof AbortSignal);
    assert.deepEqual(
      (f.observed.inputs[0] as AskUserQuestionInput).questions,
      (c.output as AskUserQuestionInput).questions,
    );
    assert.deepEqual(
      (f.observed.inputs[0] as AskUserQuestionInput).answers,
      (c.output as AskUserQuestionInput).answers,
    );
    assert.equal(f.terminal()[0].name, "finishCompleted");
  }
});

test("malformed admission and policy/hook denial cannot start a synthetic interaction", async () => {
  for (const variant of ["malformed", "policy", "hook"]) {
    const f = questionInvocation();
    if (variant === "malformed") f.call.input = { questions: [] };
    if (variant === "policy") f.behavior.decision = "deny";
    if (variant === "hook")
      f.behavior.hook = async () => ({ additionalContexts: [], permissionBehavior: "deny" });
    assert.equal((await f.execute()).success, false);
    assert.deepEqual(f.requests, []);
    assert.deepEqual(f.observed.inputs, []);
  }
});

test("allow without collected answers preserves the handler refusal after the interaction", async () => {
  const input = structuredClone(frozen.cases.find((c) => c.label === "no-answers")!.input);
  const f = questionInvocation(input);
  f.behavior.reply = { decision: "allow" };
  const result = await f.execute();
  assert.equal(result.error?.type, CoreErrorType.ToolExecutionFailed);
  assert.equal(result.error?.message, "AskUserQuestion requires user answers before execution");
  assert.equal(f.requests.length, 1);
  assert.equal(f.observed.inputs.length, 1);
  assert.equal(f.events.at(-1)?.type, SessionEventType.ToolCallError);
  assert.equal(
    f.events.some((e) => e.type === SessionEventType.ToolCallResult),
    false,
  );
});

test("denial and invalid modified replies cannot reach the handler", async () => {
  for (const variant of ["deny", "invalid"]) {
    const f = questionInvocation();
    f.behavior.reply =
      variant === "deny"
        ? { decision: "deny", reason: "example declined" }
        : { decision: "modify", modifiedInput: { questions: [] } };
    const result = await f.execute();
    assert.equal(result.success, false);
    assert.deepEqual(f.observed.inputs, []);
    assert.equal(f.requests.length, 1);
    assert.equal(
      f.events.some((e) => e.type === SessionEventType.ToolCallStarted),
      false,
    );
    assert.equal(
      result.error?.type,
      variant === "deny" ? CoreErrorType.PermissionDenied : CoreErrorType.ToolExecutionFailed,
    );
  }
});

test("pre-cancellation creates no request; pending cancellation closes the synthetic answer owner", async () => {
  const parent = new AbortController();
  parent.abort();
  const before = questionInvocation();
  assert.equal(
    (await before.execute({ signal: parent.signal })).error?.type,
    CoreErrorType.ToolCancelled,
  );
  assert.deepEqual(before.requests, []);
  const f = questionInvocation(),
    entered = gate(),
    response = gate<typeof f.behavior.reply>();
  f.response.read = async () => {
    entered.resolve();
    return response.promise;
  };
  const pendingParent = new AbortController();
  const pending = f.execute({ signal: pendingParent.signal });
  await entered.promise;
  pendingParent.abort();
  const result = await pending;
  response.resolve(f.behavior.reply);
  assert.equal(result.success, false);
  assert.equal(f.requests[0].options?.signal?.aborted, true);
  assert.deepEqual(f.observed.inputs, []);
  assert.equal(
    f.events.some((e) => e.type === SessionEventType.ToolCallStarted),
    false,
  );
});

test("permission waiting does not consume the fixed 30000ms handler deadline", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const budgets: number[] = [];
  const start = ToolDeadline.prototype.start;
  t.mock.method(
    ToolDeadline.prototype,
    "start",
    function (this: { timeoutMs: number }, callback: () => void) {
      budgets.push(this.timeoutMs);
      return start.call(this, callback);
    },
  );
  const f = questionInvocation(),
    entered = gate(),
    reply = gate<typeof f.behavior.reply>();
  f.response.read = async () => {
    entered.resolve();
    return reply.promise;
  };
  const pending = f.execute();
  await entered.promise;
  t.mock.timers.tick(40_000);
  assert.deepEqual(budgets, []);
  reply.resolve(f.behavior.reply);
  const result = await pending;
  assert.equal(result.success, true);
  assert.deepEqual(budgets, [30_000]);
  assert.ok((result.performance?.permissionWaitMs ?? 0) >= 40_000);
});

test("synthetic interaction timeout retains the existing permission failure boundary", async () => {
  const f = questionInvocation();
  const timeout = createCoreError(
    CoreErrorType.PermissionTimeout,
    "Example answer collection timed out",
    { recoverable: true },
  );
  f.response.read = async () => {
    throw timeout;
  };
  const result = await f.execute();
  assert.equal(result.error?.type, CoreErrorType.PermissionTimeout);
  assert.equal(result.error?.message, timeout.message);
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.observed.inputs, []);
  assert.equal(
    f.events.some((e) => e.type === SessionEventType.ToolCallStarted),
    false,
  );
  assert.equal(f.events.at(-1)?.type, SessionEventType.PermissionResolved);
});

test("existing interaction policy asks in every mode and retains hard denial", () => {
  for (const denied of [false, true]) {
    const service = new PermissionService({
      allowedTools: new Set(),
      disallowedTools: new Set(denied ? ["AskUserQuestion"] : []),
      autoApproveHighRisk: false,
      allowMediumRiskInAutoMode: false,
    });
    for (const mode of ["build", "plan", "auto", "yolo"]) {
      const decision = service.checkPermission(
        { mode, toolName: "AskUserQuestion", input: {}, riskLevel: "low" },
        entry,
      );
      assert.equal(decision.decision, denied ? "deny" : "ask");
      if (!denied) assert.equal(decision.ruleId, "tool.userInteraction");
    }
  }
});

test("actual protocol mapping preserves question/option order, labels, previews and values", () => {
  const input = frozen.cases.find((c) => c.label === "partial")!.input as AskUserQuestionInput;
  for (const question of input.questions) {
    const mapped = protocol.mapAskUserQuestion(question);
    assert.equal(mapped.question, question.question);
    assert.equal(mapped.header, question.header);
    assert.equal(mapped.multiSelect, question.multiSelect);
    assert.deepEqual(
      mapped.options,
      question.options.map((option) => ({
        description: option.description,
        label: option.label,
        preview: option.preview,
        value: option.label,
      })),
    );
  }
});

test("actual protocol answer normalization feeds empty/partial answers and keyed annotations into the handler", async () => {
  const input = frozen.cases.find((c) => c.label === "partial")!.input as AskUserQuestionInput;
  const request = questionInvocation(input).requests;
  assert.deepEqual(request, []);
  for (const content of [
    { answers: {} },
    {
      answers: { "Choose a size?": [" Small ", "Large"], "Choose a colour?": " " },
      annotations: { "Choose a size?": { notes: "note", preview: "preview" } },
      answer_0: " ",
    },
  ]) {
    const reply = protocol.userInputResponseToBrokerResult({ input } as never, {
      action: "accept",
      content,
    });
    assert.equal(reply.decision, "modify");
    const output = (await entry.handler(reply.modifiedInput, {
      toolCallId: "example-protocol-question",
    } as never)) as AskUserQuestionInput;
    assert.deepEqual(
      output.answers,
      "Choose a size?" in content.answers ? { "Choose a size?": "Small, Large" } : {},
    );
    assert.equal(Object.hasOwn(reply.modifiedInput as object, "answer_0"), false);
    if ("annotations" in content) assert.deepEqual(output.annotations, content.annotations);
  }
  for (const action of ["cancel", "decline"] as const) {
    const reply = protocol.userInputResponseToBrokerResult({ input } as never, { action });
    assert.equal(reply.decision, "deny");
    assert.equal(
      reply.reason,
      action === "cancel" ? "AskUserQuestion was cancelled" : "AskUserQuestion was declined",
    );
  }
});

test("pure UI consumer preserves question IDs, option IDs/order and canonical answer keys", async () => {
  const c = frozen.cases.find((c) => c.label === "partial")!;
  const input = c.input as AskUserQuestionInput;
  const display = ui.normalizeAskUserQuestionInput(input);
  assert.deepEqual(
    display.questions.map((q) => q.id),
    ["question-0", "question-1"],
  );
  assert.deepEqual(
    display.questions.map((q) => q.type),
    ["single", "multiple"],
  );
  assert.deepEqual(
    display.questions.map((q) => q.options.map((option) => option.id)),
    input.questions.map((q) => q.options.map((option) => option.label)),
  );
  const output = await entry.handler(input, { toolCallId: "example-ui-question" } as never);
  assert.deepEqual(
    ui.readAskUserQuestionAnswers({ input, output }),
    (c.output as AskUserQuestionInput).answers,
  );
});
