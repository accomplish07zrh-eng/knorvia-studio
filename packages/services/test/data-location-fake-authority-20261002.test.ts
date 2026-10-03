import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { join } from "node:path";

const priorEnvironment = process.env;
process.env = {
  KNORVIA_DATA_BASE_DIR: " /synthetic/captured-base ",
  KNORVIA_HOME: " /synthetic/captured-root ",
  HOME: "   ",
};
let homeCalls = 0;
let copyFailure: unknown;
const inspected: string[] = [];
mock.module("node:os", {
  namedExports: {
    homedir: () => {
      homeCalls++;
      return "/synthetic/default-home";
    },
  },
});
mock.module("node:fs", {
  namedExports: {
    lstatSync: (source: string) => {
      assert.ok(source.startsWith("/synthetic/"));
      inspected.push(source);
      if (source.endsWith("/vanished")) throw new Error("synthetic vanished file");
      return { isSymbolicLink: () => source.endsWith("/link") };
    },
  },
});
mock.module("node:fs/promises", {
  namedExports: {
    cp: async (
      source: string,
      destination: string,
      options: { recursive: boolean; force: boolean; filter: (path: string) => boolean },
    ) => {
      assert.equal(source, join("/synthetic/old", ".knorvia-studio", "v2"));
      assert.equal(destination, join("/synthetic/new", ".knorvia-studio", "v2"));
      assert.equal(options.recursive, true);
      assert.equal(options.force, false);
      if (copyFailure) throw copyFailure;
      assert.equal(options.filter("/synthetic/setting.json"), false);
      assert.equal(options.filter("/synthetic/nested/setting.json.lock"), false);
      assert.equal(options.filter("/synthetic/setting.json.transient.tmp"), false);
      assert.deepEqual(inspected, []);
      assert.equal(options.filter("/synthetic/link"), false);
      assert.equal(options.filter("/synthetic/vanished"), true);
      assert.equal(options.filter("/synthetic/Setting.json"), true);
      assert.equal(options.filter("/synthetic/payload"), true);
    },
  },
});
const paths = await import("../src/paths.js");

test("synthetic data-location ports preserve captured priorities, identity, Windows boundary and copy failure", async () => {
  try {
    assert.equal(homeCalls, 1);
    assert.equal(paths.getDataBaseDir(), "/synthetic/captured-base");
    assert.equal(
      paths.getKnorviaDataRootDir(),
      join("/synthetic/captured-base", ".knorvia-studio"),
    );
    process.env.KNORVIA_DATA_BASE_DIR = "/synthetic/changed-base";
    process.env.HOME = "/synthetic/changed-home";
    paths.setDataBaseDir(" /synthetic/override ");
    assert.equal(paths.getDataBaseDir(), "/synthetic/override");
    paths.setDataBaseDir("   ");
    assert.equal(paths.getDataBaseDir(), "/synthetic/captured-base");
    assert.equal(
      paths.getWorkspaceHash("/synthetic/one", " shared-synthetic "),
      paths.getWorkspaceHash("/synthetic/two", "shared-synthetic"),
    );
    assert.notEqual(
      paths.getWorkspaceHash("/synthetic/one"),
      paths.getWorkspaceHash("/synthetic/two"),
    );
    assert.deepEqual(
      paths.validateDataBaseDirTarget("C:\\Synthetic\\Knorvia Studio\\data", {
        platform: "win32",
        env: { programfiles: "C:\\Synthetic" },
      }),
      {
        ok: false,
        code: "DATA_BASE_DIR_FORBIDDEN_WINDOWS_INSTALL_DIR",
        forbiddenDir: "C:\\Synthetic\\Knorvia Studio",
      },
    );
    assert.deepEqual(
      paths.validateDataBaseDirTarget("C:\\Synthetic\\Knorvia Studio Other", {
        platform: "win32",
        env: { ProgramFiles: "C:\\Synthetic" },
      }),
      { ok: true },
    );
    await paths.copyDataDirectory("/synthetic/old", "/synthetic/new");
    copyFailure = new Error("synthetic copy failure");
    await assert.rejects(
      paths.copyDataDirectory("/synthetic/old", "/synthetic/new"),
      (error) => error === copyFailure,
    );
  } finally {
    paths.setDataBaseDir(null);
    process.env = priorEnvironment;
  }
});
