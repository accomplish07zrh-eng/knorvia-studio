import assert from "node:assert/strict";
import { delimiter } from "node:path";
import { mock, test } from "node:test";
import { fakeFsPath } from "./fake-native-paths-20261003.js";
const probes: string[] = [];
mock.module("node:fs", {
  namedExports: {
    constants: { X_OK: 1 },
    existsSync: (path: string) =>
      path === fakeFsPath("/synthetic/denied/tool") ||
      path === fakeFsPath("/synthetic/runtime/tools/fake/rg"),
    accessSync: (path: string) => {
      probes.push(path);
      if (path !== fakeFsPath("/synthetic/runtime/tools/fake/rg"))
        throw new Error("synthetic denied");
    },
  },
});
mock.module("@knorvia/shared", {
  namedExports: {
    getRuntimeToolRuntime: () => ({
      binaryEnvVar: "SYNTHETIC_BINARY",
      bundledResourceDir: "fake",
      resolveEntrySegments: () => ["rg"],
    }),
  },
});
const { buildRuntimeToolEnvPatch } = await import("../src/runtime-tools/runtimeToolResolver.js");
test("fake executable permission rejects override before selecting runtime candidate without mutating environment", () => {
  const env = {
    SYNTHETIC_BINARY: ` ${fakeFsPath("/synthetic/denied/tool")} `,
    KNORVIA_SERVER_RUNTIME_ROOT: fakeFsPath("/synthetic/runtime"),
    PATH: fakeFsPath("/synthetic/bin"),
  };
  const before = { ...env };
  assert.deepEqual(buildRuntimeToolEnvPatch(["ripgrep"], env), {
    SYNTHETIC_BINARY: fakeFsPath("/synthetic/runtime/tools/fake/rg"),
    PATH: [env.PATH, fakeFsPath("/synthetic/runtime/tools/fake")].join(delimiter),
  });
  assert.deepEqual(probes, [
    fakeFsPath("/synthetic/denied/tool"),
    fakeFsPath("/synthetic/runtime/tools/fake/rg"),
  ]);
  assert.deepEqual(env, before);
});
