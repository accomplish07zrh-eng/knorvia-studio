import assert from "node:assert/strict";
import { test } from "node:test";
import { listIntegratedTerminalShellOptions } from "../src/system/integratedTerminalShells.js";
test("synthetic shell permission port never probes CMD and stops after first executable Git root", () => {
  const probes: string[] = [];
  const options = listIntegratedTerminalShellOptions({
    platform: "win32",
    env: {
      cOmSpEc: " C:\\Synthetic\\cmd.exe ",
      PaTh: "C:\\First\\cmd;C:\\Second\\cmd",
      pAtHeXt: ".EXE",
    },
    isExecutable: (path) => {
      probes.push(path);
      return path.endsWith("First\\cmd\\git.exe");
    },
  });
  assert.deepEqual(options, [
    {
      dialect: "cmd",
      id: "cmd:C:\\Synthetic\\cmd.exe",
      label: "CMD",
      path: "C:\\Synthetic\\cmd.exe",
      source: "system",
    },
  ]);
  assert.equal(probes.includes("C:\\Synthetic\\cmd.exe"), false);
  assert.equal(
    probes.some((path) => path.includes("Second")),
    false,
  );
  const failure = new Error("synthetic authorization failure");
  assert.throws(
    () =>
      listIntegratedTerminalShellOptions({
        platform: "win32",
        env: {},
        isExecutable: () => {
          throw failure;
        },
      }),
    (error) => error === failure,
  );
  assert.deepEqual(
    listIntegratedTerminalShellOptions({
      platform: "linux",
      env: {},
      isExecutable: () => {
        throw failure;
      },
    }),
    [],
  );
});
