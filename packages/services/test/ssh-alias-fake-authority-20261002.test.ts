import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { join, sep } from "node:path";
import { mock, test } from "node:test";
import { fakeFsPath } from "./fake-native-paths-20261003.js";

const priorEnvironment = process.env;
process.env = { PATH: fakeFsPath("/synthetic/bin"), SYNTHETIC_FIXTURE: "yes" };
const sshBinary = fakeFsPath(`/synthetic/bin/${process.platform === "win32" ? "ssh.exe" : "ssh"}`);
const root = fakeFsPath("/synthetic/home/.ssh/config");
let syntheticHome = fakeFsPath("/synthetic/home");
let expectedQueryRoot = root;
const firstInclude = fakeFsPath("/synthetic/home/.ssh/fragments/a.conf");
const secondInclude = fakeFsPath("/synthetic/home/.ssh/fragments/b.conf");
const files = new Map([
  [
    root,
    "User root-first\nInclude fragments/a.conf fragments/*.conf\nHostName parent-after-include\nHost beta\nPort 2222\nHost alpha\nHost multi names\nHost wildcard*\nHost !negative\nHost alpha.teleport-x.example.com\nHost *.teleport-*.example.com\nUser later\n",
  ],
  [
    firstInclude,
    'Host alpha\nPort invalid\nPort 2201tail\nIdentityFile "C:\\Synthetic\\explicit key"\nInclude ../config\n',
  ],
  [secondInclude, "Host gamma\nHostName gamma-fallback\n"],
]);
const reads: string[] = [];
const children: Array<EventEmitter & { stdout: EventEmitter; killed: number; alias: string }> = [];
let active = 0;
let maximum = 0;
let existenceFailure: unknown;
let spawnFailure: unknown;
mock.module("node:os", { namedExports: { homedir: () => syntheticHome } });
mock.module("node:fs", {
  namedExports: {
    existsSync: (path: string) => {
      assert.ok(path.startsWith(`${fakeFsPath("/synthetic")}${sep}`));
      if (path === root && existenceFailure) throw existenceFailure;
      return files.has(path) || path === sshBinary;
    },
  },
});
mock.module("node:fs/promises", {
  namedExports: {
    readFile: async (path: string, encoding: string) => {
      assert.equal(encoding, "utf8");
      assert.ok(files.has(path), `only declared synthetic configs may be read: ${path}`);
      reads.push(path);
      return files.get(path)!;
    },
    glob: async function* (pattern: string) {
      assert.equal(pattern, fakeFsPath("/synthetic/home/.ssh/fragments/*.conf"));
      yield firstInclude;
      yield secondInclude;
      throw new Error("synthetic partial glob failure");
    },
  },
});
mock.module("node:child_process", {
  namedExports: {
    spawn: (
      executable: string,
      args: string[],
      options: { stdio: string[]; windowsHide: boolean; env: NodeJS.ProcessEnv },
    ) => {
      assert.equal(executable, sshBinary);
      assert.deepEqual(args.slice(0, 5), ["-G", "-F", expectedQueryRoot, "-o", "BatchMode=yes"]);
      assert.deepEqual(options.stdio, ["ignore", "pipe", "ignore"]);
      assert.equal(options.windowsHide, true);
      assert.equal(options.env.SSH_ASKPASS_REQUIRE, "never");
      assert.equal(options.env.SSH_ASKPASS, "");
      assert.equal(options.env.DISPLAY, "");
      assert.equal(options.env.SYNTHETIC_FIXTURE, "yes");
      if (spawnFailure) throw spawnFailure;
      const alias = args[5]!;
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        killed: 0,
        alias,
        kill() {
          this.killed++;
          active--;
        },
      });
      children.push(child);
      active++;
      maximum = Math.max(maximum, active);
      if (alias !== "timeout")
        queueMicrotask(() => {
          if (alias !== "alpha")
            child.stdout.emit(
              "data",
              `hostname resolved-${alias}\nport 2300tail\nuser query-user\nidentityfile /synthetic/default-private-key\n`,
            );
          active--;
          child.emit("close", alias === "late" ? 1 : 0);
        });
      return child;
    },
  },
});
const { listSSHConfigAliasesFromLocalConfig } = await import("../src/system/sshConfigAlias.js");

test("synthetic SSH ports preserve includes, explicit key authority, stable workers, cloned cache and native failures", async () => {
  mock.timers.enable({ apis: ["Date", "setTimeout"], now: 100 });
  try {
    const options = await listSSHConfigAliasesFromLocalConfig();
    assert.deepEqual(
      options.map((option) => option.alias),
      ["alpha", "gamma", "beta", "alpha.teleport-x.example.com"],
    );
    assert.deepEqual(reads, [root, firstInclude, secondInclude]);
    assert.ok(maximum <= 3);
    assert.deepEqual(options[0], {
      alias: "alpha",
      host: "parent-after-include",
      port: 2201,
      username: "root-first",
      privateKeyPath: "C:\\Synthetic\\explicit key",
      source: firstInclude,
    });
    assert.equal(options[1]?.host, "resolved-gamma");
    assert.equal(options[1]?.privateKeyPath, undefined);
    assert.equal(options[1]?.source, secondInclude);
    options[0]!.host = "tampered";
    assert.equal((await listSSHConfigAliasesFromLocalConfig())[0]?.host, "parent-after-include");
    assert.equal(reads.length, 3);
    mock.timers.tick(30_000);
    files.set(root, "Host timeout\nHost late\n");
    const pending = listSSHConfigAliasesFromLocalConfig();
    for (let turn = 0; turn < 30 && !children.some((child) => child.alias === "timeout"); turn++)
      await Promise.resolve();
    const timeoutChild = children.find((child) => child.alias === "timeout");
    assert.ok(timeoutChild);
    mock.timers.tick(1500);
    assert.deepEqual(
      (await pending).map((option) => option.host),
      ["timeout", "late"],
    );
    assert.equal(timeoutChild.killed, 1);
    timeoutChild.emit("close", 0);
    assert.equal(timeoutChild.killed, 1);
    mock.timers.tick(28_500);
    existenceFailure = new Error("synthetic existence failure");
    await assert.rejects(
      listSSHConfigAliasesFromLocalConfig(),
      (error) => error === existenceFailure,
    );
    existenceFailure = undefined;
    files.set(root, "Host broken\n");
    spawnFailure = new Error("synthetic spawn failure");
    await assert.rejects(listSSHConfigAliasesFromLocalConfig(), (error) => error === spawnFailure);
    spawnFailure = undefined;
    syntheticHome = fakeFsPath("/synthetic/$&home");
    expectedQueryRoot = join(syntheticHome, ".ssh", "config");
    files.set(expectedQueryRoot, "Host dollar\nIdentityFile %d/key\n");
    assert.equal(
      (await listSSHConfigAliasesFromLocalConfig())[0]?.privateKeyPath,
      // IdentityFile 的文本替换保留后缀原字节；此处不能再按文件路径规范化。
      fakeFsPath("/synthetic/%dhome") + "/key",
    );
  } finally {
    mock.timers.reset();
    process.env = priorEnvironment;
  }
});
