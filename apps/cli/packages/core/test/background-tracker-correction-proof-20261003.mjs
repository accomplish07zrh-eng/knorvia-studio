import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fixture, repo, hash, flush, deferred } from "./background-tracker-fixture-20261003.mjs";
const mode = process.argv[2];
assert.ok(["baseline", "initial-draft", "current"].includes(mode));
let make = fixture;
if (mode === "initial-draft") {
  const b = await readFile(
    path.join(repo, "docs/evidence/background-tracker-draft-20261003/initial-artifacts.json"),
  );
  assert.equal(hash(b), "e5f91b7e318a9dcce47b51c6985dfa4cf3d74b967bbdea14f33431e19a8b2a28");
  const rows = JSON.parse(b).files;
  const overrides = [];
  for (const [logical, row] of Object.entries(rows)) {
    for (const entry of Object.values(row))
      assert.equal(hash(await readFile(path.join(repo, entry.path))), entry.sha256);
    overrides.push([
      logical.replace(/\.ts$/u, ".js"),
      (await readFile(path.join(repo, row.compiled.path))).toString(),
    ]);
  }
  let source = await readFile(
    path.join(repo, "apps/cli/packages/core/test/background-tracker-fixture-20261003.mjs"),
    "utf8",
  );
  assert.equal(
    hash(
      source.replace(
        "e3a8f212f9a30970acdffbefb1f7198c859fb698da87a689ed3fd57f222b1453",
        "CURRENT_PIN",
      ),
    ),
    "c5aca34f46d64350e761bb521aa2aab9e535d5fa7f9af3de2dc70b4ce33041c8",
  );
  source = source.replace(
    'export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");',
    `export const repo = ${JSON.stringify(repo)};`,
  );
  source = source.replace(
    '  if (mode === "current") {',
    `  for (const [logical, text] of ${JSON.stringify(overrides)}) texts.set(logical, text);\n  if (mode === "current") {`,
  );
  make = (await import("data:text/javascript;base64," + Buffer.from(source).toString("base64")))
    .fixture;
}
const load = () => make(mode === "current" ? "current" : "baseline");
const observations = [];
function marks(order, n = 1) {
  Promise.resolve().then(() => {
    order.push(`tick${n}`);
    if (n < 6) marks(order, n + 1);
  });
}
{
  const f = await load(),
    order = [],
    wait = deferred();
  f.deps.executionPort = {
    waitForBackgroundTask() {
      order.push("wait");
      return wait.promise;
    },
  };
  const p = f.tracking();
  p.then(() => order.push("track.complete"));
  marks(order);
  await p;
  await flush();
  observations.push({ name: "no-snapshot waiter native admission", order });
}
{
  const f = await load(),
    order = [],
    error = { owned: "payload failure" };
  f.deps.runtimeTaskRegistry = undefined;
  const launch = { ...f.launch };
  Object.defineProperty(launch, "childSessionId", {
    get() {
      order.push("payload.read");
      throw error;
    },
  });
  const p = f.tracking(f.tool(), launch);
  p.catch((e) => {
    assert.equal(e, error);
    order.push("track.reject");
  });
  marks(order);
  await assert.rejects(p, (e) => e === error);
  await flush();
  observations.push({
    name: "payload error remains before event native boundary",
    order,
    events: f.events.length,
  });
}
{
  const f = await load();
  f.deps.executionPort = {
    getBackgroundTask() {
      return Promise.resolve({
        taskId: "owned-task",
        status: "cancelled",
        runStatus: "stopped",
        stopReason: "superseded",
        startedAt: new f.Clock(),
      });
    },
  };
  await f.tracking();
  observations.push({
    name: "existing supersession admission has no new tool-name gate",
    notifications: f.notifications.length,
    claimed: f.records.get("owned-task").notified,
  });
}
{
  const f = await load();
  f.deps.dynamicWorkflowRunPort = {
    getTask() {
      return Promise.resolve({
        taskId: "owned-task",
        runId: "owned-task",
        status: "completed",
        startedAt: new f.Clock(),
        output: { name: "Owned result label" },
      });
    },
  };
  await f.tracking(f.tool("ResumeWorkflowRun", { run_id: "owned-task" }), {
    ...f.launch,
    name: "Owned launch label",
  });
  observations.push({
    name: "event/text/origin have separate output read phases",
    eventDescriptions: f.events.map((e) => e.payload.description),
    originTitle: f.notifications[0].originMeta.title,
    textUsesResultLabel: f.notifications[0].text.includes("Owned result label"),
    eventKeys: Object.keys(f.events[0]),
    payloadKeys: Object.keys(f.events[0].payload),
    explicitUndefined:
      Object.hasOwn(f.events[0].payload, "stderrBytes") &&
      f.events[0].payload.stderrBytes === undefined,
  });
}
const golden =
  "apps/cli/packages/core/test/background-tracker-correction-observations-20261003.json";
console.log(JSON.stringify({ mode, observations }, null, 2));
if (mode === "baseline")
  await writeFile(path.join(repo, golden), JSON.stringify(observations, null, 2) + "\n");
else {
  const b = await readFile(path.join(repo, golden));
  assert.equal(hash(b), "1bae1db93bb1d52fb81be2e73260ca5e59cb477a09aac65e5b1491812a2af6c8");
  assert.deepEqual(observations, JSON.parse(b));
}
console.log(
  JSON.stringify({ mode, groups: 1, targetedComparisons: 4, liveTasksProcessesProvidersGrants: 0 }),
);
