import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

test("synthetic MCP migration/import preserves config, precedence, private mode and invalid-file refusal", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-mcp-sync-integrity-"));
  const names = ["HOME", "USERPROFILE", "KNORVIA_DATA_BASE_DIR", "KNORVIA_HOME"] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) process.env[name] = name === "KNORVIA_HOME" ? "" : root;
  const put = async (path: string, content: string) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  };
  try {
    const { createMcpSyncService } = await import("../src/mcp-sync/mcpSyncService.js");
    const config = join(root, ".knorvia-studio", "cli", "config.json");
    await put(
      config,
      JSON.stringify({
        untouched: { synthetic: [1, 2] },
        mcp: {
          retained: true,
          servers: {
            Existing: { command: "synthetic-existing", enabled: false },
            Legacy: { command: "synthetic-legacy", enable: false, enabled: true },
          },
          [dirname(config)]: { Legacy: false, Keep: true },
        },
      }),
    );
    await put(
      join(root, ".agents", "mcp.json"),
      JSON.stringify({ mcpServers: { IgnoredFallback: { command: "synthetic-fallback" } } }),
    );
    const service = createMcpSyncService();
    const listed = await service.listLocalUserMcpCandidates();
    assert.deepEqual(
      listed.candidates.map(({ name, enabled, source }) => ({ name, enabled, source })),
      [
        { name: "Existing", enabled: false, source: "knorvia" },
        { name: "Legacy", enabled: false, source: "knorvia" },
      ],
    );
    let saved = JSON.parse(await readFile(config, "utf8"));
    assert.deepEqual(saved.mcp.servers.Legacy, { command: "synthetic-legacy", enabled: false });
    await service.saveMcpToUserDirectory({
      action: "set-enabled",
      source: "knorviaagentmcp",
      name: "Legacy",
      enabled: true,
    });
    saved = JSON.parse(await readFile(config, "utf8"));
    assert.deepEqual(saved.mcp.servers.Legacy, { command: "synthetic-legacy" });
    assert.deepEqual(saved.mcp[dirname(config)], { Keep: true });
    const workspace = join(root, "synthetic-workspace");
    await put(
      join(workspace, ".agents", "mcp.json"),
      JSON.stringify({ mcpServers: { ProjectOnly: { command: "synthetic-project" } } }),
    );
    assert.deepEqual(
      (await service.loadMcpFromUserDirectory({ workspacePath: workspace })).servers.map(
        ({ name, scope }) => ({ name, scope }),
      ),
      [
        { name: "ProjectOnly", scope: "workspace" },
        { name: "Existing", scope: "user" },
        { name: "Legacy", scope: "user" },
      ],
    );
    const record = (name: string, config: Record<string, unknown>, enabled: boolean) => ({
      id: `synthetic-${name}`,
      name,
      config,
      enabled,
      source: "knorvia" as const,
      path: "synthetic-source",
    });
    const request = {
      localHomeDir: "C:\\Users\\Synthetic",
      localWorkspacePath: "C:\\Users\\Synthetic\\Project",
      remoteWorkspacePath: "/srv/synthetic-project",
      servers: [
        record("existing", { command: "must-not-replace" }, true),
        record(
          "filesystem",
          {
            command: "synthetic-command",
            enable: true,
            args: ["C:\\Users\\Synthetic\\Project\\a", "C:\\Users\\Synthetic\\b", "--flag"],
          },
          false,
        ),
      ],
    };
    const imported = await service.importMcpServers(request);
    assert.deepEqual(
      imported.results.map(({ name, status }) => ({ name, status })),
      [
        { name: "existing", status: "skipped" },
        { name: "filesystem", status: "synced" },
      ],
    );
    const raw = await readFile(config, "utf8");
    saved = JSON.parse(raw);
    assert.deepEqual(saved.untouched, { synthetic: [1, 2] });
    assert.equal(saved.mcp.retained, true);
    assert.deepEqual(saved.mcp.servers.Existing, { command: "synthetic-existing", enabled: false });
    assert.deepEqual(saved.mcp.servers.filesystem, {
      command: "synthetic-command",
      args: ["/srv/synthetic-project/a", join(root, "b"), "--flag"],
      enabled: false,
    });
    assert.equal(raw, `${JSON.stringify(saved, null, 2)}\n`);
    if (process.platform !== "win32") assert.equal((await stat(config)).mode & 0o777, 0o600);
    assert.deepEqual(
      (await service.importMcpServers(request)).results.map((item) => item.status),
      ["skipped", "skipped"],
    );
    assert.equal(await readFile(config, "utf8"), raw);
    await writeFile(config, "{synthetic-invalid");
    await assert.rejects(service.importMcpServers(request), /无法解析 MCP 配置文件/);
    assert.equal(await readFile(config, "utf8"), "{synthetic-invalid");
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    await rm(root, { recursive: true, force: true });
  }
});
