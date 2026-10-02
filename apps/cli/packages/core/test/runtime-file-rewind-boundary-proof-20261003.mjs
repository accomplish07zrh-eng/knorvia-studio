import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(core, "../../../..");
const hash = (b) => createHash("sha256").update(b).digest("hex");
const oldPins = {
  "bash-shell-snapshot": "fdc764040e17d13cb269ec05b3e5c0ae157c2e620ee116f3f581d9481205f025",
  "persisted-remote-session-path-repair":
    "17d6fb24c5441d8cc9ed4bf087a5de43e243e83e7badf07dc3be5a02708bf0d5",
  "file-rewind": "1bbe3450763d6849ea283c9247c7401619ee36593bbbf6b7fd4a39948d254639",
};
const mode = process.argv[2];
assert.ok(["baseline", "current", "sealed-draft"].includes(mode), "explicit strict artifact mode");
const bytesByModule = {},
  locations = {};
if (mode === "baseline") {
  for (const [n, pin] of Object.entries(oldPins)) {
    const b = await readFile(path.join(core, "test", `runtime-${n}-baseline-20261003.json`));
    assert.equal(hash(b), pin);
    const f = JSON.parse(b).files[n];
    for (const k of ["source", "compiled", "declaration"])
      assert.equal(hash(f[k]), f[k + "Sha256"]);
    bytesByModule[n] = f.compiled;
    locations[n] = path.join(
      core,
      "src/runtime",
      n === "persisted-remote-session-path-repair" ? "helpers" : "methods",
      n + ".js",
    );
  }
} else if (mode === "sealed-draft") {
  const b = await readFile(
    path.join(
      repo,
      "docs/evidence/runtime-persistence-recovery-three-failures-20261003/draft-artifacts.json",
    ),
  );
  assert.equal(hash(b), "c0661f9c6235c20877935373adcae2787c7290d162e7e1262cef8262ec1dbe66");
  for (const [n, f] of Object.entries(JSON.parse(b).files)) {
    for (const [ext, e] of Object.entries(f.artifacts)) {
      const a = await readFile(path.join(repo, e.path));
      assert.equal(hash(a), e.sha256);
      if (ext === "js") bytesByModule[n] = a.toString();
    }
    locations[n] = path.join(core, "src/runtime", f.rel, n + ".js");
  }
} else {
  const b = await readFile(
    path.join(
      repo,
      "docs/evidence/knorvia-runtime-persistence-recovery-three-current-20261003.json",
    ),
  );
  assert.equal(
    hash(b),
    "276e9a735db4b7845894fa699cdfebcb5ddd04e87f7589e5239b0d28f162774f",
    "strict current manifest,no historical fallback",
  );
  for (const [n, entries] of Object.entries(JSON.parse(b).files)) {
    for (const [k, e] of Object.entries(entries)) {
      const a = await readFile(path.join(repo, e.path));
      assert.equal(hash(a), e.sha256, e.path);
      if (k === "compiled") bytesByModule[n] = a.toString();
    }
    locations[n] = path.join(
      repo,
      entries.source.path.replace("/src/", "/src/").replace(/\.ts$/, ".js"),
    );
  }
}
const dir = await mkdtemp(path.join(tmpdir(), "knorvia-recovery-owned-"));
const fakeFs = path.join(dir, "owned-fs.mjs");
await writeFile(
  fakeFs,
  "export const constants={X_OK:1};export function accessSync(){throw new Error('Owned unavailable shell')}\n",
);
const contracts = path.join(core, "../contracts/dist/index.js");
const diff = createRequire(path.join(core, "package.json")).resolve("diff");
for (const [n, b] of Object.entries(bytesByModule)) {
  const rebound = b.replace(/(from\s+|import\s+)(["'])([^"']+)\2/g, (all, pre, q, spec) => {
    let target;
    if (spec === "node:fs") target = fakeFs;
    else if (spec === "diff") target = diff;
    else if (spec === "@knorvia/contracts") target = contracts;
    else if (spec === "@knorvia/shared")
      target = path.join(repo, "packages/shared/src/remote-workspace-identity.ts");
    else if (spec.startsWith(".")) {
      target = path.resolve(path.dirname(locations[n]), spec);
      const selected = Object.keys(locations).find((key) => locations[key] === target);
      if (selected) target = path.join(dir, selected + ".mjs");
    } else return all;
    return pre + q + pathToFileURL(target).href + q;
  });
  await writeFile(path.join(dir, n + ".mjs"), rebound);
}

import test from "node:test";
const rewind = await import(pathToFileURL(path.join(dir, "file-rewind.mjs")).href);
const deps = await import(pathToFileURL(path.join(core, "src/runtime/deps.js")).href);
const trace = { traceId: "owned-trace" };
function fixture({ unsupported = false } = {}) {
  const oldRoot = path.resolve("/owned/old"),
    newRoot = path.resolve("/owned/new"),
    calls = [];
  const artifact = (name, file) => ({
    version: 1,
    kind: "workspace_file_before_change",
    createdAt: "owned",
    toolCallId: "owned-call",
    toolName: name,
    files: [file],
  });
  const file = {
    path: "owned.txt",
    existedBefore: true,
    beforeContent: "before",
    afterContent: "after",
    structuredPatch: [],
  };
  const rows = unsupported
    ? [
        artifact("ApplyPatch", {
          ...file,
          existedBefore: false,
          beforeContent: null,
          afterContent: undefined,
        }),
        artifact("Write", file),
      ]
    : [artifact("Write", file), artifact("Write", { ...file, path: "second.txt" })];
  const events = rows.map((_, i) => ({
    type: deps.SessionEventType.CheckpointCreated,
    payload: {
      checkpointId: "owned-cp" + i,
      messageId: "owned-message" + i,
      scope: "workspace",
      snapshotRef: "owned://" + i,
      fileCount: 1,
    },
  }));
  const runtime = {
    workspaceRoot: oldRoot,
    rootTraceContext: trace,
    sessionId: "owned-session",
    eventStore: {
      async getEvents() {
        return events;
      },
    },
    artifactStore: {
      async readToolResultArtifact(input) {
        const index = Number(input.uri.split("//")[1]);
        calls.push(["artifact", index]);
        if (!unsupported && index === 1) runtime.workspaceRoot = newRoot;
        return { content: JSON.stringify(rows[index]) };
      },
    },
    fileSystemPort: {
      async readTextFile(input) {
        calls.push(["file", input.path]);
        return { content: "after" };
      },
    },
  };
  return { runtime, calls, newRoot };
}
test("artifact cohort settles before path projection", async () => {
  const f = fixture();
  const preview = await rewind.previewWorkspaceFileRewind.call(f.runtime, {
    traceContext: trace,
    targetMessageIds: ["owned-message0", "owned-message1"],
  });
  assert.deepEqual(
    f.calls.filter((x) => x[0] === "file").map((x) => x[1]),
    [path.resolve(f.newRoot, "second.txt"), path.resolve(f.newRoot, "owned.txt")],
  );
  assert.equal(preview.canApply, true);
});
test("unsupported path retains only admitted unsafe tool names", async () => {
  const f = fixture({ unsupported: true });
  const preview = await rewind.previewWorkspaceFileRewind.call(f.runtime, {
    traceContext: trace,
    targetMessageIds: ["owned-message0", "owned-message1"],
  });
  assert.equal(preview.canApply, false);
  assert.equal(preview.unsafeFiles.length, 1);
  assert.deepEqual(preview.unsafeFiles[0].toolNames, ["ApplyPatch"]);
  assert.equal(preview.unsafeFiles[0].operationCount, 1);
  assert.ok(!f.calls.some((x) => x[0] === "file"));
});
