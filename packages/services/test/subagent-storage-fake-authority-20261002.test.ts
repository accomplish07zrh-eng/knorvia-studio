import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { mock, test } from "node:test";

test("synthetic subagent storage preserves configured and portable data locations", async () => {
  const originalEnv = process.env;
  const trace: unknown[][] = [];
  let config: unknown = { storage: { dir: " ~/custom " } };
  let fail = false;
  mock.module("node:fs/promises", {
    namedExports: {
      readFile: async (...args: unknown[]) => {
        trace.push(args);
        if (fail) throw new Error("synthetic permission denied");
        return JSON.stringify(config);
      },
    },
  });
  mock.module("node:os", { namedExports: { homedir: () => "/synthetic-os-home" } });
  mock.module(new URL("../src/paths.ts", import.meta.url).href, {
    namedExports: { getKnorviaDataRootDir: () => "/synthetic-data" },
  });
  const storage = await import("../src/subagents/subagentStorage.js");
  try {
    process.env = { HOME: " /synthetic-env-home ", USERPROFILE: "/ignored" };
    assert.equal(storage.resolveUserHomeDir(), "/synthetic-env-home");
    const options = { homeDir: "/synthetic-home" };
    assert.equal(
      await storage.resolveUserSubagentRoot(options),
      join(options.homeDir, "custom", "agents"),
    );
    assert.deepEqual(trace[0], [
      join(options.homeDir, ".knorvia-studio", "cli", "config.json"),
      "utf8",
    ]);
    config = { storage: { dir: "relative-owned" } };
    assert.equal(
      await storage.resolveSubagentStateFile(options),
      join(resolve("relative-owned"), "v2", "agents-state.json"),
    );
    fail = true;
    assert.equal(
      await storage.resolveKnorviaStorageRoot(options),
      join(options.homeDir, ".knorvia-studio"),
    );
    const before = trace.length;
    process.env.KNORVIA_PORTABLE_DIR = " synthetic ";
    assert.equal(await storage.resolveKnorviaStorageRoot(options), "/synthetic-data");
    assert.equal(trace.length, before);
    delete process.env.KNORVIA_PORTABLE_DIR;
    process.env.HOME = " ";
    process.env.USERPROFILE = " ";
    assert.equal(storage.resolveUserHomeDir(), "/synthetic-os-home");
    assert.equal(storage.resolveUserHomeDir({ homeDir: " /raw-home " }), " /raw-home ");
    assert.equal(
      storage.resolveWorkspaceSubagentRoot("/synthetic-workspace"),
      join("/synthetic-workspace", ".knorvia-studio", "agents"),
    );
  } finally {
    process.env = originalEnv;
  }
});
