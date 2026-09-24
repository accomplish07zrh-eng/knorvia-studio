import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { hasGlobalCliKnorviaCuaServer } from "../src/node.js";
import { resolveStorageRoots } from "../src/storage/adapters/rootsResolver.js";
import {
  resolveConfigPath,
  resolveUserSubagentRoot,
  resolveWorkspaceSubagentRoot,
} from "../src/subagents/subagentStorage.js";

test("storage scans only the selected profile", () => {
  const home = join(tmpdir(), "profile-home");
  const selected = join(tmpdir(), "portable-data");
  assert.deepEqual(resolveStorageRoots({ homeDir: home, dataBaseDir: selected }), [
    { id: "dataBaseDir", path: join(selected, ".knorvia-studio"), hasCustomDataBaseDir: true },
  ]);
});

test("computer-use discovery never reads the original product home config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-cua-isolation-"));
  const legacyFile = join(dir, "home", ".knorvia", "cli", "config.json");
  const selectedFile = join(dir, "data", ".knorvia-studio", "cli", "config.json");
  const config = JSON.stringify({ mcp: { servers: { "computer-use": { command: "fixture" } } } });
  const env = { HOME: join(dir, "home"), KNORVIA_DATA_BASE_DIR: join(dir, "data") };
  try {
    await mkdir(join(legacyFile, ".."), { recursive: true });
    await writeFile(legacyFile, config);
    assert.equal(hasGlobalCliKnorviaCuaServer(env), false);
    await mkdir(join(selectedFile, ".."), { recursive: true });
    await writeFile(selectedFile, config);
    assert.equal(hasGlobalCliKnorviaCuaServer(env), true);
    assert.equal(await readFile(legacyFile, "utf8"), config);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("subagent discovery ignores legacy storage overrides and preserves explicit home paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-subagent-isolation-"));
  const previousPortable = process.env.KNORVIA_PORTABLE_DIR;
  delete process.env.KNORVIA_PORTABLE_DIR;
  try {
    const legacyDir = join(dir, ".knorvia", "cli");
    await mkdir(legacyDir, { recursive: true });
    await writeFile(
      join(legacyDir, "config.json"),
      JSON.stringify({ storage: { dir: "~/old-data" } }),
    );
    assert.equal(
      await resolveUserSubagentRoot({ homeDir: dir }),
      join(dir, ".knorvia-studio", "agents"),
    );
    assert.equal(resolveWorkspaceSubagentRoot(dir), join(dir, ".knorvia-studio", "agents"));
    assert.equal(
      resolveConfigPath("~/.agents/skills", { homeDir: dir }),
      join(dir, ".agents", "skills"),
    );
  } finally {
    if (previousPortable === undefined) delete process.env.KNORVIA_PORTABLE_DIR;
    else process.env.KNORVIA_PORTABLE_DIR = previousPortable;
    await rm(dir, { recursive: true, force: true });
  }
});
