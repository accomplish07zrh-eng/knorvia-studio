// Owned ports and an explicitly copied test-only private scanner oracle.
import assert from "node:assert/strict";
import { after, mock } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import ts from "typescript";
import * as rpc from "@knorvia/rpc";
import type { IGitCheckpointService } from "../src/git/gitCheckpoint.js";
import type { GitCommandExecutionOptions } from "../src/git/providers/gitCommandProvider.js";
import { result, deferred } from "./git-repository-resolution-fixture-fast-20261001.js";
export { result, deferred };
export const root = resolve("owned synthetic checkpoint repository 中文"),
  workspace = resolve(root, "sub");
export const meta = (checkpointId: string) => ({
  checkpointId,
  workspacePath: workspace,
  repoRoot: root,
  workspaceInRepoPath: "sub",
  createdAt: 77,
  refName: `refs/owned/${checkpointId}`,
  commitOid: `owned-${checkpointId}`,
  scope: "workspace" as const,
});
export const tree = (path: string, mode = "100644", hash = "owned-match") =>
  `${mode} blob ${hash}\t${path}\0`;
export function fileStat(directory = false, symlink = false, trace: unknown[] = []) {
  const value = {
    isDirectory() {
      assert.equal(this, value);
      trace.push("directory");
      return directory;
    },
    isSymbolicLink() {
      assert.equal(this, value);
      trace.push("symlink");
      return symlink;
    },
  };
  return value;
}
type Options = {
  run?: (command: GitCommandExecutionOptions) => unknown;
  lstat?: (path: string) => unknown;
  mutate?: boolean;
  load?: (path: string, id: string) => unknown;
};
export async function checkpointConflictsFixture() {
  const dist = process.env.KNORVIA_GIT_RESOLUTION_TARGET === "dist";
  const url = (name: string) =>
    new URL(`../${dist ? "dist" : "src"}/${name}.${dist ? "js" : "ts"}`, import.meta.url).href;
  const previous = process.env;
  process.env = previous.NODE_TEST_CONTEXT ? { NODE_TEST_CONTEXT: previous.NODE_TEST_CONTEXT } : {};
  after(() => {
    process.env = previous;
  });
  mock.method(Date, "now", () => 77);
  const forbidden = () => assert.fail("unowned checkpoint process/filesystem/store/settings port");
  let options: Options = {},
    effects: unknown[] = [];
  const lstat = (path: string) => {
    effects.push(["lstat", path]);
    return options.lstat ? options.lstat(path) : fileStat();
  };
  mock.module("node:fs/promises", {
    namedExports: {
      lstat,
      access: forbidden,
      open: forbidden,
      readFile: forbidden,
      realpath: forbidden,
      stat: forbidden,
      copyFile: forbidden,
      mkdir: forbidden,
      mkdtemp: forbidden,
      writeFile: forbidden,
      rename: forbidden,
      rm: (...args: unknown[]) => {
        if (!options.mutate) forbidden();
        effects.push(["rm", ...args]);
      },
    },
  });
  mock.module(url("git/providers/gitCommandProvider"), {
    namedExports: { createGitCommandProvider: forbidden },
  });
  mock.module(url("git/repo/gitCliRepo"), { namedExports: { createGitCliRepo: forbidden } });
  mock.module(url("paths"), {
    namedExports: { getGitCheckpointIndexRootDir: forbidden, getWorkspaceHash: forbidden },
  });
  mock.module(url("git/repo/gitCheckpointStore"), {
    namedExports: {
      GitCheckpointStore: class {
        constructor() {
          forbidden();
        }
      },
    },
  });
  const helpers = await import(url("git/repo/gitCheckpointHelpers")),
    config = await import(url("git/config")),
    cliHelpers = await import(url("git/repo/gitCliHelpers")),
    { createGitCheckpointRepo } = await import(url("git/repo/gitCheckpointRepo")),
    { createGitCheckpointService } = await import(url("git/gitCheckpointService")),
    { IGitCheckpointService: descriptor } = await import(url("git/gitCheckpoint"));
  const oracle = JSON.parse(
    readFileSync(
      new URL("./checkpoint-conflicts-legacy-fast-20261001.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(oracle.commit, "9d01b4cfdbdd80daa20e88d61336d5159359a40d");
  assert.equal(oracle.copiedExposedTestOnly, true);
  assert.equal(createHash("sha256").update(oracle.text).digest("hex"), oracle.sha256);
  const text = readFileSync(new URL(url("git/repo/gitCheckpointRepo")), "utf8"),
    sf = ts.createSourceFile("scanner", text, ts.ScriptTarget.Latest, true);
  const declarations = new Map<string, string>();
  function visit(n: ts.Node) {
    if (ts.isFunctionDeclaration(n) && n.name) declarations.set(n.name.text, n.getText(sf));
    ts.forEachChild(n, visit);
  }
  visit(sf);
  const bindings = {
    lstat,
    toAbsolutePath: helpers.toAbsolutePath,
    toWorkspaceRelativeGitPath: config.toWorkspaceRelativeGitPath,
    ensureGitCommandSucceeded: cliHelpers.ensureGitCommandSucceeded,
    parseLsTree: helpers.parseLsTree,
  };
  function scanner(provider: unknown, legacy: boolean) {
    const source =
      declarations.get("pathExists") +
      "\n" +
      (legacy ? oracle.text : declarations.get("collectWorkspaceConflicts"));
    const code = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return new Function(
      "commandProvider",
      ...Object.keys(bindings),
      code + ";return collectWorkspaceConflicts;",
    )(provider, ...Object.values(bindings)) as any;
  }
  function fixture(owned: Options = {}, legacy = false) {
    options = owned;
    effects = [];
    const trace = effects,
      commands: GitCommandExecutionOptions[] = [];
    const provider = {
      get run() {
        trace.push("run-get");
        return function (this: unknown, c: GitCommandExecutionOptions) {
          assert.equal(this, provider);
          trace.push(["run", c]);
          commands.push(c);
          if (
            ["restore", "update-ref", "commit-tree", "write-tree", "add"].includes(c.args[0]!) &&
            !owned.mutate
          )
            forbidden();
          return owned.run ? owned.run(c) : result({ stdout: "" });
        };
      },
    };
    const gitRepo = {
      resolveRepository(path: string) {
        assert.equal(this, gitRepo);
        trace.push(["resolve", path]);
        return Promise.resolve({
          workspacePath: path,
          repoRoot: root,
          workspaceInRepoPath: "sub",
          autoRefreshWatchPaths: [],
          isGitAvailable: true,
          isRepository: true,
        });
      },
    };
    const store = {
      load(path: string, id: string) {
        assert.equal(this, store);
        trace.push(["load", path, id]);
        return owned.load ? owned.load(path, id) : Promise.resolve(meta(id));
      },
    };
    const repo = createGitCheckpointRepo({ commandProvider: provider as never, gitRepo });
    return {
      scan: scanner(provider, legacy),
      repo,
      api: createGitCheckpointService({ repo, store: store as never }),
      commands,
      trace,
    };
  }
  function remote(t: { after(fn: () => void): void }, api: IGitCheckpointService) {
    const toServer = new rpc.Emitter<rpc.VSBuffer>(),
      toClient = new rpc.Emitter<rpc.VSBuffer>();
    const server = new rpc.ChannelServer(
      { onMessage: toServer.event, send: (v) => queueMicrotask(() => toClient.fire(v)) },
      "owned-checkpoint-host",
    );
    server.registerChannel(descriptor.channelName, rpc.ProxyChannel.fromService(api));
    const client = new rpc.ChannelClient({
      onMessage: toClient.event,
      send: (v) => queueMicrotask(() => toServer.fire(v)),
    });
    t.after(() => {
      client.dispose();
      server.dispose();
      toServer.dispose();
      toClient.dispose();
    });
    return rpc.ProxyChannel.toService<IGitCheckpointService>(
      client.getChannel(descriptor.channelName),
    );
  }
  return { fixture, remote, url };
}
