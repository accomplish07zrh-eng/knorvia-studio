// Bounded synthetic data/admission checks only. No ordinary suite, runtime transport or provenance claim.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { build } from "esbuild";

// 根统一入口没有 positional root；显式历史输入仍优先，默认核对本包当前源码。
const root = process.argv[2] ?? fileURLToPath(new URL("../src/", import.meta.url));
assert.ok(root, "Supply a source root; no ambient configuration is read by the owners.");
const plain = (value) => JSON.parse(JSON.stringify(value));
async function load(name) {
  const output = await build({
    entryPoints: [resolve(root, name + ".ts")],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    plugins: [
      {
        name: "synthetic-telemetry-ports",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /\/(custom-model-value|legacy-model-provider-identity|model-provider-types|official-glm-model-id)\.js$/,
            },
            (args) => ({
              path: args.path,
              namespace: "synthetic",
            }),
          );
          builder.onLoad({ filter: /.*/, namespace: "synthetic" }, () => ({
            contents: [
              'export const OFFICIAL_GLM_MODEL_IDS = ["fixture-model"];',
              'export const isBuiltinModelProviderId = (id) => id === "account:fixture";',
              'export const migrateLegacyModelProviderId = (id) => id === "builtin:fixture" ? "account:fixture" : id;',
              'export const decodeCustomModelValue = (value) => value.startsWith("custom:") ? {providerId:"private-fixture",modelName:"fixture-model"} : undefined;',
            ].join("\n"),
          }));
        },
      },
    ],
  });
  const module = { exports: {} };
  runInNewContext(output.outputFiles[0].text, {
    module,
    exports: module.exports,
    URL,
    process: {
      env: { KNORVIA_BASE_URL: " https://runtime.invalid/path ", KNORVIA_ENDPOINT_ORIGIN: " " },
    },
    __KNORVIA_ENDPOINT_ENV__: {
      KNORVIA_ENDPOINT_ORIGIN: "https://injected.invalid/",
      EXTRA: "fixture",
    },
  });
  return module.exports;
}

test("endpoint admits explicit web origins and denies empty/nonweb origins without real environment data", async () => {
  const api = await load("endpoint");
  assert.equal(
    api.normalizeKnorviaEndpointOrigin(" https://fixture:synthetic@example.invalid:8443/p?q=1#f "),
    "https://example.invalid:8443",
  );
  assert.throws(() => api.normalizeKnorviaEndpointOrigin(" "), {
    message: "Knorvia Studio endpoint origin is empty",
  });
  assert.throws(() => api.normalizeKnorviaEndpointOrigin("ftp://example.invalid"), {
    message: "Knorvia Studio endpoint origin must use http or https",
  });
  assert.deepEqual(plain(api.readProductEndpointEnv()), {
    KNORVIA_ENDPOINT_ORIGIN: "https://injected.invalid/",
    EXTRA: "fixture",
    KNORVIA_BASE_URL: "https://runtime.invalid/path",
  });
  assert.equal(
    api.resolveRuntimeKnorviaEndpointOrigin({
      KNORVIA_BASE_URL: " ",
      KNORVIA_ENDPOINT_ORIGIN: "https://fallback.invalid/a",
    }),
    "https://fallback.invalid",
  );
});

test("file-entry wire boundary preserves escaped data and skips malformed rows without introducing path policy", async () => {
  const api = await load("workspaceFileEntriesCodec");
  const relativePath = "folder/😀\tline\nslash\\tail\r";
  const packed = api.packWorkspaceFileEntries([
    { type: "file", relativePath, name: "ignored", path: "ignored" },
  ]);
  assert.ok(!packed.includes("\n"));
  const entries = api.unpackWorkspaceFileEntries(
    packed + "\nmalformed\nunknown\t../retained\n",
    "C:\\fixture",
  );
  assert.deepEqual(plain(entries), [
    {
      name: "😀\tline\nslash\\tail\r",
      path: "C:\\fixture\\folder\\😀\tline\nslash\\tail\r",
      relativePath,
      type: "file",
    },
    {
      name: "retained",
      path: "C:\\fixture\\..\\retained",
      relativePath: "../retained",
      type: "file",
    },
  ]);
  assert.deepEqual(plain(api.unpackWorkspaceFileEntries("", "/fixture")), []);
});

test("search data boundary retains candidate identity/order and excludes absent or query-required matches", async () => {
  const api = await load("workspaceFileSearch");
  const candidates = api.mapWorkspaceFileEntriesToSearchCandidates([
    { name: " Beta ", path: "/fixture/Beta", relativePath: "Beta", type: "directory" },
    { name: "Alpha", path: "/fixture/Alpha", relativePath: "Alpha", type: "file" },
    { name: "Alpha", path: "/fixture/Other", relativePath: "Other", type: "file" },
  ]);
  const selected = api.filterWorkspaceFileSearchCandidates(candidates, " ALP ", { limit: 1 });
  assert.equal(selected[0], candidates[1]);
  assert.equal(selected.length, 1);
  assert.deepEqual(plain(api.filterWorkspaceFileSearchCandidates(candidates, "unmatchable")), []);
  assert.deepEqual(
    plain(api.filterWorkspaceFileSearchCandidates(candidates, "", { requireQuery: true })),
    [],
  );
  assert.equal(api.filterWorkspaceFileSearchCandidates(candidates, "")[0], candidates[1]);
  assert.equal(
    api.filterWorkspaceFileSearchCandidates(candidates, "Alpha", { limit: 0 }).length,
    0,
  );
  assert.equal(api.scoreWorkspaceFileFuzzyMatch(" ", ""), null);
});

test("feedback privacy denies structured/mixed secrets and diagnostic bodies while retaining benign content", async () => {
  const api = await load("feedbackPrivacy");
  assert.equal(
    api.redactFeedbackText('{"token":"synthetic","status":"ok"}'),
    '{"token":"[REDACTED]","status":"ok"}',
  );
  assert.equal(api.redactFeedbackText('{"content":"synthetic"}'), '{"content":"synthetic"}');
  assert.equal(
    api.redactFeedbackText('{"content":"synthetic"}', { diagnostic: true }),
    '{"content":"[REDACTED]"}',
  );
  assert.equal(api.redactFeedbackText('entry {"token":'), "entry [REDACTED]");
  assert.equal(
    api.redactFeedbackText("https://demo.invalid/files/item?X-Signature=synthetic"),
    "https://demo.invalid/[REDACTED]",
  );
  assert.equal(
    api.redactFeedbackText("https://demo.invalid/files/item?page=1"),
    "https://demo.invalid/files/item",
  );
  assert.equal(api.redactFeedbackText("-----BEGIN TEST PRIVATE KEY-----\nsynthetic"), "[REDACTED]");
});

test("telemetry boundary rejects local/private identities and secrets while admitting synthetic stable IDs", async () => {
  const api = await load("telemetryRedaction");
  assert.equal(api.redactTelemetryUrl("/opt/fixture/private"), "local_file");
  assert.equal(api.redactTelemetryUrl("!!!"), "unknown");
  assert.equal(
    api.redactTelemetryUrl(
      "https://fixture:synthetic@demo.invalid/items/1234567?token=synthetic#private",
    ),
    "https://demo.invalid/items/{segment}",
  );
  assert.equal(
    api.redactTelemetryText("token=synthetic user@demo.invalid /home/fixture/private"),
    "token={redacted} {email} {path}",
  );
  assert.equal(api.redactTelemetryText("(user@demo.invalid)"), "({email})");
  assert.equal(
    api.resolveTelemetryModelId("builtin", "account:fixture/FIXTURE-MODEL"),
    "fixture-model",
  );
  assert.equal(api.resolveTelemetryModelId("builtin", "private-name"), "custom");
  assert.equal(api.resolveTelemetryModelId("custom", "fixture-model"), "custom");
  assert.equal(api.resolveTelemetryModelId("unknown", "fixture-model"), "");
  assert.deepEqual(plain(api.resolveTelemetryProviderScope("builtin:fixture")), {
    providerId: "builtin:fixture",
    providerScope: "builtin",
  });
  assert.equal(api.sanitizeTelemetryModelValue("custom:private-fixture:fixture-model"), "custom");
});
