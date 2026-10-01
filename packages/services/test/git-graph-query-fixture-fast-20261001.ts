// Owned command/resolution ports only; no live repo, process, profile or user data.
import assert from "node:assert/strict";
import { after, mock } from "node:test";
import * as rpc from "@knorvia/rpc";
import type { IMessagePassingProtocol, VSBuffer } from "@knorvia/rpc";
import type { IGitService } from "../src/git/git.js";
import type { GitResolvedRepository } from "../src/git/repo/gitCliTypes.js";
import type {
  GitCommandExecutionOptions,
  GitCommandExecutionResult,
} from "../src/git/providers/gitCommandProvider.js";

export const workspace = "owned synthetic workspace/--path 中文";
export const repoRoot = "owned synthetic root/--root 中文";
export const resolution: GitResolvedRepository = Object.freeze({
  workspacePath: workspace,
  repoRoot,
  workspaceInRepoPath: "owned-subdir",
  autoRefreshWatchPaths: [],
  isGitAvailable: true,
  isRepository: true,
});
export function commandResult(
  values: Partial<GitCommandExecutionResult> = {},
): GitCommandExecutionResult {
  return {
    binaryPath: "owned fake git",
    cwd: repoRoot,
    args: [],
    stdout: "",
    stderr: "",
    exitCode: 0,
    signal: null,
    durationMs: 7,
    timedOut: false,
    outputTruncated: false,
    ...values,
  };
}
export const record = (
  hash = "owned-hash",
  parents = "",
  author = "Owned author 中文",
  seconds = "123",
  subject = "owned subject 🚀",
  refs = "",
) => [hash, parents, author, seconds, subject, refs].join("\0") + "\x1e";
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export async function graphFixture() {
  const emitted = process.env.KNORVIA_GIT_GRAPH_TARGET === "dist";
  const url = (name: string) =>
    new URL(`../${emitted ? "dist" : "src"}/${name}.${emitted ? "js" : "ts"}`, import.meta.url)
      .href;
  const uiUrl = (name: string) =>
    new URL(
      `../../ui/${emitted ? "dist" : "src"}/${name}.${emitted ? "js" : "ts"}`,
      import.meta.url,
    ).href;
  const parentEnv = process.env;
  process.env = {
    ...(parentEnv.NODE_TEST_CONTEXT ? { NODE_TEST_CONTEXT: parentEnv.NODE_TEST_CONTEXT } : {}),
    HOME: "owned synthetic home",
    ProgramFiles: "owned synthetic programs",
    ProgramW6432: "owned synthetic programs64",
    "ProgramFiles(x86)": "owned synthetic programs32",
  };
  after(() => {
    process.env = parentEnv;
  });
  const forbidden = () => assert.fail("unapproved graph process/fs/settings/time port");
  mock.module(url("git/providers/gitCommandProvider"), {
    namedExports: { createGitCommandProvider: forbidden },
  });
  mock.module(url("paths"), { namedExports: { getKnorviaDataRootDir: forbidden } });
  mock.module("node:fs/promises", {
    namedExports: {
      access: forbidden,
      open: forbidden,
      realpath: forbidden,
      mkdir: forbidden,
      mkdtemp: forbidden,
      readFile: forbidden,
      rm: forbidden,
      stat: forbidden,
    },
  });
  const logs: unknown[][] = [];
  mock.module(url("logger/serviceLogger"), {
    namedExports: {
      createServiceLogger: () => ({
        info: forbidden,
        debug: forbidden,
        warn: (...args: unknown[]) => logs.push(args),
        error: forbidden,
      }),
    },
  });
  const { createGitCliRepo } = await import(url("git/repo/gitCliRepo"));
  const { createGitService } = await import(url("git/gitService"));
  const { IGitService: descriptor } = await import(url("git/git"));
  function fixture(
    options: {
      result?: GitCommandExecutionResult;
      resolve?: (path: string) => GitResolvedRepository | Promise<GitResolvedRepository>;
      run?: (
        command: GitCommandExecutionOptions,
      ) => GitCommandExecutionResult | Promise<GitCommandExecutionResult>;
      actualResolution?: boolean;
    } = {},
  ) {
    const trace: unknown[] = [];
    const commands: GitCommandExecutionOptions[] = [];
    const provider = {
      async resolveGitBinary() {
        assert.equal(this, provider);
        trace.push("binary");
        return "owned fake binary";
      },
      async run(command: GitCommandExecutionOptions) {
        assert.equal(this, provider);
        trace.push("run");
        commands.push(command);
        return options.run ? await options.run(command) : (options.result ?? commandResult());
      },
    };
    const repo = createGitCliRepo({ commandProvider: provider });
    if (!options.actualResolution)
      repo.resolveRepository = async function (path: string) {
        assert.equal(this, repo);
        trace.push(["resolve", path]);
        return options.resolve ? await options.resolve(path) : resolution;
      };
    return { repo, provider, commands, trace, api: createGitService({ repo }) };
  }
  function remote(t: { after(fn: () => void): void }, api: IGitService) {
    const toServer = new rpc.Emitter<VSBuffer>(),
      toClient = new rpc.Emitter<VSBuffer>();
    const serverProtocol: IMessagePassingProtocol = {
      onMessage: toServer.event,
      send: (value) => queueMicrotask(() => toClient.fire(value)),
    };
    const clientProtocol: IMessagePassingProtocol = {
      onMessage: toClient.event,
      send: (value) => queueMicrotask(() => toServer.fire(value)),
    };
    const server = new rpc.ChannelServer(serverProtocol, "owned-graph-host");
    server.registerChannel(descriptor.channelName, rpc.ProxyChannel.fromService(api));
    const client = new rpc.ChannelClient(clientProtocol);
    t.after(() => {
      client.dispose();
      server.dispose();
      toServer.dispose();
      toClient.dispose();
    });
    return rpc.ProxyChannel.toService<IGitService>(client.getChannel(descriptor.channelName));
  }
  return { fixture, remote, url, uiUrl, logs };
}
