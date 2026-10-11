// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01 合同测试：commands/*（B71–B78）。
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { load } from "./entry.mjs";

const roots = await load("commands/roots");
const commands = await load("commands/index");

async function tempDir(t, prefix = "knorvia-contract-cmd-") {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  t.after(async () => await rm(directory, { recursive: true, force: true }));
  return directory;
}

function root(path, priority, scope = "project", source = "knorvia") {
  return { path, scope, source, priority };
}

test("B71 默认根发现顺序与优先级", async (t) => {
  const home = await tempDir(t);
  const project = await tempDir(t, "knorvia-contract-proj-");
  await mkdir(join(project, ".git"), { recursive: true });
  const nested = join(project, "a", "b");
  await mkdir(nested, { recursive: true });
  const resolved = await roots.resolveDefaultCustomCommandRoots(nested, { homeDirectory: home });
  assert.deepEqual(
    resolved.slice(0, 2).map((item) => item.path),
    [join(home, ".knorvia-studio", "commands"), join(home, ".agents", "commands")],
  );
  assert.deepEqual(
    resolved.slice(0, 2).map((item) => item.scope),
    ["user", "user"],
  );
  assert.deepEqual(
    resolved.slice(0, 2).map((item) => item.source),
    ["knorvia", "agents"],
  );
  assert.deepEqual(
    resolved.map((item) => item.priority),
    resolved.map((_, index) => (index + 1) * 10),
  );
  const projectPaths = resolved.slice(2).map((item) => item.path);
  assert.equal(projectPaths.includes(join(nested, ".knorvia-studio", "commands")), true);
  assert.equal(projectPaths.includes(join(nested, ".agents", "commands")), true);
  assert.equal(projectPaths.includes(join(project, ".knorvia-studio", "commands")), true);
  const extraResolved = root("/synthetic/extra", 7, "user", "agents");
  const withExtra = await roots.resolveDefaultCustomCommandRoots(nested, {
    homeDirectory: home,
    extraResolvedRoots: [extraResolved],
  });
  assert.equal(withExtra.at(-1), extraResolved);
  const excluded = await roots.resolveDefaultCustomCommandRoots(nested, {
    homeDirectory: home,
    includeKnorviaCommands: false,
  });
  assert.deepEqual(excluded, []);
});

test("B72 extraRoots 的 ~/ 展开与根对象形状", async (t) => {
  const home = await tempDir(t);
  const workdir = await tempDir(t);
  const resolved = await roots.resolveDefaultCustomCommandRoots(workdir, {
    homeDirectory: home,
    includeKnorviaCommands: false,
    extraRoots: ["~/cmds", "rel/cmds", resolve("/abs/cmds")],
  });
  assert.deepEqual(
    resolved.map((item) => item.path),
    [join(home, "cmds"), resolve(workdir, "rel", "cmds"), resolve("/abs/cmds")].map((value) =>
      resolve(value),
    ),
  );
  assert.deepEqual(Object.keys(resolved[0]).sort(), ["path", "priority", "scope", "source"]);
  assert.equal(resolved[0].scope, "project");
  assert.equal(resolved[0].source, "knorvia");
  assert.deepEqual(
    resolved.map((item) => item.priority),
    [10, 20, 30],
  );
});

test("B73 discoverCommands 的扫描、禁用、去重与排序", async (t) => {
  const firstRoot = await tempDir(t, "knorvia-contract-root-");
  const secondRoot = await tempDir(t, "knorvia-contract-root-");
  await writeFile(join(firstRoot, "foo.md"), "first version");
  await writeFile(join(firstRoot, "zeta.md"), "zeta body");
  await writeFile(join(firstRoot, "alpha.md"), "alpha body");
  await writeFile(join(secondRoot, "foo.md"), "second version");
  const adapter = commands.createNodeCustomCommandAdapter();
  const outcome = await adapter.discoverCommands({
    workingDirectory: firstRoot,
    roots: [root(firstRoot, 10), root(secondRoot, 20)],
  });
  assert.deepEqual(
    outcome.commands.map((command) => command.name),
    ["alpha", "foo", "zeta"],
  );
  assert.equal(
    outcome.commands.find((command) => command.name === "foo").description,
    "first version",
  );
  assert.equal(
    outcome.diagnostics.some((item) => item.code === "custom_command_duplicate_name"),
    true,
  );
  assert.equal(outcome.totalDiscovered, 4);
  const disabled = commands.createNodeCustomCommandAdapter({
    disabledPaths: [join(secondRoot, "foo.md")],
  });
  const filtered = await disabled.discoverCommands({
    workingDirectory: firstRoot,
    roots: [root(secondRoot, 20)],
  });
  assert.deepEqual(filtered.commands, []);
  assert.equal(filtered.totalDiscovered, 0);
});

test("B74 目录枚举规则：.md 大小写、非目录根、缺失根与深度上限", async (t) => {
  const rootDir = await tempDir(t);
  await writeFile(join(rootDir, "a.md"), "a body");
  await writeFile(join(rootDir, "b.MD"), "b body");
  await writeFile(join(rootDir, "c.txt"), "c");
  await mkdir(join(rootDir, "sub"), { recursive: true });
  await writeFile(join(rootDir, "sub", "d.md"), "d body");
  const adapter = commands.createNodeCustomCommandAdapter();
  const found = await adapter.discoverCommands({
    workingDirectory: rootDir,
    roots: [root(rootDir, 10)],
  });
  assert.deepEqual(
    found.commands.map((command) => command.name),
    ["a", "b", "sub:d"],
  );
  const asFile = join(rootDir, "a.md");
  const fileOutcome = await adapter.discoverCommands({
    workingDirectory: rootDir,
    roots: [root(asFile, 10)],
  });
  assert.deepEqual(fileOutcome.commands, []);
  assert.deepEqual(fileOutcome.diagnostics, []);
  const missingOutcome = await adapter.discoverCommands({
    workingDirectory: rootDir,
    roots: [root(join(rootDir, "missing"), 10)],
  });
  assert.deepEqual(missingOutcome.commands, []);
  assert.deepEqual(missingOutcome.diagnostics, []);
  let deep = join(rootDir, "deep");
  const segments = [];
  for (let index = 0; index < 14; index += 1) segments.push(`d${index}`);
  deep = join(deep, ...segments);
  await mkdir(deep, { recursive: true });
  await writeFile(join(deep, "too-deep.md"), "deep body");
  const deepOutcome = await adapter.discoverCommands({
    workingDirectory: rootDir,
    roots: [root(rootDir, 10)],
  });
  assert.equal(
    deepOutcome.commands.some((command) => command.name.includes("too-deep")),
    false,
  );
});

test("B75 元数据解析、校验与诊断", async (t) => {
  const rootDir = await tempDir(t);
  const adapter = commands.createNodeCustomCommandAdapter();
  await mkdir(join(rootDir, "sub", "dir"), { recursive: true });
  await writeFile(
    join(rootDir, "sub", "dir", "MyCommand.md"),
    [
      "---",
      'description: "quoted"',
      "allowed-tools: [Read, Write]",
      "disable-noninteractive: yes",
      "unknown-key: 1",
      "---",
      "# Title",
      "",
      "Do it",
    ].join("\n"),
  );
  await writeFile(join(rootDir, "no-colon.md"), "---\nnocolon\n---\nbody");
  await writeFile(join(rootDir, "no-description.md"), "---\nname: named\n---\n");
  await writeFile(join(rootDir, "Bad Name.md"), "body only");
  const outcome = await adapter.discoverCommands({
    workingDirectory: rootDir,
    roots: [root(rootDir, 10)],
  });
  const parsed = outcome.commands.find((command) => command.name === "sub:dir:mycommand");
  assert.equal(parsed.description, "quoted");
  assert.deepEqual(parsed.allowedTools, ["Read", "Write"]);
  assert.equal(parsed.disableNonInteractive, true);
  assert.deepEqual(parsed.frontmatterKeys, [
    "description",
    "allowed-tools",
    "disable-noninteractive",
    "unknown-key",
  ]);
  assert.equal(
    outcome.diagnostics.some((item) => item.code === "custom_command_unknown_frontmatter"),
    true,
  );
  assert.equal(
    outcome.diagnostics.some(
      (item) => item.code === "custom_command_invalid_frontmatter" && item.severity === "warning",
    ),
    true,
  );
  assert.equal(
    outcome.commands.some((command) => command.name === "no-colon"),
    true,
  );
  assert.equal(
    outcome.diagnostics.some(
      (item) =>
        item.code === "custom_command_invalid_frontmatter" &&
        item.severity === "error" &&
        item.message.includes("must include a description"),
    ),
    true,
  );
  assert.equal(
    outcome.commands.some((command) => command.name.includes("bad")),
    false,
  );
  assert.equal(
    outcome.diagnostics.some((item) => item.code === "custom_command_invalid_name"),
    true,
  );
});

test("B76 loadCommand 的查找、截断与正文", async (t) => {
  const rootDir = await tempDir(t);
  const body = "x".repeat(200);
  await writeFile(join(rootDir, "foo.md"), `---\ndescription: d\n---\n${body}`);
  const adapter = commands.createNodeCustomCommandAdapter();
  const loaded = await adapter.loadCommand({
    name: "/FOO",
    workingDirectory: rootDir,
    roots: [root(rootDir, 10)],
  });
  assert.equal(loaded.metadata.name, "foo");
  assert.equal(loaded.truncated, false);
  assert.equal(loaded.bytesRead, loaded.sizeBytes);
  assert.equal(loaded.content, body);
  const truncated = await adapter.loadCommand({
    name: " foo ",
    workingDirectory: rootDir,
    roots: [root(rootDir, 10)],
    maxBytes: 30,
  });
  assert.equal(truncated.truncated, true);
  assert.equal(truncated.bytesRead, 30);
  await assert.rejects(
    () =>
      adapter.loadCommand({
        name: "Missing",
        workingDirectory: rootDir,
        roots: [root(rootDir, 10)],
      }),
    (error) => error.message === "Custom command not found: Missing",
  );
});

test("B77 取消语义：Custom command operation cancelled", async (t) => {
  const rootDir = await tempDir(t);
  await writeFile(join(rootDir, "foo.md"), "body");
  const adapter = commands.createNodeCustomCommandAdapter();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () =>
      adapter.discoverCommands(
        { workingDirectory: rootDir, roots: [root(rootDir, 10)] },
        { signal: controller.signal },
      ),
    (error) => error.message === "Custom command operation cancelled",
  );
  await assert.rejects(
    () =>
      adapter.loadCommand(
        { name: "foo", workingDirectory: rootDir, roots: [root(rootDir, 10)] },
        { signal: controller.signal },
      ),
    (error) => error.message === "Custom command operation cancelled",
  );
});

test("B78 commands 导出面", async () => {
  assert.deepEqual(Object.keys(commands).sort(), [
    "NodeCustomCommandAdapter",
    "createNodeCustomCommandAdapter",
  ]);
  assert.equal(commands.normalizeName, undefined);
  assert.equal(commands.enumerateDirectory, undefined);
  assert.deepEqual(Object.keys(roots).sort(), ["resolveDefaultCustomCommandRoots"]);
  assert.equal(typeof roots.resolveDefaultCustomCommandRoots, "function");
  assert.equal(roots.findWorktreeRoot, undefined);
  const outcome = await commands
    .createNodeCustomCommandAdapter()
    .discoverCommands({ workingDirectory: process.cwd(), roots: [] });
  assert.deepEqual(outcome.commands, []);
});
