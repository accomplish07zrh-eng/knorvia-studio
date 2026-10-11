// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01 合同测试：config/*（B18–B59）。
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { adaptersRoot, load, loadContracts, repoRoot } from "./entry.mjs";

const { ConfigScope, DefaultRuntimeConfig, ConfigKey, ConfigScopePriority } = await loadContracts();
const envConfig = await load("config/env-config.adapter");
const schema = await load("config/schema");
const merger = await load("config/config-merger");
const configIndex = await load("config/index");
const fileConfig = await load("config/file-config.adapter");
const projectConfig = await load("config/project-config.adapter");
const factory = await load("config/config-factory");

const { ConfigPortImpl, createConfigPort } = configIndex;

async function tempDir(t) {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-contract-config-"));
  t.after(async () => await rm(directory, { recursive: true, force: true }));
  return directory;
}

test("B18 环境变量解析：键名映射、数值归一与未知键忽略", () => {
  assert.deepEqual(envConfig.parseEnvConfig({ KNORVIA_STORAGE_DIR: "/x" }), {
    storage: { dir: "/x" },
  });
  assert.deepEqual(envConfig.parseEnvConfig({ KNORVIA_SESSION_DB: "/db" }), {
    storage: { sessionDbPath: "/db" },
  });
  assert.deepEqual(envConfig.parseEnvConfig({ KNORVIA_SESSION_DB_PATH: "/db2" }), {
    storage: { sessionDbPath: "/db2" },
  });
  assert.deepEqual(envConfig.parseEnvConfig({ KNORVIA_HTTP_PROXY: "http://proxy.invalid:8080" }), {
    network: { httpProxy: "http://proxy.invalid:8080" },
  });
  assert.equal(envConfig.parseEnvConfig({ KNORVIA_HTTP_TIMEOUT: "abc" }).network.timeout, 0);
  assert.equal(envConfig.parseEnvConfig({ KNORVIA_TIMEOUT: "1234" }).network.timeout, 1234);
  assert.equal(envConfig.parseEnvConfig({ KNORVIA_LOG_FORMAT: "JSON" }).logging.format, "json");
  assert.equal(envConfig.parseEnvConfig({ KNORVIA_LOG_FORMAT: "yaml" }).logging.format, "text");
  assert.deepEqual(envConfig.parseEnvConfig({ KNORVIA_UNKNOWN: "1" }), {});
  assert.deepEqual(envConfig.parseEnvConfig({ KNORVIA_STORAGE_DIR: undefined }), {});
  assert.equal(
    envConfig.parseEnvConfig({ APP_STORAGE_DIR: "/y" }, { prefix: "APP_" }).storage.dir,
    "/y",
  );
  assert.equal(
    envConfig.parseEnvConfig({ KNORVIA_STORAGE_DIR: "/z" }, { prefix: "APP_" }).storage,
    undefined,
  );
});

test("B19 工具并发配置：默认 10、非法值归一为 0、每次重读", () => {
  const previous = process.env.KNORVIA_MAX_TOOL_CONCURRENCY;
  try {
    delete process.env.KNORVIA_MAX_TOOL_CONCURRENCY;
    assert.deepEqual(envConfig.getToolConcurrencyConfig(), { maxConcurrency: 10 });
    process.env.KNORVIA_MAX_TOOL_CONCURRENCY = "4";
    assert.deepEqual(envConfig.getToolConcurrencyConfig(), { maxConcurrency: 4 });
    process.env.KNORVIA_MAX_TOOL_CONCURRENCY = "x";
    assert.deepEqual(envConfig.getToolConcurrencyConfig(), { maxConcurrency: 0 });
  } finally {
    if (previous === undefined) delete process.env.KNORVIA_MAX_TOOL_CONCURRENCY;
    else process.env.KNORVIA_MAX_TOOL_CONCURRENCY = previous;
  }
});

test("B20 作用域优先级：取值来自 ConfigScopePriority 且顺序无关", () => {
  assert.equal(
    merger.getScopePriority(ConfigScope.System),
    ConfigScopePriority[ConfigScope.System],
  );
  assert.equal(merger.getScopePriority(ConfigScope.Project), 20);
  assert.equal(merger.getScopePriority(ConfigScope.Cli), 50);
  assert.equal(
    merger.getScopePriority(ConfigScope.Project),
    merger.getScopePriority(ConfigScope.Project),
  );
  const prioritized = merger.createPrioritizedConfig({ x: 1 }, ConfigScope.User);
  assert.equal(prioritized.scope, "user");
  assert.equal(prioritized.priority, merger.getScopePriority(ConfigScope.User));
  assert.deepEqual(prioritized.config, { x: 1 });
  const samePriority = merger.mergeConfigs(
    { config: { x: 1 }, scope: "custom", priority: 3 },
    { config: { x: 2 }, scope: "custom", priority: 3 },
  );
  assert.equal(samePriority.x, 2);
});

test("B21 mergeConfigs：浅覆盖、插件并集/逐键、hooks 追加与 Project 丢弃额外市场", () => {
  const user = {
    storage: { dir: "user" },
    plugins: {
      dirs: ["u"],
      enabledPlugins: { a: false },
      options: { a: { keep: 1, change: "u" }, b: { b: 1 } },
      extraKnownMarketplaces: { user: {} },
    },
    hooks: { enabled: true, events: { Start: [{ hooks: [{ id: "u" }] }] } },
  };
  const project = {
    storage: { dir: "project" },
    plugins: {
      dirs: ["u", "p"],
      enabledPlugins: { c: true },
      options: { a: { change: "p" } },
      extraKnownMarketplaces: { forbidden: {} },
    },
    hooks: { enabled: false, events: { Start: [{ hooks: [{ id: "p" }] }] } },
  };
  const withDisabledProjectHooks = merger.mergeConfigs(
    merger.createPrioritizedConfig(user, ConfigScope.User),
    merger.createPrioritizedConfig(project, ConfigScope.Project),
  );
  assert.deepEqual(withDisabledProjectHooks.storage, { dir: "project" });
  assert.deepEqual(withDisabledProjectHooks.plugins.dirs, ["u", "p"]);
  assert.deepEqual(withDisabledProjectHooks.plugins.enabledPlugins, { a: false, c: true });
  assert.deepEqual(withDisabledProjectHooks.plugins.options, {
    a: { keep: 1, change: "p" },
    b: { b: 1 },
  });
  assert.deepEqual(withDisabledProjectHooks.plugins.extraKnownMarketplaces, { user: {} });
  assert.equal(withDisabledProjectHooks.hooks.enabled, true);
  assert.equal(withDisabledProjectHooks.hooks.events.Start.length, 1);
  assert.deepEqual(user.hooks.events.Start[0].hooks[0], { id: "u" });
  const enabledIncoming = merger.mergeConfigs(
    merger.createPrioritizedConfig(user, ConfigScope.User),
    merger.createPrioritizedConfig(
      { ...project, hooks: { ...project.hooks, enabled: true } },
      ConfigScope.Project,
    ),
  );
  assert.equal(enabledIncoming.hooks.events.Start.length, 2);
  assert.deepEqual(enabledIncoming.hooks.events.Start[1], { hooks: [{ id: "p" }] });
  const disabledIncoming = merger.mergeConfigs(
    merger.createPrioritizedConfig(user, ConfigScope.User),
    merger.createPrioritizedConfig(
      { hooks: { enabled: false, events: { Start: [{ hooks: [{ id: "x" }] }] } } },
      ConfigScope.Cli,
    ),
  );
  assert.equal(disabledIncoming.hooks.events.Start.length, 1);
  const shallow = merger.mergeConfigs(
    merger.createPrioritizedConfig({ features: { compact: false } }, ConfigScope.User),
    merger.createPrioritizedConfig({ features: { mcp: false } }, ConfigScope.Project),
  );
  assert.deepEqual(shallow.features, { mcp: false });
});

test("B22 ConfigStore 键值与来源：set 只保留最后一次来源", () => {
  const port = new ConfigPortImpl({});
  port.set(ConfigKey.StorageDir, "/a");
  assert.equal(port.get(ConfigKey.StorageDir), "/a");
  assert.equal(port.has(ConfigKey.StorageDir), true);
  assert.equal(port.getSources(ConfigKey.StorageDir).length, 1);
  port.set(ConfigKey.StorageDir, "/b");
  assert.equal(port.get(ConfigKey.StorageDir), "/b");
  assert.equal(port.getSources(ConfigKey.StorageDir).length, 1);
  assert.equal(port.getSources(ConfigKey.StorageDir)[0].value, "/b");
});

test("B23 通知顺序与订阅生命周期：key 先于 all、退订后静默、handler 抛错冒泡", () => {
  const port = new ConfigPortImpl({});
  const events = [];
  const observer = port.observe();
  const unsubscribeKey = observer.subscribe(ConfigKey.StorageDir, (value, prev) =>
    events.push(["key", value, prev]),
  );
  const unsubscribeAll = observer.subscribeAll((key, value, prev) =>
    events.push(["all", key, value, prev]),
  );
  port.set(ConfigKey.StorageDir, "/one");
  port.set(ConfigKey.StorageDir, "/two");
  assert.deepEqual(events, [
    ["key", "/one", undefined],
    ["all", ConfigKey.StorageDir, "/one", undefined],
    ["key", "/two", "/one"],
    ["all", ConfigKey.StorageDir, "/two", "/one"],
  ]);
  unsubscribeKey();
  unsubscribeKey();
  unsubscribeAll();
  events.length = 0;
  port.set(ConfigKey.StorageDir, "/three");
  assert.deepEqual(events, []);
  const throwing = new ConfigPortImpl({});
  const keyCalls = [];
  throwing.observe().subscribe(ConfigKey.StorageDir, () => {
    keyCalls.push("key");
    throw new Error("handler boom");
  });
  throwing.observe().subscribeAll(() => keyCalls.push("all"));
  assert.throws(() => throwing.set(ConfigKey.StorageDir, "/x"), /handler boom/);
  assert.deepEqual(keyCalls, ["key"]);
});

test("B24 merge(patch) 的判空差异、累积式钩子与异常守护合并", () => {
  const port = new ConfigPortImpl({});
  port.merge({ features: { compact: false } }, ConfigScope.User);
  assert.equal(port.get(ConfigKey.FeatureCompact), false);
  assert.equal(port.get(ConfigKey.PermissionMode), DefaultRuntimeConfig.permission.mode);
  port.merge({ permission: { mode: "" } }, ConfigScope.User);
  assert.deepEqual(port.getSources(ConfigKey.PermissionMode), []);
  assert.equal(port.get(ConfigKey.PermissionMode), DefaultRuntimeConfig.permission.mode);
  port.merge({ network: { timeout: 0 } }, ConfigScope.User);
  assert.equal(port.get(ConfigKey.HttpTimeout), 0);
  port.merge({ skillOverrides: {} }, ConfigScope.User);
  assert.equal(port.has(ConfigKey.SkillOverrides), true);
  port.merge({ modelAnomalyGuard: { toolCallWarningThreshold: 5 } }, ConfigScope.User);
  port.merge({ modelAnomalyGuard: { repeatedToolCallWarningThreshold: 7 } }, ConfigScope.User);
  const guard = port.getAll().modelAnomalyGuard;
  assert.equal(guard.toolCallWarningThreshold, 5);
  assert.equal(guard.repeatedToolCallWarningThreshold, 7);
  port.merge(
    {
      hooks: { enabled: true, events: { Start: [{ hooks: [{ type: "command", command: "x" }] }] } },
    },
    ConfigScope.User,
  );
  port.merge({ hooks: { enabled: true } }, ConfigScope.Project);
  const hooks = port.getAll().hooks;
  assert.equal(hooks.enabled, true);
  assert.equal(hooks.events.Start.length, 1);
});

test("B25 ConfigPortImpl 读取与缺省：features 缺省 true、未知 key 逐字消息", () => {
  const port = new ConfigPortImpl({});
  assert.equal(port.get(ConfigKey.FeatureCompact), true);
  assert.equal(port.getAll().features.compact, true);
  assert.equal(port.getAll().storage.dir, DefaultRuntimeConfig.storage.dir);
  assert.throws(
    () => port.get("nope.not.a.key"),
    (error) => error.message === "Config key not found: nope.not.a.key",
  );
  const patched = new ConfigPortImpl({ features: { compact: false } });
  assert.equal(patched.getAll().features.compact, false);
  assert.equal(patched.get(ConfigKey.FeatureCompact), false);
  assert.equal(typeof createConfigPort({}).getAll, "function");
});

test("B26 项目配置发现：baseDir、hooks 待信任诊断与 stdio cwd 解析", async (t) => {
  const root = await tempDir(t);
  const projectDir = join(root, "project");
  const dataDir = join(projectDir, ".knorvia-studio");
  await writeFile(join(root, "keep.txt"), "x");
  await mkdir(dataDir, { recursive: true });
  const configPath = join(dataDir, "knorvia.json");
  await writeFile(
    configPath,
    JSON.stringify({
      hooks: {
        enabled: true,
        events: { Stop: [{ hooks: [{ type: "command", command: "echo" }] }] },
      },
      mcp: {
        servers: {
          local: { type: "stdio", command: "node", cwd: "tools" },
          remote: { type: "sse", url: "https://mcp.example.invalid/s" },
        },
      },
      storage: { dir: "project-dir" },
    }),
  );
  const loaded = projectConfig.loadProjectConfigFile(configPath, {
    discoveryOrder: 0,
    explicitProjectConfig: true,
  });
  assert.equal(loaded.baseDir, projectDir);
  assert.equal(loaded.loaded, true);
  assert.equal(Object.hasOwn(loaded.config, "hooks"), false);
  assert.equal(
    loaded.diagnostics.some((item) => item.code === "config_project_hooks_pending_trust"),
    true,
  );
  assert.equal(loaded.config.mcp.servers.local.cwd, join(projectDir, "tools"));
  assert.equal(loaded.config.mcp.servers.remote.url, "https://mcp.example.invalid/s");
  const summary = projectConfig.summarizeProjectConfigs([loaded]);
  assert.equal(summary.loaded, true);
  assert.deepEqual(summary.mcpServerNames, ["local", "remote"]);
  assert.deepEqual(summary.paths, [configPath]);
  const empty = projectConfig.summarizeProjectConfigs([]);
  assert.equal(empty.loaded, false);
  assert.deepEqual(empty.paths, []);
});

test("B28 配置文件 schema 顶层字段与约束", () => {
  assert.deepEqual(schema.parseConfigFileToRuntimePatchWithDiagnostics({ unknown: 1 }).config, {});
  assert.equal(
    schema.parseConfigFileToRuntimePatchWithDiagnostics({ storage: { dir: "a", extra: 1 } }).config
      .storage.dir,
    "a",
  );
  assert.deepEqual(
    schema.parseConfigFileToRuntimePatchWithDiagnostics({ storage: { dir: "a", extra: 1 } }).config
      .storage,
    { dir: "a" },
  );
  assert.throws(() =>
    schema.parseConfigFileToRuntimePatchWithDiagnostics({ storage: { dir: "" } }),
  );
  assert.throws(() =>
    schema.parseConfigFileToRuntimePatchWithDiagnostics({ logging: { format: "yaml" } }),
  );
  assert.throws(() =>
    schema.parseConfigFileToRuntimePatchWithDiagnostics({ features: { compact: "yes" } }),
  );
  assert.throws(() => schema.parseConfigFileToRuntimePatchWithDiagnostics({ mcp: "x" }));
  assert.throws(() =>
    schema.parseConfigFileToRuntimePatchWithDiagnostics({
      plugins: {
        extraKnownMarketplaces: { m: { source: { source: "npm", package: "p", extra: 1 } } },
      },
    }),
  );
});

test("B29 MCP server 输入归一化", () => {
  const parse = (value) => schema.parseConfigFileToRuntimePatchWithDiagnostics(value).config;
  assert.deepEqual(
    parse({ mcp: { servers: { a: { type: "stdio", command: "c", environment: { K: "v" } } } } }).mcp
      .servers.a.env,
    { K: "v" },
  );
  assert.equal(
    Object.hasOwn(
      parse({ mcp: { servers: { a: { type: "stdio", command: "c", environment: { K: "v" } } } } })
        .mcp.servers.a,
      "environment",
    ),
    false,
  );
  assert.equal(
    parse({
      mcp: { servers: { a: { type: "stdio", command: "c", enable: false, enabled: true } } },
    }).mcp.servers.a.enabled,
    false,
  );
  assert.equal(
    parse({ mcp: { servers: { a: { type: "stdio", command: "c", enable: true } } } }).mcp.servers.a
      .enabled,
    true,
  );
  assert.equal(
    parse({ mcp: { servers: { a: { type: "remote", url: "https://mcp.example.invalid/m" } } } }).mcp
      .servers.a.type,
    "http",
  );
  assert.equal(parse({ mcp: { servers: { a: { command: "c" } } } }).mcp.servers.a.type, "stdio");
  assert.equal(
    parse({ mcp: { servers: { a: { url: "https://mcp.example.invalid/m" } } } }).mcp.servers.a.type,
    "http",
  );
  assert.deepEqual(
    parse({
      mcp: {
        servers: {
          a: { type: "http", url: "https://mcp.example.invalid/m", http_headers: { A: "b" } },
        },
      },
    }).mcp.servers.a.headers,
    { A: "b" },
  );
  const cleaned = parse({
    mcp: { servers: { a: { type: "stdio", command: "c", timeout: 5, startup_timeout_sec: 6 } } },
  }).mcp.servers.a;
  assert.equal(Object.hasOwn(cleaned, "timeout"), false);
  assert.equal(Object.hasOwn(cleaned, "startup_timeout_sec"), false);
});

test("B30 MCP servers 逐项诊断与部分保留", () => {
  const whole = schema.parseConfigFileToRuntimePatchWithDiagnostics({
    mcp: { servers: [] },
    storage: { dir: "/tmp/x" },
  });
  assert.equal(whole.diagnostics.length, 1);
  assert.equal(whole.diagnostics[0].code, "config_mcp_server_invalid");
  assert.equal(whole.diagnostics[0].path, "mcp.servers");
  assert.equal(
    whole.diagnostics[0].message,
    "mcp.servers must be a JSON object; ignoring all MCP servers.",
  );
  assert.equal(whole.diagnostics[0].severity, "warning");
  assert.equal(whole.config.storage.dir, "/tmp/x");
  assert.deepEqual(whole.config.mcp.servers, {});
  const partial = schema.parseConfigFileToRuntimePatchWithDiagnostics({
    mcp: { servers: { ok: { type: "stdio", command: "c" }, bad: { type: "stdio" } } },
  });
  assert.equal(partial.diagnostics.length, 1);
  assert.equal(partial.diagnostics[0].path, "mcp.servers.bad");
  assert.match(partial.diagnostics[0].message, /^command: /);
  assert.deepEqual(Object.keys(partial.config.mcp.servers), ["ok"]);
  const strict = schema.parseConfigFileToRuntimePatchWithDiagnostics({
    mcp: { servers: { bad: { type: "stdio", command: "c", extra: 1 } } },
  });
  assert.equal(strict.diagnostics.length, 1);
  assert.equal(strict.diagnostics[0].message, '<server>: Unrecognized key: "extra"');
});

test("B31 MCP 三种传输与 OAuth 的 strict 形状", () => {
  const diagnostics = (server) =>
    schema.parseConfigFileToRuntimePatchWithDiagnostics({ mcp: { servers: { s: server } } })
      .diagnostics;
  assert.equal(diagnostics({ type: "stdio", command: "c", args: [1] }).length, 1);
  assert.equal(
    diagnostics({ type: "http", url: "https://mcp.example.invalid/m", headers: { A: 1 } }).length,
    1,
  );
  assert.equal(
    diagnostics({
      type: "http",
      url: "https://mcp.example.invalid/m",
      oauth: { type: "client_credentials", clientId: "id" },
    }).length,
    1,
  );
  assert.equal(
    diagnostics({
      type: "http",
      url: "https://mcp.example.invalid/m",
      oauth: { type: "authorization_code" },
    }).length,
    0,
  );
  assert.equal(diagnostics({ type: "sse", url: "https://mcp.example.invalid/s" }).length, 0);
  assert.equal(diagnostics({ type: "stdio", command: "c", protocolVersion: "legacy" }).length, 0);
});

test("B32 plugins 与额外市场 schema", () => {
  const parse = (value) => schema.parseConfigFileToRuntimePatchWithDiagnostics(value).config;
  assert.throws(() => parse({ plugins: { dirs: [""] } }));
  assert.throws(() =>
    parse({
      plugins: {
        extraKnownMarketplaces: { m: { source: { source: "npm", package: "p", extra: 1 } } },
      },
    }),
  );
  assert.throws(() =>
    parse({ plugins: { extraKnownMarketplaces: { m: { source: { source: "github" } } } } }),
  );
  const ok = parse({
    plugins: {
      enabledPlugins: { a: true },
      options: { a: { n: 1, b: false, s: "x" } },
      suppressedBuiltins: ["x"],
      extraKnownMarketplaces: { m: { source: { source: "directory", path: "/tmp/m" } } },
    },
  });
  assert.deepEqual(ok.plugins.options.a, { n: 1, b: false, s: "x" });
});

test("B33 skills/skill/command 的解析与覆盖映射", () => {
  const parse = (value) => schema.parseConfigFileToRuntimePatchWithDiagnostics(value).config;
  const both = parse({
    skills: { "/a/SKILL.md": { enable: false }, rel: { enable: true }, enabled: false },
  });
  assert.deepEqual(both.skills, { enabled: false });
  assert.deepEqual(both.skillOverrides, { "/a/SKILL.md": { enable: false } });
  assert.deepEqual(
    Object.keys(parse({ skills: { "C:\\a\\SKILL.md": { enable: false } } }).skillOverrides),
    ["C:\\a\\SKILL.md"],
  );
  assert.deepEqual(
    parse({ skill: { "/a": { enable: true } }, skills: { "/a": { enable: false } } })
      .skillOverrides,
    { "/a": { enable: false } },
  );
  assert.deepEqual(parse({ command: { "/c.md": { enable: false } } }).commandOverrides, {
    "/c.md": { enable: false },
  });
  assert.deepEqual(parse({ skills: { enabled: true } }).skills, { enabled: true });
  assert.equal(parse({ skills: {} }).skills, undefined);
});

test("B34 插件 id 规范化与别名", () => {
  assert.equal(schema.LEGACY_CUA_PLUGIN_ID, "cua@knorvia-plugins-bundled");
  assert.equal(schema.CANONICAL_CUA_PLUGIN_ID, "computer-use@knorvia-plugins-bundled");
  assert.equal(
    schema.canonicalizePluginId("cua@knorvia-plugins-bundled"),
    "computer-use@knorvia-plugins-bundled",
  );
  assert.equal(schema.canonicalizePluginId("other@x"), "other@x");
  assert.deepEqual(schema.pluginIdAliases("cua@knorvia-plugins-bundled"), [
    "computer-use@knorvia-plugins-bundled",
    "cua@knorvia-plugins-bundled",
  ]);
  assert.deepEqual(schema.pluginIdAliases("other@x"), ["other@x"]);
  assert.deepEqual(schema.pluginIdAliases("Computer-Use@knorvia-plugins-bundled"), [
    "Computer-Use@knorvia-plugins-bundled",
  ]);
});

test("B35 配置文件里的插件别名迁移", () => {
  const parse = (value) => schema.parseConfigFileToRuntimePatchWithDiagnostics(value).config;
  assert.deepEqual(
    parse({ plugins: { enabledPlugins: { "cua@knorvia-plugins-bundled": true } } }).plugins
      .enabledPlugins,
    {
      "computer-use@knorvia-plugins-bundled": true,
    },
  );
  assert.deepEqual(
    parse({
      plugins: {
        enabledPlugins: {
          "cua@knorvia-plugins-bundled": true,
          "computer-use@knorvia-plugins-bundled": false,
        },
      },
    }).plugins.enabledPlugins,
    { "computer-use@knorvia-plugins-bundled": false },
  );
  assert.deepEqual(
    parse({
      plugins: {
        suppressedBuiltins: [
          "cua@knorvia-plugins-bundled",
          "computer-use@knorvia-plugins-bundled",
          "other",
        ],
      },
    }).plugins.suppressedBuiltins,
    ["computer-use@knorvia-plugins-bundled", "other"],
  );
  assert.deepEqual(
    parse({ plugins: { options: { "cua@knorvia-plugins-bundled": { x: 1 } } } }).plugins.options,
    {
      "computer-use@knorvia-plugins-bundled": { x: 1 },
    },
  );
  const input = { plugins: { enabledPlugins: { "cua@knorvia-plugins-bundled": true } } };
  parse(input);
  assert.equal(Object.hasOwn(input.plugins.enabledPlugins, "cua@knorvia-plugins-bundled"), true);
});

test("B36 配置文件到 RuntimeConfigPatch 的映射与诊断", () => {
  assert.deepEqual(schema.parseConfigFileToRuntimePatchWithDiagnostics({}), {
    config: {},
    diagnostics: [],
  });
  const mapped = schema.parseConfigFileToRuntimePatchWithDiagnostics({
    $schema: "x",
    unknown: 1,
    storage: { dir: "/tmp/s" },
  });
  assert.deepEqual(Object.keys(mapped.config), ["storage"]);
  const withBadServer = schema.parseConfigFileToRuntimePatchWithDiagnostics({
    mcp: { servers: { bad: {} } },
  });
  assert.deepEqual(withBadServer.config.mcp.servers, {});
  assert.equal(withBadServer.diagnostics.length, 1);
});

test("B37 createConfig 装配顺序与来源优先级", async (t) => {
  const root = await tempDir(t);
  const userPath = join(root, "user.json");
  await writeFile(userPath, JSON.stringify({ storage: { dir: "user" } }));
  const projectDir = join(root, "proj");
  await mkdir(projectDir, { recursive: true });
  const projectPath = join(projectDir, "knorvia.json");
  await writeFile(projectPath, JSON.stringify({ storage: { dir: "project" } }));
  const withoutEnv = factory.createConfig({
    userConfigPath: userPath,
    projectConfigPath: projectPath,
    env: {},
  });
  assert.equal(withoutEnv.config.storage.dir, "project");
  const withEnv = factory.createConfig({
    userConfigPath: userPath,
    projectConfigPath: projectPath,
    env: { KNORVIA_STORAGE_DIR: "env" },
  });
  assert.equal(withEnv.config.storage.dir, "env");
  const withCli = factory.createConfig({
    userConfigPath: userPath,
    projectConfigPath: projectPath,
    env: { KNORVIA_STORAGE_DIR: "env" },
    cliOverrides: { storage: { dir: "cli" } },
  });
  assert.equal(withCli.config.storage.dir, "cli");
  const skipped = factory.createConfig({
    skipUserConfig: true,
    userConfigPath: join(root, "missing.json"),
    env: {},
  });
  assert.equal(skipped.sources.user.loaded, false);
});

test("B38 项目发现元数据与 UI 来源路径", async (t) => {
  const root = await tempDir(t);
  const first = join(root, "a.json");
  const second = join(root, "b.json");
  await writeFile(first, JSON.stringify({ ui: { locale: "zh-CN" } }));
  await writeFile(second, JSON.stringify({ ui: { theme: "dark" } }));
  const workdir = join(root, "work");
  await mkdir(workdir, { recursive: true });
  const result = factory.createConfig({
    workingDirectory: workdir,
    projectConfigPath: second,
    env: {},
  });
  assert.equal(result.sources.project.path, second);
  assert.deepEqual(result.sources.project.paths, [second]);
  assert.equal(result.sources.project.loaded, true);
  assert.equal(result.sources.project.uiThemePath, second);
  assert.equal(result.sources.project.uiLocalePath, undefined);
  const none = factory.createConfig({ env: {}, skipUserConfig: true });
  assert.equal(none.sources.project.path, undefined);
  assert.equal(none.sources.project.loaded, false);
  assert.deepEqual(none.sources.project.paths, []);
});

test("B39 plugins 来源归属", async (t) => {
  const root = await tempDir(t);
  const userPath = join(root, "user.json");
  await writeFile(
    userPath,
    JSON.stringify({
      plugins: {
        dirs: ["u"],
        enabledPlugins: { a: false },
        options: { a: { user: 1 } },
        extraKnownMarketplaces: {
          u: { source: { source: "directory", path: "/tmp/marketplace-u" } },
        },
      },
    }),
  );
  const projectPath = join(root, "project.json");
  await writeFile(
    projectPath,
    JSON.stringify({
      plugins: {
        dirs: ["p"],
        enabledPlugins: { a: true },
        options: { a: { workspace: 2 } },
        extraKnownMarketplaces: {
          forbidden: { source: { source: "directory", path: "/tmp/marketplace-f" } },
        },
      },
    }),
  );
  const result = factory.createConfig({
    userConfigPath: userPath,
    projectConfigPath: projectPath,
    env: {},
  });
  assert.deepEqual(result.sources.plugins.dirs, { user: ["u"], workspace: ["p"] });
  assert.equal(result.sources.plugins.enabled.a, "workspace");
  assert.deepEqual(Object.keys(result.sources.plugins.marketplaces), ["u"]);
  assert.deepEqual(result.sources.plugins.options.a, { user: "user", workspace: "workspace" });
  assert.equal(result.sources.plugins.paths.user, userPath);
  assert.equal(result.sources.plugins.paths.workspace, projectPath);
});

test("B40 MCP 生效表与来源归属", async (t) => {
  const root = await tempDir(t);
  const userPath = join(root, "user.json");
  await writeFile(
    userPath,
    JSON.stringify({
      mcp: {
        servers: {
          same: { type: "stdio", command: "user" },
          userOnly: { type: "stdio", command: "u" },
        },
      },
    }),
  );
  const projectPath = join(root, "project.json");
  await writeFile(
    projectPath,
    JSON.stringify({
      mcp: {
        servers: {
          same: { type: "stdio", command: "project" },
          projectOnly: { type: "stdio", command: "p" },
        },
      },
    }),
  );
  const result = factory.createConfig({
    userConfigPath: userPath,
    projectConfigPath: projectPath,
    env: { KNORVIA_STORAGE_DIR: "/x" },
    cliOverrides: { mcp: { servers: { same: { type: "stdio", command: "cli" } } } },
  });
  assert.equal(result.config.mcp.servers.same.command, "cli");
  assert.equal(result.sources.mcp.serverSources.same, "cli");
  assert.equal(result.sources.mcp.serverSources.userOnly, "user");
  assert.equal(result.sources.mcp.serverSources.projectOnly, "project");
  assert.equal(Object.hasOwn(result.sources.mcp.serverSources, "system"), false);
});

test("B41 hooks 来源标记", async (t) => {
  const root = await tempDir(t);
  const userPath = join(root, "user.json");
  await writeFile(
    userPath,
    JSON.stringify({
      hooks: {
        enabled: true,
        events: { Stop: [{ hooks: [{ type: "command", command: "echo" }] }] },
      },
    }),
  );
  const result = factory.createConfig({
    userConfigPath: userPath,
    env: {},
    cliOverrides: {
      hooks: { enabled: true, events: { Start: [{ hooks: [{ type: "command", command: "x" }] }] } },
    },
  });
  assert.deepEqual(result.config.hooks.events.Stop[0].hooks[0].source, {
    kind: "user",
    path: userPath,
  });
  assert.deepEqual(result.config.hooks.events.Start[0].hooks[0].source, { kind: "internal" });
  const existing = { kind: "internal", custom: "kept" };
  const withExisting = factory.createConfig({
    env: {},
    cliOverrides: {
      hooks: {
        events: { Start: [{ hooks: [{ type: "command", command: "x", source: existing }] }] },
      },
    },
  });
  assert.equal(withExisting.config.hooks.events.Start[0].hooks[0].source, existing);
  assert.equal(result.sources.project.workspaceHookRuntimeRoot !== undefined, true);
  assert.equal(Object.hasOwn(result.sources.project, "workspaceHookSnapshot"), false);
});

test("B42 配置诊断告警日志：映射、顺序与抛错中断", async (t) => {
  const root = await tempDir(t);
  const userPath = join(root, "user.json");
  await writeFile(userPath, JSON.stringify({ mcp: { servers: { bad: { type: "stdio" } } } }));
  const projectPath = join(root, "project.json");
  await writeFile(projectPath, JSON.stringify({ mcp: { servers: { bad: { type: "stdio" } } } }));
  const calls = [];
  const loggerFactory = {
    createLogger: (name) => ({
      child: (fields) => ({
        warn: (message, fields2) => calls.push(["warn", message, fields2, fields]),
      }),
    }),
  };
  factory.createConfig({
    userConfigPath: userPath,
    projectConfigPath: projectPath,
    env: {},
    loggerFactory,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1], "MCP server config skipped");
  assert.equal(calls[0][2].configScope, "user");
  assert.equal(calls[0][2].event, "config.mcp_server.skipped");
  assert.equal(calls[1][2].configScope, "project");
  const throwing = {
    createLogger: () => ({
      child: () => ({
        warn: () => {
          throw new Error("warn boom");
        },
      }),
    }),
  };
  assert.throws(
    () =>
      factory.createConfig({
        userConfigPath: userPath,
        projectConfigPath: projectPath,
        env: {},
        loggerFactory: throwing,
      }),
    /warn boom/,
  );
  const silent = [];
  factory.createConfig({
    userConfigPath: join(root, "clean.json"),
    env: {},
    loggerFactory: {
      createLogger: () => {
        silent.push("logger");
        return { child: () => ({ warn: () => {} }) };
      },
    },
  });
  assert.deepEqual(silent, []);
});

test("B43 项目发现三个入口分支", async (t) => {
  const root = await tempDir(t);
  const explicit = join(root, "explicit.json");
  await writeFile(explicit, JSON.stringify({ storage: { dir: "e" } }));
  const empty = factory.createConfig({ env: {}, skipUserConfig: true });
  assert.equal(empty.sources.project.loaded, false);
  assert.deepEqual(empty.sources.project.paths, []);
  const single = factory.createConfig({
    projectConfigPath: explicit,
    env: {},
    skipUserConfig: true,
  });
  assert.equal(single.sources.project.loaded, true);
  assert.equal(single.sources.project.path, explicit);
  assert.deepEqual(single.sources.project.paths, [explicit]);
  const workdir = join(root, "work");
  await mkdir(join(workdir, ".knorvia-studio"), { recursive: true });
  const discovered = join(workdir, "knorvia.json");
  await writeFile(discovered, JSON.stringify({ storage: { dir: "discovered" } }));
  const byWorkingDirectory = factory.createConfig({
    workingDirectory: workdir,
    env: {},
    skipUserConfig: true,
  });
  assert.equal(byWorkingDirectory.sources.project.loaded, true);
  assert.equal(byWorkingDirectory.config.storage.dir, "discovered");
});

test("B44 工作区 hook 运行时根与快照", async (t) => {
  const plainRoot = await tempDir(t);
  const plain = factory.createConfig({
    workingDirectory: plainRoot,
    workspaceIdentity: " id ",
    env: {},
    skipUserConfig: true,
  });
  assert.equal(plain.sources.project.workspaceHookRuntimeRoot !== undefined, true);
  assert.equal(Object.hasOwn(plain.sources.project, "workspaceHookSnapshot"), false);
  const hookRoot = await tempDir(t);
  await mkdir(join(hookRoot, ".knorvia-studio"), { recursive: true });
  await writeFile(
    join(hookRoot, "knorvia.json"),
    JSON.stringify({
      hooks: {
        enabled: true,
        events: { Stop: [{ hooks: [{ type: "command", command: "echo" }] }] },
      },
    }),
  );
  const withHooks = factory.createConfig({
    workingDirectory: hookRoot,
    workspaceIdentity: " id ",
    env: {},
    skipUserConfig: true,
  });
  assert.equal(withHooks.sources.project.workspaceHookRuntimeRoot !== undefined, true);
  assert.equal(withHooks.sources.project.workspaceHookSnapshot.workspaceIdentity, "id");
  const byPath = factory.createConfig({
    workingDirectory: hookRoot,
    env: {},
    skipUserConfig: true,
  });
  assert.equal(Object.hasOwn(byPath.sources.project, "workspaceHookSnapshot"), true);
  assert.equal(byPath.sources.project.workspaceHookSnapshot.workspaceIdentity, resolve(hookRoot));
});

test("B45 resolveWorkspaceStorageDir 优先级：env → 最后项目文件（空串也算）→ 默认", async (t) => {
  const root = await tempDir(t);
  await mkdir(join(root, ".knorvia-studio"), { recursive: true });
  const dataConfig = join(root, ".knorvia-studio", "config.json");
  await writeFile(dataConfig, JSON.stringify({ storage: { dir: "data-dir" } }));
  const rootConfig = join(root, "knorvia.json");
  await writeFile(rootConfig, JSON.stringify({ storage: { dir: "root-dir" } }));
  assert.equal(
    factory.resolveWorkspaceStorageDir({
      workingDirectory: root,
      env: { KNORVIA_STORAGE_DIR: "env" },
    }),
    "env",
  );
  const discovery = projectConfig.loadProjectConfigs(root);
  const last = discovery.files.at(-1);
  assert.equal(last !== undefined, true);
  assert.equal(last.config.storage.dir, "data-dir");
  assert.equal(factory.resolveWorkspaceStorageDir({ workingDirectory: root, env: {} }), "data-dir");
  const emptyDir = await tempDir(t);
  assert.equal(
    factory.resolveWorkspaceStorageDir({ workingDirectory: emptyDir, env: {} }),
    DefaultRuntimeConfig.storage.dir,
  );
  const withoutDir = await tempDir(t);
  await writeFile(
    join(withoutDir, "knorvia.json"),
    JSON.stringify({ storage: { sessionDbPath: "/db.sqlite" } }),
  );
  assert.equal(
    factory.resolveWorkspaceStorageDir({ workingDirectory: withoutDir, env: {} }),
    DefaultRuntimeConfig.storage.dir,
  );
});

test("B46 skipUserConfig 与来源元数据", async (t) => {
  const root = await tempDir(t);
  const missing = join(root, "missing.json");
  const skipped = factory.createConfig({ skipUserConfig: true, userConfigPath: missing, env: {} });
  assert.equal(skipped.sources.user.loaded, false);
  assert.equal(skipped.sources.user.path, fileConfig.getDefaultConfigPath());
  assert.deepEqual(skipped.sources.user.diagnostics, []);
  const absent = factory.createConfig({ userConfigPath: missing, env: {} });
  assert.equal(absent.sources.user.loaded, false);
  assert.deepEqual(absent.sources.user.diagnostics, []);
  const brokenPath = join(root, "broken.json");
  await writeFile(brokenPath, "{");
  const failed = factory.createConfig({ userConfigPath: brokenPath, env: {} });
  assert.equal(failed.sources.user.loaded, false);
  assert.equal(failed.sources.user.diagnostics.length >= 1, true);
  assert.equal(
    factory.createConfig({ env: {}, cliOverrides: {}, skipUserConfig: true }).sources.cli,
    true,
  );
  assert.equal(factory.createConfig({ env: {}, skipUserConfig: true }).sources.cli, false);
});

test("B47 config-factory 导出面：运行时只暴露 2 个函数、内部函数不导出", () => {
  assert.deepEqual(Object.keys(factory).sort(), ["createConfig", "resolveWorkspaceStorageDir"]);
  assert.equal(typeof factory.createConfig, "function");
  assert.equal(typeof factory.resolveWorkspaceStorageDir, "function");
  assert.equal(factory.tagHooks, undefined);
  assert.equal(factory.describePlugins, undefined);
  assert.equal(factory.readProjects, undefined);
  assert.equal(factory.createConfig({ env: {}, skipUserConfig: true }).sources.user.loaded, false);
});

test("B49 配置路径解析与默认路径", () => {
  assert.equal(fileConfig.resolvePath("~/config.json"), join(homedir(), "config.json"));
  assert.equal(fileConfig.resolvePath("~"), resolve("~"));
  assert.equal(
    fileConfig.getDefaultConfigPath(),
    join(fileConfig.resolvePath(join(homedir(), ".knorvia-studio", "cli")), "config.json"),
  );
  assert.equal(typeof fileConfig.getDefaultConfigPath(), "string");
  assert.equal(typeof fileConfig.hasDefaultConfigFile(), "boolean");
});

test("B50 loadFileConfig 加载、诊断与默认补全", async (t) => {
  const root = await tempDir(t);
  const missing = join(root, "missing.json");
  const missingResult = fileConfig.loadFileConfig(missing);
  assert.equal(missingResult.loaded, false);
  assert.deepEqual(missingResult.config, {});
  assert.deepEqual(missingResult.diagnostics, []);
  assert.equal(missingResult.path, resolve(missing));
  const good = join(root, "good.json");
  await writeFile(good, JSON.stringify({ storage: { dir: "/tmp/a" }, unknown: 1 }));
  const goodResult = fileConfig.loadFileConfig(good);
  assert.equal(goodResult.loaded, true);
  assert.equal(goodResult.config.storage.dir, "/tmp/a");
  const broken = join(root, "broken.json");
  await writeFile(broken, "{");
  const brokenResult = fileConfig.loadFileConfig(broken);
  assert.equal(brokenResult.loaded, false);
  assert.equal(brokenResult.diagnostics[0].code, "config_file_invalid");
  assert.equal(brokenResult.diagnostics[0].severity, "error");
  assert.equal(brokenResult.diagnostics[0].filePath, resolve(broken));
  const invalidSchema = join(root, "invalid-schema.json");
  await writeFile(invalidSchema, JSON.stringify({ storage: { dir: "" } }));
  const invalidResult = fileConfig.loadFileConfig(invalidSchema);
  assert.equal(invalidResult.loaded, false);
  assert.match(invalidResult.diagnostics[0].message, /storage\.dir: /);
  const emptyName = fileConfig.loadFileConfig("", { baseDir: root, configFileName: "" });
  assert.equal(emptyName.path, resolve(root));
});

test("B51 读取时的 CUA 别名迁移与尽力而为落盘", async (t) => {
  const root = await tempDir(t);
  const path = join(root, "knorvia.json");
  await writeFile(
    path,
    JSON.stringify({ plugins: { enabledPlugins: { "cua@knorvia-plugins-bundled": true } } }),
  );
  fileConfig.loadFileConfig(path);
  const migrated = JSON.parse(await readFile(path, "utf8"));
  assert.deepEqual(migrated.plugins.enabledPlugins, {
    "computer-use@knorvia-plugins-bundled": true,
  });
  assert.equal((await readFile(path, "utf8")).endsWith("\n"), true);
  const again = fileConfig.loadFileConfig(path);
  assert.equal(again.loaded, true);
  const files = await readdir(root);
  assert.equal(
    files.some((name) => name.includes(".migrate.")),
    false,
  );
  const suppressedPath = join(root, "suppressed.json");
  await writeFile(
    suppressedPath,
    JSON.stringify({ plugins: { suppressedBuiltins: ["cua@knorvia-plugins-bundled"] } }),
  );
  fileConfig.loadFileConfig(suppressedPath);
  assert.deepEqual(JSON.parse(await readFile(suppressedPath, "utf8")).plugins.suppressedBuiltins, [
    "computer-use@knorvia-plugins-bundled",
  ]);
  const cleanPath = join(root, "clean.json");
  await writeFile(cleanPath, JSON.stringify({ storage: { dir: "/tmp" } }));
  fileConfig.loadFileConfig(cleanPath);
  const names = await readdir(root);
  assert.equal(
    names.some((name) => name.includes(".migrate.")),
    false,
  );
  assert.equal(
    names.some((name) => name.endsWith(".tmp")),
    false,
  );
  assert.equal(
    names.slice().sort().join(","),
    ["clean.json", "knorvia.json", "suppressed.json"].join(","),
  );
});

test("B52 写回路径的读取与原子保存契约", async (t) => {
  const root = await tempDir(t);
  const fresh = join(root, "nested", "deep", "config.json");
  await fileConfig.updateUiLocaleInFileConfig(fresh, "en");
  assert.equal(await readFile(fresh, "utf8"), '{\n  "ui": {\n    "locale": "en"\n  }\n}\n');
  assert.equal(
    (await readdir(join(root, "nested", "deep"))).some((name) => name.endsWith(".tmp")),
    false,
  );
  const arrayPath = join(root, "array.json");
  await writeFile(arrayPath, "[]");
  await assert.rejects(
    () => fileConfig.updateUiLocaleInFileConfig(arrayPath, "en"),
    (error) => error.message === `Config file must contain a JSON object: ${resolve(arrayPath)}`,
  );
  const badJsonPath = join(root, "bad.json");
  await writeFile(badJsonPath, "not json");
  await assert.rejects(
    () => fileConfig.updateUiLocaleInFileConfig(badJsonPath, "en"),
    (error) =>
      error.message === `Unable to parse config file as JSON: ${resolve(badJsonPath)}` &&
      error.cause instanceof SyntaxError,
  );
  const blocking = join(root, "blocker");
  await writeFile(blocking, "file");
  await assert.rejects(
    () => fileConfig.updateUiLocaleInFileConfig(join(blocking, "config.json"), "en"),
    (error) => !error.message.startsWith("Unable to write config file:"),
  );
});

test("B53 updateUiLocaleInFileConfig 的读写语义", async (t) => {
  const root = await tempDir(t);
  const path = join(root, "config.json");
  await writeFile(path, JSON.stringify({ unknown: { keep: 1 }, ui: { theme: "dark" } }));
  const result = await fileConfig.updateUiLocaleInFileConfig(path, "zh-CN");
  assert.deepEqual(result, { locale: "zh-CN", path: resolve(path) });
  const content = JSON.parse(await readFile(path, "utf8"));
  assert.deepEqual(content.unknown, { keep: 1 });
  assert.equal(content.ui.theme, "dark");
  assert.equal(content.ui.locale, "zh-CN");
  const created = join(root, "new.json");
  await fileConfig.updateUiLocaleInFileConfig(created, "en-US");
  assert.equal(JSON.parse(await readFile(created, "utf8")).ui.locale, "en-US");
});

test("B54 updatePluginEnabledInFileConfig 别名清理与显式取值", async (t) => {
  const root = await tempDir(t);
  const path = join(root, "config.json");
  await writeFile(
    path,
    JSON.stringify({
      plugins: {
        enabledPlugins: { "cua@knorvia-plugins-bundled": false, other: false },
        options: { "cua@knorvia-plugins-bundled": { keep: 1 } },
      },
    }),
  );
  const result = await fileConfig.updatePluginEnabledInFileConfig(
    path,
    "cua@knorvia-plugins-bundled",
    true,
  );
  assert.equal(result.pluginId, "cua@knorvia-plugins-bundled");
  assert.equal(result.enabled, true);
  const content = JSON.parse(await readFile(path, "utf8"));
  assert.deepEqual(content.plugins.enabledPlugins, {
    other: false,
    "computer-use@knorvia-plugins-bundled": true,
  });
  assert.deepEqual(content.plugins.options, { "cua@knorvia-plugins-bundled": { keep: 1 } });
});

test("B55 enablePluginsByDefaultInFileConfig 只补未声明项", async (t) => {
  const root = await tempDir(t);
  const path = join(root, "config.json");
  await writeFile(path, JSON.stringify({ plugins: { enabledPlugins: { other: false } } }));
  const result = await fileConfig.enablePluginsByDefaultInFileConfig(path, [
    "other",
    "fresh",
    "fresh",
  ]);
  assert.deepEqual(result.enabledIds, ["fresh", "fresh"]);
  const content = JSON.parse(await readFile(path, "utf8"));
  assert.deepEqual(content.plugins.enabledPlugins, { other: false, fresh: true });
  const second = await fileConfig.enablePluginsByDefaultInFileConfig(path, ["fresh"]);
  assert.deepEqual(second.enabledIds, []);
  const noop = await fileConfig.enablePluginsByDefaultInFileConfig(join(root, "absent.json"), []);
  assert.deepEqual(noop.enabledIds, []);
});

test("B56 updatePluginOptionsInFileConfig 基线选择与清理键", async (t) => {
  const root = await tempDir(t);
  const path = join(root, "config.json");
  await writeFile(
    path,
    JSON.stringify({
      plugins: {
        options: { "cua@knorvia-plugins-bundled": { keep: "yes", drop: "no" }, other: { v: 3 } },
      },
    }),
  );
  const values = { drop: "readded", new: 1 };
  const clears = ["drop"];
  const result = await fileConfig.updatePluginOptionsInFileConfig(
    path,
    "cua@knorvia-plugins-bundled",
    values,
    clears,
  );
  assert.equal(result.options, values);
  assert.equal(result.clearedOptionKeys, clears);
  const content = JSON.parse(await readFile(path, "utf8"));
  assert.deepEqual(content.plugins.options["computer-use@knorvia-plugins-bundled"], {
    keep: "yes",
    drop: "readded",
    new: 1,
  });
  assert.deepEqual(content.plugins.options.other, { v: 3 });
});

test("B57 removePlugin* 的删除语义与无命中不写", async (t) => {
  const root = await tempDir(t);
  const path = join(root, "config.json");
  await writeFile(
    path,
    JSON.stringify({
      plugins: {
        enabledPlugins: { other: false, "cua@knorvia-plugins-bundled": true },
        options: { "cua@knorvia-plugins-bundled": { x: 1 } },
      },
    }),
  );
  const before = await readFile(path, "utf8");
  const absent = await fileConfig.removePluginEnabledFromFileConfig(path, "absent");
  assert.equal(absent.removedEnabled, false);
  assert.equal(await readFile(path, "utf8"), before);
  const removed = await fileConfig.removePluginFromFileConfig(path, "cua@knorvia-plugins-bundled");
  assert.equal(removed.removedEnabled, true);
  assert.equal(removed.removedOptions, true);
  const content = JSON.parse(await readFile(path, "utf8"));
  assert.deepEqual(content.plugins.enabledPlugins, { other: false });
  assert.deepEqual(content.plugins.options, {});
});

test("B58 suppressedBuiltins 的登记与移除", async (t) => {
  const root = await tempDir(t);
  const path = join(root, "config.json");
  await writeFile(
    path,
    JSON.stringify({ plugins: { suppressedBuiltins: ["cua@knorvia-plugins-bundled", "other"] } }),
  );
  await fileConfig.addSuppressedBuiltinInFileConfig(path, "cua@knorvia-plugins-bundled");
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")).plugins.suppressedBuiltins, [
    "other",
    "computer-use@knorvia-plugins-bundled",
  ]);
  const before = await readFile(path, "utf8");
  await fileConfig.addSuppressedBuiltinInFileConfig(path, "cua@knorvia-plugins-bundled");
  assert.equal(await readFile(path, "utf8"), before);
  const removed = await fileConfig.removeSuppressedBuiltinInFileConfig(
    path,
    "cua@knorvia-plugins-bundled",
  );
  assert.equal(removed.suppressed, false);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")).plugins.suppressedBuiltins, ["other"]);
  const mixed = join(root, "mixed.json");
  await writeFile(
    mixed,
    JSON.stringify({ plugins: { suppressedBuiltins: ["cua@knorvia-plugins-bundled", 4] } }),
  );
  await fileConfig.addSuppressedBuiltinInFileConfig(mixed, "cua@knorvia-plugins-bundled");
  assert.deepEqual(JSON.parse(await readFile(mixed, "utf8")).plugins.suppressedBuiltins, [
    "computer-use@knorvia-plugins-bundled",
  ]);
});

test("B59 file-config 导出面：运行时 12 个函数、内部类型与函数不导出", () => {
  const names = Object.keys(fileConfig).sort();
  const expectedFunctions = [
    "addSuppressedBuiltinInFileConfig",
    "enablePluginsByDefaultInFileConfig",
    "getDefaultConfigPath",
    "hasDefaultConfigFile",
    "loadFileConfig",
    "removePluginEnabledFromFileConfig",
    "removePluginFromFileConfig",
    "removeSuppressedBuiltinInFileConfig",
    "resolvePath",
    "updatePluginEnabledInFileConfig",
    "updatePluginOptionsInFileConfig",
    "updateUiLocaleInFileConfig",
  ].sort();
  assert.deepEqual(names, expectedFunctions);
  for (const name of expectedFunctions) assert.equal(typeof fileConfig[name], "function");
  assert.equal(fileConfig.FileConfigOptions, undefined);
  assert.equal(fileConfig.migration, undefined);
  assert.equal(fileConfig.saveJson, undefined);
  assert.equal(fileConfig.resolvePath("~/config.json"), join(homedir(), "config.json"));
});

test("B27 config/index.ts 的导出面", () => {
  assert.equal(typeof configIndex.ConfigPortImpl, "function");
  assert.equal(typeof configIndex.createConfigPort, "function");
  assert.equal(configIndex.ConfigStore, undefined);
  assert.deepEqual(
    Object.keys(configIndex).sort(),
    [
      "ConfigPortImpl",
      "createConfigPort",
      "createPrioritizedConfig",
      "getScopePriority",
      "getToolConcurrencyConfig",
      "parseEnvConfig",
      "mergeConfigs",
      "KnorviaConfigFileSchema",
      "loadFileConfig",
      "getDefaultConfigPath",
      "hasDefaultConfigFile",
      "resolvePath",
      "updatePluginEnabledInFileConfig",
      "enablePluginsByDefaultInFileConfig",
      "removePluginEnabledFromFileConfig",
      "updatePluginOptionsInFileConfig",
      "removePluginFromFileConfig",
      "addSuppressedBuiltinInFileConfig",
      "removeSuppressedBuiltinInFileConfig",
      "updateUiLocaleInFileConfig",
      "createConfig",
      "resolveWorkspaceStorageDir",
    ].sort(),
  );
  assert.equal(configIndex.createConfigPort({}).get(ConfigKey.FeatureCompact), true);
});

test("B48 owners.test.mjs 的归属行为由本包契约测试覆盖", async () => {
  const sourcePath = join(repoRoot, "apps/cli/packages/adapters/src/config/owners.test.mjs");
  assert.equal(existsSync(sourcePath), true);
  const studioScript = await readFile(join(repoRoot, "scripts", "test-studio.mjs"), "utf8");
  assert.equal(studioScript.includes("apps/cli/packages/adapters/test"), true);
  assert.equal(studioScript.includes("apps/cli/packages/adapters/src"), false);
  const merged = merger.mergeConfigs(
    merger.createPrioritizedConfig({ storage: { dir: "user" } }, ConfigScope.User),
    merger.createPrioritizedConfig({ storage: { dir: "project" } }, ConfigScope.Project),
  );
  assert.equal(merged.storage.dir, "project");
});
