import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  EnterPlanModeInputSchema,
  EnterPlanModeInputJsonSchema,
  EnterPlanModeOutputSchema,
  ExitPlanModeInputSchema,
  ExitPlanModeInputJsonSchema,
  ExitPlanModeOutputSchema,
  PLAN_MODE_MAX_PLAN_CHARS,
  CoreErrorType,
} from "@knorvia/contracts";
import { directCases, getterCases } from "./plan-mode-cases.js";
import {
  clock,
  declaration,
  entryFor,
  fixture,
  inputFor,
  module,
  observe,
  observeReads,
  publicDeclaration,
  validPlan,
} from "./plan-mode-fixture.js";
const frozen = JSON.parse(
  await readFile(new URL("./plan-mode-contract.json", import.meta.url), "utf8"),
);

test("source/strict emitted exports, public declarations, metadata and schemas retain exact contracts", () => {
  assert.deepEqual(Object.keys(module), frozen.exports);
  assert.equal(publicDeclaration, frozen.publicDeclaration);
  assert.deepEqual(
    [declaration(module.enterPlanModeToolEntry), declaration(module.exitPlanModeToolEntry)],
    frozen.declarations,
  );
  for (const [index, embeddedSearchEnabled] of [false, true].entries())
    assert.equal(
      module.createEnterPlanModeToolEntry({ embeddedSearchEnabled }).metadata.description,
      frozen.descriptions[index],
    );
  const enter = module.enterPlanModeToolEntry,
    exit = module.exitPlanModeToolEntry;
  assert.equal(enter.runtimeInputSchema, EnterPlanModeInputSchema);
  assert.equal(exit.runtimeInputSchema, ExitPlanModeInputSchema);
  assert.equal(enter.inputSchema, EnterPlanModeInputJsonSchema);
  assert.equal(exit.inputSchema, ExitPlanModeInputJsonSchema);
  assert.equal(enter.runtimeOutputSchema, EnterPlanModeOutputSchema);
  assert.equal(exit.runtimeOutputSchema, ExitPlanModeOutputSchema);
  assert.equal(enter.metadata.needsApproval, false);
  assert.equal(exit.metadata.needsApproval, true);
  assert.equal(exit.requiresUserInteraction, true);
  assert.equal(exit.permission.needsApproval, true);
  for (const entry of [enter, exit]) {
    assert.equal(entry.resultBudget.maxModelBytes, 100000);
    assert.equal(entry.resultBudget.maxInlineBytes, 100000);
    assert.equal(entry.timeout.defaultMs, 30000);
    assert.equal(entry.metadata.concurrentSafe, false);
  }
});
test("frozen source/strict emitted direct input/admission/persistence/transition/output observations", async () => {
  await clock(async () => {
    for (const [index, c] of directCases.entries())
      assert.deepEqual(await observe(c), frozen.direct[index].observed, c.label);
  });
});
test("frozen getter ordering preserves errors inside and outside persistence suppression", async () => {
  await clock(async () => {
    for (const [index, c] of getterCases.entries())
      assert.deepEqual(
        await observeReads(c.operation, c.fault),
        frozen.getters[index].observed,
        JSON.stringify(c),
      );
  });
});
test("schema parse precedes missing port; malformed input never reads throwing session getter", async () => {
  for (const operation of ["enter", "exit"] as const) {
    const f = fixture({ label: "schema", operation });
    let reads = 0;
    Object.defineProperty(f.context, "sessionModePort", {
      get() {
        reads++;
        throw new Error("Synthetic session getter");
      },
    });
    await assert.rejects(entryFor(operation).handler(null, f.context), { name: "ZodError" });
    assert.equal(reads, 0);
    await assert.rejects(
      entryFor(operation).handler(inputFor({ label: "valid", operation }), f.context),
      { message: "Synthetic session getter" },
    );
    assert.equal(reads, 1);
    const missing = fixture({ label: "missing", operation, missingPort: true });
    await assert.rejects(
      entryFor(operation).handler(inputFor({ label: "valid", operation }), missing.context),
      (error: any) => {
        assert.equal(error.type, CoreErrorType.ConfigurationError);
        assert.equal(error.recoverable, false);
        return true;
      },
    );
  }
});
test("exact plan ceiling is characters; raw text and allowedPrompts survive parse and projection", async () => {
  assert.equal(PLAN_MODE_MAX_PLAN_CHARS, 20000);
  assert.equal(ExitPlanModeInputSchema.safeParse({ plan: "界".repeat(20000) }).success, true);
  assert.equal(ExitPlanModeInputSchema.safeParse({ plan: "界".repeat(20001) }).success, false);
  assert.equal(ExitPlanModeInputSchema.safeParse({ plan: "😀".repeat(10001) }).success, false);
  const f = fixture({ label: "raw" }),
    allowedPrompts = [{ tool: "Bash", prompt: "synthetic tests" }];
  const output = await entryFor("exit").handler(
    { plan: validPlan, allowedPrompts, extra: true },
    f.context,
  );
  assert.equal(output.plan, validPlan);
  assert.deepEqual(output.allowedPrompts, allowedPrompts);
  assert.notEqual(output.allowedPrompts, allowedPrompts);
  assert.equal(Object.hasOwn(output, "extra"), false);
  assert.deepEqual(Object.keys(output), [
    "allowedPrompts",
    "approved",
    "planEnabled",
    "previousPlanEnabled",
    "mode",
    "plan",
    "previousMode",
  ]);
  assert.deepEqual(Object.keys(f.calls.at(-1).request), ["toolCallId", "traceContext"]);
});
test("formatter keeps inherited prose and raw malformed output failures", () => {
  assert.equal(
    entryFor("exit").formatModelContent({ plan: null }),
    "User has approved exiting plan mode. You can now proceed.",
  );
  assert.equal(
    entryFor("exit").formatModelContent({ plan: "  " }),
    "User has approved exiting plan mode. You can now proceed.",
  );
  assert.throws(() => entryFor("exit").formatModelContent({ plan: 0 }), TypeError);
  assert.throws(() => entryFor("enter").formatModelContent(null), TypeError);
  assert.equal(
    entryFor("enter").formatModelContent({}),
    entryFor("enter").formatModelContent({ message: undefined }),
  );
});
