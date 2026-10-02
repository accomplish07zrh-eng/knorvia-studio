import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(core, "../../../..");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const baselinePins = {
  "target-completion-verification":
    "c227322002b6fad2216d0dc0206cdd2bf696fcc7884376882a598769b6ae0c15",
  "turn-loop": "0f9db0bebec69371924e4e92051ca5dd116bcb97edc747337964af664388fc33",
  "turn-model": "87a0c21e4c1dc01d7b31b8221c3618e243710d92050b3577faf34375040e8166",
  "plugin-reference": "0fa78fd2d6244c93ec2d85eb87356f9fd2f40cf37ad25e45577aefde04d989e2",
  "session-shell-environment": "6b605aea5dd3599ba14a960daca970bd1bd97b9d64c0d8fc1f3f14b679c41ac8",
};
const mode = process.argv[2];
assert.ok(
  ["baseline", "current", "sealed-draft"].includes(mode),
  "explicit exact artifact mode required",
);
const dir = await mkdtemp(path.join(tmpdir(), "knorvia-goal-stop-five-synthetic-"));
const modules = {};
const artifacts = {};
if (mode === "baseline") {
  for (const [name, pin] of Object.entries(baselinePins)) {
    const bytes = await readFile(path.join(core, "test", `runtime-${name}-baseline-20261003.json`));
    assert.equal(sha(bytes), pin, `${name} immutable oracle`);
    const data = JSON.parse(bytes).files[name];
    for (const kind of ["source", "compiled", "declaration"])
      assert.equal(sha(data[kind]), data[`${kind}Sha256`]);
    artifacts[name] = data.compiled;
  }
} else if (mode === "sealed-draft") {
  const bytes = await readFile(process.argv[3]);
  assert.equal(sha(bytes), "4274767365140838cc4f71c66098af78c35b78dfb51510490d8d630514395a26");
  artifacts["target-completion-verification"] = bytes.toString();
} else {
  const pin = "068ad60277e61ebf114ff7322b66008a237df5adcff49d78c295e2b6ac6c4d29";
  const bytes = await readFile(
    path.join(repo, "docs/evidence/knorvia-runtime-preparation-five-current-20261003.json"),
  );
  assert.equal(sha(bytes), pin, "strict current manifest; never fallback to historical code");
  const manifest = JSON.parse(bytes);
  for (const [name, files] of Object.entries(manifest.files)) {
    for (const [kind, entry] of Object.entries(files)) {
      const data = await readFile(path.join(repo, entry.path));
      assert.equal(sha(data), entry.sha256, `${name} ${kind} exact current artifact`);
      if (kind === "compiled") artifacts[name] = data.toString();
    }
  }
}
const fakePlugin = path.join(dir, "fake-plugin.mjs"),
  fakeProjection = path.join(dir, "fake-projection.mjs"),
  fakeUsage = path.join(dir, "fake-usage.mjs");
await writeFile(
  fakePlugin,
  'export function extractPluginReferences(){return {references:[{id:"owned"}],invalidCount:0,truncatedCount:0}};export function buildPluginReferenceReminderBody(){return {body:"Owned reminder",diagnostics:{mcpServerCount:0,resolvedPluginIds:["owned"],skillCount:0,subagentCount:0,skipped:[],truncated:false}}}',
);
await writeFile(
  fakeProjection,
  "export * from " +
    JSON.stringify(pathToFileURL(path.join(core, "src/runtime/helpers/index.js")).href) +
    ";export function buildRuntimeProviderRequestMessages(){return {messages:[],sourceEntries:[],diagnostics:{latestRealUserMessageIndex:-1}}}",
);
await writeFile(fakeUsage, "export async function recordModelUsageFact(){}");
for (const [name, bytes] of Object.entries(artifacts)) {
  // Only import locations are rebound; emitted function syntax stays intact.
  const packageBound = bytes.replaceAll(
    '"@knorvia/contracts"',
    JSON.stringify(pathToFileURL(path.join(core, "../contracts/dist/index.js")).href),
  );
  const rebound = packageBound.replace(
    /(from\s+|import\s+)(["'])(\.[^"']+)\2/g,
    (whole, prefix, quote, specifier) => {
      const absolute = path.resolve(core, "src/runtime/methods", specifier);
      if (
        name === "plugin-reference" &&
        absolute === path.join(core, "src/plugin-reference/index.js")
      )
        return prefix + quote + pathToFileURL(fakePlugin).href + quote;
      if (
        name === "target-completion-verification" &&
        absolute === path.join(core, "src/runtime/helpers/index.js")
      )
        return prefix + quote + pathToFileURL(fakeProjection).href + quote;
      if (
        name === "target-completion-verification" &&
        absolute === path.join(core, "src/runtime/methods/usage-observability.js")
      )
        return prefix + quote + pathToFileURL(fakeUsage).href + quote;
      const selected = path.basename(absolute, ".js");
      const local =
        absolute === path.join(core, "src/runtime/methods", `${selected}.js`) &&
        selected in artifacts;
      return (
        prefix +
        quote +
        pathToFileURL(local ? path.join(dir, `${selected}.mjs`) : absolute).href +
        quote
      );
    },
  );
  await writeFile(path.join(dir, `${name}.mjs`), rebound);
}
for (const name of Object.keys(artifacts))
  modules[name] = await import(pathToFileURL(path.join(dir, `${name}.mjs`)).href);
const trace = { traceId: "owned-trace", spanId: "owned-span" },
  failure = new Error("Owned first publication rejection");
const target = {
    targetID: "owned-goal",
    status: "active",
    objective: "Owned goal",
    sessionID: "owned-session",
    summaryTitle: null,
    tokenBudget: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    time: { created: 0, updated: 0 },
  },
  model = {
    providerId: "owned-provider",
    modelId: "owned-model",
    options: {},
    optionSpecs: {},
    properties: {},
  };
const scope = {
  run(fn) {
    return fn();
  },
  finishFailed() {},
  finishCancelled() {},
  finishCompleted() {},
  setResultType() {},
};
let observed;
const runtime = {
  config: {},
  sessionStore: {},
  sessionId: "owned-session",
  agentTelemetry: {
    detached() {
      return scope;
    },
  },
  getSessionModelSelection() {
    return { providerId: model.providerId, modelId: model.modelId };
  },
  modelFactory() {
    return model;
  },
  async rebuildProjection() {
    target.targetID = "changed-owned-goal";
    return {
      targetCompletionVerificationTimeline: [
        { targetId: "owned-goal", goalIteration: 4 },
        { targetId: "changed-owned-goal", goalIteration: 9 },
      ],
    };
  },
  createEvent(type, payload) {
    return { type, payload };
  },
  async appendEvent(event) {
    observed = event.payload;
    throw failure;
  },
};
await assert.rejects(
  modules["target-completion-verification"].verifyActiveTargetCompletionForContinuation.call(
    runtime,
    { target, traceContext: trace },
  ),
  (error) => error === failure,
);
assert.equal(
  observed.goalIteration,
  5,
  "iteration matching uses the target ID captured before projection await",
);
assert.equal(
  observed.targetId,
  "changed-owned-goal",
  "event target field remains a live read after projection",
);
console.log(
  JSON.stringify({
    mode,
    groups: 1,
    observation:
      "captured iteration target versus live publication target;first append rejection before model request",
    overlap:
      "verifier lifecycle owner also in3group safety fixture;not additional broad consumer coverage",
  }),
);
