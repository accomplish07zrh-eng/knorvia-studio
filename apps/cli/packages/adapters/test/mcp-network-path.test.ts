// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { constants } from "node:fs";
import * as path from "node:path";
import test from "node:test";
import { networkFixture } from "./mcp-network.fixture.js";

for (const platform of ["win32", "linux", "darwin"] as const) {
  const paths = platform === "win32" ? path.win32 : path.posix;
  const separator = platform === "win32" ? ";" : path.delimiter;
  const executable =
    platform === "win32" ? "C:\\owned\\first\\..\\Agent\\node.exe" : "/owned/first/../Agent/node";
  const directory = paths.dirname(executable);
  const nodeName = platform === "win32" ? "node.exe" : "node";

  test(`${platform}: absent PATH creates a shallow result with the raw captured directory`, async (t) => {
    const { api, state } = await networkFixture(t, { platform, executable });
    const projected = Object.freeze({ KEEP: "owned" });
    state.project = () => projected;
    const output = api.buildMcpStdioEnv({ env: {} });
    assert.deepEqual(output, { KEEP: "owned", PATH: directory });
    assert.notEqual(output, projected);
    assert.deepEqual(projected, { KEEP: "owned" });
    assert.equal(state.access.length, 0);
  });

  test(`${platform}: a later normalized match suppresses every availability check`, async (t) => {
    const { api, state } = await networkFixture(t, { platform, executable });
    const projected = { PATH: ["owned-earlier", paths.normalize(directory)].join(separator) };
    state.project = () => projected;
    assert.equal(api.buildMcpStdioEnv({ env: {} }), projected);
    assert.equal(state.access.length, 0);
  });

  test(`${platform}: directory comparison folds case only on Windows`, async (t) => {
    const { api, state } = await networkFixture(t, { platform, executable });
    const original = paths.normalize(directory).toLowerCase();
    const projected = { PATH: original };
    state.project = () => projected;
    const output = api.buildMcpStdioEnv({ env: {} });
    if (platform === "win32") {
      assert.equal(output, projected);
      assert.equal(state.access.length, 0);
    } else {
      assert.deepEqual(output, { PATH: directory + separator + original });
      assert.deepEqual(state.access, [
        { candidate: paths.join(original, nodeName), mode: constants.X_OK },
      ]);
    }
  });

  test(`${platform}: failed probes skip empty entries but keep their original text`, async (t) => {
    const { api, state } = await networkFixture(t, { platform, executable });
    const original = ["", "owned-first", "", "owned-second", ""].join(separator);
    const projected = { PATH: original };
    state.project = () => projected;
    assert.deepEqual(api.buildMcpStdioEnv({ env: {} }), { PATH: directory + separator + original });
    assert.deepEqual(state.access, [
      { candidate: paths.join("owned-first", nodeName), mode: constants.X_OK },
      { candidate: paths.join("owned-second", nodeName), mode: constants.X_OK },
    ]);
    assert.equal(projected.PATH, original);
  });

  for (const acceptedIndex of [0, 1]) {
    test(`${platform}: accessible Node ${acceptedIndex + 1} keeps projection identity and stops probing`, async (t) => {
      const { api, state } = await networkFixture(t, { platform, executable });
      const entries = ["owned-first", "owned-second", "owned-third"];
      const projected = { PATH: entries.join(separator) };
      state.project = () => projected;
      state.available = (candidate) => candidate === paths.join(entries[acceptedIndex]!, nodeName);
      assert.equal(api.buildMcpStdioEnv({ env: {} }), projected);
      assert.deepEqual(
        state.access.map((call) => call.candidate),
        entries.slice(0, acceptedIndex + 1).map((entry) => paths.join(entry, nodeName)),
      );
    });
  }

  test(`${platform}: first own PATH spelling wins even when it is empty`, async (t) => {
    const { api, state } = await networkFixture(t, { platform, executable });
    const projected = { pAtH: "", PATH: paths.normalize(directory), OTHER: "kept" };
    state.project = () => projected;
    const output = api.buildMcpStdioEnv({ env: {} });
    assert.deepEqual(output, { pAtH: directory, PATH: projected.PATH, OTHER: "kept" });
    assert.equal(projected.pAtH, "");
    assert.equal(state.access.length, 0);
  });

  test(`${platform}: default PATH reads an inherited exact value but insertion owns a new record`, async (t) => {
    const { api, state } = await networkFixture(t, { platform, executable });
    const projected: Record<string, string> = Object.assign(
      Object.create({ PATH: "owned-inherited" }),
      { KEEP: "value" },
    );
    state.project = () => projected;
    const output = api.buildMcpStdioEnv({ env: {} });
    assert.deepEqual(output, { KEEP: "value", PATH: directory + separator + "owned-inherited" });
    assert.equal(Object.hasOwn(projected, "PATH"), false);
    assert.equal(Object.getPrototypeOf(output), Object.prototype);
    assert.deepEqual(state.access, [
      { candidate: paths.join("owned-inherited", nodeName), mode: constants.X_OK },
    ]);
  });

  test(`${platform}: spaces, quoting and relative entries are passed to native join unchanged`, async (t) => {
    const { api, state } = await networkFixture(t, { platform, executable });
    const entries = [" ", '"owned path"', "relative/../node-dir"];
    const original = entries.join(separator);
    state.project = () => ({ PATH: original });
    assert.equal(api.buildMcpStdioEnv({ env: {} }).PATH, directory + separator + original);
    assert.deepEqual(
      state.access.map((call) => call.candidate),
      entries.map((entry) => paths.join(entry, nodeName)),
    );
  });

  test(`${platform}: non-Node executable skips PATH reading and native access`, async (t) => {
    const { api, state } = await networkFixture(t, {
      platform,
      executable: paths.join("owned-dir", "different.exe"),
    });
    const projected = {
      get PATH(): string {
        throw new Error("PATH must not be read");
      },
    };
    state.project = () => projected;
    assert.equal(api.buildMcpStdioEnv({ env: {} }), projected);
    assert.equal(state.access.length, 0);
  });

  for (const name of ["NODE", "NoDe.ExE"]) {
    test(`${platform}: captured executable ${name} is recognized after process identity is restored`, async (t) => {
      const { api, state } = await networkFixture(t, {
        platform,
        executable: paths.join("owned-captured", name),
      });
      assert.deepEqual(api.buildMcpStdioEnv({ env: {} }), { PATH: "owned-captured" });
      assert.equal(state.access.length, 0);
    });
  }
}

test("only access failure is treated as unavailable", async (t) => {
  const { api, state } = await networkFixture(t);
  state.available = () => {
    throw "owned access rejection";
  };
  assert.equal(
    api.buildMcpStdioEnv({ env: { PATH: "owned-bin" } }).PATH,
    "C:\\owned\\agent;owned-bin",
  );
  assert.equal(state.access.length, 1);
});

test("projected PATH getter failure remains synchronous with original identity", async (t) => {
  const { api, state } = await networkFixture(t);
  const failure = new Error("owned PATH read");
  state.project = () => ({
    get PATH(): string {
      throw failure;
    },
  });
  assert.throws(
    () => api.buildMcpStdioEnv({ env: {} }),
    (error) => error === failure,
  );
  assert.equal(state.access.length, 0);
});
