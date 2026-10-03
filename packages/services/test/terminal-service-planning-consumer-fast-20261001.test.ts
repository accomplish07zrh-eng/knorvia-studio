// Frozen real-service planning contracts. Every native command, filesystem, PTY and setting port is fake.
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { registerHooks } from "node:module";
import { delimiter, join, resolve } from "node:path";
import { after, beforeEach, mock, test } from "node:test";
import type { ISettingService } from "../src/setting/setting.js";

const emitted = process.env.KNORVIA_TERMINAL_PLAN_TARGET === "dist";
const root = resolve("synthetic-terminal-plan-owned");
const shell = join(root, "bin", "owned-shell");
const bin = join(root, "bin");
const osHome = join(root, "os-home");
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const originalEnv = process.env;
const marker = originalEnv.NODE_TEST_CONTEXT
  ? { NODE_TEST_CONTEXT: originalEnv.NODE_TEST_CONTEXT }
  : {};
let executables: Set<string>;
let directories: Map<string, boolean | Error>;
let accesses: string[];
let stats: string[];
let observations: string[];
let homeCalls: number;
let releaseCalls: number;
let releaseText: string;
let homeError: Error | undefined;
let spawns: Array<{
  executable: string;
  args: string[];
  options: Record<string, unknown> & { env: NodeJS.ProcessEnv };
}>;
let spawnErrors: unknown[];
let settingsCalls: number;
let profileInputs: unknown[];
let profileEnv: NodeJS.ProcessEnv | undefined;
let kills: number;
beforeEach(() => {
  Object.defineProperty(process, "platform", { ...originalPlatform, value: "linux" });
  process.env = {
    ...marker,
    HOME: root,
    SHELL: shell,
    PATH: bin,
    KNORVIA_ENV: "test",
    KNORVIA_DATA_BASE_DIR: root,
    KNORVIA_STORAGE_DIR: join(root, "cli"),
  };
  executables = new Set([shell]);
  directories = new Map([
    [root, true],
    [osHome, true],
    ["/", true],
  ]);
  accesses = [];
  stats = [];
  observations = [];
  homeCalls = 0;
  releaseCalls = 0;
  releaseText = "10.0.22631";
  homeError = undefined;
  spawns = [];
  spawnErrors = [];
  settingsCalls = 0;
  profileInputs = [];
  profileEnv = undefined;
  kills = 0;
});
after(() => {
  process.env = originalEnv;
  Object.defineProperty(process, "platform", originalPlatform);
});
mock.module("node:fs", {
  namedExports: {
    constants,
    accessSync: (path: string, mode: number) => {
      assert.equal(mode, constants.X_OK);
      accesses.push(path);
      observations.push(`access:${path}`);
      if (!executables.has(path)) throw new Error("owned fake executable denied");
    },
    statSync: (path: string) => {
      stats.push(path);
      observations.push(`stat:${path}`);
      const outcome = directories.get(path);
      if (outcome instanceof Error) throw outcome;
      return { isDirectory: () => outcome === true };
    },
    existsSync: (path: string) => {
      assert.ok(path.startsWith(root));
      return false;
    },
    readFileSync: () => assert.fail("never read real profiles"),
    chmodSync: () => assert.fail("native helper permissions remain outside this fixture"),
  },
});
mock.module("node:os", {
  namedExports: {
    homedir: () => {
      homeCalls++;
      observations.push("homedir");
      if (homeError) throw homeError;
      return osHome;
    },
    release: () => {
      releaseCalls++;
      observations.push("release");
      return releaseText;
    },
  },
});
mock.module("node:module", {
  namedExports: {
    createRequire: () =>
      Object.assign(
        (id: string) => {
          assert.equal(id, "node-pty/lib/utils");
          return {
            loadNativeModule: (name: string) => {
              assert.equal(name, "pty");
              return { dir: "owned-native" };
            },
          };
        },
        {
          resolve: (id: string) => {
            assert.equal(id, "node-pty/lib/unixTerminal.js");
            return join(root, "pty", "lib", "unixTerminal.js");
          },
        },
      ),
  },
});
mock.module("node:child_process", {
  namedExports: {
    execFileSync: () => assert.fail("no native commands"),
    spawn: () => assert.fail("no terminal or application launch"),
  },
});
mock.module("node-pty", {
  namedExports: {
    spawn: (
      executable: string,
      args: string[],
      options: Record<string, unknown> & { env: NodeJS.ProcessEnv },
    ) => {
      spawns.push({ executable, args, options });
      observations.push("spawn");
      if (spawnErrors.length) throw spawnErrors.shift();
      return {
        onData: () => {},
        onExit: () => {},
        kill: () => {
          kills++;
        },
        write: () => {},
        resize: () => {},
      };
    },
  },
});
mock.module(
  new URL(
    `../${emitted ? "dist" : "src"}/terminal/terminalProfile.${emitted ? "js" : "ts"}`,
    import.meta.url,
  ).href,
  {
    namedExports: {
      resolveTerminalFontProfile: (input: { settings: unknown; env: NodeJS.ProcessEnv }) => {
        observations.push("profile");
        profileInputs.push(input.settings);
        profileEnv = input.env;
        return { fontFamily: "Owned profile", source: "fallback" };
      },
    },
  },
);
const { createTerminalService }: typeof import("../src/terminal/terminalService.js") = await import(
  new URL(
    `../${emitted ? "dist" : "src"}/terminal/terminalService.${emitted ? "js" : "ts"}`,
    import.meta.url,
  ).href
);
function service(t: { after(fn: () => void): void }) {
  const s = createTerminalService({
    settingService: {
      get: async () => {
        settingsCalls++;
        observations.push("settings");
        return { terminalInheritSystemProfile: false };
      },
    } as ISettingService,
  }) as ReturnType<typeof createTerminalService> & { disposeAll(): void };
  t.after(() => s.disposeAll());
  return s;
}
const dimensions = { cols: 93, rows: 29 };
const create = (s: ReturnType<typeof service>, cwd: string | undefined = root) =>
  s.create({ ...dimensions, cwd });
const windows = () => {
  Object.defineProperty(process, "platform", { ...originalPlatform, value: "win32" });
  delete process.env.SHELL;
  executables = new Set([join(bin, "pwsh.exe")]);
};
const spawnedEnv = () => spawns.at(-1)!.options.env;

test("lazy load is deferred until create and failed resolution is retried without changing native code", async (t) => {
  let imports = 0;
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "node-pty") {
        imports++;
        if (imports === 1) throw new Error("owned synthetic module resolution failure");
      }
      return nextResolve(specifier, context);
    },
  });
  t.after(() => hook.deregister());
  const s = service(t);
  assert.equal(imports, 0);
  await assert.rejects(create(s), {
    message: "node-pty is unavailable in this runtime: owned synthetic module resolution failure",
  });
  assert.equal(spawns.length, 0);
  assert.equal(imports, 1);
  const result = await create(s);
  assert.equal(result.id, "1");
  assert.equal(imports, 2);
  assert.equal(spawns.length, 1);
  await create(s);
  assert.equal(imports, 2);
  assert.equal(spawns.length, 2);
});
test("actual service plans before settings and forwards dimensions, raw profile env and fake PTY only", async (t) => {
  const s = service(t);
  const before = { ...process.env };
  const result = await create(s);
  assert.equal(result.shell, shell);
  assert.equal(result.windowsPty, undefined);
  assert.deepEqual(accesses, [shell]);
  assert.deepEqual(stats, [root]);
  assert.equal(homeCalls, 1);
  assert.deepEqual(observations, [
    `access:${shell}`,
    "homedir",
    `stat:${root}`,
    "settings",
    "profile",
    "spawn",
    "release",
  ]);
  assert.equal(releaseCalls, 1);
  assert.deepEqual(spawns[0]!.args, []);
  assert.equal(spawns[0]!.options.cols, 93);
  assert.equal(spawns[0]!.options.rows, 29);
  assert.equal(spawns[0]!.options.cwd, root);
  assert.equal(spawns[0]!.options.encoding, "utf8");
  assert.equal(spawns[0]!.options.name, "xterm-256color");
  assert.equal(Object.hasOwn(spawns[0]!.options, "useConpty"), false);
  assert.strictEqual(profileEnv, process.env);
  assert.deepEqual(process.env, before);
  await s.dispose({ id: result.id });
  assert.equal(kills, 1);
});
for (const [chosen, expectedAccess] of [
  ["/bin/zsh", ["/bin/zsh"]],
  ["/bin/bash", ["/bin/zsh", "/bin/bash"]],
  ["/bin/sh", ["/bin/zsh", "/bin/bash", "/bin/sh"]],
] as const) {
  test(`POSIX missing SHELL falls back in order to ${chosen}`, async (t) => {
    delete process.env.SHELL;
    executables = new Set([chosen]);
    const result = await create(service(t));
    assert.equal(result.shell, chosen);
    assert.deepEqual(accesses, expectedAccess);
  });
}
test("bad inherited shell is tried raw before POSIX fallbacks", async (t) => {
  process.env.SHELL = join(root, "missing shell");
  executables = new Set(["/bin/bash"]);
  assert.equal((await create(service(t))).shell, "/bin/bash");
  assert.deepEqual(accesses, [process.env.SHELL, "/bin/zsh", "/bin/bash"]);
});
test("slash and backslash shell paths use direct X_OK even with no PATH", async (t) => {
  delete process.env.PATH;
  for (const value of [join(root, "direct"), "owned\\shell", "  owned/shell  "]) {
    process.env.SHELL = value;
    executables = new Set([value]);
    accesses = [];
    assert.equal((await create(service(t))).shell, value);
    assert.deepEqual(accesses, [value]);
  }
});
test("bare command returns original name while raw PATH segments retain whitespace and repeats", async (t) => {
  process.env.SHELL = "owned-shell";
  const second = join(root, "second");
  process.env.PATH = ["", " owned-space ", bin, bin, second, ""].join(delimiter);
  executables = new Set([join(second, "owned-shell")]);
  assert.equal((await create(service(t))).shell, "owned-shell");
  assert.deepEqual(accesses, [
    join(" owned-space ", "owned-shell"),
    join(bin, "owned-shell"),
    join(bin, "owned-shell"),
    join(second, "owned-shell"),
  ]);
});
test("missing PATH does not admit a bare SHELL or invent extensions", async (t) => {
  process.env.SHELL = "owned-shell";
  delete process.env.PATH;
  executables = new Set(["/bin/sh"]);
  assert.equal((await create(service(t))).shell, "/bin/sh");
  assert.deepEqual(accesses, ["/bin/zsh", "/bin/bash", "/bin/sh"]);
});
test("POSIX shell failure has exact wording and performs no home/settings/spawn", async (t) => {
  executables.clear();
  await assert.rejects(create(service(t)), {
    message: "No usable shell found for terminal startup",
  });
  assert.equal(homeCalls, 0);
  assert.equal(settingsCalls, 0);
  assert.deepEqual(spawns, []);
});
for (const [chosen, candidates] of [
  ["pwsh.exe", ["pwsh.exe"]],
  ["powershell.exe", ["pwsh.exe", "powershell.exe"]],
  ["owned-comspec", ["pwsh.exe", "powershell.exe", "owned-comspec"]],
  ["cmd.exe", ["pwsh.exe", "powershell.exe", "owned-comspec", "cmd.exe"]],
] as const) {
  test(`Windows shell order selects ${chosen}`, async (t) => {
    windows();
    process.env.ComSpec = "owned-comspec";
    executables = new Set([join(bin, chosen)]);
    assert.equal((await create(service(t))).shell, chosen);
    assert.deepEqual(
      accesses,
      candidates.map((name) => join(bin, name)),
    );
  });
}
test("Windows direct ComSpec remains untrimmed and bypasses PATH probing", async (t) => {
  windows();
  process.env.ComSpec = " owned\\ComSpec ";
  executables = new Set([process.env.ComSpec]);
  assert.equal((await create(service(t))).shell, process.env.ComSpec);
  assert.deepEqual(accesses, [
    join(bin, "pwsh.exe"),
    join(bin, "powershell.exe"),
    process.env.ComSpec,
  ]);
});
test("Windows repeated ComSpec is not deduplicated", async (t) => {
  windows();
  process.env.ComSpec = "powershell.exe";
  executables = new Set([join(bin, "cmd.exe")]);
  assert.equal((await create(service(t))).shell, "cmd.exe");
  assert.deepEqual(
    accesses,
    ["pwsh.exe", "powershell.exe", "powershell.exe", "cmd.exe"].map((name) => join(bin, name)),
  );
});
test("Windows shell failure exact wording precedes other work", async (t) => {
  windows();
  executables.clear();
  await assert.rejects(create(service(t)), {
    message: "No usable Windows shell found for terminal startup",
  });
  assert.equal(homeCalls, 0);
  assert.equal(settingsCalls, 0);
  assert.deepEqual(spawns, []);
});
for (const [label, requested, homes, expectedCwd, expectedStats] of [
  [
    "requested",
    join(root, "requested"),
    [join(root, "requested")],
    join(root, "requested"),
    [join(root, "requested")],
  ],
  ["HOME", join(root, "missing"), [root], root, [join(root, "missing"), root]],
  ["OS home", join(root, "missing"), [osHome], osHome, [join(root, "missing"), root, osHome]],
  ["root", join(root, "missing"), ["/"], "/", [join(root, "missing"), root, osHome, "/"]],
] as const) {
  test(`cwd fallback selects ${label}, preserving probe order`, async (t) => {
    directories = new Map(homes.map((path) => [path, true]));
    await create(service(t), requested);
    assert.equal(spawns[0]!.options.cwd, expectedCwd);
    assert.deepEqual(stats, expectedStats);
    assert.equal(homeCalls, 1);
  });
}
test("cwd raw whitespace/relative values are preserved", async (t) => {
  directories = new Map([[" owned-relative ", true]]);
  await create(service(t), " owned-relative ");
  assert.equal(spawns[0]!.options.cwd, " owned-relative ");
  assert.deepEqual(stats, [" owned-relative "]);
});
test("cwd skips only falsy candidates and ignores USERPROFILE", async (t) => {
  process.env.HOME = "";
  process.env.USERPROFILE = join(root, "ignored");
  directories = new Map([[osHome, true]]);
  await create(service(t), "");
  assert.deepEqual(stats, [osHome]);
  assert.equal(spawns[0]!.options.cwd, osHome);
});
test("directory false/stat exceptions fall through; complete failure precedes settings", async (t) => {
  directories = new Map([
    [root, new Error("owned stat denial")],
    [osHome, false],
  ]);
  await assert.rejects(create(service(t)), {
    message: "No usable working directory found for terminal startup",
  });
  assert.deepEqual(stats, [root, root, osHome, "/"]);
  assert.equal(settingsCalls, 0);
  assert.deepEqual(spawns, []);
});
test("eager homedir errors propagate even with usable requested cwd", async (t) => {
  const error = new Error("owned home port failure");
  homeError = error;
  await assert.rejects(create(service(t)), (value) => value === error);
  assert.deepEqual(stats, []);
  assert.equal(homeCalls, 1);
  assert.equal(settingsCalls, 0);
});
const darwinPaths = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/local/sbin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];
test("Darwin PATH projection trims/deduplicates and preserves first-seen order only in child env", async (t) => {
  Object.defineProperty(process, "platform", { ...originalPlatform, value: "darwin" });
  process.env.PATH = [` ${bin} `, "", "/usr/bin", bin, "/bin", "/usr/bin"].join(delimiter);
  const before = process.env.PATH;
  await create(service(t));
  assert.equal(
    spawnedEnv().PATH,
    [
      bin,
      "/usr/bin",
      "/bin",
      ...darwinPaths.filter((path) => !["/usr/bin", "/bin"].includes(path)),
    ].join(delimiter),
  );
  assert.equal(process.env.PATH, before);
  assert.deepEqual(accesses, [shell]);
});
test("Darwin missing PATH is augmented only after unaugmented shell admission", async (t) => {
  Object.defineProperty(process, "platform", { ...originalPlatform, value: "darwin" });
  process.env.SHELL = "owned-shell";
  delete process.env.PATH;
  executables = new Set(["/bin/sh"]);
  assert.equal((await create(service(t))).shell, "/bin/sh");
  assert.deepEqual(accesses, ["/bin/zsh", "/bin/bash", "/bin/sh"]);
  assert.equal(spawnedEnv().PATH, darwinPaths.join(delimiter));
  assert.equal(Object.hasOwn(process.env, "PATH"), false);
});
test("non-Darwin PATH stays verbatim including duplicates/whitespace/absence", async (t) => {
  for (const path of [` ${bin} ${delimiter}${bin}${delimiter}${bin}`, undefined]) {
    if (path === undefined) delete process.env.PATH;
    else process.env.PATH = path;
    await create(service(t));
    assert.equal(spawnedEnv().PATH, path);
    assert.equal(Object.hasOwn(spawnedEnv(), "PATH"), path !== undefined);
  }
});
for (const [term, ci, expectedCI] of [
  ["dumb", "1", undefined],
  ["dumb", "true", "true"],
  ["DUMB", "1", "1"],
  ["xterm", "1", "1"],
  [undefined, "1", "1"],
  ["dumb", undefined, undefined],
] as const) {
  test(`TERM/CI projection: ${JSON.stringify([term, ci])}`, async (t) => {
    if (term === undefined) delete process.env.TERM;
    else process.env.TERM = term;
    if (ci === undefined) delete process.env.CI;
    else process.env.CI = ci;
    const before = { ...process.env };
    await create(service(t));
    assert.equal(spawnedEnv().TERM, "xterm-256color");
    assert.equal(spawnedEnv().CI, expectedCI);
    assert.deepEqual(process.env, before);
  });
}
for (const [input, expected] of [
  [undefined, "truecolor"],
  ["", "truecolor"],
  [" \t ", "truecolor"],
  [" custom-color ", "custom-color"],
] as const) {
  test(`COLORTERM projection: ${JSON.stringify(input)}`, async (t) => {
    if (input === undefined) delete process.env.COLORTERM;
    else process.env.COLORTERM = input;
    await create(service(t));
    assert.equal(spawnedEnv().COLORTERM, expected);
  });
}
for (const [label, env, expected] of [
  ["missing", {}, { LANG: "C.UTF-8", LC_CTYPE: "C.UTF-8" }],
  [
    "C/POSIX",
    { LANG: " c ", LC_CTYPE: "posix", LC_ALL: " \t " },
    { LANG: "C.UTF-8", LC_CTYPE: "C.UTF-8", LC_ALL: "C.UTF-8" },
  ],
  [
    "ALL precedence raw",
    { LC_ALL: " fr.UTF8 ", LC_CTYPE: "de.UTF-8", LANG: "C" },
    { LC_ALL: " fr.UTF8 ", LC_CTYPE: "de.UTF-8", LANG: " fr.UTF8 " },
  ],
  [
    "CTYPE precedence",
    { LC_ALL: "POSIX", LC_CTYPE: " ja.utf-8 ", LANG: "en.UTF8" },
    { LC_ALL: " ja.utf-8 ", LC_CTYPE: " ja.utf-8 ", LANG: "en.UTF8" },
  ],
  [
    "LANG fallback",
    { LANG: " zh.UTF8 ", LC_CTYPE: "C" },
    { LANG: " zh.UTF8 ", LC_CTYPE: " zh.UTF8 " },
  ],
  [
    "non-UTF locale retained",
    { LANG: "en.ISO8859", LC_CTYPE: "C", LC_ALL: "latin-1" },
    { LANG: "en.ISO8859", LC_CTYPE: "C.UTF-8", LC_ALL: "latin-1" },
  ],
  [
    "substring grammar",
    { LANG: "notutf8marker", LC_CTYPE: "" },
    { LANG: "notutf8marker", LC_CTYPE: "notutf8marker" },
  ],
] as const) {
  test(`locale precedence and preservation: ${label}`, async (t) => {
    Object.assign(process.env, env);
    const before = { ...process.env };
    await create(service(t));
    const actual = Object.fromEntries(
      ["LANG", "LC_CTYPE", "LC_ALL"].flatMap((key) =>
        Object.hasOwn(spawnedEnv(), key) ? [[key, spawnedEnv()[key]]] : [],
      ),
    );
    assert.deepEqual(actual, expected);
    assert.deepEqual(process.env, before);
  });
}
test("Darwin locale fallback is en_US.UTF-8 without modifying other synthetic fields", async (t) => {
  Object.defineProperty(process, "platform", { ...originalPlatform, value: "darwin" });
  process.env.OWNED_SYNTHETIC_FIELD = "keep-exact";
  await create(service(t));
  assert.equal(spawnedEnv().LANG, "en_US.UTF-8");
  assert.equal(spawnedEnv().LC_CTYPE, "en_US.UTF-8");
  assert.equal(Object.hasOwn(spawnedEnv(), "LC_ALL"), false);
  assert.equal(spawnedEnv().OWNED_SYNTHETIC_FIELD, "keep-exact");
  assert.notStrictEqual(spawnedEnv(), process.env);
  assert.equal(process.env.LANG, undefined);
});
test("Windows first options use ConPTY DLL while Unix options have no Windows fields", async (t) => {
  windows();
  const result = await create(service(t));
  const options = spawns[0]!.options;
  assert.equal(options.useConpty, true);
  assert.equal(options.useConptyDll, true);
  assert.deepEqual(
    Object.keys(options).sort(),
    ["useConpty", "name", "cols", "rows", "cwd", "env", "encoding", "useConptyDll"].sort(),
  );
  assert.deepEqual(result.windowsPty, { backend: "conpty", buildNumber: 22631 });
});
for (const message of [
  "conpty.node module handle missing",
  "CONPTY.NODE MODULE FILE NAME unavailable",
  "Cannot find conpty.dll",
  "native error code: 126",
  "native error code:    126-extra",
]) {
  test(`Windows eligible DLL error uses exactly one system-ConPTY fallback: ${message}`, async (t) => {
    windows();
    spawnErrors = [new Error(message)];
    const result = await create(service(t));
    assert.equal(spawns.length, 2);
    assert.equal(spawns[0]!.options.useConptyDll, true);
    assert.equal(spawns[1]!.options.useConptyDll, false);
    assert.equal(spawns[1]!.options.useConpty, true);
    assert.strictEqual(spawns[0]!.options.env, spawns[1]!.options.env);
    assert.deepEqual({ ...spawns[0]!.options, useConptyDll: false }, spawns[1]!.options);
    assert.deepEqual(result.windowsPty, { backend: "conpty", buildNumber: 22631 });
  });
}
for (const platform of ["linux", "win32"] as const) {
  test(`unrelated ${platform} spawn failure keeps exact wrapper and no retry`, async (t) => {
    if (platform === "win32") windows();
    const chosen = platform === "win32" ? "pwsh.exe" : shell;
    spawnErrors = [new Error("owned unrelated launch failure")];
    await assert.rejects(create(service(t)), {
      message: `Failed to start terminal with shell '${chosen}' in '${root}': owned unrelated launch failure`,
    });
    assert.equal(spawns.length, 1);
    assert.equal(releaseCalls, 0);
  });
}
test("Windows fallback failure uses second message and never attempts a third spawn", async (t) => {
  windows();
  spawnErrors = [new Error("cannot find conpty.dll"), "owned second failure"];
  await assert.rejects(create(service(t)), {
    message: `Failed to start terminal with shell 'pwsh.exe' in '${root}': owned second failure`,
  });
  assert.equal(spawns.length, 2);
  assert.equal(releaseCalls, 0);
});
test("non-Error eligible Windows failure is coerced through the existing wrapper", async (t) => {
  windows();
  spawnErrors = ["error code: 126"];
  await create(service(t));
  assert.equal(spawns.length, 2);
});
for (const [version, expected] of [
  ["10.0.22631", 22631],
  ["10.0.22631.extra", 22631],
  ["10.0.123tail", 123],
  ["10.0.-5", -5],
  ["10.0.+7", 7],
  ["10.0.0", 0],
  ["10.0. 42", 42],
  ["10.0.0x10", 0],
  ["10.0.", undefined],
  ["10.0", undefined],
  ["unknown", undefined],
  ["10.0.NaN", undefined],
] as const) {
  test(`Windows release prefix parsing: ${version}`, async (t) => {
    windows();
    releaseText = version;
    const result = await create(service(t));
    assert.deepEqual(result.windowsPty, { backend: "conpty", buildNumber: expected });
    assert.equal(Object.hasOwn(result.windowsPty!, "buildNumber"), true);
    assert.equal(releaseCalls, 1);
    assert.equal(observations.at(-1), "release");
  });
}
test("repeated creates observe changed shell/env/release without introducing a planning cache", async (t) => {
  windows();
  const s = service(t);
  releaseText = "10.0.19041";
  const first = await create(s);
  executables = new Set([join(bin, "cmd.exe")]);
  releaseText = "10.0.22000";
  process.env.COLORTERM = " owned-new ";
  const second = await create(s);
  assert.equal(first.shell, "pwsh.exe");
  assert.equal(second.shell, "cmd.exe");
  assert.equal(first.windowsPty!.buildNumber, 19041);
  assert.equal(second.windowsPty!.buildNumber, 22000);
  assert.equal(spawnedEnv().COLORTERM, "owned-new");
  assert.equal(settingsCalls, 2);
});
