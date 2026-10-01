// Real terminalService create path, fake PTY/filesystem/command ports: no process launch.
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { after, beforeEach, mock, test } from "node:test";
import type { ISettingService } from "../src/setting/setting.js";
import type { TerminalDetectedProfile } from "../src/terminal/terminalProfileTypes.js";

const emitted = process.env.KNORVIA_TERMINAL_PROFILE_TARGET === "dist";
const root = resolve("synthetic-terminal-consumer-owned");
const shell = join(root, "bin", "fake-shell");
const settingsPath = join(root, ".config", "Code", "User", "settings.json");
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const originalEnv = process.env;
process.env = {
  // Preserve only the test runner's IPC marker, never inherited account/credential env.
  ...(originalEnv.NODE_TEST_CONTEXT ? { NODE_TEST_CONTEXT: originalEnv.NODE_TEST_CONTEXT } : {}),
  HOME: root,
  USERPROFILE: root,
  SHELL: shell,
  PATH: join(root, "bin"),
  KNORVIA_ENV: "test",
  KNORVIA_DATA_BASE_DIR: root,
  KNORVIA_STORAGE_DIR: join(root, "cli"),
};
Object.defineProperty(process, "platform", { ...originalPlatform, value: "linux" });
after(() => {
  process.env = originalEnv;
  Object.defineProperty(process, "platform", originalPlatform);
});
let raw: string | undefined;
let external: TerminalDetectedProfile | null;
let settings: Parameters<
  (typeof import("../src/terminal/terminalProfile.js"))["resolveTerminalFontProfile"]
>[0]["settings"];
let settingsError: Error | undefined;
let reads: string[];
let spawns: Array<{
  executable: string;
  args: string[];
  options: { cwd: string; cols: number; rows: number };
}>;
let kills: number;
beforeEach(() => {
  raw = undefined;
  external = null;
  settings = {};
  settingsError = undefined;
  reads = [];
  spawns = [];
  kills = 0;
});
mock.module("node:fs", {
  namedExports: {
    constants,
    existsSync: (path: string) => {
      assert.ok(path.startsWith(root));
      return path === settingsPath && raw !== undefined;
    },
    readFileSync: (path: string, encoding: string) => {
      assert.equal(path, settingsPath);
      assert.equal(encoding, "utf8");
      reads.push(path);
      return raw;
    },
    accessSync: (path: string) => assert.equal(path, shell),
    statSync: (path: string) => {
      assert.equal(path, root);
      return { isDirectory: () => true };
    },
    chmodSync: () => {
      assert.fail("consumer must never repair real OS permissions");
    },
  },
});
mock.module("node:os", {
  namedExports: { homedir: () => root, release: () => "synthetic-release" },
});
mock.module("node:child_process", {
  namedExports: {
    execFileSync: () => {
      assert.fail("no command execution in portable acceptance");
    },
    spawn: () => {
      assert.fail("no process launch in portable acceptance");
    },
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
mock.module(
  new URL(
    `../${emitted ? "dist" : "src"}/terminal/terminalProfileMacOs.${emitted ? "js" : "ts"}`,
    import.meta.url,
  ).href,
  {
    namedExports: {
      createMacOsTerminalProfileDetectors: () => [
        { id: "synthetic-provider", platforms: ["linux"], detect: () => external },
      ],
    },
  },
);
const { createTerminalService }: typeof import("../src/terminal/terminalService.js") = await import(
  new URL(
    `../${emitted ? "dist" : "src"}/terminal/terminalService.${emitted ? "js" : "ts"}`,
    import.meta.url,
  ).href
);
function service() {
  return createTerminalService({
    settingService: {
      get: async () => {
        if (settingsError) throw settingsError;
        return settings;
      },
    } as ISettingService,
  }) as ReturnType<typeof createTerminalService> & { disposeAll(): void };
}

test("actual service create forwards detected font and releases only the fake PTY", async (t) => {
  raw = '{"terminal.integrated.fontFamily":"Consumer System",}';
  const s = service();
  t.after(() => s.disposeAll());
  const result = await s.create({ cols: 91, rows: 27, cwd: root });
  assert.match(result.fontFamily, /^Consumer System, ui-monospace,/);
  assert.equal(result.fontFamilySource, "system");
  assert.equal(result.shell, shell);
  assert.equal(result.id, "0");
  assert.deepEqual(reads, [settingsPath]);
  assert.equal(spawns.length, 1);
  assert.equal(spawns[0]!.executable, shell);
  assert.deepEqual(spawns[0]!.args, []);
  assert.equal(spawns[0]!.options.cwd, root);
  await s.dispose({ id: result.id });
  assert.equal(kills, 1);
});
test("actual service keeps custom font while forwarding unchanged provider size and theme", async (t) => {
  const theme = { background: "#010203", brightBlue: "#abc123", cursorAccent: "transparent" };
  external = { fontFamily: "Provider", fontSize: 15.5, theme };
  settings = { terminalFontFamily: " Consumer Custom " };
  const s = service();
  t.after(() => s.disposeAll());
  const result = await s.create({ cols: 80, rows: 24, cwd: root });
  assert.match(result.fontFamily, /^Consumer Custom, ui-monospace,/);
  assert.equal(result.fontFamilySource, "custom");
  assert.equal(result.fontSize, 15.5);
  assert.strictEqual(result.theme, theme);
  assert.equal(spawns.length, 1);
});
test("actual service settings failure retains inherited detection and sees later config changes", async (t) => {
  settingsError = new Error("synthetic setting read failure");
  raw = '{"terminal.integrated.fontFamily":"First Consumer"}';
  const s = service();
  t.after(() => s.disposeAll());
  const first = await s.create({ cols: 80, rows: 24, cwd: root });
  raw = '{"terminal.integrated.fontFamily":"Second Consumer"}';
  const second = await s.create({ cols: 80, rows: 24, cwd: root });
  assert.match(first.fontFamily, /^First Consumer,/);
  assert.match(second.fontFamily, /^Second Consumer,/);
  assert.equal(first.fontFamilySource, "system");
  assert.equal(second.fontFamilySource, "system");
  assert.equal(spawns.length, 2);
});
