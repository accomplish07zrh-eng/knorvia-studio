import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { appSettingsSchema } from "@knorvia/shared";
import { NodeApiClient } from "../src/providers/api/nodeApiClient.js";
import { createUsageStatsService } from "../src/usage-stats/usageStatsService.js";
import { createCredentialCipherProvider } from "../src/credential/providers/credentialCipherProvider.js";
import { createLocalServices, disposeServiceResourcesAndWait } from "../src/node.js";
import { IProviderSettingsService } from "../src/model-provider/providerFacadeServices.js";
import { setDataBaseDir } from "../src/paths.js";
import { createSettingService } from "../src/setting/settingService.js";

test("settings use the selected application root and portable data cannot be moved", async () => {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-setting-isolation-"));
  const prior = ["KNORVIA_DATA_BASE_DIR", "KNORVIA_HOME", "KNORVIA_PORTABLE_DIR"].map(
    (name) => [name, process.env[name]] as const,
  );
  process.env.KNORVIA_DATA_BASE_DIR = dir;
  process.env.KNORVIA_HOME = join(dir, "another-root");
  process.env.KNORVIA_PORTABLE_DIR = dir;
  try {
    const settings = createSettingService();
    await settings.update({ locale: "en-US" });
    const saved = JSON.parse(
      await readFile(join(dir, ".knorvia-studio", "v2", "setting.json"), "utf8"),
    );
    assert.equal(saved.locale, "en-US");
    await assert.rejects(settings.updateDataBaseDir(join(dir, "other")), /便携版/);
    delete process.env.KNORVIA_DATA_BASE_DIR;
    await settings.update({ locale: "zh-CN" });
    assert.equal(
      JSON.parse(await readFile(join(dir, "another-root", "v2", "setting.json"), "utf8")).locale,
      "zh-CN",
    );
  } finally {
    for (const [name, value] of prior) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test("HTTP forwards only explicit credentials and leaves 401 responses to the caller", async () => {
  const input = "https://model.example.invalid/v1/chat/completions";
  let sent: { url: unknown; init: RequestInit | undefined } | undefined;
  const client = new NodeApiClient({
    fetchImpl: (async (url, init) => {
      sent = { url, init };
      return new Response("invalid key", { status: 401 });
    }) as typeof fetch,
  });
  const response = await client.request(input, {
    headers: { Authorization: "Bearer test-only-model-key" },
  });
  assert.equal(response.status, 401);
  assert.equal(sent?.url, input);
  const headers = new Headers(sent?.init?.headers);
  assert.equal(headers.get("authorization"), "Bearer test-only-model-key");
  assert.ok(headers.get("x-request-id"));
  assert.deepEqual([...headers.keys()].sort(), ["authorization", "x-request-id"]);
});

test("credential encryption never uses the previous product secret", () => {
  const first = createCredentialCipherProvider({
    env: { ZCODE_CREDENTIAL_SECRET: "old-product-secret" },
  });
  const second = createCredentialCipherProvider({
    env: { ZCODE_CREDENTIAL_SECRET: "different-old-product-secret" },
  });
  const encrypted = first.encrypt("test-only-third-party-key");
  assert.equal(second.decrypt(encrypted), "test-only-third-party-key");
  const explicit = createCredentialCipherProvider({
    env: { KNORVIA_CREDENTIAL_SECRET: "explicit-knorvia-secret" },
  });
  assert.throws(() => explicit.decrypt(encrypted));
});

test("usage has only the local agent statistics method", async () => {
  const result = { source: "fixture-agent-statistics" };
  let requested: unknown;
  const service = createUsageStatsService({
    agentService: {
      getAppUsageStats: async (input) => {
        requested = input;
        return result as never;
      },
    },
  });
  assert.deepEqual(Object.keys(service), ["getAppUsageSnapshot"]);
  assert.equal(await service.getAppUsageSnapshot({ range: "today", timeZone: "UTC" }), result);
  assert.deepEqual(requested, { range: "today", timeZone: "UTC" });
});

test("local Host registers working provider configuration without product account channels", async () => {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-host-clean-"));
  setDataBaseDir(dir);
  const services = createLocalServices({
    knorviaBuiltinProviderConfigFilePath: fileURLToPath(
      new URL("../../../config/provider/builtin.json", import.meta.url),
    ),
    runtimeProcessEnvPatch: {},
    settingService: {
      get: async () => appSettingsSchema.parse({}),
      update: async () => {},
      updateDataBaseDir: async () => {},
      ensureDefaultProject: async () => ({ path: dir, created: false }),
    },
  });
  try {
    await services.get(IProviderSettingsService).getView();
    const channels: string[] = [];
    services.exposeOnChannelServer({
      registerChannel: (name: string) => channels.push(name),
    } as never);
    for (const forbidden of [
      "oauth",
      "coding-plan-subscription",
      "client-config",
      "client-scenes",
      "feedback",
      "provider-provisioning-target",
      "off-peak-task",
      "conversation-share",
    ]) {
      assert.ok(!channels.includes(forbidden), `Unexpected product channel: ${forbidden}`);
    }
    assert.ok(channels.includes("provider-settings"));
    assert.ok(channels.includes("credential"));
    const source = await readFile(new URL("../src/node.ts", import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /createOAuthService|createAccountProvider|fetchKnorviaBuiltinRemoteRelease|createTelemetryCore/,
    );
  } finally {
    await disposeServiceResourcesAndWait(services);
    setDataBaseDir(null);
    await rm(dir, { recursive: true, force: true });
  }
});
