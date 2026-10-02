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
  resolve: (value) => "/" + value.split("/").filter(Boolean).join("/"),
  join: (...parts) => parts.join("/"),
  dirname: (value) => value.slice(0, value.lastIndexOf("/")) || "/",
  basename: (value) => value.split("/").at(-1),
};
async function load(name, ports) {
  const entry = process.argv.includes("--baseline")
    ? "/tmp/knorvia-cli-skill-baseline/" + name + ".ts"
    : path.resolve("apps/cli/packages/adapters/src/skills/" + name + ".ts");
  const output = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    logLevel: "silent",
    plugins: [
      {
        name: "synthetic-public-ports",
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
    filename: name + "-skill-synthetic.cjs",
  });
  return sandbox.module.exports;
}
const dirent = (name, kind) => ({
  name,
  isDirectory: () => kind === "directory",
  isSymbolicLink: () => kind === "link",
});
test("scan trust preserves plugin rejection, user follow, one-level order and async/sync error identity", async () => {
  const permission = Object.assign(new Error("synthetic permission"), { code: "EACCES" }),
    absent = Object.assign(new Error("synthetic missing"), { code: "ENOENT" });
  const calls = [];
  let failure;
  const links = new Set(["/linked-root", "/root/SKILL.md", "/root/file-link/SKILL.md"]);
  function lstat(file) {
    calls.push(["lstat", file]);
    return { isSymbolicLink: () => links.has(file) };
  }
  function stat(file) {
    calls.push(["stat", file]);
    if (failure === "stat") throw permission;
    if (file === "/root/missing/SKILL.md") throw absent;
    return {
      isDirectory: () => file === "/root" || file === "/linked-root",
      isFile: () => file.endsWith("/SKILL.md"),
    };
  }
  function readdir(file, options) {
    calls.push(["readdir", file, plain(options)]);
    if (failure === "readdir") throw absent;
    return [
      dirent("good", "directory"),
      dirent("skip", "directory"),
      dirent("dir-link", "link"),
      dirent("file-link", "directory"),
      dirent("missing", "directory"),
    ];
  }
  const api = await load("scan", {
    "node:fs": { lstatSync: lstat, statSync: stat, readdirSync: readdir },
    "node:fs/promises": {
      lstat: async (...args) => lstat(...args),
      stat: async (...args) => stat(...args),
      readdir: async (...args) => readdir(...args),
    },
    "node:path": { join: paths.join },
    "@knorvia/shared": {
      SKILL_FILE_NAME: "SKILL.md",
      shouldWalkSkillDirectoryEntry: (name) => {
        calls.push(["filter", name]);
        return name !== "skip";
      },
    },
  });
  for (const sync of [false, true]) {
    const scan = sync ? api.scanSkillFilesUnderRootSync : api.scanSkillFilesUnderRoot;
    const invoke = (...args) => Promise.resolve().then(() => scan(...args));
    calls.length = 0;
    assert.deepEqual(plain(await invoke("/linked-root", { followSymbolicLinks: false })), []);
    assert.deepEqual(calls, [["lstat", "/linked-root"]]);
    calls.length = 0;
    assert.deepEqual(plain(await invoke("/root", { followSymbolicLinks: false })), [
      "/root/good/SKILL.md",
    ]);
    assert.ok(
      !calls.some(
        (call) =>
          call[0] === "stat" &&
          (call[1] === "/root/SKILL.md" || call[1] === "/root/file-link/SKILL.md"),
      ),
    );
    assert.ok(!calls.some((call) => call[0] === "filter" && call[1] === "dir-link"));
    calls.length = 0;
    assert.deepEqual(plain(await invoke("/root")), [
      "/root/SKILL.md",
      "/root/good/SKILL.md",
      "/root/dir-link/SKILL.md",
      "/root/file-link/SKILL.md",
    ]);
    assert.ok(!calls.some((call) => call[0] === "lstat"));
    failure = "stat";
    await assert.rejects(invoke("/root"), (error) => error === permission);
    failure = "readdir";
    await assert.rejects(invoke("/root"), (error) => error === absent);
    failure = undefined;
  }
});
test("discovery identity preserves canonical disable, plugin pending cache, folded data and path dedup", async () => {
  const calls = [],
    disabled = ["/disabled-link/SKILL.md"],
    factoryOptions = { disabledPaths: disabled, extraRoots: ["synthetic"] };
  const hidden = "/canonical-hidden/SKILL.md",
    one = "/plug/skills/one/SKILL.md",
    two = "/plug/skills/two/SKILL.md",
    manual = "/user/manual/SKILL.md";
  const plugin = {
      path: "/plug/skills",
      priority: 10,
      scope: "project",
      source: "plugin",
      pluginId: "synthetic-id",
    },
    user = { path: "/user", priority: 20, scope: "user", source: "knorvia" };
  const roots = [user, plugin];
  const texts = {
    [hidden]: "---\nname: Hidden\ndescription: hidden\n---\ntext",
    [one]:
      "---\nname: Same\ndescription: >+\n  First line\n  second line\n\n  paragraph\nunknown: value\nbroken line\n---\nbody",
    [two]: "---\nname: Same\ndescription: two\n---\nbody",
    [manual]: "# Manual synthetic skill",
  };
  let manifestReads = 0;
  const ports = {
    "node:fs": {
      realpathSync: (file) => {
        calls.push(["canonical-sync", file]);
        return hidden;
      },
    },
    "node:fs/promises": {
      realpath: async (file) => {
        calls.push(["canonical", file]);
        return file;
      },
      readFile: async (file, encoding) => {
        calls.push(["read", file, encoding]);
        if (file.endsWith("/.knorvia-plugin/plugin.json")) {
          manifestReads++;
          await Promise.resolve();
          return '{"name":" synthetic-plugin "}';
        }
        return texts[file];
      },
      stat: async () => {
        throw new Error("unexpected stat");
      },
      open: async () => {
        throw new Error("unexpected open");
      },
    },
    "node:path": paths,
    "./roots.js": {
      resolveDefaultSkillRoots: async (cwd, options) => {
        assert.equal(cwd, "/work");
        assert.equal(options, factoryOptions);
        return roots;
      },
    },
    "./scan.js": {
      scanSkillFilesUnderRoot: async (root, options) => {
        calls.push(["scan", root, plain(options)]);
        return root === plugin.path ? [hidden, one, two] : [one, manual];
      },
    },
  };
  const { createNodeSkillAdapter } = await load("index", ports);
  const adapter = createNodeSkillAdapter(factoryOptions);
  disabled.length = 0;
  factoryOptions.extraRoots = ["changed"];
  const outcomes = await Promise.all([
    adapter.discoverSkills({ workingDirectory: "/work" }),
    adapter.discoverSkills({ workingDirectory: "/work" }),
  ]);
  assert.equal(manifestReads, 1);
  assert.deepEqual(roots, [user, plugin]);
  for (const outcome of outcomes) {
    assert.equal(outcome.totalDiscovered, 4);
    assert.deepEqual(plain(outcome.skills.map((skill) => [skill.name, skill.path])), [
      ["manual", manual],
      ["Same", one],
      ["Same", two],
    ]);
    const skill = outcome.skills[1];
    assert.equal(skill.description, "First line second line\nparagraph");
    assert.equal(skill.safeToAutoLoad, false);
    assert.deepEqual(
      [skill.pluginId, skill.pluginName, skill.qualifiedName],
      ["synthetic-id", "synthetic-plugin", "synthetic-plugin:Same"],
    );
    assert.deepEqual(plain(skill.policy), { allowImplicitInvocation: true });
    assert.deepEqual(plain(outcome.diagnostics.map((diagnostic) => diagnostic.code)), [
      "skill_invalid_frontmatter",
      "skill_invalid_frontmatter",
    ]);
    assert.equal(outcome.skills[0].description, "");
    assert.equal(outcome.skills[0].safeToAutoLoad, true);
  }
  assert.equal(calls.filter((call) => call[0] === "canonical-sync").length, 1);
  assert.ok(!calls.some((call) => call[0] === "canonical" && call[1] === hidden));
  assert.deepEqual(
    calls.filter((call) => call[0] === "scan").map((call) => call[2]),
    [
      { followSymbolicLinks: false },
      { followSymbolicLinks: false },
      { followSymbolicLinks: true },
      { followSymbolicLinks: true },
    ],
  );
  await adapter.discoverSkills({ workingDirectory: "/work" });
  assert.equal(manifestReads, 1);
});
test("load identity preserves exact alias/public dispatch, text budget, cleanup precedence and abort", async () => {
  const metadata = {
    name: "Same",
    qualifiedName: "synthetic-plugin:Same",
    path: "/synthetic/SKILL.md",
    directory: "/synthetic",
  };
  const options = { signal: new AbortController().signal },
    roots = [],
    calls = [],
    readError = new Error("synthetic read"),
    closeError = new Error("synthetic close");
  let mode = "success";
  const handle = {
    async read(buffer, offset, length, position) {
      assert.equal(this, handle);
      calls.push(["read", offset, length, position]);
      if (mode === "error") throw readError;
      buffer.write("OK");
      return { bytesRead: 2 };
    },
    async close() {
      assert.equal(this, handle);
      calls.push(["close"]);
      if (mode === "error") throw closeError;
    },
  };
  const ports = {
    "node:fs": {
      realpathSync: () => {
        throw new Error("unexpected canonical");
      },
    },
    "node:fs/promises": {
      stat: async () => ({ size: 10 }),
      open: async (file, flags) => {
        calls.push(["open", file, flags]);
        return handle;
      },
      readFile: async () => Buffer.from("---wrong\n---\n body "),
      realpath: async () => {
        throw new Error("unexpected canonical");
      },
    },
    "node:path": paths,
    "./roots.js": {
      resolveDefaultSkillRoots: async () => {
        throw new Error("unexpected roots");
      },
    },
    "./scan.js": {
      scanSkillFilesUnderRoot: async () => {
        throw new Error("unexpected scan");
      },
    },
  };
  const { NodeSkillAdapter } = await load("index", ports);
  const adapter = new NodeSkillAdapter();
  adapter.discoverSkills = async (request, received) => {
    assert.equal(request.roots, roots);
    assert.equal(request.workingDirectory, "/work");
    assert.equal(received, options);
    calls.push(["discover"]);
    return { skills: [metadata], diagnostics: [], totalDiscovered: 1 };
  };
  const request = { name: metadata.qualifiedName, workingDirectory: "/work", roots, maxBytes: 4 };
  const content = await adapter.loadSkill(request, options);
  assert.equal(content.metadata, metadata);
  assert.deepEqual(plain({ ...content, metadata: null }), {
    metadata: null,
    content: "OK",
    baseDirectory: "/synthetic",
    bytesRead: 2,
    sizeBytes: 10,
    truncated: true,
  });
  assert.deepEqual(calls, [
    ["discover"],
    ["open", "/synthetic/SKILL.md", "r"],
    ["read", 0, 4, 0],
    ["close"],
  ]);
  const full = await adapter.loadSkill({ ...request, maxBytes: 20 }, options);
  assert.equal(full.content, "body");
  assert.equal(full.truncated, false);
  await assert.rejects(
    adapter.loadSkill({ ...request, name: "same" }, options),
    /Skill not found: same/,
  );
  mode = "error";
  await assert.rejects(adapter.loadSkill(request, options), (error) => error === closeError);
  const aborted = new AbortController();
  aborted.abort();
  calls.length = 0;
  await assert.rejects(
    adapter.loadSkill(request, { signal: aborted.signal }),
    /Skill operation cancelled/,
  );
  assert.equal(calls.length, 0);
});

test("discovery error admission preserves absent-code property observation before diagnostics", async () => {
  const getterFailure = new Error("synthetic absent-code getter");
  const rejected = new Proxy(
    {},
    {
      has: () => false,
      get: (_target, key) => {
        if (key === "code") throw getterFailure;
        return undefined;
      },
    },
  );
  const ports = {
    "node:fs": {
      realpathSync: () => {
        throw new Error("unexpected canonical");
      },
    },
    "node:fs/promises": {
      open: () => {
        throw new Error("unexpected open");
      },
      readFile: () => {
        throw new Error("unexpected read");
      },
      realpath: () => {
        throw new Error("unexpected canonical");
      },
      stat: () => {
        throw new Error("unexpected stat");
      },
    },
    "node:path": paths,
    "./roots.js": {
      resolveDefaultSkillRoots: () => {
        throw new Error("unexpected roots");
      },
    },
    "./scan.js": {
      scanSkillFilesUnderRoot: async () => {
        throw rejected;
      },
    },
  };
  const { createNodeSkillAdapter } = await load("index", ports);
  const adapter = createNodeSkillAdapter();
  const outcome = await adapter.discoverSkills({
    workingDirectory: "/work",
    roots: [{ path: "/synthetic-root", priority: 1, scope: "user", source: "agents" }],
  });
  assert.deepEqual(plain(outcome), {
    skills: [],
    diagnostics: [
      {
        code: "skill_scan_failed",
        severity: "warning",
        message: "Failed to scan skill root: /synthetic-root",
        path: "/synthetic-root",
      },
    ],
    totalDiscovered: 0,
  });
});

test("discovery manifest preserves path-port rejection identity and retained pending failure", async () => {
  const failure = new Error("synthetic manifest path"),
    skill = "/plug/skills/one/SKILL.md";
  let joins = 0;
  const ports = {
    "node:fs": {
      realpathSync: () => {
        throw new Error("unexpected canonical");
      },
    },
    "node:fs/promises": {
      open: () => {
        throw new Error("unexpected open");
      },
      readFile: async (file) =>
        file === skill
          ? "---\nname: One\ndescription: synthetic\n---\nbody"
          : '{"name":"fallback"}',
      realpath: async (file) => file,
      stat: () => {
        throw new Error("unexpected stat");
      },
    },
    "node:path": {
      ...paths,
      join: (...parts) => {
        if (parts[1] === ".knorvia-plugin/plugin.json") {
          joins++;
          throw failure;
        }
        return paths.join(...parts);
      },
    },
    "./roots.js": {
      resolveDefaultSkillRoots: () => {
        throw new Error("unexpected roots");
      },
    },
    "./scan.js": { scanSkillFilesUnderRoot: async () => [skill] },
  };
  const { createNodeSkillAdapter } = await load("index", ports);
  const adapter = createNodeSkillAdapter();
  const request = {
    workingDirectory: "/work",
    roots: [{ path: "/plug/skills", priority: 1, scope: "project", source: "plugin" }],
  };
  await assert.rejects(adapter.discoverSkills(request), (error) => error === failure);
  await assert.rejects(adapter.discoverSkills(request), (error) => error === failure);
  assert.equal(joins, 1);
});
