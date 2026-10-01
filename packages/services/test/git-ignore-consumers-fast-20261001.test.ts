import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import {
  ignoreFixture,
  workspace,
  revOutput,
  result,
  deferred,
} from "./git-ignore-fixture-fast-20261001.js";
import { ignoredUiCallback } from "./git-ignore-ui-callback-fast-20261001.js";
const f = await ignoreFixture();
for (const transport of ["service", "RPC"] as const)
  for (const outcome of ["ignored", "none", "rejected"])
    test(`actual ${transport} ignored read ${outcome}`, async (t) => {
      const s = f.fixture({
        run: (c) =>
          c.args[0] === "rev-parse"
            ? result({ stdout: revOutput })
            : result({
                stdout: "sub/item\n",
                exitCode: outcome === "none" ? 1 : outcome === "rejected" ? 128 : 0,
                stderr: "owned rejected",
              }),
      });
      const api = transport === "RPC" ? f.remote(t, s.api) : s.api;
      const request = {
        workspacePath: workspace,
        paths: ["item", "../..", "item"],
        workspaceIdentity: "owned synthetic identity",
      };
      if (outcome === "rejected")
        await assert.rejects(api.getIgnoredPaths(request), {
          message: "git check-ignore failed: owned rejected",
        });
      else
        assert.deepEqual(
          await api.getIgnoredPaths(request),
          outcome === "none" ? [] : [resolve(workspace, "item"), resolve(workspace, "item")],
        );
      assert.deepEqual(s.commands[1]!.args, ["check-ignore", "--", "sub/item", "sub/item"]);
    });
test("actual service request getter and receiver ordering", async () => {
  const s = f.fixture(),
    trace: unknown[] = [];
  s.repo.getIgnoredPaths = async function (w, paths) {
    assert.equal(this, s.repo);
    trace.push([w, paths]);
    return paths;
  };
  const request = new Proxy(
    { workspacePath: workspace, paths: ["owned"] },
    {
      get(t, k) {
        trace.push(k);
        return Reflect.get(t, k);
      },
    },
  );
  assert.deepEqual(await s.api.getIgnoredPaths(request), ["owned"]);
  assert.deepEqual(trace, ["workspacePath", "paths", [workspace, ["owned"]]]);
});
test("actual UI model literal Windows/POSIX ignored keys", async () => {
  const model = await import(f.uiUrl("workspace-file-tree/model"));
  const keys = model.buildWorkspaceFileIgnoredPathSet([
    "C:\\owned\\item\\",
    "/owned/item/",
    "C:/owned/item",
  ]);
  assert.equal(keys.size, 2);
  for (const path of ["C:\\owned\\item", "C:/owned/item/", "/owned/item/"])
    assert.equal(model.isWorkspaceFileGitIgnored(keys, path), true);
  assert.equal(model.isWorkspaceFileGitIgnored(keys, "/owned/other"), false);
});
for (const transport of ["service", "RPC"] as const)
  for (const outcome of [
    "live",
    "stale-generation",
    "stale-directory",
    "stale-request",
    "rejected",
  ] as const)
    test(`actual file-tree callback ${transport} ${outcome}`, async (t) => {
      const command = deferred<ReturnType<typeof result>>(),
        started = deferred<void>(),
        completed = deferred<void>();
      const s = f.fixture({
        run: (c) => {
          if (c.args[0] === "rev-parse") return result({ stdout: revOutput });
          started.resolve();
          return command.promise;
        },
      });
      const api = transport === "RPC" ? f.remote(t, s.api) : s.api;
      const model = await import(f.uiUrl("workspace-file-tree/model"));
      const generation = { current: 4 },
        request = { current: 2 },
        directory = { current: new Map<string, number>() };
      let ignored = new Set([
        resolve(workspace, "item").replace(/\\/g, "/"),
        "owned retained other",
      ]);
      const entries = ["item", "other"].map((name) => ({
        name,
        path: resolve(workspace, name),
        type: "file",
      }));
      const warned = deferred<void>();
      const warnings: unknown[][] = [],
        requests: unknown[] = [],
        children = new Map();
      const callback = ignoredUiCallback(f.uiUrl("workspace-file-tree/useWorkspaceFileTreeData"), {
        workspacePath: workspace,
        workspaceGenerationRef: generation,
        requestVersionRef: request,
        directoryRequestVersionRef: directory,
        enableWorkspaceFeatures: true,
        loadingDirectoryPathsRef: { current: new Set() },
        loadedDirectoryPathsRef: { current: new Set() },
        setDirectoryLoading: () => {},
        setDirectoryLoaded: () => {},
        setErrorByDirectory: () => {},
        setChildrenByDirectory: (fn: (v: Map<unknown, unknown>) => Map<unknown, unknown>) => {
          const next = fn(children);
          for (const [k, v] of next) children.set(k, v);
        },
        fileService: {
          readdir: (r: unknown) => {
            requests.push(r);
            return Promise.resolve(entries);
          },
        },
        gitService: {
          getIgnoredPaths: (r: Parameters<typeof api.getIgnoredPaths>[0]) => {
            requests.push(r);
            const p = api.getIgnoredPaths(r);
            void p.then(
              () => completed.resolve(),
              () => completed.resolve(),
            );
            return p;
          },
        },
        setIgnoredPathSet: (fn: (v: Set<string>) => Set<string>) => {
          ignored = fn(ignored);
        },
        buildWorkspaceFileIgnoredPathSet: model.buildWorkspaceFileIgnoredPathSet,
        isWorkspaceFileTreeAutoFlattenableDirectory: () => false,
        toError: (e: Error) => e,
        logger: {
          warn: (...args: unknown[]) => {
            warnings.push(args);
            warned.resolve();
          },
        },
      });
      assert.equal(await callback(workspace, 0), "loaded");
      await started.promise;
      assert.equal(children.has(workspace), true);
      assert.deepEqual(JSON.parse(JSON.stringify(requests)), [
        { path: workspace, includeHidden: true },
        { workspacePath: workspace, paths: entries.map((e) => e.path) },
      ]);
      if (outcome === "stale-generation") generation.current++;
      if (outcome === "stale-request") request.current++;
      if (outcome === "stale-directory") directory.current.set(workspace, 9);
      command.resolve(
        result({
          stdout: "sub/other\n",
          exitCode: outcome === "rejected" ? 128 : 0,
          stderr: "owned UI rejected",
        }),
      );
      await completed.promise;
      if (outcome === "rejected") await warned.promise;
      if (outcome === "live")
        assert.deepEqual(
          [...ignored],
          ["owned retained other", resolve(workspace, "other").replace(/\\/g, "/")],
        );
      else
        assert.deepEqual(
          [...ignored],
          [resolve(workspace, "item").replace(/\\/g, "/"), "owned retained other"],
        );
      assert.equal(warnings.length, outcome === "rejected" ? 1 : 0);
      if (outcome === "rejected")
        assert.deepEqual(JSON.parse(JSON.stringify(warnings[0])), [
          "[WorkspaceFileTree] 读取 Git ignored 状态失败",
          {
            workspacePath: workspace,
            path: workspace,
            error: "git check-ignore failed: owned UI rejected",
          },
        ]);
    });
