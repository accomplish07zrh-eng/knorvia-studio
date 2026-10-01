import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { api, corpus, materialUrl, message, session } from "./session-material-fixture.js";
const frozen = JSON.parse(
  await readFile(new URL("./session-material-contract.json", import.meta.url), "utf8"),
);
test("material builder imports the explicit source or actual emitted target", () => {
  assert.ok(
    materialUrl.endsWith(
      process.env.KNORVIA_SESSION_MATERIAL_TARGET === "dist"
        ? "/dist/session-context/read-session-context.js"
        : "/src/session-context/read-session-context.ts",
    ),
  );
  assert.equal(frozen.baseline, "20d6ca5987f5bcb8cb1caacbcac759b25b9eb452");
});
test("420 frozen public-builder observations preserve all strings, scores, references and budgets", () => {
  const scenarios = corpus();
  assert.equal(scenarios.length, 420);
  assert.equal(frozen.cases.length, scenarios.length);
  for (const [index, input] of scenarios.entries()) {
    const before = JSON.stringify(input);
    const output = api.buildSessionContextMaterial({ ...input, session });
    const digest = createHash("sha256").update(JSON.stringify(output)).digest("hex");
    assert.deepEqual({ label: input.label, digest }, frozen.cases[index]);
    assert.equal(JSON.stringify(input), before);
  }
});
test("part filtering and duplicate replacement retain only readable owned content", () => {
  const hidden = message(0, "hidden", { visibility: "model-only" });
  const ignored = message(1, "ignored");
  Object.assign(ignored.parts[0], { ignored: true });
  const synthetic = message(2, "excluded-synthetic-text");
  Object.assign(synthetic.parts[0], { synthetic: true, metadata: { source: "diagnostics" } });
  const duplicate = message(3, "first");
  duplicate.parts.push({ ...duplicate.parts[0], text: "last owned" } as any);
  const reminder = message(4, "<system-reminder>owned excluded</system-reminder>");
  const result = api.buildSessionContextMaterial({
    session,
    messages: [hidden, ignored, synthetic, duplicate, reminder],
    query: "owned",
    strategy: "relevant",
  });
  assert.equal(result.messageCount, 5);
  assert.equal(result.readableMessageCount, 1);
  assert.match(result.allContent, /last owned/);
  assert.doesNotMatch(
    result.allContent,
    /first|hidden|ignored|excluded-synthetic-text|owned excluded/,
  );
  assert.deepEqual(result.references, [{ messageId: "msg_3", index: 3, role: "user" }]);
});
test("public model output and missing-session projection remain frozen", () => {
  const missing = api.formatLocalSessionNotFound({
    sessionId: "sess_owned",
    query: "owned",
    strategy: "handoff",
  });
  assert.equal(
    api.formatReadSessionContextModelContent(missing),
    "Session sess_owned was not found.",
  );
  assert.equal(
    api.formatReadSessionContextModelContent({
      status: "failed",
      sessionId: "sess_owned",
      error: "owned failure",
      content: "details",
    }),
    "ReadSessionContext failed for sess_owned.\nError: owned failure\ndetails",
  );
  assert.equal(
    api.formatReadSessionContextModelContent({
      status: "success",
      sessionId: "sess_owned",
      source: "local",
      title: "Owned",
      truncated: true,
      content: "body",
    }),
    "ReadSessionContext returned local context for sess_owned.\nTitle: Owned\nThe returned context is truncated.\nbody",
  );
});
