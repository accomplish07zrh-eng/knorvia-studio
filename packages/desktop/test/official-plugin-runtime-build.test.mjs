import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import {
  buildOfficialPluginRuntimes,
  officialPluginPackages,
} from "../scripts/official-plugin-staging.mjs";

const fixturePrefix = "knorvia-runtime-build-";

function createCompleteRuntimeFixture(t) {
  const tempRoot = resolve(tmpdir());
  const repoRoot = mkdtempSync(join(tempRoot, fixturePrefix));
  t.after(() => {
    // Only remove the freshly created direct child of the OS temporary directory.
    assert.equal(dirname(resolve(repoRoot)), tempRoot);
    assert.ok(basename(repoRoot).startsWith(fixturePrefix));
    rmSync(repoRoot, { recursive: true, force: true });
  });
  for (const plugin of officialPluginPackages) {
    for (const relativePath of plugin.requiredRuntimePaths ?? []) {
      const runtimePath = resolve(repoRoot, plugin.relativePath, ...relativePath.split("/"));
      mkdirSync(dirname(runtimePath), { recursive: true });
      writeFileSync(runtimePath, "existing runtime fixture\n");
    }
  }
  return repoRoot;
}

function recordBootstrapBuild(repoRoot, env) {
  const calls = [];
  buildOfficialPluginRuntimes({
    repoRoot,
    env,
    isBootstrapWithRemote: true,
    // Never spawn a compiler, driver staging script, package manager, or downloader.
    runCommand(command, args, options) {
      calls.push({ command, args: [...args], options });
    },
  });
  return calls;
}

test("bootstrap rebuilds the node_repl host even when every runtime asset already exists", (t) => {
  const repoRoot = createCompleteRuntimeFixture(t);
  const host = officialPluginPackages.find(
    (plugin) => plugin.packageName === "@knorvia/node-repl-host",
  );
  assert.ok(host);
  const hostRoot = resolve(repoRoot, host.relativePath);
  for (const relativePath of host.requiredRuntimePaths) {
    assert.ok(existsSync(resolve(hostRoot, relativePath)));
  }
  const env = { KNORVIA_TEST_BOOTSTRAP_ENV: "explicit-host-build-environment" };
  const calls = recordBootstrapBuild(repoRoot, env);
  const hostCalls = calls.filter(({ options }) => options.cwd === hostRoot);

  assert.deepEqual(
    hostCalls.map(({ command, args }) => ({ command, args })),
    [
      { command: process.execPath, args: ["../../node_modules/typescript/bin/tsc"] },
      { command: process.execPath, args: [host.runtimeBuildScript] },
    ],
  );
  for (const { options } of hostCalls) assert.strictEqual(options.env, env);
  assert.equal(
    readFileSync(resolve(hostRoot, "dist/mcp/server.js"), "utf8"),
    "existing runtime fixture\n",
  );
});

test(
  "Windows bootstrap passes the explicit offline CUA archive environment to driver staging",
  {
    skip: process.platform !== "win32",
  },
  (t) => {
    const repoRoot = createCompleteRuntimeFixture(t);
    const cua = officialPluginPackages.find(
      (plugin) => plugin.packageName === "@knorvia/cua-plugin",
    );
    assert.ok(cua?.requiresRuntime);
    const archivePath = resolve(repoRoot, "offline cache", "cua-driver binary.zip");
    mkdirSync(dirname(archivePath), { recursive: true });
    writeFileSync(archivePath, "offline archive fixture; never executed\n");
    const env = {
      KNORVIA_CUA_DRIVER_ARCHIVE: archivePath,
      KNORVIA_TEST_BOOTSTRAP_ENV: "explicit-cua-build-environment",
    };
    const calls = recordBootstrapBuild(repoRoot, env);
    const cuaCalls = calls.filter(
      ({ options }) => options.cwd === resolve(repoRoot, cua.relativePath),
    );

    assert.equal(cuaCalls.length, 1);
    assert.equal(cuaCalls[0].command, process.execPath);
    assert.deepEqual(cuaCalls[0].args, [cua.runtimeBuildScript]);
    assert.strictEqual(cuaCalls[0].options.env, env);
    assert.equal(cuaCalls[0].options.env.KNORVIA_CUA_DRIVER_ARCHIVE, archivePath);
    assert.ok(calls.every(({ command }) => command !== "pnpm"));
  },
);
