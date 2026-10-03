// Synthetic values and virtual retained runtime ports; no live environment/account/network actions.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { build } from "esbuild";
// 根统一入口没有 positional root；显式历史输入仍优先，默认核对本包当前源码。
const root = process.argv[2] ?? fileURLToPath(new URL("../src/", import.meta.url));
assert.ok(root, "Supply source root.");
const plain = (x) => JSON.parse(JSON.stringify(x));
const ports = {
  "./model-selection.js":
    'export const formatModelPickerValue=v=>v?"fixture:"+v.providerId+"/"+v.modelId:"";',
  "./oauth.js": 'export const ZAI_PROVIDER_ID="zai";export const BIGMODEL_PROVIDER_ID="bigmodel";',
  "./model-provider-types.js":
    'export const BUILTIN_MODEL_PROVIDER_IDS={zaiStartPlan:"account:zai-start-plan",zaiIndividualCodingPlan:"account:zai-individual-coding-plan",zaiTeamCodingPlan:"account:zai-team-coding-plan",bigmodelStartPlan:"account:bigmodel-start-plan",bigmodelIndividualCodingPlan:"account:bigmodel-individual-coding-plan",bigmodelTeamCodingPlan:"account:bigmodel-team-coding-plan"};',
  "./env.js": 'export const KNORVIA_ENV="synthetic";',
  "./endpoint.js": 'export const buildBigModelCodingPlanTeamManageUrl=v=>"fixture:"+v.KNORVIA_ENV;',
  "./plugin-marketplaces.js":
    'export const KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID="knorvia-plugins-bundled";',
};
async function load(name) {
  const out = await build({
    entryPoints: [resolve(root, name + ".ts")],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    plugins: [
      {
        name: "virtual-runtime-ports",
        setup(b) {
          b.onResolve({ filter: /\.js$/ }, (a) =>
            ports[a.path] ? { path: a.path, namespace: "synthetic" } : undefined,
          );
          b.onLoad({ filter: /.*/, namespace: "synthetic" }, (a) => ({ contents: ports[a.path] }));
        },
      },
    ],
  });
  const module = { exports: {} };
  runInNewContext(out.outputFiles[0].text, { module, exports: module.exports, URL });
  return module.exports;
}

test("settings projection preserves identity bytes, owned choices and empty/default admission", async () => {
  const a = await load("agent-model-state");
  const input = {
    model: {
      current: { providerId: "fixture", modelId: "name:free" },
      available: [
        {
          ref: { providerId: "fixture", modelId: "name:free" },
          label: "Synthetic",
          providerLabel: "",
          reasoning: { levels: [{ value: "low" }], defaultLevel: "invalid" },
        },
        {
          ref: { providerId: "fixture", modelId: "second" },
          label: "Second",
          reasoning: { levels: [], defaultLevel: "" },
        },
      ],
    },
    mode: { current: "unknown" },
    thoughtLevel: {
      enabled: true,
      current: "",
      defaultLevel: "low",
      available: [{ value: "low", label: "Low" }],
    },
  };
  const before = plain(input);
  const r = a.sessionSettingsToKnorviaConfigOptions(input);
  assert.deepEqual(plain(r.map((x) => x.id)), ["model", "mode", "thought_level"]);
  assert.equal(r[0].currentValue, "fixture:fixture/name:free");
  assert.equal(r[0].options[0].modelProviderName, "");
  assert.ok(Object.hasOwn(r[0].options[0], "description"));
  assert.ok(!Object.hasOwn(r[0].options[0], "modelDefaultThoughtLevel"));
  assert.deepEqual(plain(r[0].options[1].modelThoughtLevels), []);
  assert.ok(
    !Object.hasOwn(r[0].options[1], "modelDefaultThoughtLevel"),
    "empty model default remains omitted",
  );
  assert.equal(r[1].currentValue, "build");
  assert.equal(r[2].currentValue, "");
  r[0].options[0].modelThoughtLevels.push("fixture-extra");
  assert.deepEqual(plain(input), before);
  const modes = a.getKnorviaAgentAvailableModes();
  modes[0].name = "changed";
  assert.equal(a.getKnorviaAgentModeSelectOptions()[0].name, "Ask before changes");
  const sparse = [];
  sparse.length = 2;
  sparse[1] = input.model.available[0];
  const sparseResult = a.sessionSettingsToKnorviaConfigOptions({
    ...input,
    model: { ...input.model, available: sparse },
    thoughtLevel: { ...input.thoughtLevel, enabled: false },
  });
  assert.equal(sparseResult.length, 2);
  assert.ok(!(0 in sparseResult[0].options));
  const trace = [];
  const ordered = {
    ref: {
      providerId: "fixture",
      get modelId() {
        trace.push("picker");
        return "ordered";
      },
    },
    label: "Ordered",
    reasoning: {
      get levels() {
        trace.push("reasoning");
        return [];
      },
    },
  };
  a.sessionSettingsToKnorviaConfigOptions({
    ...input,
    model: { current: undefined, available: [ordered] },
  });
  assert.deepEqual(
    trace,
    ["reasoning", "picker"],
    "reasoning projection must precede per-option picker",
  );
});

test("family classification preserves catalogue identity and exact domain boundaries without account access", async () => {
  const a = await load("model-provider-family");
  assert.strictEqual(a.getModelProviderFamilySpec("zai"), a.MODEL_PROVIDER_FAMILY_SPECS[0]);
  assert.strictEqual(
    a.resolveModelProviderFamilySpecByProviderId("account:bigmodel-team-coding-plan"),
    a.MODEL_PROVIDER_FAMILY_SPECS[1],
  );
  assert.equal(a.getModelProviderFamilySpec("invalid"), undefined);
  assert.equal(a.resolveModelProviderFamilyIdByBaseURL("  https://api.Z.AI/fixture  "), "zai");
  assert.equal(a.resolveModelProviderFamilyIdByBaseURL("https://z.ai.example.invalid/"), null);
  assert.equal(a.resolveModelProviderFamilyIdByBaseURL("https://notz.ai/"), null);
  assert.equal(a.resolveModelProviderFamilyIdByBaseURL("https://z.ai./"), null);
  assert.equal(a.resolveModelProviderFamilyIdByBaseURL("invalid"), null);
  assert.equal(a.normalizeProviderFamilyDomain(" zai "), null);
  assert.equal(
    a.shouldShowBuiltinModelProviderForDomain({
      providerId: "account:zai-start-plan",
      providerFamilyDomain: "bigmodel",
    }),
    false,
  );
  assert.equal(
    a.shouldShowBuiltinModelProviderForDomain({
      providerId: "fixture:custom",
      providerFamilyDomain: "bigmodel",
    }),
    true,
  );
  assert.equal(
    a.shouldShowModelProviderFamilyForActiveOAuth({
      familyId: "zai",
      activeOAuthProvider: "invalid",
    }),
    true,
  );
  assert.equal(a.MODEL_PROVIDER_FAMILY_SPECS[1].teamCodingPlanManageUrl, "fixture:synthetic");
  const sentinel = new Error("synthetic catalogue getter");
  Object.defineProperty(a.MODEL_PROVIDER_FAMILY_SPECS[0], "rootDomain", {
    get() {
      throw sentinel;
    },
  });
  assert.throws(
    () => a.resolveModelProviderFamilyIdByBaseURL("https://fixture.invalid/"),
    (e) => e === sentinel,
    "only URL parsing errors are caught",
  );
});

test("plugin ordering preserves configured duplicate ranks, exact official IDs and stable item references", async () => {
  const a = await load("pluginStoreOrdering");
  const official = "@knorvia-plugins-bundled";
  const input = [
    { id: "pdf@personal", category: " guides ", displayName: "A" },
    { id: "presentations" + official, category: "utilities", displayName: "Z" },
    { id: "pdf" + official, category: "utilities", displayName: "Z" },
    { id: "first", category: "unknown", displayName: "Same" },
    { id: "second", category: "unknown", displayName: "Same" },
    { id: "fallback", category: " ", displayName: "A" },
  ];
  const before = input.slice();
  let calls = 0;
  const r = a.sortPluginStoreEntries(
    input,
    (x) => {
      calls++;
      return x;
    },
    "en",
    {
      categoryOrder: ["utilities", "utilities", "unknown"],
      pluginOrder: { utilities: ["presentations" + official, "presentations" + official] },
    },
  );
  assert.equal(calls, input.length);
  assert.deepEqual(
    r.map((x) => x.id),
    ["presentations" + official, "pdf" + official, "pdf@personal", "first", "second", "fallback"],
  );
  assert.notStrictEqual(r, input);
  assert.strictEqual(r[0], input[1]);
  assert.deepEqual(input, before);
  assert.equal(a.compareDocumentPluginPriority("pdf" + official, "pdf@personal"), -4);
  assert.equal(a.resolvePluginStoreCategory(" guides "), "utilities");
  const sparse = [];
  sparse.length = 3;
  sparse[1] = input[0];
  calls = 0;
  const sr = a.sortPluginStoreEntries(
    sparse,
    (x) => {
      calls++;
      return x;
    },
    "en",
  );
  assert.equal(calls, 1);
  assert.equal(sr.length, 3);
  assert.strictEqual(sr[0], input[0]);
  assert.ok(!(1 in sr));
  a.PLUGIN_STORE_CATEGORY_ORDER.reverse();
  const changed = [
    { id: "utilities-item", category: "utilities", displayName: "A" },
    { id: "legal-item", category: "legal", displayName: "B" },
  ];
  assert.equal(
    a.sortPluginStoreEntries(changed, (x) => x, "en")[0].id,
    "legal-item",
    "default category order observes retained exported table",
  );
});

test("config admission retains URL bytes, array records, exact flags and same-language fallback", async () => {
  const a = await load("remoteAppConfig");
  const config = [];
  config.feedback_url = "  fixture-url  ";
  config.feedback_use_external_form = "true";
  config.community_urls = { "zh-CN": " zh-fixture ", "en-US": " " };
  config.forceUpdate = [];
  config.forceUpdate.minimalVersion = " 4.5 ";
  assert.equal(a.getFeedbackUrlFromConfig(config), "  fixture-url  ");
  assert.equal(a.getFeedbackUseExternalFormFromConfig(config), true);
  assert.equal(
    a.getFeedbackUseExternalFormFromConfig({ feedback_use_external_form: " true " }),
    false,
  );
  assert.equal(a.getForceUpdateMinimalVersionFromConfig(config), "4.5");
  const urls = a.getCommunityUrlsFromConfig(config);
  assert.ok(Object.hasOwn(urls, "en-US"));
  assert.equal(urls["en-US"], undefined);
  assert.equal(
    a.getCommunityUrlFromConfigs(config, { community_urls: { "en-US": "en-fixture" } }, "en-US"),
    "en-fixture",
  );
  assert.equal(a.getCommunityUrlFromConfigs(config, {}, "en-US"), undefined);
  assert.deepEqual(plain(a.getCommunityUrlsFromConfig(null)), {});
  const trace = [];
  const remote = {
    get community_urls() {
      trace.push("remote");
      return { "en-US": "remote-fixture" };
    },
  };
  const local = {
    get community_urls() {
      trace.push("local");
      return { "en-US": "local-fixture" };
    },
  };
  assert.equal(a.getCommunityUrlFromConfigs(remote, local, "en-US"), "remote-fixture");
  assert.deepEqual(trace, ["remote", "local"]);
});

test("entitlement identity preserves TTL boundary, coding authority and explicit no-plan precedence", async () => {
  const a = await load("plan-identity");
  const none = {
    generatedAt: 90,
    authenticated: true,
    unavailableReason: "no_plan",
    provider: null,
    remaining: { count: 1 },
    subscription: null,
    quota: null,
  };
  const active = {
    ...none,
    unavailableReason: undefined,
    subscription: { details: [{ productId: "fixture-plan" }] },
  };
  const input = {
    providerFamilyDomain: "zai",
    codingPlanEntitlement: active,
    startPlanEntitlement: none,
    now: 100,
    entitlementCacheTtlMs: 10,
  };
  assert.deepEqual(plain(a.resolvePlanIdentitySnapshot(input)), {
    generatedAt: 90,
    planStatus: "coding_plan",
    planProductId: "fixture-plan",
  });
  assert.deepEqual(plain(a.resolvePlanIdentitySnapshot({ ...input, now: 101 })), {
    generatedAt: 101,
    planStatus: "unknown",
    planProductId: "",
  });
  assert.equal(
    a.resolvePlanIdentitySnapshot({
      ...input,
      codingPlanEntitlement: none,
      startPlanEntitlement: active,
    }).planStatus,
    "start_plan",
  );
  assert.equal(
    a.resolvePlanIdentitySnapshot({ ...input, codingPlanEntitlement: none }).planStatus,
    "no_plan",
  );
  assert.equal(
    a.resolvePlanIdentitySnapshot({
      ...input,
      codingPlanEntitlement: { ...active, authenticated: false },
    }).planStatus,
    "unknown",
  );
  const lazy = {
    ...input,
    codingPlanEntitlement: null,
    get startPlanEntitlement() {
      throw new Error("must not inspect start");
    },
  };
  assert.equal(a.resolvePlanIdentitySnapshot(lazy).planStatus, "unknown");
  assert.equal(
    a.resolvePlanIdentitySnapshot({ ...input, providerFamilyDomain: null }).planStatus,
    "unknown",
  );
});
