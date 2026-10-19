// SPDX-License-Identifier: Apache-2.0
// commands 簇 S21–S26：commandConfig 的 config.json 读容错/写回格式/启用覆盖提取，
// commandPluginConfiguration 与 configuredPluginPath 的展开规则，
// commandFileParser 的 frontmatter 接受/拒绝样例与写回生成（保留未知元数据）。
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import { importDeep } from "./entry.mjs";
import {
  knorviaDataRoot,
  makeTempRoot,
  pathExists,
  readText,
  withEnv,
  writeText,
} from "./helpers.mjs";

const commandConfig = await importDeep("commands/commandConfig.ts");
const commandFileParser = await importDeep("commands/commandFileParser.ts");

const { CommandFileParser } = commandFileParser;

function configPathOf(root) {
  return join(knorviaDataRoot(root), "cli", "config.json");
}

describe("S21 commandConfig 读写", () => {
  it("S21 config.json 缺失/坏 JSON/非对象一律读为空对象，写回为 2 空格缩进加尾换行", async (t) => {
    const root = await makeTempRoot(t);
    const file = configPathOf(root);
    // 缺失文件：readCommandConfiguration 吞掉 ENOENT 返回 {}。
    assert.deepEqual(await commandConfig.readCommandConfiguration(), {});
    assert.equal(await pathExists(file), false);

    const config = { zeta: 1, alpha: { nested: [1, 2] }, command: {} };
    await commandConfig.writeCommandConfiguration(config);
    const raw = await readText(file);
    // 写回格式是公开契约：完整重写、2 空格缩进、以换行结尾。
    assert.equal(raw, `${JSON.stringify(config, null, 2)}\n`);
    assert.deepEqual(await commandConfig.readCommandConfiguration(), config);

    // 损坏 JSON / JSON 数组 / JSON 标量都按空对象处理（不留下备份，与凭据面不同）。
    await writeText(file, "{not json");
    assert.deepEqual(await commandConfig.readCommandConfiguration(), {});
    await writeText(file, "[1,2]");
    assert.deepEqual(await commandConfig.readCommandConfiguration(), {});
    await writeText(file, "42");
    assert.deepEqual(await commandConfig.readCommandConfiguration(), {});

    // 下一次写整文件替换，读回新值。
    await commandConfig.writeCommandConfiguration({ fresh: true });
    assert.deepEqual(await commandConfig.readCommandConfiguration(), { fresh: true });
  });

  it("S21 enabledOverrides 只收 boolean 的 enable 项，readEnabledOverrides 走真实文件", async (t) => {
    const root = await makeTempRoot(t);
    const disk = {
      command: {
        "/data/cmds/off.md": { enable: false },
        "/data/cmds/on.md": { enable: true },
        "/data/cmds/str.md": { enable: "yes" },
        "/data/cmds/plain.md": "not-a-record",
        "/data/cmds/typo.md": { enabled: false },
      },
      other: 1,
    };
    await commandConfig.writeCommandConfiguration(disk);
    const fromDisk = await commandConfig.readEnabledOverrides();
    assert.deepEqual(
      [...fromDisk.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      [
        ["/data/cmds/off.md", false],
        ["/data/cmds/on.md", true],
      ],
    );
    // 纯函数侧同样只认 command.<path>.enable 的 boolean。
    assert.deepEqual([...commandConfig.enabledOverrides({}).entries()], []);
    assert.equal(commandConfig.enabledOverrides({ command: "string" }).size, 0);
    assert.equal(commandConfig.enabledOverrides({ command: [1, 2] }).size, 0);
    // 顶层非对象输入按空处理。
    assert.equal(commandConfig.isRecord(null), false);
    assert.equal(commandConfig.isRecord([1]), false);
    assert.equal(commandConfig.isRecord({}), true);
  });
});

describe("S22 withCommandEnabled 覆盖写回", () => {
  it("S22 禁用写 enable:false、启用删键、集合空时删 command、保留其它未知字段且不改动入参", async (t) => {
    const root = await makeTempRoot(t);
    const original = {
      unrelated: { keep: "x" },
      command: { "/a.md": { enable: false }, junk: 5 },
    };
    const snapshot = structuredClone(original);

    const off = commandConfig.withCommandEnabled(original, "/b.md", false);
    assert.deepEqual(off, {
      unrelated: { keep: "x" },
      command: { "/a.md": { enable: false }, junk: 5, "/b.md": { enable: false } },
    });
    // 入参必须不被就地修改（调用方读到的还是快照）。
    assert.deepEqual(original, snapshot);

    const on = commandConfig.withCommandEnabled(off, "/b.md", true);
    assert.deepEqual(on, {
      unrelated: { keep: "x" },
      command: { "/a.md": { enable: false }, junk: 5 },
    });
    // 非覆盖条目（junk）不参与删除：command 仍保留。
    const emptiedJunk = commandConfig.withCommandEnabled(on, "/a.md", true);
    assert.deepEqual(emptiedJunk, { unrelated: { keep: "x" }, command: { junk: 5 } });
    // 覆盖集合清空后 command 整体消失，而不是留空对象。
    assert.deepEqual(
      commandConfig.withCommandEnabled({ command: { "/a.md": { enable: false } } }, "/a.md", true),
      {},
    );
    // command 原本不是对象时直接重建为新集合。
    assert.deepEqual(commandConfig.withCommandEnabled({ command: "junk" }, "/c.md", false), {
      command: { "/c.md": { enable: false } },
    });
    assert.deepEqual(commandConfig.withCommandEnabled({}, "/c.md", true), {});

    // 与持久化闭环：写回后再读，启用态与未知字段都在。
    await commandConfig.writeCommandConfiguration(off);
    assert.deepEqual(
      await commandConfig.readEnabledOverrides(),
      new Map([
        ["/b.md", false],
        ["/a.md", false],
      ]),
    );
    const reread = await commandConfig.readCommandConfiguration();
    assert.deepEqual(reread.unrelated, { keep: "x" });
    assert.equal(reread.command.junk, 5);
  });
});

describe("S23 commandPluginConfiguration 与 configuredPluginPath", () => {
  it("S23 全默认配置给出 enabled=true、dirs=[]、storageDir=Knorvia 数据根", async (t) => {
    const root = await makeTempRoot(t);
    assert.deepEqual(commandConfig.commandPluginConfiguration({}), {
      dirs: [],
      enabled: true,
      enabledPlugins: {},
      suppressedBuiltins: [],
      storageDir: knorviaDataRoot(root),
    });
    // plugins/storage 非对象、字段类型不符时逐项回退。
    const partial = commandConfig.commandPluginConfiguration({
      plugins: {
        dirs: ["/abs/one", 42, null, "/abs/two"],
        enabled: false,
        enabledPlugins: { "a@m": true, "b@m": "no", 3: false },
        suppressedBuiltins: ["x@m", 7],
      },
      storage: { dir: "   " },
    });
    assert.deepEqual(partial.dirs, ["/abs/one", "/abs/two"]);
    assert.equal(partial.enabled, false);
    assert.deepEqual(partial.enabledPlugins, { "a@m": true, 3: false });
    assert.deepEqual(partial.suppressedBuiltins, ["x@m"]);
    // 纯空白 storage.dir 不生效，回退数据根。
    assert.equal(partial.storageDir, knorviaDataRoot(root));
  });

  it("S23 storage.dir 原样生效；KNORVIA_PORTABLE_DIR 非空白时优先数据根", async (t) => {
    const root = await makeTempRoot(t);
    const withDir = commandConfig.commandPluginConfiguration({
      storage: { dir: "/custom/storage" },
    });
    assert.equal(withDir.storageDir, "/custom/storage");
    // 便携模式忽略 storage.dir（trim 后才判空，空白等价未设置）。
    withEnv(t, "KNORVIA_PORTABLE_DIR", "1");
    assert.equal(
      commandConfig.commandPluginConfiguration({ storage: { dir: "/custom/storage" } }).storageDir,
      knorviaDataRoot(root),
    );
    withEnv(t, "KNORVIA_PORTABLE_DIR", "   ");
    assert.equal(
      commandConfig.commandPluginConfiguration({ storage: { dir: "/custom/storage" } }).storageDir,
      "/custom/storage",
    );
  });

  it("S23 configuredPluginPath 展开 ~/ 到 commandHome、绝对路径原样、相对路径按 cwd resolve", async (t) => {
    const root = await makeTempRoot(t);
    const home = join(root, "fake-home");
    // commandHome 读 env（HOME→USERPROFILE→homedir），须指向临时目录避免真实 HOME。
    withEnv(t, "HOME", home);
    withEnv(t, "USERPROFILE", home);
    assert.equal(commandConfig.configuredPluginPath("~/plugins/x"), join(home, "plugins", "x"));
    assert.equal(commandConfig.configuredPluginPath("/abs/dir"), "/abs/dir");
    assert.equal(commandConfig.configuredPluginPath("rel/dir"), resolve("rel/dir"));
    // 只有 "~/ 前缀" 才展开；"~name/x" 视为普通相对路径。
    assert.equal(commandConfig.configuredPluginPath("~name/x"), resolve("~name/x"));
    withEnv(t, "HOME", "   ");
    withEnv(t, "USERPROFILE", home);
    // HOME 纯空白时回退 USERPROFILE（Windows 主场景）。
    assert.equal(commandConfig.configuredPluginPath("~/w"), join(home, "w"));
  });
});

describe("S24 parseCommandFile frontmatter 接受样例", () => {
  it("S24 提取 description/argument-hint，缩进行折叠续写，键名大小写不敏感", () => {
    const parsed = CommandFileParser.parseCommandFile(
      [
        "---",
        "description: Hello",
        "  continued",
        "ARGUMENT-HINT: <file>",
        "---",
        "",
        "Use {arg} now",
      ].join("\n"),
      "/repo/commands/greet.md",
    );
    assert.notEqual(parsed, null);
    assert.deepEqual(Object.keys(parsed).sort(), [
      "argumentHint",
      "content",
      "description",
      "filePath",
      "name",
      "prompt",
    ]);
    assert.equal(parsed.name, "/greet");
    assert.equal(parsed.description, "Hello continued");
    assert.equal(parsed.argumentHint, "<file>");
    assert.equal(parsed.prompt, "Use {arg} now");
    // content 是闭合分隔符之后的原文（不 trim），prompt 是同一份 trim 后的。
    assert.equal(parsed.content, "\nUse {arg} now");
    assert.equal(parsed.filePath, "/repo/commands/greet.md");

    // 值只在缩进续写行上也能取到。
    const foldOnly = CommandFileParser.parseCommandFile(
      ["---", "description:", "  only-fold", "---", "body"].join("\n"),
      "C:\\srv\\cmds\\Deep.MD",
    );
    assert.equal(foldOnly.description, "only-fold");
    assert.equal(foldOnly.prompt, "body");
    // name 取自路径末段并按大小写不敏感剥离 .md；正斜杠/反斜杠都可分割（跨平台）。
    assert.equal(foldOnly.name, "/Deep");
    // 双层 .md 只剥最后一个。
    assert.equal(CommandFileParser.parseCommandFile("x", "/c/sub.md.md").name, "/sub.md");
    // 第三个参数（格式）当前固定 markdown，显式传入与缺省结果一致。
    assert.deepEqual(
      CommandFileParser.parseCommandFile("body", "/c/a.md", "markdown"),
      CommandFileParser.parseCommandFile("body", "/c/a.md"),
    );
  });

  it("S24 冒号后原样保留（含 URL），空值回退 undefined 再走缩进续写", () => {
    const parsed = CommandFileParser.parseCommandFile(
      ["---", "description: see https://example.com:8443/x", "---", "b"].join("\n"),
      "/c/u.md",
    );
    assert.equal(parsed.description, "see https://example.com:8443/x");
    const empty = CommandFileParser.parseCommandFile(
      ["---", "description:", "---", "b"].join("\n"),
      "/c/e.md",
    );
    // 没有任何值的 description 归一为 undefined（空串不保留）。
    assert.equal(empty.description, undefined);
  });
});

describe("S25 parseCommandFile 拒绝与容错", () => {
  it("S25 无 frontmatter、未闭合、正文中两道 --- 时的吞并规则", () => {
    const plain = CommandFileParser.parseCommandFile("just text\nmore", "/c/t.md");
    assert.equal(plain.prompt, "just text\nmore");
    assert.equal(plain.description, undefined);
    assert.equal(plain.argumentHint, undefined);

    // 只有一道 --- ：找不到闭合，整份都是正文（frontmatter 不生效）。
    const unclosed = CommandFileParser.parseCommandFile(
      ["---", "only: one", "description: d"].join("\n"),
      "/c/one.md",
    );
    assert.equal(unclosed.description, undefined);
    assert.equal(unclosed.prompt, ["---", "only: one", "description: d"].join("\n"));

    // 首个 --- 不必在首行：它之前的文字被静默丢弃，两个 --- 之间当元数据。
    const midDoc = CommandFileParser.parseCommandFile(
      ["intro", "---", "unknown: x", "---", "body"].join("\n"),
      "/c/mid.md",
    );
    assert.equal(midDoc.prompt, "body");
    assert.equal(midDoc.description, undefined);

    // 空 frontmatter 对（相邻 ---）：合法，无元数据。
    const emptyFm = CommandFileParser.parseCommandFile(
      ["---", "---", "body"].join("\n"),
      "/c/e.md",
    );
    assert.equal(emptyFm.prompt, "body");

    // 元数据里既无缩进又非键值的行被跳过，且不中断折叠：噪声行后续缩进仍并入值。
    const noisy = CommandFileParser.parseCommandFile(
      ["---", "description: a", "noise", "  b", "---", "x"].join("\n"),
      "/c/n.md",
    );
    assert.equal(noisy.description, "a b");
  });

  it("S25 字符串输入永不返回 null；非字符串输入走 catch 返回 null", () => {
    // 空串与空路径也不会抛：name 退化为 "/"。
    const weird = CommandFileParser.parseCommandFile("", "");
    assert.notEqual(weird, null);
    assert.equal(weird.name, "/");
    assert.equal(weird.prompt, "");
    // 契约容错：运行时喂进非字符串（RPC 侧越界数据）返回 null 而不是抛。
    assert.equal(CommandFileParser.parseCommandFile(undefined, "/c/x.md"), null);
    assert.equal(CommandFileParser.parseCommandFile(42, "/c/x.md"), null);
  });
});

describe("S26 generateCommandFileContent 写回生成", () => {
  it("S26 无元数据时原样返回 prompt；有元数据时 --- 块 + 空行 + prompt", () => {
    assert.equal(
      CommandFileParser.generateCommandFileContent({ name: "/a", prompt: "p1\np2" }),
      "p1\np2",
    );
    // description/argumentHint 两侧空白被裁掉；空白值等同缺省。
    assert.equal(
      CommandFileParser.generateCommandFileContent({
        name: "/a",
        prompt: "body",
        description: " d ",
        argumentHint: "   ",
      }),
      ["---", "description: d", "---", "", "body"].join("\n"),
    );
    assert.equal(
      CommandFileParser.generateCommandFileContent(
        { name: "/a", prompt: "body", description: "d", argumentHint: "h" },
        "markdown",
      ),
      ["---", "description: d", "argument-hint: h", "---", "", "body"].join("\n"),
    );
  });

  it("S26 existingContent 的未知元数据与折叠续写保留，description/argument-hint 整段替换", () => {
    const existing = [
      "---",
      "unknown: keep",
      "  keep-continuation",
      "description: old",
      "  old folded tail",
      "argument-hint: old-hint",
      "tail: after",
      "---",
      "OLD BODY TEXT",
    ].join("\n");
    // 新 config 不带 description：旧 description 及其缩进续写整段删除。
    const stripped = CommandFileParser.generateCommandFileContent(
      { name: "/a", prompt: "new prompt" },
      "markdown",
      existing,
    );
    assert.equal(
      stripped,
      ["---", "unknown: keep", "  keep-continuation", "tail: after", "---", "", "new prompt"].join(
        "\n",
      ),
    );
    // 新值追加在保留行之后；旧正文彻底丢弃。
    const replaced = CommandFileParser.generateCommandFileContent(
      { name: "/a", prompt: "new prompt", description: "fresh", argumentHint: "h2" },
      "markdown",
      existing,
    );
    assert.equal(
      replaced,
      [
        "---",
        "unknown: keep",
        "  keep-continuation",
        "tail: after",
        "description: fresh",
        "argument-hint: h2",
        "---",
        "",
        "new prompt",
      ].join("\n"),
    );
    assert.ok(!replaced.includes("OLD BODY TEXT"));
    // 往返一致性：生成的内容再 parse 回来得到同值。
    const round = CommandFileParser.parseCommandFile(replaced, "/c/a.md");
    assert.equal(round.description, "fresh");
    assert.equal(round.argumentHint, "h2");
    assert.equal(round.prompt, "new prompt");
  });
});
