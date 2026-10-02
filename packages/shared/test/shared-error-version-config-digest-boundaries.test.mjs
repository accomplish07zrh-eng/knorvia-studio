// Synthetic data/validation boundaries only; retained state/config/path/hash ports are virtual.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { build } from "esbuild";

const root = process.argv[2];
assert.ok(root, "Supply baseline or candidate source root.");
const plain = (value) => JSON.parse(JSON.stringify(value));
const ports = {
  "./model-selection.js":
    'export const modelSelectionSchema={safeParse:v=>v&&typeof v.providerId==="string"&&typeof v.modelId==="string"?{data:{...v}}:{}};',
  "./legacy-model-provider-identity.js":
    'export const migrateLegacyModelProviderId=p=>p==="builtin:old"?"builtin:new":p;export const migrateLegacyOfficialGlmModelId=(p,m)=>p==="builtin:old"?"migrated-"+m:m;',
  "./subagent-markdown-selection.js":
    'export const parseSubagentMarkdownSelection=v=>typeof v.model==="string"&&v.model.includes("/")?{providerId:v.model.slice(0,v.model.indexOf("/")),modelId:v.model.slice(v.model.indexOf("/")+1),...(v.thoughtLevel?{options:{reasoningLevel:v.thoughtLevel}}:{})}:undefined;',
  "./subagents-types.js":
    'export const parsePluginSubagentModelSelectionOverrides=v=>v&&typeof v==="object"&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).filter(([k,x])=>k.startsWith("plugin:")&&x&&typeof x.providerId==="string"&&typeof x.modelId==="string")):{};',
  "./workspace-hook-config.js":
    'export const WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION=1;export const WORKSPACE_HOOK_EVENT_NAMES=["PreToolUse","SessionStart"];export const resolveWorkspaceHookTimeoutMs=(h,d)=>h.timeoutMs??d;export const resolveWorkspaceHookConfiguredGates=({sourceEnabled,declarationEnabled,runtimeHooksEnabled})=>({sourceRootEnabled:sourceEnabled!==false,declarationEnabled:declarationEnabled!==false,runtimeHooksEnabled,configuredEnabled:sourceEnabled!==false&&declarationEnabled!==false&&runtimeHooksEnabled});',
  "node:crypto":
    'export const createHash=a=>{if(a!=="sha256")throw new Error("wrong algorithm");return {update:s=>({digest:e=>{if(e!=="hex")throw new Error("wrong encoding");return fixtureDigest(s);}})}};',
  "node:path":
    'export const resolve=p=>p;export const relative=(base,p)=>p===base?"":p.startsWith(base+"/")?p.slice(base.length+1):p;export const basename=p=>p.split(/[\\\\/]/).at(-1);',
};
async function load(name, options = {}) {
  const output = await build({
    entryPoints: [resolve(root, name + ".ts")],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    plugins: [
      {
        name: "synthetic-owner-ports",
        setup(builder) {
          builder.onResolve({ filter: /(?:\.js$|^node:)/ }, (args) =>
            ports[args.path] ? { path: args.path, namespace: "synthetic" } : undefined,
          );
          builder.onLoad({ filter: /.*/, namespace: "synthetic" }, (args) => ({
            contents: ports[args.path],
          }));
        },
      },
    ],
  });
  const hashes = [];
  const trace = [];
  const module = { exports: {} };
  runInNewContext(output.outputFiles[0].text, {
    module,
    exports: module.exports,
    Error,
    process: { platform: options.platform ?? "linux" },
    Date: class {
      toISOString() {
        trace.push("time");
        return "synthetic-time";
      }
    },
    fixtureDigest: (serialized) => {
      trace.push("hash");
      hashes.push(JSON.parse(serialized));
      return "digest:" + serialized;
    },
  });
  return { api: module.exports, hashes, trace };
}

test("unknown errors retain wrapped candidate and message/code fallback without leaking unrelated fields", async () => {
  const { api } = await load("errors");
  assert.deepEqual(
    plain(
      api.normalizeUnknownError({
        message: "outer",
        error: { message: "inner", code: 12n, unrelated: "omit" },
      }),
    ),
    { message: "inner", code: "12" },
  );
  assert.equal(Object.hasOwn(api.normalizeUnknownError(7), "code"), false);
  assert.equal(Object.hasOwn(api.normalizeUnknownError({ message: "text" }), "code"), true);
  const error = new Error("");
  error.name = "SyntheticFailure";
  error.code = api.KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE;
  assert.equal(api.normalizeUnknownError(error).message, "SyntheticFailure");
  assert.equal(api.isKnorviaFileLockTimeoutError({ error }), true);
  const cycle = {};
  cycle.self = cycle;
  assert.equal(api.stringifyUnknownValue(cycle), "[object Object]");
  assert.equal(api.stringifyUnknownValue(undefined), "undefined");
  assert.equal(
    api.normalizeUnknownError({ message: undefined, code: false }).message,
    '{"code":false}',
  );
});

test("version requirement admits shorthand and exact prerelease ordering without an update action", async () => {
  const { api } = await load("forceUpdate");
  assert.equal(api.compareSemverVersions(" v4.5 ", "4.5.0+fixture"), 0);
  assert.equal(api.compareSemverVersions("4.5.0-beta.2", "4.5.0-beta.11"), -1);
  assert.equal(api.compareSemverVersions("4.5.0-1", "4.5.0-a"), -1);
  assert.equal(api.compareSemverVersions("4.5.0", "4.5.0-alpha"), 1);
  assert.equal(api.compareSemverVersions("4.5-beta", "4.5.0"), null);
  assert.equal(api.compareSemverVersions("invalid", "4"), null);
  assert.deepEqual(
    plain(
      api.resolveForceUpdateRequirement({
        currentVersion: " v4 ",
        forceUpdate: { minimalVersion: " 5 " },
      }),
    ),
    { currentVersion: " v4 ", minimalVersion: "5" },
  );
  assert.equal(
    api.resolveForceUpdateRequirement({
      currentVersion: "5",
      forceUpdate: { minimalVersion: "4" },
    }),
    null,
  );
});

test("subagent storage import respects own current-map authority without reviving legacy identity", async () => {
  const { api } = await load("subagent-state-migration");
  const preserved = { fixture: true };
  const current = {
    preserved,
    builtInModelSelectionOverrides: null,
    pluginAgentModelSelectionOverrides: undefined,
    builtInModelOverrides: { Explore: "builtin:old/model" },
    pluginAgentModelOverrides: { "plugin:fixture": "builtin:old/model" },
  };
  const denied = api.importSubagentStateSelections(current);
  assert.deepEqual(plain(denied.builtInModelSelectionOverrides), {});
  assert.deepEqual(plain(denied.pluginAgentModelSelectionOverrides), {});
  assert.equal(denied.preserved, preserved);
  assert.equal(current.builtInModelSelectionOverrides, null);
  const legacy = api.importSubagentStateSelections({
    builtInModelOverrides: { Explore: "builtin:old/model" },
    builtInThoughtLevelOverrides: { Explore: "high" },
    pluginAgentModelOverrides: {
      "plugin:fixture": "builtin:old/model",
      invalid: "builtin:old/model",
    },
  });
  assert.equal(legacy.builtInModelSelectionOverrides.Explore.providerId, "builtin:new");
  assert.equal(legacy.builtInModelSelectionOverrides.Explore.modelId, "migrated-model");
  assert.equal(legacy.builtInModelSelectionOverrides.Explore.options.reasoningLevel, "high");
  assert.deepEqual(plain(Object.keys(legacy.pluginAgentModelSelectionOverrides)), [
    "plugin:fixture",
  ]);
  const authoritative = api.importSubagentStateSelections({
    builtInModelSelectionOverrides: { Explore: { providerId: "builtin:old", modelId: "model" } },
  });
  assert.equal(authoritative.builtInModelSelectionOverrides.Explore.providerId, "builtin:old");
  assert.equal(authoritative.builtInModelSelectionOverrides.Explore.modelId, "model");
});

test("MCP DTO conversion preserves fake-platform wrapping and existing optional config admission", async () => {
  const { api } = await load("mcp", { platform: "win32" });
  const args = ["/c", "fixture-command", "fixture-arg"];
  const output = api.convertToKnorviaAgentMcpServer("fixture", {
    command: "CMD.EXE",
    args,
    timeoutMs: 1,
    isolation: "workspace",
    protocolVersion: "auto",
    env: { FIXTURE: "synthetic" },
  });
  assert.equal(output.command, "fixture-command");
  assert.deepEqual(plain(output.args), ["fixture-arg"]);
  assert.notEqual(output.args, args);
  assert.equal(args.length, 3);
  assert.deepEqual(plain(output.env), [{ name: "FIXTURE", value: "synthetic" }]);
  assert.equal(output.timeoutMs, 1);
  assert.equal(api.isKnorviaCuaMcpCommand("/fixture/cua/"), true);
  assert.equal(api.isKnorviaCuaMcpPackageArg("cua.git@fixture"), true);
  assert.equal(api.isKnorviaCuaMcpPackageArg("cua-proxy"), false);
  assert.equal(api.isKnorviaCuaMcpPackageArg("CUA"), false);
  const oauth = {
    type: "authorization_code",
    clientId: "",
    clientSecret: "",
    scope: "synthetic-scope",
  };
  const headers = {};
  const http = api.convertToKnorviaAgentMcpServer("fixture", {
    type: "unknown",
    url: "synthetic-url",
    headers,
    http_headers: { fixture: "fallback" },
    oauth,
    timeoutMs: "1",
    isolation: "invalid",
    protocolVersion: "invalid",
  });
  assert.equal(http.type, "http");
  assert.equal(http.oauth, oauth);
  assert.deepEqual(plain(http.headers), []);
  assert.equal(
    api.getMcpServerRequestHeaders({ headers, http_headers: { fixture: "fallback" } }),
    headers,
  );
  assert.equal(Object.hasOwn(http, "timeoutMs"), false);
  assert.equal(Object.hasOwn(http, "isolation"), false);
  assert.equal(Object.hasOwn(http, "protocolVersion"), false);
  assert.equal(
    Object.hasOwn(
      api.convertToKnorviaAgentMcpServer("fixture", {
        url: "synthetic-url",
        oauth: { type: "client_credentials", clientId: " ", clientSecret: "" },
      }),
      "oauth",
    ),
    false,
  );
  assert.equal(api.convertToKnorviaAgentMcpServer("fixture", {}), null);
});

test("hook digest preserves canonical payload order, optional distinctions and owned snapshot freezing", async () => {
  const { api, hashes, trace } = await load("workspace-hook-digest");
  const args = ["one", "two"];
  const sources = [
    {
      canonicalPath: "/fixture/hooks.json",
      baseDir: "/fixture",
      discoveryOrder: 7,
      configFileKind: "fixture",
      explicitProjectConfig: false,
      editable: true,
      hooks: {
        enabled: false,
        events: {
          SessionStart: [
            { hooks: [{ type: "command", command: "never executed", shell: "", async: true }] },
          ],
          PreToolUse: [
            { matcher: "Fixture", hooks: [{ type: "process", command: "never executed", args }] },
          ],
        },
      },
    },
  ];
  const input = {
    workspaceIdentity: "synthetic-identity",
    workspacePath: "/fixture",
    sources,
    runtimeRoot: { enabled: true, timeoutMs: 10, maxOutputBytes: 20 },
    discoveredAt: "",
  };
  const snapshot = api.buildWorkspaceHookBundleSnapshot(input);
  assert.deepEqual(plain(snapshot.hooks.map((h) => h.event)), ["PreToolUse", "SessionStart"]);
  assert.equal(snapshot.hooks[0].reviewItemId, "workspace-hook-0-PreToolUse-0-0");
  assert.equal(snapshot.hooks[0].sourceRelativePath, "hooks.json");
  assert.deepEqual(plain(hashes[0]), [
    "workspace-hook-declaration",
    1,
    "hooks.json",
    7,
    "PreToolUse",
    "Fixture",
    0,
    0,
    ["process", "never executed", ["one", "two"]],
    10,
    20,
  ]);
  assert.deepEqual(plain(hashes[1][8]), ["command", "never executed", true, ["string", ""]]);
  assert.deepEqual(plain(hashes[2][2]), [
    ["hooks.json", 7, "fixture", false, ["set", false], ["unset"], ["unset"]],
  ]);
  assert.equal(snapshot.discoveredAt, "");
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.hooks[0].args), true);
  assert.notEqual(snapshot.hooks[0].args, args);
  assert.equal(Object.isFrozen(args), false);
  assert.equal(Object.isFrozen(sources), false);
  const omitted = api.createWorkspaceHookDeclarationDigest({
    sourceRelativePath: "hooks.json",
    sourceDiscoveryOrder: 7,
    event: "SessionStart",
    matcher: null,
    matcherIndex: 0,
    hookIndex: 0,
    hook: { type: "command", command: "never executed" },
    defaultTimeoutMs: 10,
    resolvedMaxOutputBytes: 20,
  });
  const empty = api.createWorkspaceHookDeclarationDigest({
    sourceRelativePath: "hooks.json",
    sourceDiscoveryOrder: 7,
    event: "SessionStart",
    matcher: null,
    matcherIndex: 0,
    hookIndex: 0,
    hook: { type: "command", command: "never executed", shell: "" },
    defaultTimeoutMs: 10,
    resolvedMaxOutputBytes: 20,
  });
  assert.notEqual(omitted, empty);
  const noHooks = api.buildWorkspaceHookBundleSnapshot({ ...input, sources: [] });
  assert.equal(noHooks, undefined);
  const sampled = api.buildWorkspaceHookBundleSnapshot({ ...input, discoveredAt: undefined });
  assert.equal(sampled.discoveredAt, "synthetic-time");
  assert.deepEqual(trace.slice(-2), ["time", "hash"]);
});
