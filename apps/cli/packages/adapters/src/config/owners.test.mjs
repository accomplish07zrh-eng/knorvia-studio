import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

const baseline = process.argv.includes("--baseline");
const chosenCase = process.argv.find((a) => a.startsWith("--case="))?.slice(7);
const chosen = process.argv.find((a) => a.startsWith("--owner="))?.slice(8);
const owners = {
  merger: "config-merger",
  project: "project-config.adapter",
  file: "file-config.adapter",
  factory: "config-factory",
};
const scope = { System: "system", User: "user", Project: "project", Env: "env", Cli: "cli" };
const priorities = { system: 0, user: 10, project: 20, env: 30, cli: 40 };
const virtualPath = {
  ...path.posix,
  resolve: (...args) => path.posix.resolve("/virtual/cwd", ...args),
};
function load(owner, ports, globals = {}) {
  const source = baseline
    ? "/tmp/knorvia-cli-config-baseline/" + owners[owner] + ".ts"
    : path.join(process.cwd(), "apps/cli/packages/adapters/src/config/" + owners[owner] + ".ts");
  const text = fs.readFileSync(source, "utf8");
  const output = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  const context = {
    exports,
    module: { exports },
    Error,
    Object,
    Array,
    JSON,
    Set,
    Map,
    Date: { now: () => 123 },
    Math: { random: () => 0.5 },
    process: { pid: 77, env: {}, cwd: () => "/virtual/cwd" },
    require: (id) => {
      if (id === "node:path") return virtualPath;
      if (Object.hasOwn(ports, id)) return ports[id];
      throw new Error("Unprovided product port: " + id);
    },
    ...globals,
  };
  vm.runInNewContext(output, context, { filename: source });
  return exports;
}
console.log(
  "sourceMode=" +
    (baseline ? "frozen-baseline" : "installed-candidate") +
    "; selectedOwner=" +
    (chosen ?? "all"),
);
const clean = (v) => JSON.parse(JSON.stringify(v));
const merger = () =>
  load("merger", { "@knorvia/contracts": { ConfigScope: scope, ConfigScopePriority: priorities } });
function caseFor(owner, name, fn) {
  if ((!chosen || chosen === owner) && (!chosenCase || name.includes(chosenCase)))
    test(owner + ": " + name, fn);
}

caseFor(
  "merger",
  "stable scope priority, ordinary replacement, plugin keys and hook append",
  () => {
    const m = merger(),
      userHooks = [{ hooks: [{ tag: "u" }] }],
      projectHooks = [{ hooks: [{ tag: "p" }] }];
    const user = {
      storage: { dir: "u", old: true },
      mcp: { servers: { old: { id: "u" } } },
      plugins: {
        dirs: ["u"],
        enabledPlugins: { a: false },
        options: { a: { keep: 1, change: "u" }, b: { b: 1 } },
        extraKnownMarketplaces: { user: {} },
      },
      hooks: { enabled: true, events: { Start: userHooks } },
      unknown: { ref: "u" },
    };
    const project = {
      storage: { dir: "p" },
      mcp: { servers: { fresh: { id: "p" } } },
      plugins: {
        dirs: ["u", "p"],
        enabledPlugins: { c: true },
        options: { a: { change: "p" } },
        extraKnownMarketplaces: { forbidden: {} },
      },
      hooks: { enabled: false, events: { Start: projectHooks } },
      marker: undefined,
    };
    const entries = [
      m.createPrioritizedConfig(project, scope.Project),
      m.createPrioritizedConfig(user, scope.User),
    ];
    const result = m.mergeConfigs(...entries);
    assert.equal(entries[0].config, project);
    assert.equal(m.getScopePriority(scope.Project), 20);
    assert.deepEqual(clean(result.storage), { dir: "p" });
    assert.deepEqual(Object.keys(result.mcp.servers), ["fresh"]);
    assert.deepEqual(clean(result.plugins), {
      dirs: ["u", "p"],
      enabledPlugins: { a: false, c: true },
      options: { a: { keep: 1, change: "p" }, b: { b: 1 } },
      extraKnownMarketplaces: { user: {} },
    });
    assert.equal(result.hooks.enabled, true);
    assert.notEqual(result.hooks.events.Start, userHooks);
    assert.equal(result.hooks.events.Start[0], userHooks[0]);
    assert.equal(result.unknown, user.unknown);
    assert.ok(Object.hasOwn(result, "marker"));
    assert.ok(Object.hasOwn(project.plugins.extraKnownMarketplaces, "forbidden"));
    const enabled = m.mergeConfigs(
      m.createPrioritizedConfig(user, scope.User),
      m.createPrioritizedConfig(
        { hooks: { events: { Start: projectHooks, Missing: undefined } } },
        scope.Cli,
      ),
    );
    assert.deepEqual(clean(enabled.hooks.events.Start), [...userHooks, ...projectHooks]);
    const stable = m.mergeConfigs(
      { config: { x: 1 }, scope: "custom", priority: 3 },
      { config: { x: 2 }, scope: "custom", priority: 3 },
    );
    assert.equal(stable.x, 2);
  },
);

function projectFixture() {
  const events = [],
    hooks = { enabled: true, events: {} },
    remote = { type: "sse", url: "synthetic" };
  const loaded = {
    config: {
      hooks,
      mcp: {
        servers: {
          relative: { type: "stdio", cwd: "tools" },
          absolute: { type: "stdio", cwd: "/absolute" },
          empty: { type: "stdio", cwd: "" },
          remote,
        },
      },
      unknown: { keep: true },
    },
    diagnostics: [{ code: "sample" }],
    path: "/work/.knorvia-studio/config.json",
    loaded: true,
  };
  let returned = loaded;
  const hookPorts = {
    discoverWorkspaceHookConfigPaths: (input) => {
      events.push(["discover", input]);
      return [
        { path: "a", explicitProjectConfig: false },
        { path: "b", explicitProjectConfig: true },
      ];
    },
    workspaceHooksConfigSchema: {
      parse: (h) => {
        events.push(["parse", h]);
        return h;
      },
    },
    createWorkspaceHookSourceInput: (input) => {
      events.push(["candidate", input]);
      return input;
    },
  };
  const module = load("project", {
    "./file-config.adapter.js": {
      loadFileConfig: (p) => {
        events.push(["load", p]);
        return returned;
      },
    },
    "@knorvia/shared/workspace-hook-discovery": hookPorts,
  });
  return {
    module,
    loaded,
    hooks,
    remote,
    events,
    set: (value) => {
      returned = value;
    },
    hookPorts,
  };
}
caseFor(
  "project",
  "base directory, stdio cwd, blocked schema candidate and failed diagnostics",
  () => {
    const f = projectFixture(),
      result = f.module.loadProjectConfigFile("synthetic");
    assert.equal(result.baseDir, "/work");
    assert.equal(result.config.hooks, undefined);
    assert.equal(result.config.mcp.servers.relative.cwd, "/work/tools");
    assert.equal(result.config.mcp.servers.absolute.cwd, "/absolute");
    assert.equal(result.config.mcp.servers.empty.cwd, "/work");
    assert.equal(result.config.mcp.servers.remote, f.remote);
    assert.equal(result.config.unknown, f.loaded.config.unknown);
    assert.notEqual(result.diagnostics, f.loaded.diagnostics);
    assert.equal(result.diagnostics[1].code, "config_project_hooks_pending_trust");
    assert.equal(result.hookCandidate.hooks, f.hooks);
    assert.equal(result.hookCandidate.workingDirectory, "/work");
    assert.ok(Object.hasOwn(result.hookCandidate, "explicitProjectConfig"));
    const failed = { ...result, loaded: false, diagnostics: [{ code: "failed" }] };
    const summary = f.module.summarizeProjectConfigs([failed, result]);
    assert.equal(summary.files[0], result);
    assert.equal(summary.hookCandidates[0], result.hookCandidate);
    assert.deepEqual(
      clean(summary.diagnostics).map((x) => x.code),
      ["failed", "sample", "config_project_hooks_pending_trust"],
    );
    f.set({ ...f.loaded, loaded: false });
    assert.deepEqual(clean(f.module.loadProjectConfigFile("failed").config), {});
  },
);
caseFor("project", "discovery order and normalization errors precede hook parsing", () => {
  const f = projectFixture();
  f.module.loadProjectConfigs("", "explicit");
  assert.deepEqual(clean(f.events[0]), [
    "discover",
    { workingDirectory: "/virtual/cwd", explicitProjectConfigPath: "explicit" },
  ]);
  assert.deepEqual(
    f.events.filter(([type]) => type === "candidate").map(([, value]) => value.discoveryOrder),
    [0, 1],
  );
  const raw = new Error("cwd getter");
  f.loaded.config.mcp.servers.relative = {
    type: "stdio",
    get cwd() {
      throw raw;
    },
  };
  f.events.length = 0;
  assert.throws(
    () => f.module.loadProjectConfigFile("a"),
    (e) => e === raw,
  );
  assert.equal(
    f.events.some(([type]) => type === "parse"),
    false,
  );
});

class SyntheticZodError extends Error {
  constructor(issues) {
    super("zod");
    this.issues = issues;
  }
}
function fileFixture() {
  const events = [],
    state = {
      text: "{}",
      present: true,
      readError: undefined,
      writeError: undefined,
      renameError: undefined,
      mkdirError: undefined,
      syncWriteError: undefined,
      parseError: undefined,
    };
  const schema = {
    CANONICAL_CUA_PLUGIN_ID: "official.cua",
    LEGACY_CUA_PLUGIN_ID: "legacy.cua",
    canonicalizePluginId: (id) => (id === "legacy.cua" ? "official.cua" : id),
    pluginIdAliases: (id) =>
      ["legacy.cua", "official.cua"].includes(id) ? ["official.cua", "legacy.cua"] : [id],
    parseConfigFileToRuntimePatchWithDiagnostics: (v) => {
      events.push(["parse", v]);
      if (state.parseError) throw state.parseError;
      return { config: v, diagnostics: [{ code: "warn" }, { code: "other", filePath: "" }] };
    },
  };
  const sync = {
    existsSync: (p) => {
      events.push(["exists", p]);
      return state.present;
    },
    readFileSync: (p, encoding) => {
      events.push(["readSync", p, encoding]);
      if (state.readError) throw state.readError;
      return state.text;
    },
    writeFileSync: (p, content, options) => {
      events.push(["writeSync", p, content, options]);
      if (state.syncWriteError) throw state.syncWriteError;
    },
    renameSync: (...args) => events.push(["renameSync", ...args]),
    unlinkSync: (...args) => events.push(["unlinkSync", ...args]),
  };
  const asyncFs = {
    readFile: async (p, encoding) => {
      events.push(["read", p, encoding]);
      if (state.readError) throw state.readError;
      return state.text;
    },
    mkdir: async (...args) => {
      events.push(["mkdir", ...args]);
      if (state.mkdirError) throw state.mkdirError;
    },
    writeFile: async (p, content, options) => {
      events.push(["write", p, content, options]);
      if (state.writeError) throw state.writeError;
    },
    rename: async (...args) => {
      events.push(["rename", ...args]);
      if (state.renameError) throw state.renameError;
    },
    unlink: async (...args) => {
      events.push(["unlink", ...args]);
      throw new Error("cleanup failed");
    },
  };
  const module = load("file", {
    "node:fs": sync,
    "node:fs/promises": asyncFs,
    "node:os": { homedir: () => "/virtual/home" },
    "@knorvia/shared/node": { resolveKnorviaDataRoot: () => "/virtual/data" },
    zod: { z: { ZodError: SyntheticZodError } },
    "./schema.js": schema,
  });
  return { module, state, events, schema, asyncFs, sync };
}
caseFor("file", "virtual paths, missing/invalid loads and best-effort alias migration", () => {
  const f = fileFixture();
  assert.equal(f.module.resolvePath("~/config"), "/virtual/home/config");
  assert.equal(f.module.resolvePath("~"), "/virtual/cwd/~");
  assert.equal(f.module.getDefaultConfigPath(), "/virtual/data/cli/config.json");
  f.state.present = false;
  assert.deepEqual(
    clean(f.module.loadFileConfig("", { baseDir: "/synthetic", configFileName: "" })),
    { config: {}, diagnostics: [], path: "/synthetic", loaded: false },
  );
  f.state.present = true;
  f.state.text = JSON.stringify({
    unknown: 1,
    plugins: {
      enabledPlugins: { "legacy.cua": true, "official.cua": false },
      options: { "legacy.cua": { x: 1 } },
      suppressedBuiltins: ["legacy.cua", 4],
    },
  });
  f.state.syncWriteError = new Error("virtual sync failure");
  const result = f.module.loadFileConfig("/config");
  assert.equal(result.loaded, true);
  assert.ok(Object.hasOwn(result.config.plugins.enabledPlugins, "legacy.cua"));
  const written = JSON.parse(f.events.find(([t]) => t === "writeSync")[2]);
  assert.deepEqual(written.plugins.enabledPlugins, { "official.cua": false });
  assert.deepEqual(written.plugins.options, { "official.cua": { x: 1 } });
  assert.deepEqual(written.plugins.suppressedBuiltins, ["official.cua", 4]);
  assert.equal(
    f.events.some(([t]) => t === "unlinkSync"),
    true,
  );
  assert.equal(result.diagnostics[0].filePath, "/config");
  assert.equal(result.diagnostics[1].filePath, "");
  f.state.parseError = new SyntheticZodError([
    { path: [], message: "root" },
    { path: ["a", 0], message: "bad" },
  ]);
  assert.equal(
    f.module.loadFileConfig("/config").diagnostics[0].message,
    "<config>: root; a.0: bad",
  );
});
caseFor("file", "key preservation, aliases, caller identity and exact no-op writes", async () => {
  const f = fileFixture(),
    original = {
      unknown: { keep: 1 },
      ui: { theme: "dark" },
      plugins: {
        untouched: "keep",
        enabledPlugins: { "legacy.cua": false, other: false },
        options: { "legacy.cua": { keep: "yes", drop: "no" }, other: { value: 3 } },
        suppressedBuiltins: ["legacy.cua", 5, "other"],
      },
    };
  f.state.text = JSON.stringify(original);
  const result = await f.module.updatePluginEnabledInFileConfig("/config", "legacy.cua", true);
  assert.equal(result.pluginId, "legacy.cua");
  let next = JSON.parse(f.events.findLast(([t]) => t === "write")[2]);
  assert.deepEqual(next.unknown, original.unknown);
  assert.deepEqual(next.plugins.options, original.plugins.options);
  assert.deepEqual(next.plugins.enabledPlugins, { other: false, "official.cua": true });
  const values = { drop: "readded", new: 1 },
    clears = ["drop"];
  const options = await f.module.updatePluginOptionsInFileConfig(
    "/config",
    "legacy.cua",
    values,
    clears,
  );
  assert.equal(options.options, values);
  assert.equal(options.clearedOptionKeys, clears);
  next = JSON.parse(f.events.findLast(([t]) => t === "write")[2]);
  assert.deepEqual(next.plugins.options["official.cua"], { keep: "yes", drop: "readded", new: 1 });
  assert.deepEqual(next.plugins.options.other, { value: 3 });
  f.events.length = 0;
  const defaults = await f.module.enablePluginsByDefaultInFileConfig("/config", [
    "other",
    "fresh",
    "fresh",
  ]);
  assert.deepEqual(clean(defaults.enabledIds), ["fresh", "fresh"]);
  f.events.length = 0;
  await f.module.enablePluginsByDefaultInFileConfig("/config", []);
  assert.equal(f.events.length, 0);
  await f.module.removePluginEnabledFromFileConfig("/config", "absent");
  assert.equal(
    f.events.some(([t]) => t === "write"),
    false,
  );
  await f.module.removePluginFromFileConfig("/config", "legacy.cua");
  next = JSON.parse(f.events.findLast(([t]) => t === "write")[2]);
  assert.deepEqual(next.plugins.enabledPlugins, { other: false });
  assert.deepEqual(next.plugins.options, { other: { value: 3 } });
  f.events.length = 0;
  await f.module.removeSuppressedBuiltinInFileConfig("/config", "absent");
  assert.equal(
    f.events.some(([t]) => t === "write"),
    false,
  );
  await f.module.addSuppressedBuiltinInFileConfig("/config", "legacy.cua");
  next = JSON.parse(f.events.findLast(([t]) => t === "write")[2]);
  assert.deepEqual(next.plugins.suppressedBuiltins, ["other", "official.cua"]);
});
caseFor("file", "save order, raw mkdir failure and wrapped write/read causes", async () => {
  const f = fileFixture();
  await f.module.updateUiLocaleInFileConfig("/config", "en");
  assert.deepEqual(
    f.events.map(([t]) => t),
    ["read", "mkdir", "write", "rename"],
  );
  assert.equal(f.events[2][1], "/.config.77.123.8.tmp");
  assert.equal(f.events[2][3].mode, 0o600);
  assert.equal(f.events[2][2], '{\n  "ui": {\n    "locale": "en"\n  }\n}\n');
  f.events.length = 0;
  const raw = new Error("mkdir denied");
  f.state.mkdirError = raw;
  await assert.rejects(f.module.updateUiLocaleInFileConfig("/config", "en"), (e) => e === raw);
  assert.deepEqual(
    f.events.map(([t]) => t),
    ["read", "mkdir"],
  );
  f.state.mkdirError = undefined;
  f.state.writeError = raw;
  f.events.length = 0;
  await assert.rejects(
    f.module.updateUiLocaleInFileConfig("/config", "en"),
    (e) => e.message === "Unable to write config file: /config" && e.cause === raw,
  );
  assert.deepEqual(
    f.events.map(([t]) => t),
    ["read", "mkdir", "write", "unlink"],
  );
  f.state.writeError = undefined;
  f.state.readError = Object.assign(new Error("missing"), { code: "ENOENT" });
  f.events.length = 0;
  await f.module.updateUiLocaleInFileConfig("/config", "en");
  assert.equal(
    f.events.some(([t]) => t === "write"),
    true,
  );
  f.state.readError = Object.assign(new Error("denied"), { code: "EACCES" });
  await assert.rejects(
    f.module.updateUiLocaleInFileConfig("/config", "en"),
    (e) => e.message === "Unable to read config file: /config" && e.cause === f.state.readError,
  );
});

function factoryFixture() {
  const events = [],
    m = merger();
  const server = (id) => ({ type: "stdio", command: id });
  const user = {
    config: {
      storage: { dir: "user" },
      ui: { locale: "user", theme: "user" },
      plugins: {
        dirs: ["u"],
        enabledPlugins: { a: false },
        extraKnownMarketplaces: { user: {} },
        options: { a: { user: 1 } },
      },
      mcp: { servers: { same: server("user"), user: server("u") } },
      hooks: { enabled: true, events: { Start: [{ hooks: [{ id: "u" }] }] } },
    },
    diagnostics: [
      { code: "config_mcp_server_invalid", message: "bad", filePath: "/user", severity: "warning" },
    ],
    path: "/user",
    loaded: true,
  };
  const files = [
    {
      config: {
        storage: { dir: "project1" },
        ui: { locale: "project" },
        plugins: {
          dirs: ["p"],
          enabledPlugins: { a: true },
          options: { a: { workspace: 2 } },
          extraKnownMarketplaces: { ignored: {} },
        },
        mcp: { servers: { same: server("project") } },
      },
      path: "/p1",
      diagnostics: [],
      loaded: true,
    },
    {
      config: { storage: { dir: "" }, ui: { theme: "project" } },
      path: "/p2",
      diagnostics: [],
      loaded: true,
    },
  ];
  const discovery = {
    files,
    diagnostics: [
      {
        code: "config_project_hooks_pending_trust",
        message: "pending",
        filePath: "/p1",
        severity: "warning",
      },
    ],
    paths: ["/p1", "/p2"],
    hookCandidates: [{ hooks: { enabled: true } }],
    mcpServerNames: ["same"],
    loaded: true,
  };
  const env = { storage: { dir: "env" }, mcp: { servers: { env: server("env") } } };
  const defaults = {
    storage: { dir: "system" },
    mcp: { servers: { system: server("s") } },
    hooks: { enabled: false },
  };
  const logger = { warn: (...args) => events.push(["warn", ...args]) };
  const loggerFactory = {
    createLogger: (name) => {
      events.push(["logger", name]);
      return {
        child: (fields) => {
          events.push(["child", fields]);
          return logger;
        },
      };
    },
  };
  const ports = {
    "@knorvia/contracts": {
      ConfigScope: scope,
      DefaultRuntimeConfig: defaults,
      createWorkspaceHookBundleSnapshot: (data) => {
        events.push(["snapshot", data]);
        return data;
      },
    },
    "@knorvia/shared/workspace-hook-discovery": {
      resolveWorkspaceHookRuntimeRoot: (inputs) => {
        events.push(["root", inputs]);
        return "runtime";
      },
      buildWorkspaceHookBundleSnapshot: (input) => {
        events.push(["bundle", input]);
        return input;
      },
    },
    "./index.js": {
      createConfigPort: (patch) => {
        events.push(["port", patch]);
        return {
          getAll: () => {
            events.push(["getAll"]);
            return patch;
          },
        };
      },
    },
    "./file-config.adapter.js": {
      loadFileConfig: (input) => {
        events.push(["user", input]);
        return user;
      },
      getDefaultConfigPath: () => {
        events.push(["defaultPath"]);
        return "/default";
      },
    },
    "./env-config.adapter.js": {
      parseEnvConfig: (input) => {
        events.push(["env", input]);
        return env;
      },
    },
    "./config-merger.js": m,
    "../logging/index.js": {
      createNodeLoggerFactory: (input) => {
        events.push(["loggerFactory", input]);
        return loggerFactory;
      },
    },
    "./project-config.adapter.js": {
      loadProjectConfigs: (...args) => {
        events.push(["projects", ...args]);
        return discovery;
      },
      loadProjectConfigFile: (...args) => {
        events.push(["projectFile", ...args]);
        return files[0];
      },
      summarizeProjectConfigs: (input) => {
        events.push(["summarize", input]);
        return input.length
          ? { ...discovery, files: input }
          : {
              files: [],
              diagnostics: [],
              paths: [],
              hookCandidates: [],
              mcpServerNames: [],
              loaded: false,
            };
      },
    },
  };
  return {
    module: load("factory", ports),
    events,
    user,
    files,
    discovery,
    env,
    defaults,
    logger,
    loggerFactory,
    ports,
    server,
  };
}
caseFor("factory", "source precedence, metadata refs, hook tagging and logger order", () => {
  const f = factoryFixture(),
    cli = { ui: { locale: "cli" }, mcp: { servers: { same: f.server("cli") } } },
    inputEnv = {};
  const result = f.module.createConfig({
    env: inputEnv,
    workingDirectory: "/work",
    workspaceIdentity: " id ",
    cliOverrides: cli,
    loggerFactory: f.loggerFactory,
  });
  assert.equal(result.config.ui.locale, "cli");
  assert.equal(result.config.storage.dir, "env");
  assert.equal(result.config.mcp.servers.same, cli.mcp.servers.same);
  assert.equal(result.config.mcp.servers.user, f.user.config.mcp.servers.user);
  assert.deepEqual(clean(result.sources.mcp.serverSources), {
    system: "system",
    same: "cli",
    user: "user",
    env: "env",
  });
  assert.equal(result.sources.user.diagnostics, f.user.diagnostics);
  assert.equal(result.sources.project.paths, f.discovery.paths);
  assert.equal(result.sources.project.diagnostics, f.discovery.diagnostics);
  assert.equal(result.sources.project.uiLocalePath, "/p1");
  assert.equal(result.sources.project.uiThemePath, "/p2");
  assert.equal(result.sources.plugins.dirs.user, f.user.config.plugins.dirs);
  assert.deepEqual(clean(result.sources.plugins.enabled), { a: "workspace" });
  assert.deepEqual(clean(result.sources.plugins.marketplaces), { user: "user" });
  assert.deepEqual(clean(result.sources.plugins.options), {
    a: { user: "user", workspace: "workspace" },
  });
  assert.equal(result.sources.workspaceHookSnapshot, undefined);
  assert.equal(result.sources.project.workspaceHookSnapshot.workspaceIdentity, "id");
  const tags = f.events.map(([tag]) => tag);
  assert.ok(tags.indexOf("warn") < tags.indexOf("env"));
  assert.ok(tags.indexOf("bundle") < tags.indexOf("port"));
  assert.equal(f.events.find(([tag]) => tag === "warn")[1], "MCP server config skipped");
  assert.deepEqual(clean(result.config.hooks.events.Start[0].hooks[0].source), {
    kind: "user",
    path: "/user",
  });
  assert.equal(f.user.config.hooks.events.Start[0].hooks[0].source, undefined);
});
caseFor("factory", "diagnostic errors stop composition and storage nullish precedence", () => {
  const f = factoryFixture(),
    raw = new Error("warn failed");
  f.logger.warn = () => {
    throw raw;
  };
  assert.throws(
    () =>
      f.module.createConfig({ env: {}, workingDirectory: "/work", loggerFactory: f.loggerFactory }),
    (e) => e === raw,
  );
  assert.equal(
    f.events.some(([tag]) => tag === "env"),
    false,
  );
  f.logger.warn = () => {};
  f.env.storage.dir = undefined;
  assert.equal(f.module.resolveWorkspaceStorageDir({ env: {}, workingDirectory: "/work" }), "");
  f.user.diagnostics = [];
  f.discovery.diagnostics = [];
  f.events.length = 0;
  const result = f.module.createConfig({
    env: {},
    skipUserConfig: true,
    userConfigPath: "/ignored",
    cliOverrides: {},
  });
  assert.equal(result.sources.user.path, "/default");
  assert.equal(result.sources.cli, true);
  assert.equal(
    f.events.some(([tag]) => tag === "user"),
    false,
  );
  assert.equal(
    f.events.some(([tag]) => tag === "logger"),
    false,
  );
});

caseFor(
  "factory",
  "internal hook sources keep exact payloads and existing source references",
  () => {
    const f = factoryFixture(),
      existing = { kind: "internal", custom: "retained" };
    f.env.hooks = { enabled: true, events: { Env: [{ hooks: [{ id: "env" }] }] } };
    const cli = {
      hooks: {
        enabled: true,
        events: { Cli: [{ hooks: [{ id: "cli" }, { id: "prior", source: existing }] }] },
      },
    };
    const result = f.module.createConfig({
      env: {},
      workingDirectory: "/work",
      cliOverrides: cli,
      loggerFactory: f.loggerFactory,
    });
    assert.deepEqual(clean(result.config.hooks.events.Env[0].hooks[0].source), {
      kind: "internal",
    });
    assert.deepEqual(clean(result.config.hooks.events.Cli[0].hooks[0].source), {
      kind: "internal",
    });
    assert.equal(result.config.hooks.events.Cli[0].hooks[1].source, existing);
  },
);
caseFor("project", "summary output key and error observation ordering", () => {
  const f = projectFixture(),
    events = [],
    raw = new Error("diagnostic getter");
  const input = {
    get loaded() {
      events.push("loaded");
      return true;
    },
    config: {
      mcp: {
        servers: {
          get a() {
            throw new Error("must not read server values");
          },
        },
      },
    },
    get diagnostics() {
      events.push("diagnostics");
      throw raw;
    },
    path: "/a",
  };
  // Object.keys inspects server names, not values, and diagnostics fail after loaded screening.
  assert.throws(
    () => f.module.summarizeProjectConfigs([input]),
    (e) => e === raw,
  );
  assert.deepEqual(events, ["loaded", "diagnostics"]);
  const summary = f.module.summarizeProjectConfigs([]);
  assert.deepEqual(Object.keys(summary), [
    "diagnostics",
    "files",
    "hookCandidates",
    "loaded",
    "paths",
    "mcpServerNames",
  ]);
});
