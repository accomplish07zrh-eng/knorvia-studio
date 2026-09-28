// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { fixture, record } from "./workspace-hook-trust.fixture.js";
import {
  createDefaultFileWorkspaceHookTrustStore,
  resolveWorkspaceHookTrustStorePath,
} from "./workspace-hook-trust-test-api.js";

function isolatedEnvironment(t: TestContext) {
  const names = ["KNORVIA_PORTABLE_DIR", "KNORVIA_DATA_BASE_DIR", "KNORVIA_HOME"] as const;
  const before = names.map((name) => [name, process.env[name]] as const);
  for (const name of names) delete process.env[name];
  t.after(() => {
    for (const [name, value] of before) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

const suffix = (base: string) => join(base, "security", "workspace-hook-trust-v1.json");

test("tilde home expansion keeps an additional leading separator inside the explicit home", async (t) => {
  isolatedEnvironment(t);
  const f = await fixture(t);
  const home = join(f.root, "home");
  const config = join(f.root, "config.json");
  await writeFile(config, JSON.stringify({ storage: { dir: "~//nested" } }));
  assert.equal(
    await resolveWorkspaceHookTrustStorePath({ homeDir: home, userConfigPath: config }),
    suffix(join(home, "nested")),
  );
});

test("default factory captures construction callbacks before awaiting the config read", async (t) => {
  isolatedEnvironment(t);
  const f = await fixture(t);
  const config = join(f.root, "missing-config.json");
  let first = 0;
  let later = 0;
  const options = {
    homeDir: f.root,
    userConfigPath: config,
    beforeRename: () => {
      first++;
    },
  };
  const pending = createDefaultFileWorkspaceHookTrustStore(options);
  options.beforeRename = () => {
    later++;
  };
  const store = await pending;
  await store.grant([record()]);
  assert.deepEqual([first, later], [1, 0]);
});

test("path resolution tolerates a missing explicit config without creating directories", async (t) => {
  isolatedEnvironment(t);
  const f = await fixture(t);
  const home = join(f.root, "home");
  const config = join(f.root, "missing-config.json");
  const promise = resolveWorkspaceHookTrustStorePath({ homeDir: home, userConfigPath: config });
  assert.ok(promise instanceof Promise);
  assert.equal(await promise, suffix(join(home, ".knorvia-studio")));
  assert.deepEqual(await readdir(f.root), []);
});

test("valid non-object JSON and invalid storage shapes retain the private root", async (t) => {
  isolatedEnvironment(t);
  const f = await fixture(t);
  const home = join(f.root, "home");
  const config = join(f.root, "config.json");
  for (const value of [
    null,
    [],
    true,
    42,
    "text",
    {},
    { storage: [] },
    { storage: null },
    { storage: { dir: 4 } },
    { storage: { dir: " \t " } },
  ]) {
    await writeFile(config, JSON.stringify(value));
    assert.equal(
      await resolveWorkspaceHookTrustStorePath({ homeDir: home, userConfigPath: config }),
      suffix(join(home, ".knorvia-studio")),
    );
  }
});

test("config parsing and native reading failures preserve their cause and path", async (t) => {
  isolatedEnvironment(t);
  const f = await fixture(t);
  const config = join(f.root, "config.json");
  const directory = join(f.root, "config-directory");
  await writeFile(config, "{bad");
  await mkdir(directory);
  for (const path of [config, directory]) {
    await assert.rejects(
      resolveWorkspaceHookTrustStorePath({ homeDir: f.root, userConfigPath: path }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.equal(
          error.message,
          `Unable to read trusted user config for Workspace Hook Trust store: ${path}`,
        );
        assert.ok(error.cause instanceof Error);
        if (path === config) assert.ok(error.cause instanceof SyntaxError);
        else assert.equal((error.cause as NodeJS.ErrnoException).code, "EISDIR");
        return true;
      },
    );
  }
});

test("configured storage trims and resolves home-relative, tilde and absolute directories", async (t) => {
  isolatedEnvironment(t);
  const f = await fixture(t);
  const home = join(f.root, "home");
  const config = join(f.root, "config.json");
  const absolute = join(f.root, "absolute");
  for (const [dir, expected] of [
    [" relative ", join(home, "relative")],
    ["~/nested", join(home, "nested")],
    [absolute, absolute],
    ["~name/literal", join(home, "~name/literal")],
  ] as const) {
    await writeFile(config, JSON.stringify({ storage: { dir } }));
    assert.equal(
      await resolveWorkspaceHookTrustStorePath({ homeDir: home, userConfigPath: config }),
      suffix(expected),
    );
  }
});

test("portable raw truthiness overrides storage but never bypasses reading the explicit config", async (t) => {
  isolatedEnvironment(t);
  const f = await fixture(t);
  const home = join(f.root, "home");
  const config = join(f.root, "config.json");
  for (const portable of ["synthetic-portable", "   "]) {
    process.env.KNORVIA_PORTABLE_DIR = portable;
    await writeFile(config, JSON.stringify({ storage: { dir: "custom" } }));
    assert.equal(
      await resolveWorkspaceHookTrustStorePath({ homeDir: home, userConfigPath: config }),
      suffix(join(home, ".knorvia-studio")),
    );
    await writeFile(config, "{bad");
    await assert.rejects(
      resolveWorkspaceHookTrustStorePath({ homeDir: home, userConfigPath: config }),
      (error) => error instanceof Error && error.cause instanceof SyntaxError,
    );
  }
  process.env.KNORVIA_PORTABLE_DIR = "";
  await writeFile(config, JSON.stringify({ storage: { dir: "custom" } }));
  assert.equal(
    await resolveWorkspaceHookTrustStorePath({ homeDir: home, userConfigPath: config }),
    suffix(join(home, "custom")),
  );
});

test("shared data base takes precedence over home override while explicit homeDir takes its own branch", async (t) => {
  isolatedEnvironment(t);
  const f = await fixture(t);
  const config = join(f.root, "config.json");
  const base = join(f.root, "base");
  const override = join(f.root, "override");
  process.env.KNORVIA_DATA_BASE_DIR = ` ${base} `;
  process.env.KNORVIA_HOME = ` ${override} `;
  await writeFile(config, "{}");
  assert.equal(
    await resolveWorkspaceHookTrustStorePath({ userConfigPath: config }),
    suffix(join(base, ".knorvia-studio")),
  );
  process.env.KNORVIA_DATA_BASE_DIR = "   ";
  assert.equal(
    await resolveWorkspaceHookTrustStorePath({ userConfigPath: config }),
    suffix(override),
  );
  assert.equal(
    await resolveWorkspaceHookTrustStorePath({ homeDir: f.root, userConfigPath: config }),
    suffix(join(f.root, ".knorvia-studio")),
  );
});

test("empty homeDir preserves separate home resolution and private-root decisions without reading a real config", async (t) => {
  isolatedEnvironment(t);
  const f = await fixture(t);
  const config = join(f.root, "config.json");
  const base = join(f.root, "base");
  process.env.KNORVIA_DATA_BASE_DIR = base;
  await writeFile(config, "{}");
  assert.equal(
    await resolveWorkspaceHookTrustStorePath({ homeDir: "", userConfigPath: config }),
    suffix(join(base, ".knorvia-studio")),
  );
  await writeFile(config, JSON.stringify({ storage: { dir: "synthetic-relative-no-io" } }));
  assert.equal(
    await resolveWorkspaceHookTrustStorePath({ homeDir: "", userConfigPath: config }),
    suffix(resolve("synthetic-relative-no-io")),
  );
});

test("default factory resolves explicit home config before constructing and retains supplied hooks", async (t) => {
  isolatedEnvironment(t);
  const f = await fixture(t);
  const config = join(f.root, ".knorvia-studio", "cli", "config.json");
  await mkdir(join(f.root, ".knorvia-studio", "cli"), { recursive: true });
  await writeFile(config, JSON.stringify({ storage: { dir: "custom" } }));
  let publications = 0;
  const promise = createDefaultFileWorkspaceHookTrustStore({
    homeDir: f.root,
    beforeRename: () => {
      publications++;
    },
  });
  assert.ok(promise instanceof Promise);
  const store = await promise;
  const saved = await store.grant([record()]);
  assert.equal(publications, 1);
  assert.deepEqual(JSON.parse(await readFile(suffix(join(f.root, "custom")), "utf8")), saved);
});
