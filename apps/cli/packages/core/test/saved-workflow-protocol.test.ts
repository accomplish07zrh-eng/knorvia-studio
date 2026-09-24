import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSavedWorkflow,
  serializeSavedWorkflow,
} from "../src/tool/handlers/saved-workflows/frontmatter.js";

test("new saved workflows use Knorvia metadata and old files still parse", () => {
  const script = 'console.log("ready")\n';
  const saved = serializeSavedWorkflow({ description: "Demo" }, script);
  assert.ok(saved.startsWith("/* knorvia-workflow\n"));
  const current = parseSavedWorkflow(saved);
  assert.equal(current.ok, true);
  if (current.ok) assert.equal(current.script, script);

  const legacy = parseSavedWorkflow(saved.replace("/* knorvia-workflow", "/* zcode-workflow"));
  assert.equal(legacy.ok, true);
  if (legacy.ok) assert.equal(legacy.script, script);
});
