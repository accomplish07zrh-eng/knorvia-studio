// Synthetic data only; every filesystem/lock/UUID/migration/environment port is virtual.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { build } from "esbuild";
const root = process.argv[2];
assert.ok(root, "Supply source root.");
const plain = (x) => JSON.parse(JSON.stringify(x));
const ports = {
  "./remote-workspace-identity.js":
    'export const parseRemoteWorkspaceIdentity=v=>{fixture.parsed.push(v);return v==="fixture:ssh"?{kind:"ssh"}:undefined;};',
  "node:crypto": 'export const randomUUID=()=>"fixture-uuid";',
  "node:path":
    'export const dirname=p=>p.slice(0,p.lastIndexOf("/"));export const basename=p=>p.slice(p.lastIndexOf("/")+1);export const join=(...p)=>p.join("/");',
  "node:fs/promises":
    "export const lstat=(...a)=>fixture.lstat(...a);export const readFile=(...a)=>fixture.readFile(...a);export const readdir=(...a)=>fixture.readdir(...a);export const realpath=(...a)=>fixture.realpath(...a);export const writeFile=(...a)=>fixture.writeFile(...a);export const chmod=(...a)=>fixture.chmod(...a);export const rename=(...a)=>fixture.rename(...a);export const rm=(...a)=>fixture.rm(...a);",
  "./privateFilePersistence.js":
    'export const withFileLock=async(p,f)=>{fixture.trace.push(["lock",p]);return f();};',
  "../subagent-markdown-selection.js":
    'export const migrateSubagentMarkdownProvider=s=>s.replace("legacy-fixture","current-fixture");',
  "../subagent-state-migration.js":
    "export const importSubagentStateSelections=v=>v.legacy?{...v,current:v.legacy}:v;",
};
async function load(name, fixture = {}, globals = {}) {
  const out = await build({
    entryPoints: [resolve(root, name + ".ts")],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    plugins: [
      {
        name: "fake-owner-ports",
        setup(b) {
          b.onResolve({ filter: /(?:\.js$|^node:)/ }, (a) =>
            ports[a.path] ? { path: a.path, namespace: "synthetic" } : undefined,
          );
          b.onLoad({ filter: /.*/, namespace: "synthetic" }, (a) => ({ contents: ports[a.path] }));
        },
      },
    ],
  });
  const module = { exports: {} };
  runInNewContext(out.outputFiles[0].text, {
    module,
    exports: module.exports,
    URL,
    SyntaxError,
    Error,
    fixture,
    Intl: undefined,
    ...globals,
  });
  return module.exports;
}

test("telemetry privacy preserves sanitized copy and injected context precedence", async () => {
  const trace = [];
  const a = await load(
    "telemetry",
    {},
    {
      Intl: {
        DateTimeFormat: () => ({
          resolvedOptions: () => {
            trace.push("intl");
            return { timeZone: "fixture-zone", locale: "fixture-locale" };
          },
        }),
      },
      screen: { width: 10, height: 20 },
    },
  );
  const detail = {
    error_msg: "synthetic error text",
    login_url: "https://fixture-user:fixture-pass@EXAMPLE.invalid/private?fixture=yes",
    other: "unchanged",
  };
  const before = { ...detail };
  const r = a.sanitizeTelemetryEventDetail("app_login_ck", detail);
  assert.deepEqual(plain(r), {
    error_msg: "[redacted]",
    login_url: "example.invalid",
    other: "unchanged",
  });
  assert.notStrictEqual(r, detail);
  assert.deepEqual(detail, before);
  assert.equal(a.resolveSafeTelemetryHostname("file:///fixture-path"), "");
  assert.equal(
    a.sanitizeTelemetryEventDetail("app_login_ck", { login_url: "example.invalid/path" }).login_url,
    "",
  );
  assert.equal(
    a.sanitizeTelemetryEventDetail("app_login_ck", { login_url: "example.invalid" }).login_url,
    "example.invalid",
  );
  assert.deepEqual(
    plain(
      a.collectTelemetryRendererContext({
        timeZone: "",
        intlLocale: "",
        screen: { width: 3, height: 4 },
      }),
    ),
    { clientTimezone: "", clientLanguage: "", screenResolution: "3x4" },
  );
  assert.deepEqual(trace, ["intl"]);
  assert.equal(a.sanitizeTelemetryErrorMessage(""), "");
  assert.equal(
    a.sanitizeTelemetryEventDetail("other", { login_url: "fixture-value" }).login_url,
    "fixture-value",
  );
});

test("resource admission excludes undefined while preserving privacy and count boundary", async () => {
  const a = await load("processResourceTelemetry");
  const props = {
    platform: "fixture",
    session_path: "synthetic",
    ignored_command: undefined,
    other: false,
  };
  const before = { ...props };
  const r = a.checkProcessResourceEventProperties(
    a.PROCESS_RESOURCE_EVENT_NAMES.processWindow,
    props,
  );
  assert.deepEqual(plain(r), {
    ok: false,
    count: 3,
    overLimit: false,
    unknownKeys: ["session_path", "other"],
    forbiddenKeys: ["session_path"],
  });
  assert.deepEqual(props, before);
  assert.equal(a.resolveCliProcessResourceRole(undefined), "cli_chat");
  assert.equal(a.resolveCliProcessResourceRole(null), "cli_aux");
  const all = Object.fromEntries(a.PERF_PROCESS_WINDOW_PROPERTY_KEYS.map((k) => [k, 0]));
  assert.equal(
    a.checkProcessResourceEventProperties(a.PROCESS_RESOURCE_EVENT_NAMES.processWindow, all)
      .overLimit,
    true,
  );
  delete all.mcp_id;
  assert.equal(
    a.checkProcessResourceEventProperties(a.PROCESS_RESOURCE_EVENT_NAMES.processWindow, all).ok,
    true,
  );
});

test("remote telemetry retains ordered error classes and emits enums without raw scope data", async () => {
  const fixture = { parsed: [] };
  const a = await load("remoteUsageTelemetry", fixture);
  const scope = {
    workspaceIdentity: " fixture:ssh ",
    get remoteSessionId() {
      throw new Error("must stay lazy");
    },
  };
  assert.deepEqual(plain(a.resolveWorkspaceTelemetryDetail(scope)), {
    workspace_kind: "remote",
    remote_kind: "ssh",
  });
  assert.deepEqual(fixture.parsed, ["fixture:ssh"]);
  assert.deepEqual(
    plain(a.resolveWorkspaceTelemetryDetail({ workspaceIdentity: "fixture:unknown" })),
    { workspace_kind: "remote", remote_kind: "" },
  );
  assert.equal(a.classifyRemoteUsageError("synthetic permission download timeout"), "auth");
  assert.equal(
    a.classifyRemoteUsageError({ code: "FIXTURE", message: "process exit attach" }),
    "host_start",
  );
  assert.equal(a.classifyRemoteUsageError(Object.create({ code: "CHECKSUM" })), "deploy");
  assert.equal(a.classifyRemoteUsageError({ message: "fixture unclassified" }), "unknown");
  const payload = a.buildRemoteWorkspaceConnectResultTelemetry({
    result: "success",
    remoteKind: "ssh",
    connectTrigger: "restore",
    errorCategory: "auth",
  });
  assert.deepEqual(plain(payload), {
    elementName: "remote_workspace_connect_result",
    eventRegion: "remote_workspace",
    eventType: "result",
    eventExtraDetail: {
      result: "success",
      remote_kind: "ssh",
      connect_trigger: "restore",
      error_category: "",
    },
  });
});

test("shortcut grammar preserves canonical modifier order and known default reference", async () => {
  const a = await load("shortcutCommands");
  assert.strictEqual(
    a.getDefaultShortcutBindings("openSettings"),
    a.SHORTCUT_COMMANDS.find((x) => x.id === "openSettings").defaultBindings,
  );
  assert.deepEqual(plain(a.getDefaultShortcutBindings("unknown")), []);
  const parsed = a.parseShortcutBinding("Shift+CmdOrCtrl+Plus");
  assert.equal(parsed.key, "=");
  assert.equal(a.serializeShortcutBinding(parsed), "CmdOrCtrl+Shift+=");
  assert.equal(a.isValidShortcutBinding("Shift+CmdOrCtrl+Plus"), false);
  assert.equal(a.isValidShortcutBinding("CmdOrCtrl+Shift+="), true);
  for (const invalid of ["Ctrl+Ctrl+a", "Ctrl+A", "Ctrl++", "Command+a", "Ctrl+F13", " Ctrl+a"])
    assert.equal(a.parseShortcutBinding(invalid), null, invalid);
  assert.equal(a.normalizeShortcutKey("Enter"), "Enter");
  assert.equal(a.normalizeShortcutKey("Space"), null);
  assert.equal(a.serializeShortcutBinding({ ...parsed, key: "Space" }), null);
});

function memoryFiles(conflict = false) {
  const trace = [];
  const text = new Map([
    ["/fixture/root/first.md", "legacy-fixture"],
    ["/fixture/root/nested/second.markdown", "legacy-fixture"],
    ["/fixture/root/state.json", '{"legacy":"fixture"}'],
  ]);
  const stats = (p) => ({
    mode: 0o640,
    ino: 1,
    dev: 2,
    isFile: () => text.has(p),
    isDirectory: () => p === "/fixture/root" || p === "/fixture/root/nested",
  });
  const file = (name) => ({ name, isDirectory: () => false, isFile: () => true });
  const directory = (name) => ({ name, isDirectory: () => true, isFile: () => false });
  return {
    trace,
    text,
    async lstat(p) {
      trace.push(["lstat", p]);
      const s = stats(p);
      if (conflict && p.endsWith("first.md") && trace.some((x) => x[0] === "write")) s.ino = 9;
      return s;
    },
    async readFile(p, encoding) {
      assert.equal(encoding, "utf8");
      trace.push(["read", p]);
      return text.get(p);
    },
    async readdir(p, options) {
      assert.deepEqual(plain(options), { withFileTypes: true });
      trace.push(["readdir", p]);
      return p.endsWith("nested")
        ? [file("second.markdown")]
        : [
            file("first.md"),
            directory("nested"),
            { name: "link.md", isDirectory: () => false, isFile: () => false },
          ];
    },
    async realpath(p) {
      trace.push(["realpath", p]);
      return p;
    },
    async writeFile(p, value, options) {
      assert.deepEqual(plain(options), { flag: "wx", mode: 0o640 });
      trace.push(["write", p]);
      text.set(p, value);
    },
    async chmod(p, mode) {
      assert.equal(mode, 0o640);
      trace.push(["chmod", p]);
    },
    async rename(from, to) {
      trace.push(["rename", from, to]);
      text.set(to, text.get(from));
      text.delete(from);
    },
    async rm(p, options) {
      assert.deepEqual(plain(options), { force: true });
      trace.push(["rm", p]);
      text.delete(p);
    },
  };
}

test("migration fake ports preserve concurrent edit denial cleanup and depth-first atomic ownership", async () => {
  const conflict = memoryFiles(true);
  const a = await load("node/subagentMarkdownMigration", conflict);
  const result = await a.migrateUserSubagentMarkdown("/fixture/root");
  assert.deepEqual(plain(result.migrated), ["/fixture/root/nested/second.markdown"]);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].path, "/fixture/root/first.md");
  assert.equal(result.failures[0].error.message, "Subagent file changed during migration");
  assert.equal(conflict.text.get("/fixture/root/first.md"), "legacy-fixture");
  assert.ok(![...conflict.text.keys()].some((x) => x.endsWith(".tmp")));
  assert.ok(!conflict.trace.some((x) => x[1]?.endsWith("/link.md")));
  const good = memoryFiles();
  const b = await load("node/subagentMarkdownMigration", good);
  const migrated = await b.migrateUserSubagentMarkdown("/fixture/root");
  assert.deepEqual(plain(migrated.migrated), [
    "/fixture/root/first.md",
    "/fixture/root/nested/second.markdown",
  ]);
  assert.equal(migrated.failures.length, 0);
  assert.deepEqual(
    good.trace.slice(1, 12).map((x) => x[0]),
    [
      "readdir",
      "lstat",
      "lock",
      "lstat",
      "read",
      "realpath",
      "write",
      "chmod",
      "lstat",
      "realpath",
      "read",
    ],
  );
  assert.ok(
    good.trace.findIndex((x) => x[0] === "rename") < good.trace.findIndex((x) => x[0] === "rm"),
  );
  await b.migrateSubagentStateFile("/fixture/root/state.json");
  assert.deepEqual(JSON.parse(good.text.get("/fixture/root/state.json")), {
    legacy: "fixture",
    current: "fixture",
  });
});
