import assert from "node:assert/strict";
import test from "node:test";
import { kernelRailOptions } from "../src/studio/agents/kernelRailOptions.js";
import { studioSelectableKernelOptions, type StudioKernelOption } from "../src/studio/types.js";

const options: StudioKernelOption[] = [
  "knorvia",
  "codex",
  "claude-code",
  "grok-build",
  "qoder-cn",
  "acp:custom",
].map((id) => ({
  id: id as StudioKernelOption["id"],
  name: id,
  vendor: "",
  builtin: id === "knorvia",
}));

test("shortcuts retain built-in and current custom kernel within four slots", () => {
  const result = kernelRailOptions(options, "acp:custom");
  assert.equal(result.length, 4);
  assert.equal(result[0]?.id, "knorvia");
  assert.ok(result.some((option) => option.id === "acp:custom"));
  assert.equal(new Set(result.map((option) => option.id)).size, result.length);
  assert.equal(options.length, 6);
});

test("current remote kernel survives absent discovery without claiming availability", () => {
  const id = "ssh:0123456789abcdef01234567:codex" as const;
  const result = kernelRailOptions(studioSelectableKernelOptions([], [id]), id);
  assert.deepEqual(
    result.map((option) => option.id),
    ["knorvia", id],
  );
  assert.equal(result[1]?.builtin, false);
});

test("empty and short catalogues remain bounded without invented shortcuts", () => {
  assert.deepEqual(kernelRailOptions([], "knorvia"), []);
  assert.deepEqual(kernelRailOptions(options.slice(0, 2), "codex"), options.slice(0, 2));
});
