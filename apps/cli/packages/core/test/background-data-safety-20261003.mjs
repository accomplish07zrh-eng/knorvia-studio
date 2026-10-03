import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  mode = process.argv[2];
assert.ok(["baseline", "current"].includes(mode));
const old = await readFile(
  path.join(repo, "apps/cli/packages/core/test/background-data-baseline-20261003.json"),
);
assert.equal(sha(old), "762a9cacea06751e0f34ccd997f57bab6c6040576519cd66e9996d4fb62d0229");
const baseline = JSON.parse(old),
  files = new Map();
for (const row of Object.values(baseline.files)) {
  for (const key of ["compiled", "declaration"]) assert.equal(sha(row[key]), row[key + "Sha256"]);
  if (row.source) assert.equal(sha(row.source), row.sourceSha256);
  else assert.equal(sha(await readFile(path.join(repo, row.logicalPath))), row.sourceSha256);
  files.set(row.logicalPath.replace(/\.ts$/u, ".js"), row.compiled);
}
if (mode === "current") {
  const b = await readFile(
    path.join(repo, "docs/evidence/knorvia-background-data-current-20261003.json"),
  );
  assert.equal(sha(b), "5abaeeb926d865401fc122a4ac86067850faea180afe46a7e7ad2ecb3e8663bc");
  for (const [logical, row] of Object.entries(JSON.parse(b).files)) {
    for (const e of Object.values(row))
      assert.equal(sha(await readFile(path.join(repo, e.path))), e.sha256);
    files.set(
      logical.replace(/\.ts$/u, ".js"),
      (await readFile(path.join(repo, row.compiled.path))).toString(),
    );
  }
}
const context = vm.createContext({}),
  trace = [],
  notifications = [],
  serializeCalls = [];
let failSerialization;
const serializer = (item) => {
  serializeCalls.push(item);
  if (item === failSerialization && failSerialization !== undefined) throw ownedSerializeError;
  return typeof item === "string" ? item : item === undefined ? undefined : JSON.stringify(item);
};
const ownedSerializeError = Error("Owned rejected report serialization");
const synthetic = (object) =>
  new vm.SyntheticModule(
    Object.keys(object),
    function () {
      for (const [k, v] of Object.entries(object)) this.setExport(k, v);
    },
    { context },
  );
const registry = {
  isDynamicWorkflowRunDispatchToolName: (n) => n === "CreateWorkflow",
  claimRuntimeBackgroundTaskNotification: () => {
    trace.push("claim");
    return true;
  },
  releaseRuntimeBackgroundTaskNotification: () => {
    trace.push("release");
  },
};
const external = new Map([
  [
    "@knorvia/contracts",
    synthetic({
      serializeWorkflowArtifact: serializer,
      traceContextToLogContext: (x) => ({ traceId: x.traceId }),
    }),
  ],
  [
    "apps/cli/packages/core/src/tool/compat.js",
    synthetic({ isSubagentDispatchToolName: (n) => ["Agent", "Task"].includes(n) }),
  ],
  ["apps/cli/packages/core/src/tool/executor/background-task-registry.js", synthetic(registry)],
  [
    "apps/cli/packages/core/src/tool/executor/utils.js",
    synthetic({ isRecord: (x) => x !== null && typeof x === "object" && !Array.isArray(x) }),
  ],
  [
    "apps/cli/packages/core/src/runtime-task/notification.js",
    synthetic({
      formatTaskNotification: (x) => {
        trace.push(["format", Object.keys(x)]);
        return JSON.stringify(x);
      },
    }),
  ],
  [
    "apps/cli/packages/core/src/tool/handlers/workflow-script-path.js",
    synthetic({
      describeWorkflowScriptPath: () => {
        throw Error("no script-path effect");
      },
    }),
  ],
]);
const modules = new Map(
  [...files].map(([name, text]) => [
    name,
    new vm.SourceTextModule(text, { context, identifier: name }),
  ]),
);
for (const module of modules.values())
  if (module.status === "unlinked")
    await module.link((s, ref) => {
      const key = s.startsWith(".")
        ? path.posix.normalize(path.posix.join(path.posix.dirname(ref.identifier), s))
        : s;
      const dep = modules.get(key) ?? external.get(key);
      assert.ok(dep, s);
      return dep;
    });
for (const module of modules.values()) if (module.status === "linked") await module.evaluate();
const ns = (n) => modules.get("apps/cli/packages/core/src/tool/executor/" + n + ".js").namespace;
const metadata = ns("background-task-output").backgroundTaskOutputMetadata,
  reports = ns("workflow-artifact"),
  projection = ns("background-tracker-projection"),
  publication = ns("background-tracker-notification");
const plain = (v) => JSON.parse(JSON.stringify(v)),
  observations = [];
const stringView = (x) => ({
  length: x.length,
  sha256: sha(x),
  prefix: x.slice(0, 12),
  suffix: x.slice(-5),
});
const sectionView = (x) =>
  x === undefined
    ? undefined
    : {
        keys: Object.keys(x),
        count: x.count,
        shown: x.shown,
        preview: Array.isArray(x.preview) ? x.preview.map(stringView) : stringView(x.preview),
      };
{
  const launch = {
    childSessionId: "owned-launch-child",
    rawOutputPath: "owned://launch",
    stdoutPersistedOutputPath: "owned://launch-stdout",
  };
  const snapshot = {
    childSessionId: "",
    stdoutTail: "",
    output: { response: "Owned workflow tail" },
    stdoutBytes: 10,
    result: {
      stdout: { bytes: 0, text: "", artifactPath: "owned://stream", truncated: "truthy" },
      stderr: { bytes: 2, text: "Owned stderr", artifactTruncated: true },
    },
  };
  const before = JSON.stringify({ snapshot, launch }),
    value = metadata(snapshot, launch);
  assert.equal(value.childSessionId, "");
  assert.equal(value.stdoutBytes, 0);
  assert.equal(value.outputBytes, 2);
  assert.equal(value.outputTail, "");
  assert.equal(value.outputFile, "owned://launch");
  assert.equal(value.outputTruncated, true);
  assert.equal(JSON.stringify({ snapshot, launch }), before);
  assert.notEqual(metadata(snapshot, launch), value);
  const empty = metadata(undefined);
  assert.equal(Object.keys(empty).length, 11);
  assert.equal(empty.outputTruncated, undefined);
  const resultArray = [];
  const nested = Object.assign([], { stdout: { text: "Owned array stream" } });
  resultArray.push(metadata({ result: nested }));
  assert.equal(resultArray[0].outputTruncated, false);
  const inherited = Object.create({
    childSessionId: "owned-inherited",
    outputFile: "owned://inherited",
  });
  const inheritedValue = metadata(inherited);
  assert.equal(inheritedValue.childSessionId, "owned-inherited");
  const failure = Error("Owned workflow response read failure");
  assert.throws(
    () =>
      metadata({
        stdoutTail: "winner",
        output: {
          get response() {
            throw failure;
          },
        },
      }),
    (e) => e === failure,
  );
  const call = { id: "owned-call", name: "Bash", input: { command: "owned-never-run" } };
  const payload = projection.taskPayload({}, call, "owned-task", "completed", launch, snapshot);
  assert.equal(payload.childSessionId, "");
  assert.equal(payload.outputTail, "");
  assert.equal(payload.cancellable, false);
  observations.push({
    name: "metadata priority and actual event payload",
    value: plain(value),
    keys: Object.keys(value),
    emptyKeys: Object.keys(empty),
    array: plain(resultArray),
    inherited: plain(inheritedValue),
    payload: plain(payload),
    payloadKeys: Object.keys(payload),
  });
}
{
  assert.equal(reports.serializeWorkflowArtifact, serializer);
  assert.equal(reports.buildWorkflowReportsNotificationSection(undefined), undefined);
  assert.equal(reports.buildWorkflowReportsManifestSection([]), undefined);
  const items = Array.from({ length: 9 }, (_, i) => "测".repeat(2100) + i);
  serializeCalls.length = 0;
  const text = reports.buildWorkflowReportsNotificationSection(items);
  assert.equal(text.shown, 3);
  assert.equal(serializeCalls.length, 4);
  assert.equal(serializeCalls[3], items[3]);
  assert.ok(text.preview.endsWith("…"));
  serializeCalls.length = 0;
  const manifest = reports.buildWorkflowReportsManifestSection(items);
  assert.equal(manifest.shown, 8);
  assert.equal(serializeCalls.length, 8);
  assert.equal(manifest.preview[0].length, 500);
  failSerialization = items[3];
  assert.throws(
    () => reports.buildWorkflowReportsNotificationSection(items),
    (e) => e === ownedSerializeError,
  );
  failSerialization = undefined;
  const fetchError = Error("Owned ninth report fetch failure"),
    fetchItems = [...items];
  Object.defineProperty(fetchItems, 8, {
    get() {
      throw fetchError;
    },
  });
  assert.throws(
    () => reports.buildWorkflowReportsManifestSection(fetchItems),
    (e) => e === fetchError,
  );
  const sparse = Array(2),
    sparseText = reports.buildWorkflowReportsNotificationSection(sparse);
  assert.equal(sparseText.preview, "[1] \n[2] ");
  const deps = {
    enqueueBackgroundTaskNotification(notification) {
      assert.equal(this, deps);
      trace.push("enqueue");
      notifications.push(notification);
    },
    getWorkingDirectory: () => {
      throw Error("no workspace read");
    },
  };
  const call = {
    id: "owned-workflow-call",
    name: "CreateWorkflow",
    input: { description: "Owned report run" },
  };
  const snapshot = {
    status: "completed",
    runStatus: "completed",
    output: "Owned terminal result",
    reports: items,
  };
  publication.enqueueTerminalNotification(
    deps,
    call,
    "owned-workflow-task",
    "completed",
    { traceId: "owned-trace" },
    snapshot,
    {},
  );
  assert.equal(notifications.length, 1);
  const notification = notifications[0],
    formatted = JSON.parse(notification.text);
  assert.equal(formatted.reports.shown, 3);
  assert.equal(notification.originMeta.workflowNotification.reports.shown, 8);
  observations.push({
    name: "report caps, errors and actual enqueue data",
    text: sectionView(text),
    manifest: sectionView(manifest),
    sparse: sectionView(sparseText),
    notification: {
      taskId: notification.taskId,
      toolName: notification.toolName,
      originKeys: Object.keys(notification.originMeta),
      manifestKeys: Object.keys(notification.originMeta.workflowNotification),
      textReports: sectionView(formatted.reports),
      manifestReports: sectionView(notification.originMeta.workflowNotification.reports),
      trace: plain(trace),
    },
  });
}
const value = plain(observations),
  golden = path.join(
    repo,
    "apps/cli/packages/core/test/background-data-observations-20261003.json",
  );
if (mode === "baseline") await writeFile(golden, JSON.stringify(value, null, 2) + "\n");
else {
  const bytes = await readFile(golden);
  assert.equal(sha(bytes), "4a582715f6f2f4b3bee24796a80a84e7fc007301c162bf51b0b9c4b495fb7962");
  assert.deepEqual(value, JSON.parse(bytes));
}
console.log(
  JSON.stringify({
    mode,
    groups: 2,
    actualConsumersWithinGroups: ["taskPayload", "enqueueTerminalNotification"],
    fakePortsOnly: true,
    liveIO: 0,
    wholeSuite: false,
  }),
);
