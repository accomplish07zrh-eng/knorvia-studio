// Frozen guards for retained native-helper behavior; all permission/process/filesystem ports are fake.
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { after, beforeEach, mock, test } from "node:test";
import type { ISettingService } from "../src/setting/setting.js";

const emitted = process.env.KNORVIA_TERMINAL_PLAN_TARGET === "dist";
const root = resolve("synthetic-terminal-plan-helper-owned");
const shell = join(root, "bin", "owned-shell");
const rawModule = join(root, "app.asar", "node_modules.asar", "node-pty", "lib", "unixTerminal.js");
const helper = join(
  root,
  "app.asar.unpacked",
  "node_modules.asar.unpacked",
  "node-pty",
  "lib",
  "owned-native",
  "spawn-helper",
);
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const originalEnv = process.env;
let present: boolean;
let executable: boolean;
let discoveryError: boolean;
let repairError: unknown;
let recheckError: unknown;
let discovery: string[];
let existence: string[];
let helperAccesses: string[];
let repairs: Array<{ path: string; mode: number }>;
let spawns: number;
let sequence = 0;
beforeEach(() => {
  process.env = {
    ...(originalEnv.NODE_TEST_CONTEXT ? { NODE_TEST_CONTEXT: originalEnv.NODE_TEST_CONTEXT } : {}),
    HOME: root,
    SHELL: shell,
    PATH: join(root, "bin"),
    KNORVIA_ENV: "test",
    KNORVIA_DATA_BASE_DIR: root,
    KNORVIA_STORAGE_DIR: join(root, "cli"),
  };
  Object.defineProperty(process, "platform", { ...originalPlatform, value: "darwin" });
  present = true;
  executable = true;
  discoveryError = false;
  repairError = undefined;
  recheckError = undefined;
  discovery = [];
  existence = [];
  helperAccesses = [];
  repairs = [];
  spawns = 0;
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
      if (path === shell) return;
      assert.equal(path, helper);
      helperAccesses.push(path);
      if (repairs.length && recheckError !== undefined) throw recheckError;
      if (!executable) throw new Error("owned helper access denied");
    },
    statSync: (path: string) => {
      assert.equal(path, root);
      return { isDirectory: () => true };
    },
    existsSync: (path: string) => {
      assert.equal(path, helper);
      existence.push(path);
      return present;
    },
    chmodSync: (path: string, mode: number) => {
      assert.equal(path, helper);
      assert.equal(mode, 0o755);
      repairs.push({ path, mode });
      if (repairError !== undefined) throw repairError;
      executable = true;
    },
    readFileSync: () => assert.fail("no real profile/helper file reads"),
  },
});
mock.module("node:os", { namedExports: { homedir: () => root, release: () => "owned-release" } });
mock.module("node:module", {
  namedExports: {
    createRequire: () =>
      Object.assign(
        (id: string) => {
          assert.equal(id, "node-pty/lib/utils");
          discovery.push(id);
          if (discoveryError) throw new Error("owned discovery failure");
          return {
            loadNativeModule: (name: string) => {
              assert.equal(name, "pty");
              discovery.push(name);
              return { dir: "owned-native" };
            },
          };
        },
        {
          resolve: (id: string) => {
            assert.equal(id, "node-pty/lib/unixTerminal.js");
            discovery.push(id);
            return rawModule;
          },
        },
      ),
  },
});
mock.module("node:child_process", {
  namedExports: {
    execFileSync: () => assert.fail("no actual commands"),
    spawn: () => assert.fail("no real process launch"),
  },
});
mock.module("node-pty", {
  namedExports: {
    spawn: () => {
      spawns++;
      return {
        onData: () => {},
        onExit: () => {},
        kill: () => {},
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
      resolveTerminalFontProfile: () => ({ fontFamily: "Owned profile", source: "fallback" }),
    },
  },
);
async function service(t: { after(fn: () => void): void }) {
  // Each query isolates retained module-level helper flags, without adding a production reset API.
  const target = new URL(
    `../${emitted ? "dist" : "src"}/terminal/terminalService.${emitted ? "js" : "ts"}`,
    import.meta.url,
  );
  target.searchParams.set("ownedHelperGuard", String(sequence++));
  const { createTerminalService }: typeof import("../src/terminal/terminalService.js") =
    await import(target.href);
  const s = createTerminalService({
    settingService: {
      get: async () => ({ terminalInheritSystemProfile: false }),
    } as ISettingService,
  }) as ReturnType<typeof createTerminalService> & { disposeAll(): void };
  t.after(() => s.disposeAll());
  return s;
}
const create = (s: Awaited<ReturnType<typeof service>>) =>
  s.create({ cols: 80, rows: 24, cwd: root });

test("retained helper discovery rewrites both archives, accepts X_OK and checks only once", async (t) => {
  const s = await service(t);
  await create(s);
  await create(s);
  assert.deepEqual(discovery, ["node-pty/lib/utils", "pty", "node-pty/lib/unixTerminal.js"]);
  assert.deepEqual(existence, [helper]);
  assert.deepEqual(helperAccesses, [helper]);
  assert.deepEqual(repairs, []);
  assert.equal(spawns, 2);
});
test("retained helper repair records fake 0755 and rechecks before fake spawn", async (t) => {
  executable = false;
  const s = await service(t);
  await create(s);
  assert.deepEqual(repairs, [{ path: helper, mode: 0o755 }]);
  assert.deepEqual(helperAccesses, [helper, helper]);
  assert.equal(spawns, 1);
});
test("retained helper chmod failure keeps exact error and one-time flag behavior", async (t) => {
  executable = false;
  repairError = new Error("owned repair failure");
  const s = await service(t);
  await assert.rejects(create(s), {
    message: `node-pty spawn-helper is not executable: ${helper}. owned repair failure`,
  });
  assert.equal(spawns, 0);
  assert.deepEqual(repairs, [{ path: helper, mode: 0o755 }]);
  await create(s);
  assert.equal(spawns, 1);
  assert.equal(repairs.length, 1);
  assert.equal(existence.length, 1);
});
test("retained helper recheck failure wraps a non-Error and never spawns", async (t) => {
  executable = false;
  recheckError = "owned recheck failure";
  const s = await service(t);
  await assert.rejects(create(s), {
    message: `node-pty spawn-helper is not executable: ${helper}. owned recheck failure`,
  });
  assert.equal(spawns, 0);
  assert.deepEqual(helperAccesses, [helper, helper]);
  assert.equal(repairs.length, 1);
});
test("retained missing helper does not repair and is not reprobed later", async (t) => {
  present = false;
  const s = await service(t);
  await create(s);
  present = true;
  executable = false;
  await create(s);
  assert.deepEqual(existence, [helper]);
  assert.deepEqual(helperAccesses, []);
  assert.deepEqual(repairs, []);
  assert.equal(spawns, 2);
});
test("retained discovery failure silently skips helper with no permission calls", async (t) => {
  discoveryError = true;
  const s = await service(t);
  await create(s);
  discoveryError = false;
  await create(s);
  assert.deepEqual(discovery, ["node-pty/lib/utils"]);
  assert.deepEqual(existence, []);
  assert.deepEqual(repairs, []);
  assert.equal(spawns, 2);
});
test("non-Darwin create does not consume the later Darwin helper check", async (t) => {
  Object.defineProperty(process, "platform", { ...originalPlatform, value: "linux" });
  const s = await service(t);
  await create(s);
  assert.deepEqual(discovery, []);
  Object.defineProperty(process, "platform", { ...originalPlatform, value: "darwin" });
  executable = false;
  await create(s);
  assert.deepEqual(repairs, [{ path: helper, mode: 0o755 }]);
  assert.equal(spawns, 2);
});
