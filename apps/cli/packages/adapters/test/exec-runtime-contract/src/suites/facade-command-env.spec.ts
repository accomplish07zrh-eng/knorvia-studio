// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import { contractCase } from "../harness/contract-case.js";

const PUBLIC_EXPORTS = [
  "NodeExecutionAdapter",
  "applyResolvedShellCommandForTest",
  "buildExecutionEnv",
  "createNodeExecutionAdapter",
  "decodeExecutionOutputBuffer",
  "resolveEffectiveBashShellSelection",
  "resolveExecutionCommand",
  "setResolvedShellLoginMode",
];

contractCase(
  "API-01 facade is exact and bundle inputs remain closed",
  {},
  async ({ audit, facade }) => {
    assert.deepEqual(Object.keys(facade).sort(), PUBLIC_EXPORTS);
    assert.ok(audit.inputs.length > 0);
    assert.ok(
      audit.inputs.every(
        (input) => input.includes("closed-exec-seam:") || input.startsWith(audit.root),
      ),
    );
    assert.ok(audit.externalImports.every((dependency) => dependency.startsWith("node:")));
  },
);

contractCase(
  "API-02 class and factory expose the public port",
  {},
  async ({ createAdapter, facade }) => {
    const { adapter } = createAdapter();
    assert.equal(typeof adapter.run, "function");
    assert.equal(typeof adapter.start, "function");
    assert.equal(typeof adapter.close, "function");
    const port = facade.createNodeExecutionAdapter({
      outputRootDir: "/virtual/output",
      platform: "linux",
      processEnv: {},
    });
    assert.equal(typeof port.run, "function");
    assert.equal(typeof port.close, "function");
    await port.close?.();
  },
);

contractCase(
  "ENV-01 inherited env is sanitized before unset and final set",
  { env: { KEEP: "base", KNORVIA_RUNTIME_SECRET: "remove", LC_ALL: "C", REMOVE: "yes" } },
  async ({ facade, world }) => {
    const env = facade.buildExecutionEnv(
      { set: { KEEP: "request", KNORVIA_RUNTIME_SECRET: "explicit" }, unset: ["REMOVE"] },
      { platform: "linux", processEnv: world.process.env },
    );
    assert.equal(env.KEEP, "request");
    assert.equal(env.REMOVE, undefined);
    assert.equal(env.KNORVIA_RUNTIME_SECRET, "explicit");
    assert.equal(env.PYTHONIOENCODING, "utf-8");
    assert.equal(env.PYTHONUTF8, "1");
    assert.equal(world.retainedCalls.filter((call) => call.name.includes("sanitize")).length, 1);
  },
);

contractCase(
  "ENV-02 empty base excludes inherited network values and applies policy",
  { env: { HTTP_PROXY: "http://inherited.invalid", KEEP: "drop" } },
  async ({ facade, world }) => {
    const env = facade.buildExecutionEnv(
      { base: "empty" },
      {
        network: { httpProxy: "http://fixture.proxy", noProxy: "localhost" },
        platform: "linux",
        processEnv: world.process.env,
      },
    );
    assert.equal(env.KEEP, undefined);
    assert.equal(env.HTTP_PROXY, "http://fixture.proxy");
    assert.equal(env.HTTPS_PROXY, "http://fixture.proxy");
    assert.equal(env.NO_PROXY, "localhost");
  },
);

contractCase(
  "ENV-04 Windows overlay operations fold key casing",
  { env: { Path: "C:\\base", mixed: "old" }, platform: "win32" },
  async ({ facade, world }) => {
    const env = facade.buildExecutionEnv(
      { set: { MIXED: "new", PATH: "C:\\request" }, unset: ["mIxEd"] },
      { platform: "win32", processEnv: world.process.env },
    );
    const pathKeys = Object.keys(env).filter((key) => key.toUpperCase() === "PATH");
    const mixedKeys = Object.keys(env).filter((key) => key.toUpperCase() === "MIXED");
    assert.equal(pathKeys.length, 1);
    assert.equal(env[pathKeys[0] ?? ""], "C:\\request");
    assert.equal(mixedKeys.length, 1);
    assert.equal(env[mixedKeys[0] ?? ""], "new");
  },
);

contractCase("ARG-01 POSIX argv remains shell-free and ordered", {}, async ({ facade }) => {
  const resolved = facade.resolveExecutionCommand(
    { args: ["alpha", "two words", "$literal"], file: "/virtual/bin/tool", mode: "argv" },
    { cwd: "/virtual/workspace", env: {}, platform: "linux" },
  );
  assert.equal(resolved.file, "/virtual/bin/tool");
  assert.deepEqual(resolved.args, ["alpha", "two words", "$literal"]);
  assert.equal(resolved.shell, false);
  assert.equal(resolved.cwdDialect, "posix");
});

contractCase(
  "ARG-05 Windows cmd shim routes through ComSpec with quoted argv",
  { platform: "win32" },
  async ({ facade }) => {
    const checked: string[] = [];
    const resolved = facade.resolveExecutionCommand(
      { args: ["two words", "x&y", 'quote"value'], file: "runner", mode: "argv" },
      {
        cwd: "C:\\work",
        env: { ComSpec: "C:\\Windows\\System32\\cmd.exe", Path: "C:\\bin", PATHEXT: ".EXE;.CMD" },
        exists: (path) => {
          checked.push(path);
          return path.toLowerCase() === "c:\\bin\\runner.cmd";
        },
        platform: "win32",
      },
    );
    assert.equal(resolved.file, "C:\\Windows\\System32\\cmd.exe");
    assert.deepEqual(resolved.args.slice(0, 3), ["/d", "/s", "/c"]);
    assert.match(resolved.args[3] ?? "", /runner\.cmd/iu);
    assert.match(resolved.args[3] ?? "", /two words/u);
    assert.ok(checked.some((path) => path.toLowerCase().endsWith("runner.cmd")));
  },
);

contractCase(
  "ARG-06 Windows executable with an extension is not PATHEXT-expanded",
  { platform: "win32" },
  async ({ facade }) => {
    const checked: string[] = [];
    const resolved = facade.resolveExecutionCommand(
      { args: ["x"], file: "native.exe", mode: "argv" },
      {
        cwd: "C:\\work",
        env: { Path: "C:\\bin", PATHEXT: ".CMD" },
        exists: (path) => {
          checked.push(path);
          return true;
        },
        platform: "win32",
      },
    );
    assert.equal(resolved.shell, false);
    assert.equal(
      checked.some((path) => path.toLowerCase().endsWith("native.exe.cmd")),
      false,
    );
  },
);

contractCase(
  "SHP-01 reviewed snapshot selection is preserved when path is missing",
  {},
  async ({ facade }) => {
    const selection = {
      dialect: "git-bash" as const,
      display: { name: "Recorded Bash" },
      source: "auto-detected" as const,
    };
    const result = facade.resolveEffectiveBashShellSelection({
      env: {},
      exists: () => false,
      override: selection,
      platform: "win32",
    });
    assert.deepEqual(result.selection, selection);
    assert.equal(result.provider, undefined);
  },
);

contractCase(
  "SHP-03 POSIX prefers configured bash and applies provider semantics",
  {},
  async ({ facade }) => {
    const result = facade.resolveEffectiveBashShellSelection({
      env: { SHELL: "/opt/fixture/bash" },
      exists: (path) => path === "/opt/fixture/bash",
      platform: "linux",
    });
    assert.equal(result.provider?.file, "/opt/fixture/bash");
    assert.equal(result.provider?.shell, false);
    assert.equal(result.provider?.dialect, "posix");
  },
);

contractCase("ARG-08 shell replacement preserves login-mode state", {}, async ({ facade }) => {
  const resolved = facade.setResolvedShellLoginMode(
    {
      args: ["-c", "echo first"],
      cwdDialect: "posix",
      file: "/bin/bash",
      shell: false,
      usesLoginShell: true,
    },
    true,
  );
  const loginReplaced = facade.applyResolvedShellCommandForTest(resolved, "echo second");
  const nonLogin = facade.setResolvedShellLoginMode(resolved, false);
  const nonLoginReplaced = facade.applyResolvedShellCommandForTest(nonLogin, "echo third");
  assert.equal(loginReplaced.usesLoginShell, true);
  assert.match(loginReplaced.args.join(" "), /echo second/u);
  assert.equal(loginReplaced.args.includes("-l"), true);
  assert.equal(nonLogin.args.includes("-l"), false);
  assert.match(nonLoginReplaced.args.join(" "), /echo third/u);
  assert.equal(nonLoginReplaced.args.includes("-l"), false);
});

contractCase(
  "ENC-01 complete valid UTF-8 wins over legacy fallback",
  {},
  async ({ facade, world }) => {
    world.legacyDecodedText = "wrong-decoder";
    assert.equal(
      facade.decodeExecutionOutputBuffer(Buffer.from("雪山", "utf8"), "gb18030"),
      "雪山",
    );
  },
);
