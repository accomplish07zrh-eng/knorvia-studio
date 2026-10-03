import assert from "node:assert/strict";
import vm from "node:vm";
import path from "node:path";
import nodeTest from "node:test";
import { build } from "esbuild";
const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice(7);
const test = (name, fn) => {
  if (!only || name.startsWith(only)) nodeTest(name, fn);
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const paths = {
  resolve: (...parts) => {
    const text = parts.join("/");
    const stack = [];
    for (const part of text.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") stack.pop();
      else stack.push(part);
    }
    return "/" + stack.join("/");
  },
  relative: (root, file) => file.slice(root.length + 1),
  basename: (file) => file.split("/").at(-1),
};
async function load(fs, roots) {
  const ports = {
    "node:fs/promises": fs,
    "node:path": paths,
    "./roots.js": { resolveDefaultCustomCommandRoots: roots },
  };
  const entry = process.argv.includes("--baseline")
    ? "/tmp/knorvia-cli-command-baseline/index.ts"
    : path.resolve("apps/cli/packages/adapters/src/commands/index.ts");
  const output = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    logLevel: "silent",
    plugins: [
      {
        name: "synthetic-ports",
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (arg) =>
            arg.kind === "entry-point" ? undefined : { path: arg.path, namespace: "synthetic" },
          );
          builder.onLoad({ filter: /.*/, namespace: "synthetic" }, (arg) => {
            if (!(arg.path in ports)) throw new Error("Unexpected runtime import " + arg.path);
            return {
              contents: Object.keys(ports[arg.path])
                .map(
                  (key) =>
                    "export const " +
                    key +
                    "=globalThis.ports[" +
                    JSON.stringify(arg.path) +
                    "][" +
                    JSON.stringify(key) +
                    "];",
                )
                .join("\n"),
              loader: "js",
            };
          });
        },
      },
    ],
  });
  const sandbox = { module: { exports: {} }, ports, Buffer, Error };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(output.outputFiles[0].text, sandbox, {
    filename: "custom-command-synthetic.cjs",
  });
  return sandbox.module.exports;
}
const entry = (name, kind = "file") => ({
  name,
  isDirectory: () => kind === "directory",
  isFile: () => kind === "file",
  isSymbolicLink: () => kind === "link",
});
test("discovery preserves priority, parser diagnostics, disabled snapshot and first-name data", async () => {
  const calls = [],
    disabled = ["/first/disabled.md"],
    plugin = { id: "synthetic-plugin" };
  const factoryOptions = { disabledPaths: disabled, extraRoots: ["synthetic-extra"] };
  const root1 = { path: "/first", priority: 10, scope: "project", source: "plugin", plugin };
  const root2 = { path: "/second", priority: 20, scope: "user", source: "agents" };
  const roots = [root2, root1],
    texts = {
      "/first/disabled.md": "---\ndescription: hidden\nunknown: value\n---\nbody",
      "/first/task.MD":
        '\uFEFF---\ndescription: "First"\nallowed-tools: [Read, "Write"]\nskills: [alpha, beta]\ndisable-noninteractive: YES\nunknown: one\nunknown: two\nbroken-line\n indented: ignored\n---\n# Body',
      "/first/nested/child.md": "# Nested description\ncontent",
      "/first/bad space.md": "body",
      "/second/task.md": "second description",
    };
  const fs = {
    async stat(file) {
      calls.push(["stat", file]);
      if (file === "/first/broken.md") throw new Error("synthetic missing target");
      return { isDirectory: () => true, isFile: () => false };
    },
    async readdir(directory, options) {
      calls.push(["scan", directory, plain(options)]);
      return directory === "/first"
        ? [
            entry("disabled.md"),
            entry("task.MD"),
            entry("nested", "directory"),
            entry("bad space.md"),
            entry("broken.md", "link"),
          ]
        : directory === "/second"
          ? [entry("task.md")]
          : [entry("child.md")];
    },
    async readFile(file, encoding) {
      calls.push(["read", file, encoding]);
      return texts[file];
    },
    async open() {
      throw new Error("unexpected open");
    },
  };
  const { createNodeCustomCommandAdapter } = await load(fs, async (cwd, options) => {
    assert.equal(cwd, "/work");
    assert.equal(options, factoryOptions);
    return roots;
  });
  const adapter = createNodeCustomCommandAdapter(factoryOptions);
  disabled.length = 0;
  factoryOptions.extraRoots = ["changed"];
  const outcome = await adapter.discoverCommands({ workingDirectory: "/work" });
  assert.deepEqual(plain(outcome.commands.map((command) => command.name)), [
    "nested:child",
    "task",
  ]);
  assert.equal(outcome.totalDiscovered, 3);
  assert.deepEqual(roots, [root2, root1]);
  const metadata = outcome.commands.find((command) => command.name === "task");
  assert.equal(metadata.description, "First");
  assert.equal(metadata.plugin, plugin);
  assert.deepEqual(plain(metadata.allowedTools), ["Read", '"Write"']);
  assert.deepEqual(plain(metadata.skills), ["alpha", "beta"]);
  assert.equal(metadata.disableNonInteractive, true);
  assert.ok(Object.hasOwn(metadata, "argumentHint"));
  assert.ok(Object.hasOwn(metadata, "model"));
  assert.deepEqual(
    plain(
      outcome.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.commandName ?? null]),
    ),
    [
      ["custom_command_unknown_frontmatter", "disabled"],
      ["custom_command_invalid_frontmatter", null],
      ["custom_command_unknown_frontmatter", "task"],
      ["custom_command_unknown_frontmatter", "task"],
      ["custom_command_invalid_name", "bad space"],
      ["custom_command_duplicate_name", "task"],
    ],
  );
  const scanPositions = calls.flatMap((call, index) =>
    call[0] === "scan" && call[1].startsWith("/first") ? [index] : [],
  );
  assert.ok(Math.max(...scanPositions) < calls.findIndex((call) => call[0] === "read"));
  calls.length = 0;
  const empty = await adapter.discoverCommands({ roots: [], workingDirectory: "/work" });
  assert.equal(empty.commands.length, 0);
  assert.equal(calls.length, 0);
});
test("load preserves public dispatch, bounded bytes, handle closure and raw error precedence", async () => {
  const readError = new Error("synthetic read"),
    closeError = new Error("synthetic close"),
    openError = new Error("synthetic open");
  const metadata = { name: "task", path: "/synthetic/task.md" },
    roots = [],
    options = { signal: new AbortController().signal },
    calls = [];
  let mode = "success";
  const handle = {
    async read(buffer, offset, length, position) {
      assert.equal(this, handle);
      calls.push(["read", offset, length, position]);
      if (mode === "read" || mode === "both") throw readError;
      buffer.write("OK");
      return { bytesRead: 2 };
    },
    async close() {
      assert.equal(this, handle);
      calls.push(["close"]);
      if (mode === "close" || mode === "both") throw closeError;
    },
  };
  const fs = {
    async stat(file) {
      calls.push(["stat", file]);
      return { size: 10 };
    },
    async open(file, flags) {
      calls.push(["open", file, flags]);
      if (mode === "open") throw openError;
      return handle;
    },
    async readFile() {
      throw new Error("unexpected full read");
    },
    async readdir() {
      throw new Error("unexpected scan");
    },
  };
  const { NodeCustomCommandAdapter } = await load(fs, async () => {
    throw new Error("unexpected root discovery");
  });
  const adapter = new NodeCustomCommandAdapter();
  adapter.discoverCommands = async (request, received) => {
    assert.equal(request.roots, roots);
    assert.equal(request.workingDirectory, "/work");
    assert.equal(received, options);
    calls.push(["discover"]);
    return { commands: [metadata], diagnostics: [], totalDiscovered: 1 };
  };
  const request = { name: " /TASK ", workingDirectory: "/work", roots, maxBytes: 4 };
  const content = await adapter.loadCommand(request, options);
  assert.equal(content.metadata, metadata);
  assert.deepEqual(plain({ ...content, metadata: null }), {
    metadata: null,
    bytesRead: 2,
    content: "OK",
    sizeBytes: 10,
    truncated: true,
  });
  assert.deepEqual(calls, [
    ["discover"],
    ["stat", "/synthetic/task.md"],
    ["open", "/synthetic/task.md", "r"],
    ["read", 0, 4, 0],
    ["close"],
  ]);
  mode = "read";
  await assert.rejects(adapter.loadCommand(request, options), (error) => error === readError);
  mode = "both";
  await assert.rejects(adapter.loadCommand(request, options), (error) => error === closeError);
  mode = "open";
  calls.length = 0;
  await assert.rejects(adapter.loadCommand(request, options), (error) => error === openError);
  assert.ok(!calls.some((call) => call[0] === "close"));
  const controller = new AbortController();
  controller.abort();
  calls.length = 0;
  await assert.rejects(
    adapter.loadCommand(request, { signal: controller.signal }),
    /Custom command operation cancelled/,
  );
  assert.equal(calls.length, 0);
});
