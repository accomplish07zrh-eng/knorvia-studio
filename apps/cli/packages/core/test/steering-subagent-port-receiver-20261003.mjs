import assert from "node:assert/strict";
import { fixture, load } from "./steering-subagent-fixture-20261003.mjs";
const mode = process.argv[2],
  f = fixture(),
  r = await load(mode, f);
r.skillPort = {
  async discoverSkills() {
    return { skills: [], totalDiscovered: 0 };
  },
};
r.createDefaultSubagentPort(f.deps);
await f.exploreOptions.runExploreAgent(f.request);
const discover = f.children[0].deps.skillPort.discoverSkills;
const proof = () =>
  assert.rejects(
    discover({ workingDirectory: "owned-cwd" }),
    (error) => error.name === "TypeError",
  );
if (mode === "rejectedDraft") {
  await assert.rejects(proof, assert.AssertionError);
  console.log(JSON.stringify({ mode, detachedSkillReceiverRegression: true, realOperations: 0 }));
} else {
  await proof();
  console.log(JSON.stringify({ mode, detachedSkillReceiverPreserved: true, realOperations: 0 }));
}
