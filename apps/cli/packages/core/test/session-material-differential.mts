// Owned generated corpus; baseline module is built externally from the recorded Git commit.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { api, message, session } from "./session-material-fixture.js";
const baselinePath = process.argv[2];
if (!baselinePath) throw new Error("Pass the baseline material-builder module path");
const before = await import(pathToFileURL(baselinePath).href);
let state = 0x4d41544c;
const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
const digest = createHash("sha256");
const words = [
  "alpha",
  "中文路径",
  "𠀀𠀁测试",
  "test/path-file.ts",
  "AA aa",
  "",
  "one",
  "猫狗猫狗猫",
  "écho",
];
for (let index = 0; index < 1024; index++) {
  const messages = Array.from({ length: next() % 81 }, (_, i) => {
    const word = words[next() % words.length]!;
    const value = message(i, `${word} ` + (i % 5 ? "x" : word).repeat(next() % 3500));
    if (next() % 7 === 0)
      value.parts.push({ ...value.parts[0], id: `extra_${i}`, text: `extra ${word}` } as any);
    return value;
  });
  const input = {
    messages,
    session,
    query: words[next() % words.length]!,
    strategy: index % 2 ? "handoff" : "relevant",
    outputCharBudget: [undefined, 1, 4000, 17000, 48000, 80000, Infinity, NaN][next() % 8],
  };
  const original = JSON.stringify(input);
  const expected = before.buildSessionContextMaterial(input);
  const actual = api.buildSessionContextMaterial(input);
  assert.deepEqual(actual, expected, `generated case ${index}`);
  assert.equal(JSON.stringify(input), original, `input mutation ${index}`);
  digest.update(JSON.stringify(actual));
}
console.log(
  JSON.stringify({
    cases: 1024,
    seed: 0x4d41544c,
    mode: process.env.KNORVIA_SESSION_MATERIAL_TARGET ?? "source",
    digest: digest.digest("hex"),
  }),
);
