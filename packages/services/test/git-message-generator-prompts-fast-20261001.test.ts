import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { messageFixture } from "./git-message-generator-fixture-fast-20261001.js";
import { promptCases } from "./git-message-generator-prompt-cases-fast-20261001.js";
const f = await messageFixture();
const golden = JSON.parse(
  await readFile(
    new URL("./git-message-generator-prompt-golden-fast-20261001.json", import.meta.url),
    "utf8",
  ),
);
assert.equal(golden.baseline, "28d5e79a217f8476e051a8380b8a668221e4c5f0");
assert.equal(
  golden.sourceSha256,
  "f14b38f83fa037d5f5c09dcf08e8cbe21c9d694230ba2f1893db78624e59c487",
);
assert.deepEqual(
  Object.keys(golden.cases),
  promptCases.map((c) => c.name),
);
for (const c of promptCases)
  test(`legacy prompt bytes and start fields: ${c.name}`, async () => {
    f.runtime.locale = c.runtime ?? "en-US";
    f.runtime.error = c.runtimeError ? new Error("owned Intl failure") : undefined;
    const g = f.generator(),
      params = c.params(),
      result = await g.api.generate(params),
      prompt = g.state.requests[0]!.prompt;
    const expected = golden.cases[c.name];
    assert.equal(createHash("sha256").update(prompt).digest("hex"), expected.sha256);
    assert.equal(prompt.length, expected.utf16Length);
    if (expected.prompt) assert.equal(prompt, expected.prompt);
    assert.deepEqual(g.state.logs[0]!.args, [
      undefined,
      "开始生成 Git 提交消息",
      expected.startFields,
    ]);
    assert.deepEqual(result, expected.result);
    assert.deepEqual(g.state.trace, ["lookup", "info", "text"]);
    assert.equal(g.state.requests.length, 1);
    if (params.locale !== undefined) assert.equal(f.runtime.calls, 0);
  });
