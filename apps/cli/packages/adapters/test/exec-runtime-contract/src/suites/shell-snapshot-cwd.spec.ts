// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import { bashRequest, contractCase } from "../harness/contract-case.js";

function spawnedCommand(spawn: { args: readonly string[]; file: string }): string {
  return [spawn.file, ...spawn.args].join(" ");
}

function capturedPath(command: string): string {
  const normalized = command.replaceAll("\\", "/");
  const candidates = normalized.match(/\/virtual\/tmp\/[A-Za-z0-9._/-]+/gu) ?? [];
  const selected = candidates.find((candidate) => candidate.length > "/virtual/tmp/".length);
  assert.ok(selected, `cwd wrapper should reference a unique fixture temp path: ${command}`);
  return selected.replace(/[)'";]+$/u, "");
}

function startupScriptContent(context: {
  world: { fileSystem: { paths(): string[]; text(path: string): string } };
}): string {
  const path = context.world.fileSystem
    .paths()
    .find((candidate) => candidate.includes("/bash-startup/") && candidate.endsWith(".sh"));
  assert.ok(path, "Bash startup source must be materialized in the owned filesystem");
  return context.world.fileSystem.text(path);
}

contractCase(
  "SNP-03 usable shell snapshot disables login mode and is sourced",
  { env: { SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    context.world.execFileDefault = { stderr: "", stdout: "alias fixture_alias='echo fixture'\n" };
    const { adapter } = context.createAdapter();
    const resultPromise = context.track(adapter.run(bashRequest()));
    const spawn = await context.world.waitForSpawn();
    const command = spawnedCommand(spawn);
    assert.equal(spawn.file, "/bin/bash");
    assert.equal(spawn.args.includes("-l"), false);
    assert.match(command, /shell-init|\.sh/iu);
    await spawn.child.emitSpawn();
    spawn.child.finish(0);
    assert.equal((await resultPromise).status, "completed");
  },
);

contractCase(
  "SNP-04 snapshot creation is cached once for one adapter and shell key",
  { env: { SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    context.world.execFileDefault = { stderr: "", stdout: "export FIXTURE=1\n" };
    const { adapter } = context.createAdapter();
    const firstResult = context.track(adapter.run(bashRequest()));
    const firstSpawn = await context.world.waitForSpawn(0);
    await firstSpawn.child.emitSpawn();
    firstSpawn.child.finish(0);
    await firstResult;
    const secondResult = context.track(
      adapter.run(
        bashRequest({
          command: { command: "echo second", mode: "shell", shellProfile: "posix-bash" },
        }),
      ),
    );
    const secondSpawn = await context.world.waitForSpawn(1);
    await secondSpawn.child.emitSpawn();
    secondSpawn.child.finish(0);
    await secondResult;
    assert.equal(context.world.execFileCalls.length, 1);
  },
);

contractCase(
  "SNP-05 snapshot failure falls back to login shell",
  { env: { SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    context.world.execFileDefault = new Error("fixture snapshot failure");
    const { adapter } = context.createAdapter();
    const resultPromise = context.track(adapter.run(bashRequest()));
    const spawn = await context.world.waitForSpawn();
    assert.equal(spawn.args.includes("-l"), true);
    await spawn.child.emitSpawn();
    spawn.child.finish(0);
    assert.equal((await resultPromise).status, "completed");
  },
);

contractCase(
  "SHP-05 user-config shell selection uses its chosen executable",
  { platform: "win32" },
  async (context) => {
    context.world.fileSystem.writeFileSync("C:\\custom\\bash.exe", "fixture");
    const { adapter } = context.createAdapter();
    const request = bashRequest({
      command: {
        command: "echo user shell",
        mode: "shell",
        shellOverride: {
          dialect: "git-bash",
          display: { name: "User Bash" },
          path: "C:\\custom\\bash.exe",
          source: "user-config",
        },
        shellProfile: "posix-bash",
      },
    });
    const resultPromise = context.track(adapter.run(request));
    const spawn = await context.world.waitForSpawn();
    assert.equal(spawn.file, "C:\\custom\\bash.exe");
    await spawn.child.emitSpawn();
    spawn.child.finish(0);
    assert.equal((await resultPromise).status, "completed");
  },
);

contractCase(
  "PRE-02 embedded-search backend is quoted into Bash-only prelude",
  { env: { SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    const { adapter } = context.createAdapter();
    const request = bashRequest({
      bashPrelude: {
        backend: {
          args: ["--root", "two words", "$(must-not-execute)"],
          command: "/virtual/bin/search tool",
          env: { FIXTURE_VALUE: "quote'value" },
          kind: "internal-cli",
        },
        kind: "embedded-search",
      },
    });
    const resultPromise = context.track(adapter.run(request));
    const spawn = await context.world.waitForSpawn();
    const command = spawnedCommand(spawn);
    assert.match(command, /bash-startup|\.sh/iu);
    const prelude = startupScriptContent(context);
    assert.match(prelude, /find\s*\(\)/iu);
    assert.match(prelude, /grep\s*\(\)/iu);
    assert.doesNotMatch(prelude, /rg\s*\(\)|function\s+rg/iu);
    assert.match(prelude, /search tool/u);
    assert.match(prelude, /must-not-execute/u);
    await spawn.child.emitSpawn();
    spawn.child.finish(0);
    assert.equal((await resultPromise).status, "completed");
  },
);

contractCase(
  "PRE-04 disabling find/grep wrappers retains rg fallback only",
  { env: { SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    const { adapter } = context.createAdapter();
    const resultPromise = context.track(
      adapter.run(
        bashRequest({
          bashPrelude: {
            backend: { args: [], command: "/virtual/bin/search", kind: "argv0-dispatch" },
            findAndGrepEnabled: false,
            kind: "embedded-search",
          },
        }),
      ),
    );
    const spawn = await context.world.waitForSpawn();
    const command = spawnedCommand(spawn);
    assert.match(command, /bash-startup|\.sh/iu);
    const prelude = startupScriptContent(context);
    assert.match(prelude, /rg\s*\(\)|function\s+rg/iu);
    assert.doesNotMatch(prelude, /function\s+(?:find|grep)|(?:find|grep)\s*\(\)/iu);
    await spawn.child.emitSpawn();
    spawn.child.finish(0);
    await resultPromise;
  },
);

contractCase(
  "PRE-05 generic shell callers cannot receive embedded prelude",
  {},
  async (context) => {
    const { adapter } = context.createAdapter();
    const resultPromise = context.track(
      adapter.run({
        bashPrelude: {
          backend: { args: [], command: "/virtual/bin/search", kind: "internal-cli" },
          kind: "embedded-search",
        },
        command: { command: "echo generic", mode: "shell", shell: true },
        cwd: "/virtual/workspace",
      }),
    );
    const spawn = await context.world.waitForSpawn();
    assert.doesNotMatch(spawnedCommand(spawn), /virtual\/bin\/search/u);
    await spawn.child.emitSpawn();
    spawn.child.finish(0);
    await resultPromise;
  },
);

contractCase(
  "CWD-03 successful shell run returns canonical cwd and deletes capture",
  {},
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/sh", "fixture");
    context.world.fileSystem.mkdirSync("/virtual/next");
    const { adapter } = context.createAdapter();
    const resultPromise = context.track(
      adapter.run({
        captureCwdAfterSuccess: true,
        command: { command: "cd /virtual/next", mode: "shell", shell: "/bin/sh" },
        cwd: "/virtual/workspace",
      }),
    );
    const spawn = await context.world.waitForSpawn();
    const capture = capturedPath(spawnedCommand(spawn));
    context.world.fileSystem.writeFileSync(capture, "/virtual/next\n");
    await spawn.child.emitSpawn();
    spawn.child.finish(0);
    const result = await resultPromise;
    assert.equal(result.resolvedCwd, "/virtual/next");
    assert.equal(context.world.fileSystem.existsSync(capture), false);
  },
);

contractCase("CWD-04 nonzero shell result never applies captured cwd", {}, async (context) => {
  context.world.fileSystem.writeFileSync("/bin/sh", "fixture");
  context.world.fileSystem.mkdirSync("/virtual/next");
  const { adapter } = context.createAdapter();
  const resultPromise = context.track(
    adapter.run({
      captureCwdAfterSuccess: true,
      command: { command: "exit 7", mode: "shell", shell: "/bin/sh" },
      cwd: "/virtual/workspace",
    }),
  );
  const spawn = await context.world.waitForSpawn();
  const command = spawnedCommand(spawn);
  assert.match(command, /if \[ "\$__knorvia_status" -eq 0 \]; then pwd -P >/u);
  const capture = capturedPath(command);
  await spawn.child.emitSpawn();
  spawn.child.finish(7);
  const result = await resultPromise;
  assert.equal(result.resolvedCwd, undefined);
  assert.equal(context.world.fileSystem.existsSync(capture), false);
});
