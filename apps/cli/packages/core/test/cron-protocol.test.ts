// Actual source/emitted protocol adapter; no real host or automation transport.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { entries, errorShape, valid } from "./cron-fixture.js";
import { observeProtocol, protocolCases, protocolFixture } from "./cron-protocol-fixture.js";
const frozen = JSON.parse(await readFile(new URL("./cron-contract.json", import.meta.url), "utf8"));
test("24 protocol scenarios freeze ownership, fallback, params, error and title behavior", async () => {
  assert.equal(protocolCases.length, frozen.protocol.length);
  for (const [index, variant] of protocolCases.entries())
    assert.deepEqual(await observeProtocol(variant), frozen.protocol[index].observed, variant);
});
test("protocol refusals fail closed without create and fallback is exclusive to method-not-found", async () => {
  for (const variant of ["active", "bound", "binding-error", "legacy-bound", "legacy-failure"]) {
    const result = await observeProtocol(variant);
    assert.ok(result.error);
    assert.ok(!result.calls.some((c: { method: string }) => c.method === "automation/create"));
  }
  for (const code of [-32000, -32600]) {
    const f = protocolFixture();
    f.state.bindingFailure = Object.assign(new Error("Example failure"), { code });
    await assert.rejects(f.port.create(valid.create as never, { sessionId: "example-session" }));
    assert.deepEqual(
      f.calls.map((c) => c.method),
      ["automation/checkTaskBinding"],
    );
  }
});
test("handler automation refusal precedes protocol resolver and performs no host request", async () => {
  const f = protocolFixture();
  for (const operation of ["create", "update", "delete"] as const)
    await assert.rejects(
      entries[operation].handler(valid[operation], {
        toolCallId: "example-call",
        automationTurn: true,
        automationPort: f.port,
      } as never),
      (e) => errorShape(e).type === "permission_denied",
    );
  assert.deepEqual(f.calls, []);
});
test("calendar/relative/carrier parameters preserve host clock/timezone boundary and clearing rules", async () => {
  const calendar = await observeProtocol("calendar"),
    relative = await observeProtocol("relative"),
    carrier = await observeProtocol("carrier"),
    update = await observeProtocol("update-carrier");
  const params = (result: typeof calendar) =>
    result.calls.find(
      (c: { method: string }) =>
        c.method === "automation/create" || c.method === "automation/update",
    ).params;
  assert.equal(params(calendar).cronExpr, "0 9 * * *");
  assert.equal(params(calendar).recurring, true);
  assert.ok(!Object.hasOwn(params(calendar), "relativeDelayMinutes"));
  assert.equal(params(relative).relativeDelayMinutes, 120);
  assert.equal(params(relative).cronExpr, "* * * * *");
  assert.equal(params(relative).recurring, false);
  assert.equal(params(carrier).interval, 40);
  assert.equal(params(carrier).recurring, true);
  assert.ok(!Object.hasOwn(params(carrier), "maxRuns"));
  assert.equal(params(update).maxRuns, null);
  assert.equal(params(update).recurring, true);
  for (const result of [calendar, relative, carrier, update])
    assert.ok(!Object.hasOwn(params(result), "timezone"));
});
