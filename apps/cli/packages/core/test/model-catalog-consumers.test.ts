// Exercise the existing consumers; no real registry, workflow run or user file.
import assert from "node:assert/strict";
import test from "node:test";
import { CoreErrorType, HookEventName, SessionEventType } from "@knorvia/contracts";
import { eventPayload } from "./tool-invocation-fixture.js";
import {
  amendSource,
  catalogExecutor,
  catalogFixture,
  createSource,
  frozen,
  handlers,
  permissionModule,
} from "./model-catalog-fixture.js";

test("real executor preserves ListModels input, port, model text, lifecycle and trace boundaries", async () => {
  const f = catalogExecutor(frozen.catalogs.basic);
  f.deps.traceContext = { traceId: "example-model-catalog-trace" };
  const result = await f.execute();
  assert.equal(result.success, true);
  assert.deepEqual(result.output, frozen.listCases[1].output);
  assert.equal(result.modelContent, frozen.listCases[1].modelContent);
  assert.deepEqual(f.direct.calls, [[]]);
  assert.deepEqual(f.timeline, [
    HookEventName.PreToolUse,
    "permission",
    SessionEventType.ToolCallStarted,
    "handler",
    HookEventName.PostToolUse,
    SessionEventType.ToolCallResult,
    "background",
  ]);
  assert.equal(f.observed.contexts[0].traceId, "example-model-catalog-trace");
  assert.deepEqual(f.observed.inputs, [{}]);
  assert.equal(result.serialization!.budgetStrategy, "truncate");
  const eventResult = eventPayload(f.events.at(-1)!).result as {
    content: string;
    display: { kind: string; current: string; models: unknown[] };
  };
  assert.equal(eventResult.content, result.serialization!.content);
  assert.deepEqual(eventResult.display, {
    kind: "list_models",
    ...(frozen.listCases[1].output as object),
  });
  assert.equal(f.events.at(-1)!.traceId, "example-model-catalog-trace");
});

test("malformed ListModels inputs and policy/user/hook refusal never read the catalog", async () => {
  for (const kind of ["schema", "policy", "user", "hook"] as const) {
    const f = catalogExecutor();
    if (kind === "schema") f.call.input = { query: "m" };
    if (kind === "policy") f.behavior.decision = "deny";
    if (kind === "user") {
      f.behavior.decision = "ask";
      f.behavior.reply = { decision: "deny", reason: "example denial" };
    }
    if (kind === "hook")
      f.behavior.hook = async () => ({ additionalContexts: [], permissionBehavior: "deny" });
    const result = await f.execute();
    assert.equal(result.success, false);
    assert.equal(
      result.error!.type,
      kind === "schema" ? CoreErrorType.ToolExecutionFailed : CoreErrorType.PermissionDenied,
    );
    assert.deepEqual(f.direct.calls, []);
    assert.equal(f.timeline.includes("handler"), false);
  }
});

test("missing catalog retains business error code and model-facing capability message", async () => {
  const f = catalogExecutor();
  f.deps.modelCatalogPort = undefined;
  const result = await f.execute();
  assert.equal(result.success, false);
  assert.equal(result.error!.type, CoreErrorType.ToolExecutionFailed);
  assert.equal(result.error!.code, "31");
  assert.equal(result.error!.message, (frozen.missingPort as { message: string }).message);
  assert.equal(
    result.modelContent,
    `<tool_use_error>${(frozen.missingPort as { message: string }).message}</tool_use_error>`,
  );
  assert.deepEqual(f.direct.calls, []);
  assert.deepEqual(
    f.events.map((event) => event.type),
    [SessionEventType.ToolCallStarted, SessionEventType.ToolCallError],
  );
});

test("ListModels keeps actual permission-service mode rules without changing the session model", async () => {
  for (const mode of ["build", "plan", "auto", "yolo"] as const) {
    const f = catalogExecutor(frozen.catalogs.basic);
    f.deps.getMode = () => mode;
    f.deps.permissionService = new permissionModule.PermissionService();
    const result = await f.execute();
    assert.equal(result.success, mode !== "auto");
    assert.equal(f.direct.calls.length, mode === "auto" ? 0 : 1);
    assert.equal(f.timeline.includes("broker"), false);
    assert.equal(f.deps.model, undefined);
  }
});

test("CreateWorkflow consumer resolves canonical spelling before file access or approval", async () => {
  const catalog = catalogFixture(frozen.catalogs.basic);
  const resolved = await createSource.resolveCreateWorkflowInput(
    { script: "export default {};", subagent_model: " alpha/reasoner$HIGH " },
    "/example/workspace",
    undefined,
    catalog.port,
  );
  assert.ok(resolved.result);
  assert.equal(
    (resolved.input as { subagent_model: string }).subagent_model,
    "Alpha/Reasoner$HiGH",
  );
  assert.deepEqual(catalog.calls, [[]]);
  const tool = handlers.builtInTools.find(
    (entry: { metadata: { name: string } }) => entry.metadata.name === "CreateWorkflow",
  );
  const failure = await tool.resolveInput(
    { path: "/example/must-not-read.dwf.ts", subagent_model: "unconfigured" },
    { workingDirectory: "/example/workspace", modelCatalogPort: catalog.port },
  );
  assert.equal(failure.result, false);
  assert.equal(failure.errorCode, 400);
  assert.ok(failure.message.startsWith("No configured model matches `unconfigured`."));
  assert.equal(failure.message.includes("must-not-read"), false);
  const missing = await createSource.resolveCreateWorkflowInput(
    { script: "export default {};", subagent_model: "Alpha/Reasoner" },
    "/example/workspace",
  );
  assert.deepEqual(missing, {
    result: false,
    errorCode: 400,
    message: createSource.SUBAGENT_MODEL_UNAVAILABLE,
  });
});

test("AmendWorkflow consumer retains string/null/omitted and inherited catalog-missing choices", async () => {
  const f = catalogFixture(frozen.catalogs.basic);
  assert.deepEqual(amendSource.resolveAmendSubagentModelChoice(null, "Alpha/Reasoner", f.port), {
    ok: true,
  });
  assert.deepEqual(f.calls, []);
  assert.deepEqual(amendSource.resolveAmendSubagentModelChoice(undefined, undefined, f.port), {
    ok: true,
  });
  assert.deepEqual(
    amendSource.resolveAmendSubagentModelChoice(undefined, " raw/kept ", undefined),
    { ok: true, canonical: " raw/kept " },
  );
  assert.deepEqual(
    amendSource.resolveAmendSubagentModelChoice("Alpha/Reasoner", undefined, undefined),
    {
      ok: false,
      inherited: false,
      text: "Alpha/Reasoner",
      message: createSource.SUBAGENT_MODEL_UNAVAILABLE,
    },
  );
  assert.deepEqual(
    amendSource.resolveAmendSubagentModelChoice(undefined, "alpha/reasoner$HIGH", f.port),
    { ok: true, canonical: "Alpha/Reasoner$HiGH" },
  );
  const invalid = amendSource.resolveAmendSubagentModelChoice(undefined, "old/model", f.port);
  assert.ok(!invalid.ok && invalid.inherited);
  assert.equal(invalid.text, "old/model");
  assert.ok(invalid.message.startsWith("No configured model matches `old/model`."));
  const tool = handlers.builtInTools.find(
    (entry: { metadata: { name: string } }) => entry.metadata.name === "AmendWorkflow",
  );
  const resolved = await tool.resolveInput(
    { run_id: "example-run", script: "export default {};", subagent_model: "alpha/reasoner$HIGH" },
    { workingDirectory: "/example/workspace", modelCatalogPort: f.port },
  );
  assert.ok(resolved.result);
  assert.equal(resolved.input.subagent_model, "Alpha/Reasoner$HiGH");
});

test("workflow catalog consumer failures preserve the original adapter error", async () => {
  const f = catalogFixture();
  const failure = new Error("example catalog adapter failure");
  f.state.read = () => {
    throw failure;
  };
  await assert.rejects(
    createSource.resolveCreateWorkflowInput(
      { script: "export default {};", subagent_model: "p/m" },
      "/example/workspace",
      undefined,
      f.port,
    ),
    (error) => error === failure,
  );
  assert.throws(
    () => amendSource.resolveAmendSubagentModelChoice("p/m", undefined, f.port),
    (error) => error === failure,
  );
});
