// SPDX-License-Identifier: Apache-2.0
// commands 簇 S27–S33：commandDiscovery 的用户目录发现（优先级/去重/容错）、
// 插件命令发现（开关/候选源/manifest 校验/声明目录边界），commands 描述符面，
// commandsService 的写/改/删/启停与 config.json 写回。
import assert from "node:assert/strict";
import { mkdir, rm, stat, symlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { describe, it } from "node:test";

import { importDeep, services, servicesNode } from "./entry.mjs";
import {
  knorviaDataRoot,
  makeTempRoot,
  pathExists,
  readText,
  registerCleanup,
  withEnv,
  writeText,
} from "./helpers.mjs";

const commandDiscovery = await importDeep("commands/commandDiscovery.ts");
const commandConfig = await importDeep("commands/commandConfig.ts");
const commandsModule = await importDeep("commands/commands.ts");

const userDirOf = (root) => join(knorviaDataRoot(root), "commands");
const configPathOf = (root) => join(knorviaDataRoot(root), "cli", "config.json");
const pluginRootOf = (root) => join(knorviaDataRoot(root), "cli", "plugins");

/** 把 commandHome()（agents 兜底目录与 ~/ 展开的根）钉到临时目录，禁止摸真实 HOME。 */
async function tempHome(t, root) {
  const home = join(root, "fake-home");
  await mkdir(home, { recursive: true });
  withEnv(t, "HOME", home);
  withEnv(t, "USERPROFILE", home);
  return home;
}

async function writeUserCommand(root, rel, content) {
  const filePath = join(userDirOf(root), rel);
  await writeText(filePath, content);
  return filePath;
}

/** 建一个带 manifest 与命令文件的插件根，返回插件根路径。 */
async function makePlugin(rootPath, { manifestDir = ".knorvia-plugin", name, commands, files }) {
  const manifest = { name };
  if (commands !== undefined) manifest.commands = commands;
  await writeText(join(rootPath, manifestDir, "plugin.json"), JSON.stringify(manifest));
  for (const [rel, content] of Object.entries(files ?? {})) {
    await writeText(join(rootPath, rel), content);
  }
  return rootPath;
}

function commandFields(cmd) {
  return {
    id: cmd.id,
    name: cmd.name,
    scope: cmd.scope,
    source: cmd.source,
    enabled: cmd.enabled,
    filePath: cmd.filePath,
    location: cmd.location,
  };
}

describe("S27 用户命令发现", () => {
  it("S27 跳过点文件、子目录进命名空间、扩展名大小写不敏感、override 按精确路径生效", async (t) => {
    const root = await makeTempRoot(t);
    await tempHome(t, root);
    const greetPath = await writeUserCommand(
      root,
      "greet.md",
      "---\ndescription: hi\n---\nhello world",
    );
    const deepPath = await writeUserCommand(root, join("nested", "deep.md"), "deep body");
    const upperPath = await writeUserCommand(root, "CASE.MD", "upper");
    await writeUserCommand(root, ".hidden.md", "skip me");
    await writeUserCommand(root, "notes.txt", "skip me too");

    const found = await commandDiscovery.discoverUserCommands(["agent"], undefined, new Map());
    assert.deepEqual(found.map((cmd) => cmd.name).sort(), ["/CASE", "/greet", "/nested/deep"]);
    const greet = found.find((cmd) => cmd.name === "/greet");
    assert.deepEqual(commandFields(greet), {
      id: "agent:knorvia:global:/greet",
      name: "/greet",
      scope: "global",
      source: "user",
      enabled: true,
      filePath: greetPath,
      location: { source: "knorvia", scope: "user", directoryPath: userDirOf(root) },
    });
    assert.equal(greet.agentSource, "agent");
    assert.equal(greet.description, "hi");
    assert.equal(greet.prompt, "hello world");
    assert.equal("projectPath" in greet, false);
    assert.equal(found.find((cmd) => cmd.name === "/nested/deep").filePath, deepPath);
    assert.equal(found.find((cmd) => cmd.name === "/CASE").filePath, upperPath);

    // 覆盖表按发现时的绝对路径键入；未列出的默认启用。
    const overrides = new Map([
      [greetPath, false],
      [upperPath, true],
    ]);
    const again = await commandDiscovery.discoverUserCommands(["agent"], undefined, overrides);
    assert.equal(again.find((cmd) => cmd.name === "/greet").enabled, false);
    assert.equal(again.find((cmd) => cmd.name === "/CASE").enabled, true);
    assert.equal(again.find((cmd) => cmd.name === "/nested/deep").enabled, true);
    assert.equal(again.length, 3);
  });

  it("S27 项目档发现组装：scope/projectPath/location/id 取项目层级，enabled 如实反映覆盖", async (t) => {
    const root = await makeTempRoot(t);
    await tempHome(t, root);
    const ws = join(root, "ws");
    const projDir = join(ws, ".knorvia-studio", "commands");
    const projPath = join(projDir, "hello.md");
    await writeText(projPath, "from project");
    const found = await commandDiscovery.discoverUserCommands(
      ["agent"],
      ws,
      new Map([[projPath, false]]),
    );
    assert.equal(found.length, 1);
    assert.deepEqual(commandFields(found[0]), {
      id: "agent:knorvia:project:/hello",
      name: "/hello",
      scope: "project",
      source: "user",
      enabled: false,
      filePath: projPath,
      location: {
        source: "knorvia",
        scope: "project",
        directoryPath: projDir,
        projectPath: ws,
      },
    });
    assert.equal(found[0].projectPath, ws);
    assert.equal(found[0].agentSource, "agent");
    assert.equal(found[0].content, "from project");
  });
});

describe("S28 目录来源优先级与同名去重", () => {
  it("S28 项目压用户；knorvia 目录非空即不再扫 agents；同名保留先发现者", async (t) => {
    const root = await makeTempRoot(t);
    const home = await tempHome(t, root);
    const ws = join(root, "ws");
    await writeText(
      join(ws, ".knorvia-studio", "commands", "hello.md"),
      "---\ndescription: from project\n---\np",
    );
    await writeText(join(ws, ".agents", "commands", "onlyprojagents.md"), "nope");
    await writeUserCommand(root, "hello.md", "---\ndescription: from user\n---\np");
    await writeUserCommand(root, "useronly.md", "u");
    await writeText(join(home, ".agents", "commands", "agentslegacy.md"), "a");

    const found = await commandDiscovery.discoverUserCommands(["agent"], ws, new Map());
    assert.deepEqual(found.map((cmd) => cmd.name).sort(), ["/hello", "/useronly"]);
    const hello = found.find((cmd) => cmd.name === "/hello");
    // 项目级 knorvia 目录先扫，同名去重保留它。
    assert.equal(hello.filePath, join(ws, ".knorvia-studio", "commands", "hello.md"));
    assert.equal(hello.description, "from project");
    assert.equal(hello.scope, "project");
    // knorvia 目录在两档都非空 → 两处 agents 兜底都没被扫描。
    assert.equal(
      found.some((cmd) => cmd.id.includes(":agents:")),
      false,
    );
  });

  it("S28 knorvia 用户目录零命令时 agents 兜底可发现；全无目录返回空数组", async (t) => {
    const root = await makeTempRoot(t);
    const home = await tempHome(t, root);
    // knorvia 目录存在但只有隐藏文件 → count 0 → 允许 agents 兜底。
    await writeUserCommand(root, ".keep.md", "hidden");
    await writeText(
      join(home, ".agents", "commands", "legacy.md"),
      "---\ndescription: legacy\n---\nx",
    );
    const found = await commandDiscovery.discoverUserCommands(["agent"], undefined, new Map());
    assert.deepEqual(
      found.map((cmd) => commandFields(cmd)),
      [
        {
          id: "agent:agents:global:/legacy",
          name: "/legacy",
          scope: "global",
          source: "user",
          enabled: true,
          filePath: join(home, ".agents", "commands", "legacy.md"),
          location: {
            source: "agents",
            scope: "user",
            directoryPath: join(home, ".agents", "commands"),
          },
        },
      ],
    );
    // 空 sources 与全缺失目录都安静返回空。
    assert.deepEqual(await commandDiscovery.discoverUserCommands([], undefined, new Map()), []);
    const bare = await makeTempRoot(t);
    await tempHome(t, bare);
    assert.deepEqual(
      await commandDiscovery.discoverUserCommands(["agent"], join(bare, "no-ws"), new Map()),
      [],
    );
  });

  it("S28 损坏的用户命令文件被跳过而不是让整次发现失败", async (t) => {
    const root = await makeTempRoot(t);
    await tempHome(t, root);
    await writeUserCommand(root, "good.md", "fine");
    // 把 .md 做成指向不存在目标的软链：readFile 抛错 → 该条被 catch 跳过。
    const broken = join(userDirOf(root), "broken.md");
    // 断链占位登记进统一清理：`rm -r` 对断链在部分平台会失败，必须先于数据根删除处理，
    // 否则失败会污染数据根那一步的清理结果。
    registerCleanup(t, () => rm(broken, { recursive: true, force: true }));
    try {
      await symlink(join(root, "does-not-exist.md"), broken);
    } catch {
      // Windows 无符号链接权限时退化为目录占位：readdir 走递归分支同样不产生命令。
      await mkdir(broken, { recursive: true });
    }
    const found = await commandDiscovery.discoverUserCommands(["agent"], undefined, new Map());
    assert.deepEqual(
      found.map((cmd) => cmd.name),
      ["/good"],
    );
  });
});

describe("S29 插件命令发现的开关与候选源", () => {
  it("S29 plugins.enabled=false 一票否决；inline 目录默认启用；enabledPlugins 可反向压默认", async (t) => {
    const root = await makeTempRoot(t);
    await tempHome(t, root);
    const inline = await makePlugin(join(root, "plugins", "alpha"), {
      name: "alpha",
      files: { "commands/tool.md": "---\ndescription: alpha tool\n---\ndo it" },
    });
    const tool = join(inline, "commands", "tool.md");
    await commandConfig.writeCommandConfiguration({ plugins: { enabled: false, dirs: [inline] } });
    assert.deepEqual(await commandDiscovery.discoverPluginCommands(new Map()), []);

    await commandConfig.writeCommandConfiguration({ plugins: { dirs: [inline] } });
    const found = await commandDiscovery.discoverPluginCommands(new Map());
    assert.equal(found.length, 1);
    assert.equal(found[0].id, `plugin:inline:alpha:/tool:${tool}`);
    assert.equal(found[0].name, "/tool");
    assert.equal(found[0].scope, "global");
    assert.equal(found[0].source, "plugin");
    assert.equal(found[0].enabled, true);
    assert.equal(found[0].pluginEnabled, true);
    assert.equal(found[0].pluginMarketplace, "inline");
    assert.equal(found[0].pluginName, "alpha");
    assert.equal(found[0].filePath, tool);
    assert.equal(found[0].description, "alpha tool");
    assert.equal(found[0].prompt, "do it");

    // 按 id 关闭后该插件整体消失。
    await commandConfig.writeCommandConfiguration({
      plugins: { dirs: [inline], enabledPlugins: { "alpha@inline": false } },
    });
    assert.deepEqual(await commandDiscovery.discoverPluginCommands(new Map()), []);

    // 单文件覆盖只影响 enabled，不影响 pluginEnabled（插件恢复默认启用后按文件禁用）。
    await commandConfig.writeCommandConfiguration({ plugins: { dirs: [inline] } });
    const overridden = await commandDiscovery.discoverPluginCommands(new Map([[tool, false]]));
    assert.equal(overridden.length, 1);
    assert.equal(overridden[0].enabled, false);
    assert.equal(overridden[0].pluginEnabled, true);
  });

  it("S29 bundled 缓存默认启用表、双版本取字典序首版、suppressedBuiltins 只作用 bundled", async (t) => {
    const root = await makeTempRoot(t);
    await tempHome(t, root);
    const cache = join(pluginRootOf(root), "cache", "knorvia-plugins-bundled");
    const v1 = await makePlugin(join(cache, "pdf", "1.0.0"), {
      name: "pdf",
      files: { "commands/pdf.md": "---\ndescription: v1 tool\n---\np1" },
    });
    await makePlugin(join(cache, "pdf", "2.0.0"), {
      name: "pdf",
      files: { "commands/pdf.md": "---\ndescription: v2 tool\n---\np2" },
    });
    const found = await commandDiscovery.discoverPluginCommands(new Map());
    // pdf 在默认启用名单里，且 1.0.0 按路径排序先被登记，同 id 的 2.0.0 整个跳过。
    assert.equal(found.length, 1);
    assert.equal(found[0].description, "v1 tool");
    assert.equal(found[0].filePath, join(v1, "commands", "pdf.md"));
    assert.equal(found[0].pluginMarketplace, "knorvia-plugins-bundled");

    // 抑制名单命中 bundled id 时整插件消失。
    await commandConfig.writeCommandConfiguration({
      plugins: { suppressedBuiltins: ["pdf@knorvia-plugins-bundled"] },
    });
    assert.deepEqual(await commandDiscovery.discoverPluginCommands(new Map()), []);

    // 名单外的 bundled 插件默认关，enabledPlugins 显式开才出现。
    await makePlugin(join(cache, "computer-use", "1.0.0"), {
      name: "computer-use",
      files: { "commands/cu.md": "cu" },
    });
    await commandConfig.writeCommandConfiguration({ plugins: {} });
    const defaults = await commandDiscovery.discoverPluginCommands(new Map());
    assert.deepEqual(
      defaults.map((cmd) => cmd.name),
      ["/pdf"],
    );
    await commandConfig.writeCommandConfiguration({
      plugins: { enabledPlugins: { "computer-use@knorvia-plugins-bundled": true } },
    });
    const enabled = await commandDiscovery.discoverPluginCommands(new Map());
    assert.deepEqual(
      enabled.map((cmd) => cmd.name),
      ["/cu", "/pdf"],
    );
  });

  it("S29 installed_plugins.json 索引：默认关、字段与绝对路径校验、marketplace 取自索引", async (t) => {
    const root = await makeTempRoot(t);
    await tempHome(t, root);
    const installRoot = await makePlugin(join(root, "installs", "x"), {
      name: "x",
      files: { "commands/x.md": "x body" },
    });
    await writeText(
      join(pluginRootOf(root), "installed_plugins.json"),
      JSON.stringify({
        plugins: [
          { id: "x@acme", marketplace: "acme", installPath: installRoot },
          { id: "rel@z", marketplace: "z", installPath: "relative/path" },
          { marketplace: "w", installPath: installRoot },
          "not-a-record",
        ],
      }),
    );
    // 索引插件默认关。
    assert.deepEqual(await commandDiscovery.discoverPluginCommands(new Map()), []);
    await commandConfig.writeCommandConfiguration({
      plugins: { enabledPlugins: { "x@acme": true } },
    });
    const found = await commandDiscovery.discoverPluginCommands(new Map());
    assert.equal(found.length, 1);
    assert.equal(found[0].pluginMarketplace, "acme");
    assert.equal(found[0].pluginName, "x");
    assert.equal(found[0].name, "/x");
    // 坏 JSON 索引等价于没有索引（readInstalledPluginRoots 吞错）。
    await writeText(join(pluginRootOf(root), "installed_plugins.json"), "{oops");
    await commandConfig.writeCommandConfiguration({ plugins: {} });
    assert.deepEqual(await commandDiscovery.discoverPluginCommands(new Map()), []);
  });

  it("S29 storage.dir 重定向插件根、目录名恰为 cli 时少一级、KNORVIA_PORTABLE_DIR 优先数据根", async (t) => {
    const root = await makeTempRoot(t);
    await tempHome(t, root);
    const custom = join(root, "custom-storage");
    await makePlugin(
      join(custom, "cli", "plugins", "cache", "knorvia-plugins-bundled", "pdf", "1.0.0"),
      { name: "pdf", files: { "commands/pdf.md": "storage custom" } },
    );
    await commandConfig.writeCommandConfiguration({ storage: { dir: custom } });
    const found = await commandDiscovery.discoverPluginCommands(new Map());
    assert.equal(found.length, 1);
    assert.equal(found[0].prompt, "storage custom");

    // 便携模式忽略 storage.dir，回到数据根（那里没有插件），结果为空。
    withEnv(t, "KNORVIA_PORTABLE_DIR", "1");
    assert.deepEqual(await commandDiscovery.discoverPluginCommands(new Map()), []);
    withEnv(t, "KNORVIA_PORTABLE_DIR", undefined);

    // storage.dir 末段就是 cli 时不再叠一层 cli。
    const flat = join(root, "cli");
    await makePlugin(join(flat, "plugins", "cache", "knorvia-plugins-bundled", "pdf", "1.0.0"), {
      name: "pdf",
      files: { "commands/pdf.md": "flat cli root" },
    });
    await commandConfig.writeCommandConfiguration({ storage: { dir: flat } });
    const flatFound = await commandDiscovery.discoverPluginCommands(new Map());
    assert.equal(flatFound.length, 1);
    assert.equal(flatFound[0].prompt, "flat cli root");
  });
});

describe("S30 插件 manifest 与命令目录声明边界", () => {
  it("S30 manifest 目录优先级与名称校验，非法项静默跳过", async (t) => {
    const root = await makeTempRoot(t);
    await tempHome(t, root);
    const both = join(root, "plugins", "both");
    await makePlugin(both, { name: "primary", files: { "commands/p.md": "primary body" } });
    await writeText(
      join(both, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "secondary", commands: "commands" }),
    );
    const bad = await makePlugin(join(root, "plugins", "bad"), {
      name: "Bad_Name",
      files: { "commands/no.md": "no" },
    });
    const tooLong = await makePlugin(join(root, "plugins", "long"), {
      name: "a".repeat(129),
      files: { "commands/no.md": "no" },
    });
    const padded = await makePlugin(join(root, "plugins", "padded"), {
      name: " ok.name-1 ",
      files: { "commands/z.md": "padded body" },
    });
    const noManifest = join(root, "plugins", "nomanifest");
    await writeText(join(noManifest, "commands", "ghost.md"), "ghost");
    await writeText(
      join(root, "plugins", "broken-json", ".knorvia-plugin", "plugin.json"),
      "{oops",
    );
    await commandConfig.writeCommandConfiguration({
      plugins: {
        dirs: [both, bad, tooLong, padded, noManifest, join(root, "plugins", "broken-json")],
      },
    });
    const found = await commandDiscovery.discoverPluginCommands(new Map());
    assert.deepEqual(found.map((cmd) => `${cmd.pluginName}:${cmd.name}`).sort(), [
      "ok.name-1:/z",
      "primary:/p",
    ]);
    // 非法名/无 manifest/坏 JSON 目录不贡献命令；.claude-plugin 被 .knorvia-plugin 压掉。
    assert.equal(
      found.some((cmd) => cmd.filePath.startsWith(bad)),
      false,
    );
    assert.equal(
      found.some((cmd) => cmd.filePath.startsWith(tooLong)),
      false,
    );
    assert.equal(
      found.some((cmd) => cmd.filePath.startsWith(noManifest)),
      false,
    );

    // .claude-plugin 单独存在时可作为回退。
    await makePlugin(join(root, "plugins", "claudeonly"), {
      manifestDir: ".claude-plugin",
      name: "cl",
      files: { "commands/c.md": "c" },
    });
    await commandConfig.writeCommandConfiguration({
      plugins: { dirs: [join(root, "plugins", "claudeonly")] },
    });
    const claude = await commandDiscovery.discoverPluginCommands(new Map());
    assert.deepEqual(
      claude.map((cmd) => cmd.pluginName),
      ["cl"],
    );
  });

  it("S30 commands 声明：字符串/数组、越界与绝对路径剔除、空数组禁用默认目录", async (t) => {
    const root = await makeTempRoot(t);
    await tempHome(t, root);
    const pStr = await makePlugin(join(root, "plugins", "str"), {
      name: "pstr",
      commands: "mycmd",
      files: { "mycmd/tool.md": "string decl", "commands/ignored.md": "default must lose" },
    });
    const pArr = await makePlugin(join(root, "plugins", "arr"), {
      name: "parr",
      commands: ["commands", "extra"],
      files: { "commands/a.md": "a", "extra/b.md": "b" },
    });
    const pEsc = await makePlugin(join(root, "plugins", "esc"), {
      name: "pesc",
      commands: ["../escape", join(root, "abs"), "missing"],
      files: { "commands/x.md": "should not appear" },
    });
    // 逃逸与绝对路径目标真实存在：若校验失效就会被发现，断言才有拦截力。
    await writeText(join(root, "plugins", "escape", "out.md"), "outside");
    await writeText(join(root, "abs", "abscmd.md"), "absolute");
    const pEmpty = await makePlugin(join(root, "plugins", "empty"), {
      name: "pempty",
      commands: [],
      files: { "commands/y.md": "declared-empty kills default" },
    });
    await commandConfig.writeCommandConfiguration({
      plugins: { dirs: [pStr, pArr, pEsc, pEmpty] },
    });
    const found = await commandDiscovery.discoverPluginCommands(new Map());
    assert.deepEqual(found.map((cmd) => cmd.name).sort(), ["/a", "/b", "/tool"]);
    // 字符串声明生效且默认 commands 目录失效。
    assert.equal(
      found.find((cmd) => cmd.name === "/tool").filePath,
      join(pStr, "mycmd", "tool.md"),
    );
    assert.equal(
      found.some((cmd) => cmd.name === "/ignored"),
      false,
    );
    // 逃逸/绝对路径声明被剔除，声明目录缺失时对应文件不会被发现。
    assert.equal(
      found.some((cmd) => cmd.filePath.startsWith(join(root, "plugins", "escape"))),
      false,
    );
    assert.equal(
      found.some((cmd) => cmd.filePath.startsWith(join(root, "abs"))),
      false,
    );
    assert.equal(
      found.some((cmd) => cmd.name === "/x"),
      false,
    );
    // 声明了字段时空数组等价于禁用默认目录。
    assert.equal(
      found.some((cmd) => cmd.name === "/y"),
      false,
    );

    // 同一插件声明互相包含的目录：按绝对路径去重，名称取首个根的相对名。
    const pOverlap = await makePlugin(join(root, "plugins", "overlap"), {
      name: "poverlap",
      commands: ["commands", join("commands", "sub")],
      files: { [join("commands", "sub", "x.md")]: "overlap" },
    });
    await commandConfig.writeCommandConfiguration({ plugins: { dirs: [pOverlap] } });
    const overlap = await commandDiscovery.discoverPluginCommands(new Map());
    assert.deepEqual(
      overlap.map((cmd) => cmd.name),
      ["/sub/x"],
    );
    assert.equal(overlap[0].filePath, join(pOverlap, "commands", "sub", "x.md"));

    // 结果按 name 排序（localeCompare），跨插件稳定。
    const pOrder = await makePlugin(join(root, "plugins", "order"), {
      name: "porder",
      files: { "commands/beta.md": "b", "commands/alpha.md": "a" },
    });
    await commandConfig.writeCommandConfiguration({ plugins: { dirs: [pOrder] } });
    const ordered = await commandDiscovery.discoverPluginCommands(new Map());
    assert.deepEqual(
      ordered.map((cmd) => cmd.name),
      ["/alpha", "/beta"],
    );
  });
});

describe("S31 commands.ts 描述符面与 service 装配", () => {
  it("S31 ICommandsService 是根桶与深层模块的同一运行时对象，channelName 钉死 commands", async () => {
    assert.equal(services.ICommandsService, commandsModule.ICommandsService);
    assert.deepEqual(Object.keys(commandsModule), ["ICommandsService"]);
    assert.deepEqual({ ...services.ICommandsService }, { channelName: "commands" });
    // 运行时装配面：方法集合恰好六个，且都是可调用函数。
    const service = servicesNode.createCommandsService();
    assert.deepEqual(Object.keys(service).sort(), [
      "deleteCommandFile",
      "getPrimaryUserCommandsDirectory",
      "list",
      "setCommandEnabled",
      "updateCommandFile",
      "writeCommandFile",
    ]);
    assert.equal(
      Object.values(service).every((fn) => typeof fn === "function"),
      true,
    );
  });

  it("S31 list 返回三段结构且 capability 恒为 userScopeAvailable（isDesktopRuntime 被忽略）", async (t) => {
    const root = await makeTempRoot(t);
    await tempHome(t, root);
    const service = servicesNode.createCommandsService({ isDesktopRuntime: false });
    assert.deepEqual(await service.list({}), {
      commands: [],
      userCommands: [],
      pluginCommands: [],
      capability: { userScopeAvailable: true },
    });
    await writeUserCommand(root, "listed.md", "---\ndescription: d\n---\nbody");
    const inline = await makePlugin(join(root, "plugins", "alpha"), {
      name: "alpha",
      files: { "commands/tool.md": "tool body" },
    });
    await commandConfig.writeCommandConfiguration({ plugins: { dirs: [inline] } });
    const result = await service.list({});
    assert.deepEqual(result.commands, [...result.userCommands, ...result.pluginCommands]);
    assert.deepEqual(
      result.userCommands.map((cmd) => cmd.name),
      ["/listed"],
    );
    assert.deepEqual(
      result.pluginCommands.map((cmd) => cmd.name),
      ["/tool"],
    );
    assert.equal(result.userCommands[0].description, "d");
    assert.equal(result.pluginCommands[0].pluginName, "alpha");
    // 显式指定 agentSource 与缺省同效（当前唯一来源就是 agent）。
    const scoped = await service.list({ agentSource: "agent" });
    assert.deepEqual(scoped.commands, result.commands);
    assert.deepEqual(scoped.capability, { userScopeAvailable: true });
  });
});

describe("S32 writeCommandFile", () => {
  it("S32 写入按生成格式落盘、返回 userCommand、清除同路径陈旧禁用并保留未知字段", async (t) => {
    const root = await makeTempRoot(t);
    await tempHome(t, root);
    const service = servicesNode.createCommandsService();
    const greetPath = join(userDirOf(root), "greet.md");
    await commandConfig.writeCommandConfiguration({
      unrelated: { keep: "x" },
      command: { [greetPath]: { enable: false } },
    });
    const { command } = await service.writeCommandFile({
      config: { name: "/greet", prompt: "say hi", description: " d ", argumentHint: " a " },
    });
    assert.equal(
      await readText(greetPath),
      ["---", "description: d", "argument-hint: a", "---", "", "say hi"].join("\n"),
    );
    assert.deepEqual(commandFields(command), {
      id: "agent:knorvia:global:/greet",
      name: "/greet",
      scope: "global",
      source: "user",
      enabled: true,
      filePath: greetPath,
      location: { source: "knorvia", scope: "user", directoryPath: userDirOf(root) },
    });
    // 陈旧禁用覆盖被清掉，其它键原样保留。
    assert.deepEqual(await commandConfig.readCommandConfiguration(), { unrelated: { keep: "x" } });
    assert.deepEqual([...(await commandConfig.readEnabledOverrides()).entries()], []);

    // 无元数据的新命令：文件内容就是 prompt 原文（不补 frontmatter、不加尾换行）。
    await service.writeCommandFile({ config: { name: "/bare", prompt: "hello" } });
    assert.equal(await readText(join(userDirOf(root), "bare.md")), "hello");

    // 重名写入被拒且不覆盖原文件。
    await assert.rejects(
      () => service.writeCommandFile({ config: { name: "/greet", prompt: "never overwrite" } }),
      /Command file already exists: greet\.md/,
    );
    const after = await readText(greetPath);
    assert.ok(after.includes("say hi"));
    assert.equal(after.includes("never overwrite"), false);
  });

  it("S32 项目写入落 ws/.knorvia-studio/commands；缺 workspacePath 拒绝且不留目录", async (t) => {
    const root = await makeTempRoot(t);
    await tempHome(t, root);
    const service = servicesNode.createCommandsService();
    const ws = join(root, "ws");
    const { command } = await service.writeCommandFile({
      config: { name: "/proj", prompt: "p" },
      storageLevel: "project",
      workspacePath: ws,
    });
    const projPath = join(ws, ".knorvia-studio", "commands", "proj.md");
    assert.equal(command.filePath, projPath);
    assert.deepEqual(commandFields(command), {
      id: "agent:knorvia:project:/proj",
      name: "/proj",
      scope: "project",
      source: "user",
      enabled: true,
      filePath: projPath,
      location: {
        source: "knorvia",
        scope: "project",
        directoryPath: join(ws, ".knorvia-studio", "commands"),
        projectPath: ws,
      },
    });
    await assert.rejects(
      () =>
        service.writeCommandFile({ config: { name: "/x", prompt: "p" }, storageLevel: "project" }),
      /Missing workspace path for project command/,
    );
    assert.equal(await pathExists(join(root, "ws2", ".knorvia-studio")), false);
  });

  it("S32 嵌套名写入只预建根目录导致 ENOENT（与 update 的 mkdir(dirname) 不一致）", async (t) => {
    const root = await makeTempRoot(t);
    await tempHome(t, root);
    const service = servicesNode.createCommandsService();
    await assert.rejects(
      () => service.writeCommandFile({ config: { name: "/nested/new", prompt: "p" } }),
      (error) => error.code === "ENOENT",
    );
    // 根目录因 mkdir(rootPath) 副作用存在，但嵌套目录没有创建。
    assert.equal(await pathExists(userDirOf(root)), true);
    assert.equal(await pathExists(join(userDirOf(root), "nested")), false);
    // list 侧也确认命令并没有落盘。
    const result = await service.list({});
    assert.deepEqual(result.commands, []);
  });
});

describe("S33 update/delete/setEnabled/getPrimaryUserCommandsDirectory", () => {
  it("S33 改名迁移禁用状态并保留未知元数据；禁用读回 false", async (t) => {
    const root = await makeTempRoot(t);
    await tempHome(t, root);
    const service = servicesNode.createCommandsService();
    const origPath = await writeUserCommand(root, "orig.md", "---\nunknown: keep\n---\nold body");
    await service.setCommandEnabled({ commandId: "ignored", filePath: origPath, enabled: false });
    const renamedPath = join(userDirOf(root), "renamed.md");
    const { command } = await service.updateCommandFile({
      commandId: "ignored",
      oldFilePath: origPath,
      config: { name: "/renamed", prompt: "new prompt", argumentHint: " h " },
    });
    assert.equal(await pathExists(origPath), false);
    assert.equal(
      await readText(renamedPath),
      ["---", "unknown: keep", "argument-hint: h", "---", "", "new prompt"].join("\n"),
    );
    assert.equal(command.name, "/renamed");
    // 旧路径的禁用状态迁移到新路径，返回值如实报 false。
    assert.equal(command.enabled, false);
    assert.deepEqual(
      [...(await commandConfig.readEnabledOverrides()).entries()],
      [[renamedPath, false]],
    );
    const listed = await service.list({});
    assert.deepEqual(
      listed.userCommands.map((cmd) => [cmd.name, cmd.enabled]),
      [["/renamed", false]],
    );
  });

  it("S33 原位更新（oldFilePath===filePath）覆盖内容、保持禁用、不触发存在性拒绝", async (t) => {
    const root = await makeTempRoot(t);
    await tempHome(t, root);
    const service = servicesNode.createCommandsService();
    const path = await writeUserCommand(
      root,
      "inplace.md",
      ["---", "unknown: keep", "description: old", "---", "OLD BODY"].join("\n"),
    );
    await service.setCommandEnabled({ commandId: "ignored", filePath: path, enabled: false });
    const { command } = await service.updateCommandFile({
      commandId: "ignored",
      oldFilePath: path,
      config: { name: "/inplace", prompt: "p2" },
    });
    assert.equal(await readText(path), ["---", "unknown: keep", "---", "", "p2"].join("\n"));
    assert.equal(command.enabled, false);
    // 迁移分支只在改名时走：这里禁用键保持原样、无新增键。
    assert.deepEqual([...(await commandConfig.readEnabledOverrides()).entries()], [[path, false]]);
  });

  it("S33 改名目标被占用：先删旧再拒绝（旧文件已消失、目标不被覆盖）；无 oldFilePath 时存在即拒绝", async (t) => {
    const root = await makeTempRoot(t);
    await tempHome(t, root);
    const service = servicesNode.createCommandsService();
    const srcPath = await writeUserCommand(root, "src.md", "src");
    const dstPath = await writeUserCommand(root, "dst.md", "existing content");
    await assert.rejects(
      () =>
        service.updateCommandFile({
          commandId: "ignored",
          oldFilePath: srcPath,
          config: { name: "/dst", prompt: "never write" },
        }),
      /Command file already exists: dst\.md/,
    );
    // 时序是公开行为：rm 在存在性检查之前，所以冲突时旧文件已被删除。
    assert.equal(await pathExists(srcPath), false);
    assert.equal(await readText(dstPath), "existing content");

    // 不带 oldFilePath 的更新对已存在目标等价于创建冲突。
    await assert.rejects(
      () =>
        service.updateCommandFile({ commandId: "ignored", config: { name: "/dst", prompt: "p" } }),
      /Command file already exists: dst\.md/,
    );
    assert.equal(await readText(dstPath), "existing content");
  });

  it("S33 deleteCommandFile 容忍 ENOENT、清禁用键；目录路径等非 ENOENT 错误上抛且不动 config", async (t) => {
    const root = await makeTempRoot(t);
    await tempHome(t, root);
    const service = servicesNode.createCommandsService();
    const path = await writeUserCommand(root, "gone.md", "x");
    await commandConfig.writeCommandConfiguration({
      unrelated: { keep: 1 },
      command: { [path]: { enable: false } },
    });
    await service.deleteCommandFile({ commandId: "ignored", filePath: path });
    assert.equal(await pathExists(path), false);
    assert.deepEqual(await commandConfig.readCommandConfiguration(), { unrelated: { keep: 1 } });
    // 幂等：再删一次（ENOENT）只重写 config，不抛。
    await service.deleteCommandFile({ commandId: "ignored", filePath: path });
    assert.deepEqual(await commandConfig.readCommandConfiguration(), { unrelated: { keep: 1 } });

    const dirPath = join(userDirOf(root), "adir.md");
    await mkdir(dirPath, { recursive: true });
    await assert.rejects(
      () => service.deleteCommandFile({ commandId: "ignored", filePath: dirPath }),
      (error) => error.code !== "ENOENT",
    );
    assert.equal(await pathExists(dirPath), true);
    // 上抛发生在 rm 阶段：config 未被改写。
    assert.deepEqual(await commandConfig.readCommandConfiguration(), {
      unrelated: { keep: 1 },
    });
  });

  it("S33 setCommandEnabled false→true 往返写入最小 command 集合并保留未知字段", async (t) => {
    const root = await makeTempRoot(t);
    await tempHome(t, root);
    const service = servicesNode.createCommandsService();
    await commandConfig.writeCommandConfiguration({ weird: { a: 1 } });
    const path = join(userDirOf(root), "flag.md");
    await service.setCommandEnabled({ commandId: "ignored", filePath: path, enabled: false });
    assert.deepEqual(await commandConfig.readCommandConfiguration(), {
      weird: { a: 1 },
      command: { [path]: { enable: false } },
    });
    const raw = await readText(configPathOf(root));
    assert.equal(raw.endsWith("\n"), true);
    await service.setCommandEnabled({ commandId: "ignored", filePath: path, enabled: true });
    assert.deepEqual(await commandConfig.readCommandConfiguration(), { weird: { a: 1 } });
    // 对插件文件路径同样按绝对路径记账（来源无关）。
    const pluginPath = join(root, "plugins", "one.md");
    await service.setCommandEnabled({ commandId: "ignored", filePath: pluginPath, enabled: false });
    assert.deepEqual(await commandConfig.readEnabledOverrides(), new Map([[pluginPath, false]]));
  });

  it("S33 getPrimaryUserCommandsDirectory 返回数据根 commands 目录并创建它", async (t) => {
    const root = await makeTempRoot(t);
    await tempHome(t, root);
    const service = servicesNode.createCommandsService();
    const primary = join(knorviaDataRoot(root), "commands");
    assert.equal(isAbsolute(primary), true);
    assert.deepEqual(await service.getPrimaryUserCommandsDirectory(), { path: primary });
    const stats = await stat(primary);
    assert.equal(stats.isDirectory(), true);
    assert.deepEqual(await service.getPrimaryUserCommandsDirectory({ agentSource: "agent" }), {
      path: primary,
    });
    // 返回路径可直接写命令并被 list 发现。
    await writeText(join(primary, "via-dir.md"), "via");
    const listed = await service.list({});
    assert.deepEqual(
      listed.userCommands.map((cmd) => cmd.name),
      ["/via-dir"],
    );
  });
});
