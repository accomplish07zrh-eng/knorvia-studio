import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCliProviderSwitchService } from "../src/cli-provider-switch/cliProviderSwitchService.js";
import { patchToml, parseToml } from "../src/cli-provider-switch/tomlPatch.js";

// specs/knorvia-cli-provider-switch.md

type Provider = { id: string; type: string; baseUrl: string; apiKey: string; models: string[] };

function providerView(providers: Provider[]) {
  return {
    revision: 1,
    providerTemplates: [],
    providerOrder: providers.map((item) => item.id),
    providers: providers.map((item) => ({
      providerId: item.id,
      providerName: item.id.toUpperCase(),
      enabled: true,
      executable: true,
      issues: [],
      effectiveConfig: {
        api: { type: item.type, baseUrl: item.baseUrl },
        access: { type: "api-key", apiKey: item.apiKey },
      },
      models: item.models.map((modelId) => ({ modelId, enabled: true, executable: true })),
    })),
  } as never;
}

async function fixture(providers: Provider[]) {
  const home = await mkdtemp(join(tmpdir(), "cli-switch-home-"));
  const dataDir = join(home, ".knorvia-studio");
  let current = providers;
  const service = createCliProviderSwitchService({
    providerSettings: { getView: async () => providerView(current) },
    dataDir,
    env: {},
    home,
    now: () => 1000,
  });
  return {
    home,
    dataDir,
    service,
    setProviders: (next: Provider[]) => (current = next),
    path: (...parts: string[]) => join(home, ...parts),
    close: () => rm(home, { recursive: true, force: true }),
  };
}

const glm: Provider = {
  id: "glm",
  type: "anthropic-messages",
  baseUrl: "https://open.example.cn/api/anthropic/v1",
  apiKey: "sk-glm-secret",
  models: ["glm-4.6"],
};
const responses: Provider = {
  id: "resp",
  type: "openai-responses",
  baseUrl: "https://api.example.com/v1/responses",
  apiKey: "sk-resp-secret",
  models: ["model-r"],
};
const chat: Provider = {
  id: "chat",
  type: "openai-chat-completions",
  baseUrl: "https://chat.example.com/v1",
  apiKey: "sk-chat-secret",
  models: ["model-c"],
};

test("TOML patch keeps comments and unrelated keys, and refuses unsafe layouts", () => {
  const original = [
    "# my codex config",
    'model = "gpt-5" # favourite',
    'approval_policy = "on-request"',
    "",
    "[mcp_servers.docs]",
    'command = "docs"',
    "",
  ].join("\n");
  const patched = patchToml(original, [
    { op: "set-top", key: "model", value: "glm" },
    { op: "replace-table", header: "model_providers.knorvia", entries: { base_url: "https://x" } },
  ]);
  assert.match(patched, /^# my codex config/);
  assert.match(patched, /\[mcp_servers\.docs\]\ncommand = "docs"/);
  const tree = parseToml(patched) as Record<string, any>;
  assert.equal(tree.model, "glm");
  assert.equal(tree.approval_policy, "on-request");
  assert.equal(tree.model_providers.knorvia.base_url, "https://x");
  // 内联表写法无法安全局部修改：拒绝而不是写出意外内容。
  assert.throws(
    () =>
      patchToml('model_providers = { knorvia = { name = "x" } }\n', [
        { op: "remove-table", header: "model_providers.knorvia" },
      ]),
    /无法安全/,
  );
});

test("Codex: switch to a Responses model and back restores the user's own fields", async () => {
  const f = await fixture([responses, chat]);
  try {
    await mkdir(f.path(".codex"), { recursive: true });
    const original = '# keep me\nmodel = "gpt-5"\n\n[mcp_servers.docs]\ncommand = "docs"\n';
    await writeFile(f.path(".codex", "config.toml"), original);
    await writeFile(f.path(".codex", "auth.json"), '{"auth_mode":"chatgpt"}');
    const view = await f.service.getView();
    assert.deepEqual(
      view.candidates.codex.map((item) => item.modelId),
      ["model-r"],
    );
    assert.equal(view.statuses.find((item) => item.cli === "codex")?.state, "official");

    const result = await f.service.apply({
      cli: "codex",
      target: { kind: "provider", providerId: "resp", modelId: "model-r" },
    });
    assert.equal(result.status.state, "knorvia");
    const switched = await readFile(f.path(".codex", "config.toml"), "utf8");
    const tree = parseToml(switched) as Record<string, any>;
    assert.equal(tree.model_provider, "knorvia");
    assert.equal(tree.model, "model-r");
    assert.equal(tree.model_providers.knorvia.base_url, "https://api.example.com/v1");
    assert.equal(tree.model_providers.knorvia.wire_api, "responses");
    assert.equal(tree.model_providers.knorvia.requires_openai_auth, false);
    assert.match(switched, /^# keep me/);

    await f.service.apply({ cli: "codex", target: { kind: "official" } });
    const restored = parseToml(await readFile(f.path(".codex", "config.toml"), "utf8"));
    assert.deepEqual(restored, parseToml(original));
    assert.equal(await readFile(f.path(".codex", "auth.json"), "utf8"), '{"auth_mode":"chatgpt"}');
    // 首次改写前留有原文件备份；切换记录不含密钥。
    assert.equal((await readdir(join(f.dataDir, "cli-switch", "backups"))).length, 1);
    assert.doesNotMatch(
      await readFile(join(f.dataDir, "cli-switch", "state.json"), "utf8"),
      /secret/,
    );
  } finally {
    await f.close();
  }
});

test("Claude Code: env routing is added and removed without touching other settings", async () => {
  const f = await fixture([glm]);
  try {
    await mkdir(f.path(".claude"), { recursive: true });
    const settings = {
      permissions: { allow: ["Bash(ls)"] },
      env: { ANTHROPIC_MODEL: "opus", OTHER: "1" },
    };
    await writeFile(f.path(".claude", "settings.json"), JSON.stringify(settings));
    await writeFile(f.path(".claude", ".credentials.json"), "{}");
    assert.deepEqual(
      (await f.service.getView()).candidates["claude-code"].map((item) => item.modelId),
      ["glm-4.6"],
    );
    await f.service.apply({
      cli: "claude-code",
      target: { kind: "provider", providerId: "glm", modelId: "glm-4.6" },
    });
    const switched = JSON.parse(await readFile(f.path(".claude", "settings.json"), "utf8"));
    assert.equal(switched.env.ANTHROPIC_BASE_URL, "https://open.example.cn/api/anthropic");
    assert.equal(switched.env.ANTHROPIC_AUTH_TOKEN, "sk-glm-secret");
    assert.equal(switched.env.ANTHROPIC_DEFAULT_HAIKU_MODEL, "glm-4.6");
    assert.equal(switched.env.OTHER, "1");
    assert.deepEqual(switched.permissions, settings.permissions);

    const back = await f.service.apply({ cli: "claude-code", target: { kind: "official" } });
    assert.equal(back.restartRequired, "restart-running");
    assert.deepEqual(
      JSON.parse(await readFile(f.path(".claude", "settings.json"), "utf8")),
      settings,
    );
    assert.equal(await readFile(f.path(".claude", ".credentials.json"), "utf8"), "{}");
  } finally {
    await f.close();
  }
});

test("external edits are detected; take-over is explicit; unreadable files are left alone", async () => {
  const f = await fixture([chat]);
  try {
    await mkdir(f.path(".grok"), { recursive: true });
    // 例如 CC Switch 写入的自定义模型。
    const external = '[models]\ndefault = "custom"\n\n[model.custom]\nmodel = "x"\n';
    await writeFile(f.path(".grok", "config.toml"), external);
    assert.equal(
      (await f.service.getView()).statuses.find((item) => item.cli === "grok-build")?.state,
      "external",
    );
    const target = { kind: "provider", providerId: "chat", modelId: "model-c" } as const;
    await assert.rejects(() => f.service.apply({ cli: "grok-build", target }), /接管/);
    assert.equal(await readFile(f.path(".grok", "config.toml"), "utf8"), external);
    await f.service.apply({ cli: "grok-build", target, takeOver: true });
    const tree = parseToml(await readFile(f.path(".grok", "config.toml"), "utf8")) as any;
    assert.equal(tree.models.default, "knorvia");
    assert.equal(tree.model.knorvia.api_backend, "chat_completions");
    assert.equal(tree.model.knorvia.base_url, "https://chat.example.com/v1");
    assert.equal(tree.model.custom.model, "x");

    await mkdir(f.path(".claude"), { recursive: true });
    await writeFile(f.path(".claude", "settings.json"), "{ not json");
    const status = (await f.service.getView()).statuses.find((item) => item.cli === "claude-code");
    assert.equal(status?.state, "unreadable");
    await assert.rejects(() =>
      f.service.apply({ cli: "claude-code", target: { kind: "official" } }),
    );
    assert.equal(await readFile(f.path(".claude", "settings.json"), "utf8"), "{ not json");
  } finally {
    await f.close();
  }
});

test("a changed provider key marks the active switch as stale; CLIs stay independent", async () => {
  const f = await fixture([glm, responses]);
  try {
    await f.service.apply({
      cli: "claude-code",
      target: { kind: "provider", providerId: "glm", modelId: "glm-4.6" },
    });
    const view = await f.service.getView();
    assert.equal(view.statuses.find((item) => item.cli === "codex")?.state, "official");
    assert.equal(view.statuses.find((item) => item.cli === "claude-code")?.active?.stale, false);
    f.setProviders([{ ...glm, apiKey: "sk-rotated" }, responses]);
    const after = await f.service.getView();
    assert.equal(after.statuses.find((item) => item.cli === "claude-code")?.active?.stale, true);
    // 协议不匹配的模型不能接给 Claude Code。
    await assert.rejects(
      () =>
        f.service.apply({
          cli: "claude-code",
          target: { kind: "provider", providerId: "resp", modelId: "model-r" },
        }),
      /不兼容/,
    );
  } finally {
    await f.close();
  }
});
