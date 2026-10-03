// Real macOS provider -> immutable portable resolver -> real terminalService; every IO port is fake.
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { after, beforeEach, mock, test } from "node:test";
import type { ISettingService } from "../src/setting/setting.js";

const emitted = process.env.KNORVIA_TERMINAL_MACOS_TARGET === "dist";
const root = resolve("synthetic-terminal-macos-consumer-owned");
const shell = join(root, "bin", "owned-shell");
const iterm = join(root, "Library", "Preferences", "com.googlecode.iterm2.plist");
const terminal = join(root, "Library", "Preferences", "com.apple.Terminal.plist");
const code = join(root, ".config", "Code", "User", "settings.json");
const kitty = join(root, ".config", "kitty", "kitty.conf");
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const originalEnv = process.env;
process.env = {
  ...(originalEnv.NODE_TEST_CONTEXT ? { NODE_TEST_CONTEXT: originalEnv.NODE_TEST_CONTEXT } : {}),
  HOME: root,
  USERPROFILE: root,
  SHELL: shell,
  PATH: join(root, "bin"),
  KNORVIA_ENV: "test",
  KNORVIA_DATA_BASE_DIR: root,
  KNORVIA_STORAGE_DIR: join(root, "cli"),
};
Object.defineProperty(process, "platform", { ...originalPlatform, value: "darwin" });
after(() => {
  process.env = originalEnv;
  Object.defineProperty(process, "platform", originalPlatform);
});
let files: Map<string, string | Error>;
let probes: string[];
let conversions: string[];
let spawns: Array<{
  executable: string;
  args: string[];
  options: { cwd: string; cols: number; rows: number };
}>;
let kills: number;
let settings: { terminalFontFamily?: string; terminalInheritSystemProfile?: boolean };
let settingsFailure: Error | undefined;
let existsFailure: Error | undefined;
beforeEach(() => {
  files = new Map();
  probes = [];
  conversions = [];
  spawns = [];
  kills = 0;
  settings = {};
  settingsFailure = undefined;
  existsFailure = undefined;
});
mock.module("node:fs", {
  namedExports: {
    constants,
    existsSync: (path: string) => {
      assert.ok(path.startsWith(root), "only owned virtual paths are accepted");
      probes.push(path);
      if (path === iterm && existsFailure) throw existsFailure;
      return files.has(path);
    },
    readFileSync: (path: string, encoding: string) => {
      assert.ok(path === code || path === kitty);
      assert.equal(encoding, "utf8");
      const raw = files.get(path)!;
      if (raw instanceof Error) throw raw;
      return raw;
    },
    accessSync: (path: string) => assert.equal(path, shell),
    statSync: (path: string) => {
      assert.equal(path, root);
      return { isDirectory: () => true };
    },
    chmodSync: () => assert.fail("never change OS permissions"),
  },
});
mock.module("node:os", {
  namedExports: { homedir: () => root, release: () => "owned-synthetic-release" },
});
// Block the service's Darwin CJS helper discovery without loading native node-pty or host files.
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
    execFileSync: (executable: string, args: string[], options: unknown) => {
      assert.equal(executable, "plutil");
      assert.deepEqual(args.slice(0, -1), ["-convert", "json", "-o", "-"]);
      assert.deepEqual(options, {
        encoding: "utf8",
        windowsHide: true,
        timeout: 2_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      const path = args.at(-1)!;
      assert.ok(path === iterm || path === terminal);
      assert.ok(files.has(path));
      conversions.push(path);
      const raw = files.get(path)!;
      if (raw instanceof Error) throw raw;
      return raw;
    },
    spawn: () => assert.fail("never execute an actual command/app"),
  },
});
mock.module("node-pty", {
  namedExports: {
    spawn: (
      executable: string,
      args: string[],
      options: { cwd: string; cols: number; rows: number },
    ) => {
      spawns.push({ executable, args, options });
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
const target = (name: string) =>
  new URL(
    `../${emitted ? "dist" : "src"}/terminal/${name}.${emitted ? "js" : "ts"}`,
    import.meta.url,
  ).href;
// The macOS factory is deliberately real, never replaced by a synthetic provider.
const { resolveTerminalFontProfile: profile }: typeof import("../src/terminal/terminalProfile.js") =
  await import(target("terminalProfile"));
const { createTerminalService }: typeof import("../src/terminal/terminalService.js") = await import(
  target("terminalService")
);
function putIterm(font = "Owned-Iterm 15") {
  files.set(
    iterm,
    JSON.stringify({
      "New Bookmarks": [
        { "Normal Font": font, "Background Color": "#123", "Owned Private": "never-disclose" },
      ],
    }),
  );
}
function putTerminal() {
  files.set(
    terminal,
    JSON.stringify({
      "Startup Window Settings": "Owned",
      Owned: { FontName: "Owned Terminal", FontSize: 16, TextColor: "#456" },
    }),
  );
}
function service() {
  return createTerminalService({
    settingService: {
      get: async () => {
        if (settingsFailure) throw settingsFailure;
        return settings;
      },
    } as ISettingService,
  }) as ReturnType<typeof createTerminalService> & { disposeAll(): void };
}
const resolveProfile = () => profile({ settings, env: process.env });

test("real portable caller chooses VS Code before both macOS apps", () => {
  files.set(code, '{"terminal.integrated.fontFamily":"Owned Code"}');
  putIterm();
  putTerminal();
  const result = resolveProfile();
  assert.match(result.fontFamily, /^Owned Code,/);
  assert.equal(result.source, "system");
  assert.deepEqual(conversions, []);
  assert.equal(probes.includes(iterm), false);
});
test("real portable caller chooses iTerm before Terminal and Kitty", () => {
  putIterm();
  putTerminal();
  files.set(kitty, "font_family Owned Kitty\n");
  const result = resolveProfile();
  assert.match(result.fontFamily, /^Owned Iterm,/);
  assert.equal(result.fontSize, 15);
  assert.deepEqual(result.theme, { background: "#123" });
  assert.deepEqual(conversions, [iterm]);
  assert.equal(probes.includes(terminal), false);
  assert.equal(probes.includes(kitty), false);
});
test("real portable caller falls through failed iTerm conversion to Terminal", () => {
  files.set(iterm, new Error("owned synthetic plutil error"));
  putTerminal();
  const result = resolveProfile();
  assert.match(result.fontFamily, /^Owned Terminal,/);
  assert.equal(result.fontSize, 16);
  assert.deepEqual(result.theme, { foreground: "#456" });
  assert.deepEqual(conversions, [iterm, terminal]);
});
test("real portable caller continues through malformed app data to Kitty", () => {
  files.set(iterm, "[]");
  files.set(terminal, "{");
  files.set(kitty, "font_family Owned Kitty\n");
  const result = resolveProfile();
  assert.match(result.fontFamily, /^Owned Kitty,/);
  assert.equal(result.source, "system");
  assert.deepEqual(conversions, [iterm, terminal]);
});
test("real portable caller returns fallback after both macOS misses", () => {
  const result = resolveProfile();
  assert.equal(result.source, "fallback");
  assert.match(result.fontFamily, /^ui-monospace, SFMono-Regular,/);
  assert.deepEqual(Object.keys(result), ["fontFamily", "source"]);
  assert.deepEqual(conversions, []);
});
test("actual Darwin service forwards real macOS projection and disposes fake PTY only", async (t) => {
  putIterm();
  const s = service();
  t.after(() => s.disposeAll());
  const result = await s.create({ cols: 91, rows: 27, cwd: root });
  assert.match(result.fontFamily, /^Owned Iterm,/);
  assert.equal(result.fontFamilySource, "system");
  assert.equal(result.fontSize, 15);
  assert.deepEqual(result.theme, { background: "#123" });
  assert.doesNotMatch(JSON.stringify(result), /never-disclose|Owned Private/);
  assert.equal(result.shell, shell);
  assert.equal(spawns.length, 1);
  assert.deepEqual(spawns[0]!.args, []);
  assert.equal(spawns[0]!.options.cwd, root);
  assert.deepEqual(conversions, [iterm]);
  await s.dispose({ id: result.id });
  assert.equal(kills, 1);
});
test("actual service custom family retains detected macOS size/theme", async (t) => {
  putTerminal();
  settings = { terminalFontFamily: " Owned Custom " };
  const s = service();
  t.after(() => s.disposeAll());
  const result = await s.create({ cols: 80, rows: 24, cwd: root });
  assert.match(result.fontFamily, /^Owned Custom,/);
  assert.equal(result.fontFamilySource, "custom");
  assert.equal(result.fontSize, 16);
  assert.deepEqual(result.theme, { foreground: "#456" });
  assert.deepEqual(conversions, [terminal]);
  assert.equal(spawns.length, 1);
});
test("actual service inheritance false admits no profile probes", async (t) => {
  putIterm();
  settings = { terminalFontFamily: "Owned Custom", terminalInheritSystemProfile: false };
  const s = service();
  t.after(() => s.disposeAll());
  const result = await s.create({ cols: 80, rows: 24, cwd: root });
  assert.equal(result.fontFamilySource, "custom");
  assert.equal(result.fontSize, undefined);
  assert.equal(probes.includes(iterm), false);
  assert.deepEqual(conversions, []);
});
test("actual service existence error propagates without a PTY spawn", async (t) => {
  existsFailure = new Error("owned existence failure");
  const s = service();
  t.after(() => s.disposeAll());
  await assert.rejects(
    s.create({ cols: 80, rows: 24, cwd: root }),
    (value) => value === existsFailure,
  );
  assert.deepEqual(spawns, []);
  assert.deepEqual(conversions, []);
});
test("actual service settings failure keeps detection and observes changed preferences", async (t) => {
  settingsFailure = new Error("owned settings failure");
  putIterm("First-Mono 13");
  const s = service();
  t.after(() => s.disposeAll());
  const first = await s.create({ cols: 80, rows: 24, cwd: root });
  putIterm("Second-Mono 17");
  const second = await s.create({ cols: 80, rows: 24, cwd: root });
  assert.match(first.fontFamily, /^First Mono,/);
  assert.equal(first.fontSize, 13);
  assert.match(second.fontFamily, /^Second Mono,/);
  assert.equal(second.fontSize, 17);
  assert.equal(second.fontFamilySource, "system");
  assert.deepEqual(conversions, [iterm, iterm]);
  assert.equal(spawns.length, 2);
});
