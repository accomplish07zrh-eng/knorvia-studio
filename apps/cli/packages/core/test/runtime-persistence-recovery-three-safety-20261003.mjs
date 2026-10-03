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
assert.ok(["baseline", "current"].includes(mode), "explicit strict artifact mode");
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
const shell = await import(pathToFileURL(path.join(dir, "bash-shell-snapshot.mjs")).href);
const remote = await import(
  pathToFileURL(path.join(dir, "persisted-remote-session-path-repair.mjs")).href
);
const rewind = await import(pathToFileURL(path.join(dir, "file-rewind.mjs")).href);
const deps = await import(pathToFileURL(path.join(core, "src/runtime/deps.js")).href);
const trace = { traceId: "owned-trace", spanId: "owned-span" };
const failure = new Error("Owned write/publication failure");
const groups = [];
{
  const selection = {
    id: "owned",
    label: "Owned shell",
    path: "/owned/unavailable",
    dialect: "posix",
    source: "user-config",
    display: { name: "Owned shell", extra: "owned-display" },
    extra: "owned-extra",
  };
  const calls = [];
  let entry;
  const store = {
    async saveSessionEntry(value) {
      assert.equal(this, store);
      entry = value;
      calls.push("save");
      throw failure;
    },
    async sessionEntries(value) {
      assert.equal(this, store);
      calls.push("read");
      assert.deepEqual(Object.keys(value), ["sessionID", "type"]);
      return [{ data: entry.data }];
    },
  };
  const logger = {
    warn(message, value) {
      calls.push(["warn", message, Object.keys(value)]);
    },
  };
  await shell.persistBashShellSelectionSnapshot({
    selection,
    sessionId: "owned-session",
    sessionStore: store,
    logger,
    traceContext: trace,
  });
  assert.deepEqual(Object.keys(entry), ["id", "sessionID", "type", "time", "data"]);
  assert.equal(entry.id, "owned-session:runtime:bash_shell_selection");
  assert.notEqual(entry.data, selection);
  assert.notEqual(entry.data.display, selection.display);
  assert.equal(entry.data.extra, selection.extra);
  assert.equal(entry.time.created, entry.time.updated);
  const restored = await shell.readPersistedBashShellSelectionSnapshot({
    sessionId: "owned-session",
    sessionStore: store,
    logger,
    traceContext: trace,
  });
  assert.deepEqual(Object.keys(restored), ["selection", "status"]);
  assert.equal(restored.status, "restored");
  assert.deepEqual(Object.keys(restored.selection), [
    "dialect",
    "display",
    "source",
    "id",
    "label",
    "path",
  ]);
  assert.deepEqual(restored.selection.display, { name: "Owned shell" });
  const fallbackSelection = {
    dialect: "legacy-shell",
    source: "legacy-fallback",
    display: { name: "Owned fallback" },
  };
  const fallback = shell.resolveBashShellSnapshotForResume({
    currentSelection: fallbackSelection,
    restore: restored,
    logger,
    traceContext: trace,
  });
  assert.deepEqual(Object.keys(fallback), ["reason", "selection", "staleSelection", "status"]);
  assert.equal(fallback.selection, fallbackSelection);
  assert.equal(fallback.staleSelection, restored.selection);
  assert.equal(calls[0], "save");
  assert.equal(calls[1][0], "warn");
  assert.equal(calls[2], "read");
  assert.deepEqual(calls.at(-1)[2], [
    "traceId",
    "queryId",
    "spanId",
    "parentSpanId",
    "sessionId",
    "turnId",
    "event",
    "module",
    "persistedShellName",
    "persistedShellPath",
  ]);
  groups.push("shell snapshot stored clone/parse/save rejection/stale identity");
}
{
  const identity = "remote:ssh:owned-host:owned-user:owned-port:/owned/workspace";
  const session = {
    id: "owned-session",
    projectID: "owned-project",
    workspaceID: identity,
    directory: identity,
    path: "/owned/workspace/" + identity,
    slug: "owned",
    title: "Owned",
    version: "owned",
    taskType: "chat",
    time: { created: 1, updated: 2 },
  };
  const refreshed = {
    ...session,
    directory: "/owned/workspace",
    path: "/owned/workspace",
    title: "Fresh owned",
  };
  const calls = [];
  let input;
  const store = {
    async repairRemoteSessionPaths(value) {
      assert.equal(this, store);
      input = value;
      calls.push("cas");
      return false;
    },
    async getSession(id) {
      assert.equal(this, store);
      assert.equal(id, session.id);
      calls.push("refresh");
      return refreshed;
    },
  };
  const out = await remote.repairPersistedRemoteSessionPaths(store, session);
  assert.equal(out, refreshed);
  assert.deepEqual(calls, ["cas", "refresh"]);
  assert.deepEqual(Object.keys(input), [
    "sessionID",
    "workspaceID",
    "expectedDirectory",
    "expectedPath",
    "directory",
    "path",
    "timeUpdated",
  ]);
  assert.equal(input.expectedDirectory, identity);
  assert.equal(input.directory, "/owned/workspace");
  assert.equal(input.expectedPath, session.path);
  assert.equal(input.path, "/owned/workspace");
  assert.equal(input.timeUpdated, 2);
  assert.equal(session.directory, identity);
  const warnings = [];
  const rejected = {
    async repairRemoteSessionPaths() {
      throw failure;
    },
    async getSession() {
      assert.fail("no refresh after rejected CAS");
    },
  };
  const memory = await remote.repairPersistedRemoteSessionPaths(rejected, session, {
    onPersistenceFailure(error) {
      warnings.push(error);
    },
  });
  assert.deepEqual(warnings, [failure]);
  assert.notEqual(memory, session);
  assert.equal(memory.time, session.time);
  assert.equal(memory.directory, "/owned/workspace");
  const changed = {
    ...refreshed,
    workspaceID: "remote:ssh:other:owned-user:owned-port:/owned/other",
  };
  await assert.rejects(
    remote.repairPersistedRemoteSessionPaths(
      {
        ...store,
        async repairRemoteSessionPaths() {
          return false;
        },
        async getSession() {
          return changed;
        },
      },
      session,
    ),
    (error) =>
      error.type === deps.CoreErrorType.SessionCorrupted &&
      error.message === "Remote session workspace identity changed during path repair",
  );
  groups.push("remote narrow CAS/refresh identity/rejection/concurrent identity gate");
}
{
  const checkpoint = {
    checkpointId: "owned-cp",
    messageId: "owned-message",
    scope: "workspace",
    snapshotRef: "owned://checkpoint",
    fileCount: 2,
  };
  const artifact = {
    version: 1,
    kind: "workspace_file_before_change",
    createdAt: "owned-time",
    toolCallId: "owned-call",
    toolName: "Write",
    files: [
      {
        path: "a.txt",
        existedBefore: true,
        beforeContent: "before-a",
        afterContent: "after-a",
        structuredPatch: [],
      },
      {
        path: "b.txt",
        existedBefore: true,
        beforeContent: "before-b",
        afterContent: "after-b",
        structuredPatch: [],
      },
    ],
  };
  const root = path.resolve("/owned/workspace"),
    a = path.resolve(root, "a.txt"),
    b = path.resolve(root, "b.txt");
  function fixture({
    failWrite = false,
    failCommit = false,
    failEvent = false,
    modified = false,
  } = {}) {
    const state = new Map([
        [a, modified ? "external-a" : "after-a"],
        [b, "after-b"],
      ]),
      calls = [];
    let writes = 0;
    const fs = {
      async readTextFile(input, options) {
        assert.equal(this, fs);
        calls.push(["read", input.path, options?.signal]);
        return { content: state.get(input.path) };
      },
      async writeTextFile(input, options) {
        assert.equal(this, fs);
        calls.push(["write", input.path, input.content, options?.signal]);
        writes++;
        if (failWrite && writes === 2) throw failure;
        state.set(input.path, input.content);
      },
      async removeFile() {
        assert.fail("ordinary restore fixture never deletes");
      },
    };
    const runtime = {
      workspaceRoot: root,
      sessionId: "owned-session",
      rootTraceContext: trace,
      fileSystemPort: fs,
      artifactStore: {
        async readToolResultArtifact() {
          calls.push(["artifact"]);
          return { content: JSON.stringify(artifact) };
        },
      },
      eventStore: {
        async getEvents() {
          calls.push(["events"]);
          return [
            {
              type: deps.SessionEventType.CheckpointCreated,
              payload: checkpoint,
              turnId: "owned-other-turn",
            },
          ];
        },
      },
      createEvent(type, payload, tr) {
        assert.equal(tr, trace);
        calls.push(["create", type, Object.keys(payload)]);
        return { type, payload };
      },
      async appendEvent(event, tr) {
        calls.push(["append", event.type]);
        assert.equal(tr, trace);
        if (failEvent) throw failure;
      },
      logger: {
        info() {
          calls.push(["log"]);
        },
      },
    };
    return {
      runtime,
      state,
      calls,
      async commit() {
        calls.push(["commit"]);
        if (failCommit) throw failure;
      },
    };
  }
  const abort = new AbortController();
  const rollback = fixture({ failWrite: true });
  const result = await rewind.applyWorkspaceFileRewind.call(rollback.runtime, {
    traceContext: trace,
    abortSignal: abort.signal,
    commitAfterApply: rollback.commit,
  });
  assert.equal(result.applied, false);
  assert.equal(rollback.state.get(a), "after-a");
  assert.equal(rollback.state.get(b), "after-b");
  assert.deepEqual(
    rollback.calls.filter((x) => x[0] === "write").map((x) => [x[1], x[2], x[3] === abort.signal]),
    [
      [b, "before-b", true],
      [a, "before-a", true],
      [a, "after-a", false],
      [b, "after-b", false],
    ],
  );
  assert.equal(result.preview.unsafeFiles.at(-1).operationCount, 2);
  assert.equal(result.preview.unsafeFiles.at(-1).path, a);
  assert.ok(!rollback.calls.some((x) => x[0] === "commit" || x[0] === "append"));
  const committed = fixture({ failCommit: true });
  assert.equal(
    (
      await rewind.applyWorkspaceFileRewind.call(committed.runtime, {
        traceContext: trace,
        commitAfterApply: committed.commit,
      })
    ).applied,
    false,
  );
  assert.equal(committed.state.get(a), "after-a");
  assert.equal(committed.state.get(b), "after-b");
  const external = fixture({ modified: true });
  assert.equal(
    (await rewind.applyWorkspaceFileRewind.call(external.runtime, { traceContext: trace })).applied,
    false,
  );
  assert.ok(!external.calls.some((x) => x[0] === "write"));
  const publication = fixture({ failEvent: true });
  await assert.rejects(
    rewind.applyWorkspaceFileRewind.call(publication.runtime, {
      traceContext: trace,
      targetTurnId: "ignored-owned-turn",
      commitAfterApply: publication.commit,
    }),
    (error) => error === failure,
  );
  assert.equal(publication.state.get(a), "before-a");
  assert.equal(publication.state.get(b), "before-b");
  assert.equal(publication.calls.filter((x) => x[0] === "write").length, 2);
  assert.deepEqual(publication.calls.find((x) => x[0] === "create")[2], [
    "rewindId",
    "scope",
    "strategy",
    "targetMessageId",
    "targetCheckpointId",
    "restoredSnapshotRef",
    "reason",
  ]);
  groups.push(
    "file rewind guarded writes/rejected write and commit compensation/postcommit publication failure",
  );
}
console.log(
  JSON.stringify({
    mode,
    groups,
    count: groups.length,
    selection:
      "exact old/current scoped compiler owner JS;unchanged source dependencies through tsx;synthetic fs access seam and memory store/filesystem only",
    limits:
      "3compact persistence safety groups,not full runtime/cancellation/native coverage;no duplicate source mode or actual user IO",
  }),
);
