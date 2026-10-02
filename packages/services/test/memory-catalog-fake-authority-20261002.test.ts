import assert from "node:assert/strict";
import { join } from "node:path";
import { mock, test } from "node:test";

test("synthetic memory catalog denies aliases, symlinks and post-open escapes", async () => {
  const root = join("/synthetic-profile", "cli", "memories", "projects");
  const workspace = "owned-0123456789abcdef";
  const memory = join(root, workspace, "memory");
  const denied = Object.assign(new Error("synthetic denied"), { code: "EACCES" });
  const missing = Object.assign(new Error("synthetic missing"), { code: "ENOENT" });
  let mode = "plain";
  let reads = 0;
  let stableCalls = 0;
  const entry = (name: string, directory: boolean, link = false) => ({
    name,
    isDirectory: () => directory,
    isFile: () => !directory,
    isSymbolicLink: () => link,
  });
  mock.module("node:fs/promises", {
    namedExports: {
      lstat: async (path: string) => {
        reads++;
        if (mode === "denied") throw denied;
        if (mode === "missing") throw missing;
        const directory = !path.endsWith(".md");
        return {
          ...entry(path, directory, mode === "link" && path === root),
          size: 7,
          mtimeMs: 23,
        };
      },
      readdir: async (path: string) =>
        path === root
          ? [entry(workspace, true)]
          : [
              entry("z.md", false),
              entry("MEMORY.md", false),
              entry("excluded.MD", false),
              entry("link.md", false, true),
            ],
      realpath: async (path: string) =>
        mode === "escape" && path.endsWith(".md") ? "/outside/item.md" : path,
    },
  });
  mock.module(new URL("../src/paths.ts", import.meta.url).href, {
    namedExports: { getKnorviaDataRootDir: () => "/synthetic-profile" },
  });
  mock.module(new URL("../src/memory/projectMemoryStableRead.ts", import.meta.url).href, {
    namedExports: {
      readProjectMemoryFileFromStableHandle: async (params: {
        filePath: string;
        validatePath(): Promise<void>;
      }) => {
        stableCalls++;
        assert.equal(params.filePath, join(memory, "MEMORY.md"));
        await params.validatePath();
        return { content: "synthetic", updatedAt: 23 };
      },
    },
  });
  const service = (await import("../src/memory/memoryService.js")).createMemoryService();
  assert.deepEqual(await service.listProjectMemories(), [
    {
      id: workspace,
      label: "owned",
      updatedAt: 23,
      files: [
        {
          name: "MEMORY.md",
          path: join(memory, "MEMORY.md"),
          kind: "index",
          size: 7,
          updatedAt: 23,
        },
        { name: "z.md", path: join(memory, "z.md"), kind: "item", size: 7, updatedAt: 23 },
      ],
    },
  ]);
  const before = reads;
  await assert.rejects(
    service.readProjectMemoryFile({ workspaceId: "../escape", fileName: "MEMORY.md" }),
    /Invalid Project Memory path/,
  );
  assert.equal(reads, before);
  await assert.rejects(
    service.readProjectMemoryFile({ workspaceId: workspace, fileName: "memory.md" }),
    /does not match exactly/,
  );
  assert.equal(stableCalls, 0);
  mode = "link";
  await assert.rejects(service.listProjectMemories(), /not a regular directory/);
  mode = "plain";
  assert.deepEqual(
    await service.readProjectMemoryFile({ workspaceId: workspace, fileName: "MEMORY.md" }),
    { content: "synthetic", updatedAt: 23 },
  );
  mode = "escape";
  await assert.rejects(
    service.readProjectMemoryFile({ workspaceId: workspace, fileName: "MEMORY.md" }),
    /outside the local profile/,
  );
  mode = "denied";
  await assert.rejects(service.listProjectMemories(), (e) => e === denied);
  mode = "missing";
  assert.deepEqual(await service.listProjectMemories(), []);
});
