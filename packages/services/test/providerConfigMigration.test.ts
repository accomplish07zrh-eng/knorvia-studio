import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createProviderConfigRuntime } from "../src/model-provider/providerConfigRuntime.js";
import { createProviderRuntime } from "../src/model-provider/providerRuntime.js";
import { getAppConfigDir, setDataBaseDir } from "../src/paths.js";

const builtin = fileURLToPath(new URL("../../../config/provider/builtin.json", import.meta.url));

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-provider-isolation-"));
  setDataBaseDir(dir);
  const configDir = getAppConfigDir();
  await mkdir(configDir, { recursive: true });
  const legacyPath = join(configDir, "config.json");
  const personalPath = join(configDir, "personal.json");
  const legacyContent = JSON.stringify({
    provider: { legacy: { options: { apiKey: "test-only-legacy-key" } } },
  });
  await writeFile(legacyPath, legacyContent);
  const recoveries: unknown[] = [];
  const runtime = createProviderConfigRuntime({
    knorviaBuiltinFilePath: builtin,
    personalFilePath: personalPath,
    personalPollingIntervalMs: false,
    watch: false,
    onPersonalConfigRecovery: (event) => recoveries.push(event.error),
  });
  return {
    dir,
    runtime,
    legacyPath,
    legacyContent,
    personalPath,
    recoveries,
    async dispose() {
      runtime.dispose();
      setDataBaseDir(null);
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("fresh startup does not import the previous product provider file", async () => {
  const fixture = await setup();
  try {
    await fixture.runtime.start();
    const config = await fixture.runtime.configService.read();
    assert.deepEqual(config.personalProviders.toJSON(), []);
    assert.deepEqual(fixture.recoveries, []);
    assert.equal(await readFile(fixture.legacyPath, "utf8"), fixture.legacyContent);
  } finally {
    await fixture.dispose();
  }
});

test("the existing personal provider configuration remains authoritative", async () => {
  const fixture = await setup();
  const current = JSON.stringify({
    schemaVersion: 1,
    config: {
      providerConfigRules: { providerRules: [] },
      modelConfigRules: { providerModelRules: [], manualProviderModelRules: [] },
    },
  });
  try {
    await writeFile(fixture.personalPath, current);
    await fixture.runtime.start();
    assert.deepEqual(fixture.recoveries, []);
    assert.equal(await readFile(fixture.personalPath, "utf8"), current);
  } finally {
    await fixture.dispose();
  }
});

test("invalid retired provider files cannot interrupt or mutate fresh configuration", async () => {
  const fixture = await setup();
  try {
    const invalid = '{"provider":';
    await writeFile(fixture.legacyPath, invalid);
    await fixture.runtime.start();
    assert.deepEqual(fixture.recoveries, []);
    assert.equal(await readFile(fixture.legacyPath, "utf8"), invalid);
  } finally {
    await fixture.dispose();
  }
});

test("personal API providers can be created and selected without an account or network", async () => {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-manual-provider-"));
  const runtime = createProviderRuntime({
    knorviaBuiltinFilePath: builtin,
    personalFilePath: join(dir, "personal.json"),
    personalPollingIntervalMs: false,
    watch: false,
  });
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw new Error("Unexpected provider background network request");
  };
  try {
    await runtime.start();
    const created = await runtime.providerSettings.createPersonalProvider({
      providerName: "Example manual provider",
      initialConfig: {
        access: { type: "api-key", apiKey: "test-only-key" },
        api: { type: "openai-chat-completions", baseUrl: "https://model.example.invalid/v1" },
      },
    });
    await runtime.providerSettings.addPersonalModel(created.providerId, "example-model", {});
    const view = await runtime.modelSelection.getView();
    const provider = view.providers.find((item) => item.providerId === created.providerId);
    assert.ok(provider);
    assert.ok(provider.models.some((item) => item.modelId === "example-model"));
    await runtime.providerSettings.refresh("explicit-local-refresh");
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    runtime.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
