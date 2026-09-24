import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSlashSuggestions } from "../src/slashCommandHelpers.js";

test("a discovered CLI command keeps its slash name visible beside its argument hint", () => {
  assert.deepEqual(
    buildSlashSuggestions([
      { name: "review", description: "Review code", inputHint: "[target]" },
    ]).map(({ label, description, value }) => ({ label, description, value })),
    [{ label: "/review", description: "[target] · Review code", value: "review" }],
  );
});
