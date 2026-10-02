// Synthetic data and virtual ports only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { load, plain, syntheticError } from "./shared-authority-fixture.mjs";

test("hook discovery owner keeps worktree order, duplicate ownership and per-source errors", async () => {
  const files = new Map([
    ["/synthetic/work/knorvia.json", "invalid JSON"],
    ["/synthetic/work/.knorvia-studio/config.json", JSON.stringify({ hooks: { enabled: true } })],
    ["/synthetic/work/app/knorvia.json", JSON.stringify({ unrelated: true })],
    [
      "/synthetic/work/app/.knorvia-studio/config.json",
      JSON.stringify({
        hooks: {
          enabled: false,
          events: { Stop: [{ hooks: [{ type: "command", command: "synthetic-never-executed" }] }] },
        },
      }),
    ],
  ]);
  const marker = "/synthetic/work/.git";
  const fixture = {
    existsSync: (path) => path === marker || files.has(path),
    statSync: (path) => {
      if (path !== marker) throw syntheticError("ENOENT");
      return { isDirectory: () => false, isFile: () => true };
    },
    async stat(path) {
      return this.statSync(path);
    },
    async access(path) {
      if (!files.has(path)) throw syntheticError("EACCES");
    },
    async readFile(path, encoding) {
      assert.equal(encoding, "utf8");
      return files.get(path);
    },
  };
  const owner = await load("workspace-hook-config", fixture);
  const input = {
    workingDirectory: "/synthetic/work/app",
    explicitProjectConfigPath: "/synthetic/work/app/.knorvia-studio/../.knorvia-studio/config.json",
  };
  const refs = owner.discoverWorkspaceHookConfigPaths(input);
  assert.deepEqual(
    plain(refs).map((ref) => ref.path),
    [...files.keys()],
  );
  assert.equal(refs.at(-1).explicitProjectConfig, false);
  const result = await owner.readWorkspaceHookProjectSources(input);
  assert.deepEqual(
    plain(result.sources).map((source) => [source.discoveryOrder, source.editable, source.baseDir]),
    [
      [1, false, "/synthetic/work"],
      [3, true, "/synthetic/work/app"],
    ],
  );
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].path, "/synthetic/work/knorvia.json");
  assert.equal(
    owner.createWorkspaceHookSourceInput({
      path: refs.at(-1).path,
      workingDirectory: input.workingDirectory,
      hooks: {},
      discoveryOrder: 0,
      explicitProjectConfig: true,
    }).editable,
    false,
  );
  let runtimeReads = 0;
  const gates = owner.resolveWorkspaceHookConfiguredGates({
    get runtimeHooksEnabled() {
      runtimeReads += 1;
      return runtimeReads === 1;
    },
  });
  assert.equal(gates.runtimeHooksEnabled, true);
  assert.equal(gates.configuredEnabled, false);
  assert.equal(runtimeReads, 2);
  const nonError = Object.defineProperty({}, "code", {
    get() {
      throw syntheticError("unexpected code read");
    },
  });
  fixture.stat = async () => {
    throw nonError;
  };
  const noMarker = await owner.readWorkspaceHookProjectSources(input);
  assert.deepEqual(
    plain(noMarker.sources).map((source) => source.discoveryOrder),
    [1],
  );
  assert.equal(
    owner.resolveWorkspaceHookConfiguredGates({ sourceEnabled: false, runtimeHooksEnabled: true })
      .configuredEnabled,
    false,
  );
});

test("hook mutation owner denies unreviewed writes and preserves flushed cleanup order", async () => {
  const trace = [];
  const configPath = "/synthetic/work/.knorvia-studio/config.json";
  const raw = {
    unrelated: "preserve",
    hooks: {
      timeoutMs: 999,
      events: {
        Stop: [
          {
            matcher: "synthetic",
            hooks: [{ type: "command", command: "synthetic-never-executed", extra: "preserve" }],
          },
        ],
      },
    },
  };
  const sentinel = syntheticError("beforeRename");
  let lastPayload;
  const fixture = {
    hookSchema: { safeParse: (value) => ({ success: true, data: value }) },
    digest(value) {
      assert.equal(value.defaultTimeoutMs, 60);
      assert.equal(value.resolvedMaxOutputBytes, 90);
      assert.equal(value.matcher, "synthetic");
      return this.changed ? "changed" : "reviewed";
    },
    async readFile(path, encoding) {
      trace.push("read");
      assert.equal(path, configPath);
      assert.equal(encoding, "utf8");
      if (this.readError) throw this.readError;
      return JSON.stringify(raw);
    },
    async mkdir() {
      trace.push("mkdir");
    },
    async open(path, flag, mode) {
      trace.push("open");
      assert.equal(flag, "wx");
      assert.equal(mode, 0o600);
      assert.equal(path, "/synthetic/work/.knorvia-studio/.config.json.47.100.8.tmp");
      return {
        async writeFile(payload, encoding) {
          trace.push("write");
          assert.equal(encoding, "utf8");
          lastPayload = payload;
        },
        async sync() {
          trace.push("sync");
        },
        async close() {
          trace.push("close");
        },
      };
    },
    async rename() {
      trace.push("rename");
    },
    async rm() {
      trace.push("rm");
      throw syntheticError("cleanup");
    },
  };
  const owner = await load("workspace-hook-mutation", fixture);
  const entry = {
    reviewItemId: "review",
    editable: true,
    sourceFileIndex: 0,
    sourceRelativePath: ".knorvia-studio/config.json",
    event: "Stop",
    matcherIndex: 0,
    hookIndex: 0,
    resolvedTimeoutMs: 60,
    resolvedMaxOutputBytes: 90,
    hookDeclarationDigest: "reviewed",
  };
  const source = {
    editable: true,
    configFileKind: ".knorvia-studio/config.json",
    canonicalPath: configPath,
    discoveryOrder: 0,
  };
  const snapshot = { hooks: [entry], sourceFiles: [source] };
  const input = { configPath, snapshot, reviewItemId: "review", enabled: true };
  entry.editable = false;
  await assert.rejects(
    owner.writeWorkspaceHookConfiguredToggle(input),
    (error) => error.code === "workspace_hooks_snapshot_mismatch",
  );
  assert.deepEqual(trace, []);
  entry.editable = true;
  fixture.changed = true;
  await assert.rejects(
    owner.writeWorkspaceHookConfiguredToggle(input),
    (error) => error.code === "workspace_hooks_snapshot_mismatch",
  );
  assert.deepEqual(trace, ["read"]);
  fixture.changed = false;
  fixture.readError = syntheticError("read");
  await assert.rejects(
    owner.writeWorkspaceHookConfiguredToggle(input),
    (error) =>
      error.name === "WorkspaceHookMutationError" &&
      error.code === "workspace_hooks_config_unreadable" &&
      error.cause === fixture.readError,
  );
  fixture.readError = undefined;
  trace.length = 0;
  await assert.rejects(
    owner.writeWorkspaceHookConfiguredToggle({
      ...input,
      writeOptions: {
        beforeRename() {
          trace.push("beforeRename");
          throw sentinel;
        },
      },
    }),
    (error) => error === sentinel,
  );
  assert.deepEqual(trace, [
    "read",
    "mkdir",
    "open",
    "write",
    "sync",
    "close",
    "beforeRename",
    "rm",
  ]);
  assert.equal(lastPayload.endsWith("\n"), true);
  assert.deepEqual(JSON.parse(lastPayload), {
    ...raw,
    hooks: {
      ...raw.hooks,
      events: {
        Stop: [
          {
            matcher: "synthetic",
            hooks: [
              {
                type: "command",
                command: "synthetic-never-executed",
                extra: "preserve",
                enabled: true,
              },
            ],
          },
        ],
      },
    },
  });
  trace.length = 0;
  await owner.writeWorkspaceHookConfiguredToggle(input);
  assert.deepEqual(trace, ["read", "mkdir", "open", "write", "sync", "close", "rename"]);
});
