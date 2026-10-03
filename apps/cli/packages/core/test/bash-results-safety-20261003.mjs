import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const ts = createRequire(path.join(repo, "package.json"))("typescript");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const mode = process.argv[2];
assert.ok(["baseline", "current"].includes(mode));
const oldBytes = await readFile(
  path.join(repo, "apps/cli/packages/core/test/bash-results-baseline-20261003.json"),
);
assert.equal(sha(oldBytes), "b4180fb37af8689f36bc9ffc9730d286dd1ac21d7b24efc585c94a6a44c24c97");
const baseline = JSON.parse(oldBytes),
  files = new Map();
for (const row of Object.values(baseline.files)) {
  assert.equal(sha(row.compiled), row.compiledSha256);
  assert.equal(sha(row.declaration), row.declarationSha256);
  if (row.source) assert.equal(sha(row.source), row.sourceSha256);
  if (!row.source)
    assert.equal(sha(await readFile(path.join(repo, row.logicalPath))), row.sourceSha256);
  files.set(row.logicalPath.replace(/\.ts$/u, ".js"), row.compiled);
}
if (mode === "current") {
  const b = await readFile(
    path.join(repo, "docs/evidence/knorvia-bash-results-current-20261003.json"),
  );
  assert.equal(sha(b), "CURRENT_PIN");
  for (const [logical, row] of Object.entries(JSON.parse(b).files)) {
    for (const entry of Object.values(row))
      assert.equal(sha(await readFile(path.join(repo, entry.path))), entry.sha256);
    files.set(
      logical.replace(/\.ts$/u, ".js"),
      (await readFile(path.join(repo, row.compiled.path))).toString(),
    );
  }
}
const context = vm.createContext({ Buffer }),
  trace = [],
  unused = () => {
    throw Error("no live effect permitted");
  };
let image, imageError, imagePending, parsedImage, lastAttached;
const schema = {
  safeParse: (v) => {
    trace.push("schema");
    return v?.ownedValid ? { success: true, data: v } : { success: false };
  },
};
const contracts = {
  BashOutputSchema: schema,
  BashInputSchema: { parse: unused, safeParse: unused },
  BashInputJsonSchema: {},
  BashOutputJsonSchema: {},
  CoreErrorType: {},
  SessionEventType: {},
  createCoreError: unused,
  parseImageDataUrl: (text, options) => {
    trace.push(["parse-image", text, options]);
    return parsedImage;
  },
};
const semantics = {
  interpretBashReturnCode: (command, result) => {
    trace.push(["interpret", command, result.status]);
    return result.ownedInterpretation;
  },
  isBashProviderErrorStatus: (value) => {
    trace.push(["provider-error", Object.keys(value)]);
    return (
      value.status === "failed" &&
      value.exitCode !== 0 &&
      value.returnCodeInterpretation !== "No matches found"
    );
  },
  isSilentBashCommand: (c) => {
    trace.push(["silent", c]);
    return false;
  },
  isRuntimeReadOnlyBashCommand: unused,
};
const perf = {
  attachToolExecutionTelemetry: (output, telemetry) => {
    trace.push("attach");
    lastAttached = { output, telemetry };
    return output;
  },
  compactToolExecutionTelemetry: (value) => {
    trace.push("compact");
    return value;
  },
  roundNonNegativeMs: (n) => {
    trace.push(["round", n]);
    return Math.max(0, Math.round(n));
  },
  classifyCommand: (c) => {
    trace.push(["classify", c]);
    return "owned";
  },
  classifySafeCommandIdentity: (c) => {
    trace.push(["identity", c]);
    return { count: 1, name: "owned" };
  },
  commandHash: (c) => {
    trace.push(["hash", c]);
    return "owned-hash";
  },
};
const supplied = new Map([
  ["@knorvia/contracts", contracts],
  ["apps/cli/packages/core/src/tool/handlers/bash-semantics.js", semantics],
  ["apps/cli/packages/core/src/tool/handlers/tool-perf.js", perf],
  [
    "apps/cli/packages/core/src/tool/handlers/bash-cwd-policy.js",
    {
      appendBashCwdStderrSuffix: (text, suffix) => {
        trace.push(["suffix", text, suffix]);
        return text + (suffix ?? "");
      },
      decideBashCwdPolicy: unused,
    },
  ],
  [
    "apps/cli/packages/core/src/tool/handlers/bash-gh-rate-limit.js",
    {
      getGhRateLimitHint: (command, text) => {
        trace.push(["gh-hint", command, text]);
        return "Owned hint";
      },
    },
  ],
  [
    "apps/cli/packages/core/src/tool/handlers/bash-image-output.js",
    {
      prepareBashImageOutput: (source, receiver) => {
        trace.push(["image", source]);
        assert.equal(receiver, ownedContext);
        if (imageError) throw imageError;
        return imagePending ?? Promise.resolve(image);
      },
    },
  ],
  [
    "apps/cli/packages/core/src/tool/bash-timeout-policy.js",
    {
      DEFAULT_BASH_TIMEOUT_POLICY: { defaultTimeoutMs: 100, maxTimeoutMs: 1000 },
      resolveBashTimeoutMs: unused,
    },
  ],
  [
    "apps/cli/packages/core/src/tool/handlers/bash-prompt.js",
    { createBashProviderDescription: () => "Owned unused description" },
  ],
  ["apps/cli/packages/core/src/runtime/deps.js", { modelMessageContentToText: unused }],
]);
const modules = new Map(
  [...files].map(([n, t]) => [n, new vm.SourceTextModule(t, { context, identifier: n })]),
);
const external = new Map(),
  synthetic = (exports) =>
    new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [k, v] of Object.entries(exports)) this.setExport(k, v);
      },
      { context },
    );
// Missing exports on unrelated Bash lifecycle dependencies fail immediately if invoked.
const expected = new Map();
for (const [n, text] of files) {
  const ast = ts.createSourceFile(n, text, ts.ScriptTarget.Latest, true);
  for (const statement of ast.statements) {
    if (
      !(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) ||
      !statement.moduleSpecifier
    )
      continue;
    const spec = statement.moduleSpecifier.text,
      key = spec.startsWith(".")
        ? path.posix.normalize(path.posix.join(path.posix.dirname(n), spec))
        : spec;
    const bindings = statement.importClause?.namedBindings ?? statement.exportClause;
    const names = bindings?.elements?.map((e) => e.propertyName?.text ?? e.name.text) ?? [];
    const set = expected.get(key) ?? new Set();
    for (const name of names) set.add(name);
    expected.set(key, set);
  }
}
for (const [key, names] of expected)
  if (!modules.has(key))
    external.set(
      key,
      synthetic(
        Object.fromEntries([...names].map((name) => [name, supplied.get(key)?.[name] ?? unused])),
      ),
    );
for (const module of modules.values())
  if (module.status === "unlinked")
    await module.link((spec, ref) => {
      const key = spec.startsWith(".")
        ? path.posix.normalize(path.posix.join(path.posix.dirname(ref.identifier), spec))
        : spec;
      const dependency = modules.get(key) ?? external.get(key);
      assert.ok(dependency, spec);
      return dependency;
    });
for (const module of modules.values()) if (module.status === "linked") await module.evaluate();
const ns = (name) => modules.get("apps/cli/packages/core/src/" + name + ".js").namespace;
const output = ns("tool/handlers/bash-output"),
  content = ns("tool/handlers/bash-model-content"),
  entry = ns("tool/handlers/bash").bashToolEntry,
  consumer = ns("runtime/helpers/tool-result");
const ownedContext = { owned: true },
  input = { command: "owned-preview", dangerouslyDisableSandbox: false };
const makeResult = (status = "completed") => ({
  stdout: {
    text: "  \nOwned output  ",
    bytes: 9000,
    artifactPath: "owned://stdout",
    artifactBytes: 64,
    truncated: true,
  },
  stderr: {
    text: "Owned stderr",
    bytes: 2000,
    artifactPath: "owned://stderr",
    artifactBytes: 32,
    truncated: false,
  },
  status,
  exitCode: status === "failed" ? 2 : 0,
  timedOut: false,
  cancelled: false,
  durationMs: 9.4,
});
const plain = (v) => JSON.parse(JSON.stringify(v)),
  observations = [];
{
  trace.length = 0;
  const result = makeResult();
  image = { stdout: "Owned prepared image" };
  const options = { progressTiming: { firstOutputMs: 0 }, stderrSuffix: "Owned suffix" };
  const projected = await output.toBashOutput(result, input, ownedContext, options);
  assert.equal(projected, lastAttached.output);
  assert.equal(projected.persistedOutputSize, 11000);
  assert.equal(projected.stdoutPersistedOutputSize, 64);
  assert.equal(projected.stderrPersistedOutputSize, 32);
  assert.equal(lastAttached.telemetry.detail.command.firstOutputMs, 0);
  observations.push({
    name: "artifact data versus observed bytes",
    output: plain(projected),
    keys: Object.keys(projected),
    telemetry: plain(lastAttached.telemetry),
    trace: plain(trace),
  });
  trace.length = 0;
  imageError = Error("Owned original image failure");
  const error = imageError;
  await assert.rejects(output.toBashOutput(makeResult(), input, ownedContext), (e) => e === error);
  assert.ok(!trace.includes("attach"));
  imageError = undefined;
  trace.length = 0;
  const failed = await output.toBashOutput(makeResult("failed"), input, ownedContext);
  assert.ok(!trace.some((x) => Array.isArray(x) && ["image", "gh-hint"].includes(x[0])));
  observations.push({
    name: "provider error skips image lifetime",
    output: plain(failed),
    keys: Object.keys(failed),
    trace: plain(trace),
  });
  trace.length = 0;
  let resolve;
  imagePending = new Promise((r) => {
    resolve = r;
  });
  const late = makeResult();
  const waiting = output.toBashOutput(late, input, ownedContext);
  late.stdout.bytes = 12000;
  late.stdout.text = "Owned live text";
  late.cancelled = true;
  resolve(undefined);
  const settled = await waiting;
  imagePending = undefined;
  assert.equal(settled.persistedOutputSize, 11000);
  assert.equal(settled.stdoutBytes, 12000);
  assert.equal(settled.cancelled, true);
  observations.push({
    name: "captured artifact and live post-image fields",
    output: plain(settled),
    trace: plain(trace),
  });
  trace.length = 0;
  const background = output.createBashBackgroundPerformanceTelemetry(input),
    empty = output.createEmptyBashPerformanceTelemetry(input);
  observations.push({
    name: "no-run telemetry",
    background: plain(background),
    empty: plain(empty),
    trace: plain(trace),
  });
}
{
  assert.equal(entry.formatModelContent, content.formatBashModelContent);
  assert.equal(entry.formatPersistedModelContent, content.formatPersistedBashModelContent);
  const parsed = (fields = {}) => ({
    ownedValid: true,
    stdout: "\nOwned stdout \n",
    stderr: " Owned stderr ",
    interrupted: false,
    status: "completed",
    ...fields,
  });
  const structured = [{ type: "text", text: "Owned structure" }];
  const priority = parsed({ structuredContent: structured, status: "failed", exitCode: 2 });
  assert.equal(entry.formatModelContent(priority), structured);
  const rows = [
    parsed({
      status: "failed",
      exitCode: 2,
      isImage: true,
      persistedOutputPath: "owned://saved",
      persistedOutputSize: 3000,
      interrupted: true,
    }),
    parsed({ isImage: true }),
    parsed({
      isImage: false,
      backgroundTaskId: "owned-task",
      status: "backgrounded",
      rawOutputPath: "owned://running",
      assistantAutoBackgrounded: true,
    }),
    parsed({
      backgroundTaskId: "owned-task",
      status: "backgrounded",
      rawOutputPath: "owned://running",
      backgroundedByUser: true,
    }),
    parsed({
      backgroundTaskId: "owned-task",
      status: "backgrounded",
      rawOutputPath: "owned://running",
    }),
  ];
  const values = [];
  for (let i = 0; i < rows.length; i++) {
    parsedImage =
      i === 1 ? { mediaType: "image/png", dataUrl: "data:image/png;base64,T3duZWQ=" } : undefined;
    values.push(plain(entry.formatModelContent(rows[i])));
  }
  const full = "Owned full provider content\nOwned stderr only once";
  const persisted = entry.formatPersistedModelContent({
    content: full,
    output: rows[0],
    persistedPath: "owned://full",
    originalBytes: 2048,
  });
  assert.equal(persisted.split("Owned stderr only once").length, 2);
  assert.equal(
    entry.formatPersistedModelContent({
      content: full,
      output: {},
      persistedPath: "owned://full",
      originalBytes: 2048,
    }),
    undefined,
  );
  assert.equal(content.formatBashModelContent("Owned raw fallback"), "Owned raw fallback");
  const runtimeErrors = rows.map((r) =>
    consumer.isErrorForToolResult({ success: true, toolName: "Bash", output: r }),
  );
  observations.push({
    name: "actual Bash metadata and runtime classification consumers",
    values,
    persisted,
    runtimeErrors,
  });
}
const result = plain(observations),
  golden = path.join(repo, "apps/cli/packages/core/test/bash-results-observations-20261003.json");
if (mode === "baseline") await writeFile(golden, JSON.stringify(result, null, 2) + "\n");
else {
  const b = await readFile(golden);
  assert.equal(sha(b), "5f57b1ccc612af7ec364b521585a2cb9f3539036512bddcd2b6063a55cbe8fde");
  assert.deepEqual(result, JSON.parse(b));
}
console.log(
  JSON.stringify({
    mode,
    groups: 2,
    realConsumersWithinGroups: [
      "Bash ToolEntry formatModelContent/formatPersistedModelContent",
      "runtime isErrorForToolResult",
    ],
    liveIO: 0,
    broadSuite: false,
  }),
);
