import assert from "node:assert/strict";
import { test } from "node:test";
import { protocolCase } from "./external-state-rebuild.fixture.js";
import { safeDetail } from "../src/studio-runtime/domain/kernelPolicy.js";

for (const kind of ["codex", "grok", "claude"] as const) {
  test(`${kind}: real stdio preserves option descriptions and legacy strings`, async () => {
    const c = await protocolCase(kind, "question");
    assert.equal(c.result.status, "succeeded");
    assert.deepEqual(c.interactions[0]?.questions?.[0].options, [
      { label: "Blue", description: "Use the blue option, preserving its explanation" },
      "Legacy",
    ]);
    assert.ok(JSON.stringify(c.wire).includes("Blue"));
  });
}
for (const kind of ["codex", "grok", "acp", "claude"] as const) {
  test(`${kind}: approval retains cwd, reason and context`, async () => {
    const c = await protocolCase(kind, "approval");
    assert.equal(c.result.status, "succeeded");
    const detail = c.interactions[0]?.detail ?? "";
    assert.match(detail, /\/fixture\/project/);
    assert.match(detail, /Needs review/);
    assert.match(detail, /context/);
    assert.doesNotMatch(detail, /dummy-secret/);
  });
}
for (const kind of ["acp", "grok"] as const) {
  test(`${kind}: sparse tool changes preserve fields and distinguish native content`, async () => {
    const c = await protocolCase(kind, "sparse");
    const last = c.events.filter((e) => e.type === "tool").at(-1);
    assert.equal(last?.name, "Read fixture");
    assert.equal(last?.input, '{"path":"file"}');
    assert.equal(last?.output, '{"value":"raw"}');
    assert.equal(last?.state, "unknown");
    assert.equal((last as unknown as { statusDetail: string }).statusDetail, "vendor_pending");
    assert.match((last as unknown as { content: string }).content, /"type":"text","text":"typed"/);
  });
}
test("Codex unknown native tool state is not success", async () => {
  const c = await protocolCase("codex", "tool-unknown");
  assert.equal(c.events.find((e) => e.type === "tool")?.state, "unknown");
});
test("Codex stale approval and withdrawal cannot reuse a current request ID", async () => {
  const c = await protocolCase("codex", "same-id-old");
  assert.equal(c.result.status, "succeeded");
  assert.equal(c.interactions.length, 1);
  assert.equal(
    c.wire.filter((m) => m.id === "approval" && m.result?.decision === "accept").length,
    1,
  );
  assert.equal(c.wire.filter((m) => m.id === "approval" && m.error).length, 1);
});
test("Codex legacy turn-less item events remain supported", async () => {
  const c = await protocolCase("codex", "legacy");
  assert.equal(c.result.text, "legacy current answer");
  assert.ok(c.events.some((e) => e.type === "usage" && e.inputTokens === 17));
});
test("Codex terminal in the startup ACK batch does not send an interrupt after success", async () => {
  const c = await protocolCase("codex", "ack-terminal");
  assert.equal(c.result.status, "succeeded");
  assert.equal(c.wire.filter((m) => m.method === "turn/interrupt").length, 0);
});
test("Claude unconfirmed stream proposal settles before the final run result", async () => {
  const c = await protocolCase("claude", "discarded");
  const discarded = c.events.filter((e) => e.type === "tool" && e.id === "discarded");
  assert.equal(discarded.at(-1)?.state, "unknown");
  assert.match(
    (discarded.at(-1) as unknown as { statusDetail: string }).statusDetail,
    /Unconfirmed tool proposal/,
  );
  const settled = c.events.findIndex(
    (e) => e.type === "tool" && e.id === "discarded" && e.state === "unknown",
  );
  const nextTool = c.events.findIndex((e) => e.type === "tool" && e.id === "tool");
  assert.ok(settled >= 0 && settled < nextTool);
});
for (const kind of ["acp", "grok"] as const) {
  test(`${kind}: explicit empty fields replace prior values`, async () => {
    const c = await protocolCase(kind, "explicit-empty");
    const last = c.events.filter((e) => e.type === "tool").at(-1)!;
    assert.equal(last.input, '{"path":"file"}');
    assert.equal(last.output, "");
    assert.equal((last as unknown as { content: string }).content, "[]");
  });
}
test("truncation is explicit after redaction", () => {
  const detail = safeDetail({ reason: "x".repeat(30000), authorization: "dummy-secret" });
  assert.match(detail, /truncated/);
  assert.doesNotMatch(detail, /dummy-secret/);
});
test("long approval input cannot push cwd and reason behind the truncation boundary", async () => {
  const c = await protocolCase("codex", "approval-long");
  assert.equal(c.result.status, "succeeded");
  assert.match(c.interactions[0].detail ?? "", /truncated/);
  assert.match(c.interactions[0].detail ?? "", /Needs review/);
  assert.match(c.interactions[0].detail ?? "", /\/fixture\/project/);
});
for (const scenario of [
  "stale-delta",
  "stale-tool",
  "stale-terminal",
  "stale-approval",
  "conflict-started",
  "before-ack",
  "thread-fence",
] as const) {
  test(`Codex current turn fence: ${scenario}`, async () => {
    const c = await protocolCase("codex", scenario);
    assert.equal(c.result.status, "succeeded");
    assert.equal(
      c.result.text,
      scenario === "before-ack" ? "early current answer" : "current answer",
    );
    assert.equal(c.events.filter((e) => e.type === "tool").length, 0);
    assert.equal(c.interactions.length, 0);
    assert.ok(c.events.some((e) => e.type === "usage" && e.inputTokens === 7));
  });
}
for (const scenario of ["buffer-count", "buffer-bytes", "missing-id"] as const) {
  test(`Codex unbound dispatch fails closed: ${scenario}`, async () => {
    const c = await protocolCase("codex", scenario);
    assert.equal(c.result.status, "interrupted");
    assert.equal(c.result.resultKnown, false);
    assert.equal(c.result.text, "");
    assert.equal(c.interactions.length, 0);
  });
}
for (const kind of ["codex", "claude"] as const) {
  test(`${kind}: withdrawal before slow flush cannot open an approval`, async () => {
    const c = await protocolCase(kind, "withdraw");
    assert.equal(c.interactions.length, 0);
  });
}
for (const [scenario, status, toolState] of [
  ["eof-complete", "succeeded", "succeeded"],
  ["eof-failure", "interrupted", "interrupted"],
  ["unresolved", "succeeded", "unknown"],
  ["failed-unresolved", "failed", "unknown"],
  ["cancel", "cancelled", "cancelled"],
] as const) {
  test(`Claude lifecycle, including drained sink: ${scenario}`, async () => {
    const c = await protocolCase("claude", scenario);
    assert.equal(c.result.status, status);
    assert.equal(c.events.filter((e) => e.type === "tool").at(-1)?.state, toolState);
    if (scenario === "eof-failure") assert.equal(c.result.resultKnown, false);
  });
}
