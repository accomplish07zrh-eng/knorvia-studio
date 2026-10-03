// Actual supported consumers with synthetic task and permission ports only.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CoreErrorType, HookEventName, SessionEventType } from "@knorvia/contracts";
import { gate, eventPayload } from "./tool-invocation-fixture.js";
import {
  direct,
  entries,
  errorShape,
  executorFixture,
  loopPolicy,
  PermissionService,
  resolveRuntimePermissionCapability,
  sendMessageToolEntry,
  servicePolicy,
  valid,
} from "./off-peak-fixture.js";

const frozen = JSON.parse(
  await readFile(new URL("./off-peak-contract.json", import.meta.url), "utf8"),
);
test("actual executor preserves create/list turn differences, session, trace and model-facing output", async () => {
  for (const c of frozen.executions) {
    const f = executorFixture(c.operation);
    const result = await f.execute({
      ...c.options,
      traceContext: { traceId: "example-offpeak-trace" },
    });
    assert.deepEqual(
      JSON.parse(
        JSON.stringify({
          success: result.success,
          output: result.output,
          modelContent: result.modelContent,
          error: result.error ? errorShape(result.error) : undefined,
          timeline: f.timeline,
          eventTypes: f.events.map((e) => e.type),
        }),
      ),
      c.observed,
    );
    if (result.success) {
      assert.equal(f.direct.calls.length, 1);
      assert.equal(f.direct.calls[0].receiver, true);
      assert.equal(f.observed.contexts[0].traceId, "example-offpeak-trace");
      if (c.operation === "create")
        assert.deepEqual(f.direct.calls[0].args[1], { sessionId: "fixture-session" });
      assert.equal(eventPayload(f.events.at(-1)!).toolCallId, f.call.id);
    } else assert.deepEqual(f.direct.calls, []);
  }
});

test("actual permission mode/hard/project matrix stays frozen for both capabilities", () => {
  for (const [operation, entry] of Object.entries(entries))
    for (const mode of ["build", "plan", "auto", "yolo"])
      for (const denial of ["none", "hard", "project"]) {
        const service = new PermissionService({
          allowedTools: new Set(),
          disallowedTools: new Set(denial === "hard" ? [entry.metadata.name] : []),
          autoApproveHighRisk: false,
          allowMediumRiskInAutoMode: false,
        });
        const decision = service.checkPermission(
          {
            mode,
            toolName: entry.metadata.name,
            input: operation === "create" ? valid : {},
            riskLevel: operation === "create" ? "medium" : "low",
          },
          resolveRuntimePermissionCapability(entry, operation === "create" ? valid : {}, {
            workingDirectory: ".",
            workspaceRoot: ".",
            runtimeScope: "main",
          }),
          denial === "project"
            ? { version: 1, deny: [{ toolName: entry.metadata.name }] }
            : undefined,
        );
        const expected =
          mode === "yolo"
            ? "allow"
            : mode === "auto" || denial !== "none" || (mode === "plan" && operation === "create")
              ? "deny"
              : operation === "list"
                ? "allow"
                : "ask";
        assert.equal(decision.decision, expected, `${operation}/${mode}/${denial}`);
      }
});

test("executor schema/hook/policy/user refusal has no OffPeak effect; admitted idle refusal remains handler-owned", async () => {
  for (const variant of ["schema", "hook", "policy", "user", "idle"]) {
    const f = executorFixture();
    if (variant === "schema") f.call.input = {};
    if (variant === "hook")
      f.behavior.hook = async () => ({ additionalContexts: [], permissionBehavior: "deny" });
    if (variant === "policy") f.behavior.decision = "deny";
    if (variant === "user") {
      f.behavior.decision = "ask";
      f.behavior.reply = { decision: "deny", reason: "example refusal" };
    }
    const result = await f.execute({ offPeakTurn: variant === "idle" || variant === "schema" });
    assert.equal(result.success, false);
    assert.deepEqual(f.direct.calls, []);
    assert.equal(
      result.error?.type,
      variant === "schema" ? CoreErrorType.ToolExecutionFailed : CoreErrorType.PermissionDenied,
    );
    assert.equal(f.observed.inputs.length, variant === "idle" ? 1 : 0);
    assert.equal(
      f.events.some((e) => e.type === SessionEventType.ToolCallStarted),
      variant === "idle",
    );
  }
});

test("executor discriminated failure preserves category/stage/code, failure hook and no Result", async () => {
  const f = executorFixture();
  let thrown: unknown;
  const actualHandler = f.behavior.handler;
  f.behavior.handler = async (input, context) => {
    try {
      return await actualHandler(input, context);
    } catch (error) {
      thrown = error;
      throw error;
    }
  };
  f.direct.behavior.outcome = {
    ok: false,
    failureStage: "ticket_request",
    errorCategory: "quota_3103",
    errorCode: "3103",
  };
  const result = await f.execute();
  assert.equal(result.error?.type, CoreErrorType.ToolExecutionFailed);
  const captured = errorShape(thrown);
  assert.deepEqual(captured.context, {
    toolCallId: "fixture-call",
    toolName: "OffPeakCreate",
    failureStage: "ticket_request",
    errorCategory: "quota_3103",
    errorCode: "3103",
  });
  assert.equal(captured.recoverable, false);
  assert.equal(captured.retryable, false);
  assert.equal(result.error?.message, captured.message);
  assert.equal(Object.hasOwn(result.error!, "context"), false);
  assert.equal(f.direct.calls.length, 1);
  assert.ok(f.timeline.includes(HookEventName.PostToolUseFailure));
  assert.deepEqual(
    f.events.map((e) => e.type),
    [SessionEventType.ToolCallStarted, SessionEventType.ToolCallError],
  );
});

test("pre/pending cancellation stays executor-owned without port retries or cancellation arguments", async () => {
  const before = executorFixture(),
    closed = new AbortController();
  closed.abort();
  assert.equal(
    (await before.execute({ signal: closed.signal })).error?.type,
    CoreErrorType.ToolCancelled,
  );
  assert.deepEqual(before.direct.calls, []);
  const f = executorFixture(),
    entered = gate(),
    reply = gate<Awaited<ReturnType<typeof f.direct.port.create>>>();
  f.direct.port.create = async function (input, context) {
    f.direct.calls.push({
      method: "create",
      receiver: this === f.direct.port,
      args: [input, context],
    });
    entered.resolve();
    return reply.promise;
  };
  const parent = new AbortController(),
    pending = f.execute({ signal: parent.signal });
  await entered.promise;
  parent.abort();
  assert.equal((await pending).error?.type, CoreErrorType.ToolCancelled);
  assert.equal(f.direct.calls.length, 1);
  assert.deepEqual(f.direct.calls[0].args[1], { sessionId: "fixture-session" });
  reply.resolve(f.direct.behavior.outcome as Awaited<ReturnType<typeof f.direct.port.create>>);
});

test("actual SendMessage uses unchanged exported guard, hint and schema-first ordering without any send", async () => {
  const f = direct();
  f.context.offPeakTurn = true;
  await assert.rejects(
    sendMessageToolEntry.handler(
      { to: "example-agent", summary: "Example assignment", message: "Example instructions" },
      f.context,
    ),
    (error: unknown) => {
      const e = errorShape(error);
      assert.equal(e.type, CoreErrorType.PermissionDenied);
      assert.equal(e.recoverable, true);
      assert.equal(e.retryable, false);
      assert.equal(
        e.message,
        "SendMessage is not allowed while running an idle-time task. Spawn a new foreground Agent with the full context instead of resuming a completed one.",
      );
      return true;
    },
  );
  await assert.rejects(
    sendMessageToolEntry.handler({}, f.context),
    (error: Error) => error.name === "ZodError",
  );
  assert.deepEqual(f.calls, []);
});

test("supported core/service idle-turn signals preserve recursive denial and ordinary automation allowance", () => {
  for (const [extra, restricted] of [
    [{ offPeakTaskId: " example-idle " }, true],
    [{ turnTraceContext: { queryId: " offpeak-example:resume:1 " } }, true],
    [{ toolDisallowlist: ["OffPeakCreate"] }, true],
    [{ toolDisallowlist: ["SendMessage", "Workflow"] }, false],
    [
      {
        automationId: "example-automation",
        toolDisallowlist: [...servicePolicy.AUTOMATION_MUTATION_TOOL_NAMES],
      },
      false,
    ],
    [{ offPeakTaskId: " " }, false],
  ] as const)
    assert.equal(
      loopPolicy.isOffPeakCreateRestrictedTurn({ turnTraceContext: {}, ...extra }),
      restricted,
    );
  assert.deepEqual(servicePolicy.mergeOffPeakMutationToolDenylist(["Read", "Read"]), [
    "Read",
    "OffPeakCreate",
  ]);
  assert.equal(
    servicePolicy.mergeAutomationMutationToolDenylist([]).includes("OffPeakCreate"),
    false,
  );
  assert.equal(servicePolicy.mergeOffPeakMutationToolDenylist([]).includes("OffPeakList"), false);
});
