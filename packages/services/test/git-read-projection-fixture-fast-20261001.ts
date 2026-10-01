// Snapshot ports only: no default repo, Git command, user file or native process.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { after, mock } from "node:test";
import * as rpc from "@knorvia/rpc";
import type { IMessagePassingProtocol, VSBuffer } from "@knorvia/rpc";
import type { IGitService } from "../src/git/git.js";
import type {
  GitBranchComparisonSnapshot,
  GitCliRepo,
  GitStatusEntry,
  GitStatusSnapshot,
} from "../src/git/repo/gitCliTypes.js";
import type { GitCommitMessageGenerator } from "../src/git/gitCommitMessageGenerator.js";

export const root = resolve("synthetic-owned-git-read-projection");
export const workspace = resolve(root, "work");
export const entry = (overrides: Partial<GitStatusEntry> = {}): GitStatusEntry => ({
  path: "work/owned.txt",
  originalPath: null,
  kind: "modified",
  x: "M",
  y: "M",
  isUntracked: false,
  isConflicted: false,
  ...overrides,
});
export function snapshot(entries = [entry()]): GitStatusSnapshot {
  const resolution = {
    workspacePath: workspace,
    repoRoot: root,
    workspaceInRepoPath: "work",
    autoRefreshWatchPaths: [],
    isGitAvailable: true,
    isRepository: true,
  };
  return {
    resolution,
    summary: {
      ...resolution,
      branchName: "owned-head",
      trackingBranchName: null,
      headRefType: "branch",
      ahead: 0,
      behind: 0,
      isDirty: true,
    },
    entries,
    stagedStats: new Map(),
    unstagedStats: new Map(),
    untrackedStats: new Map(),
  };
}
export function comparison(): GitBranchComparisonSnapshot {
  return {
    resolution: snapshot().resolution,
    baseRef: "owned-base",
    headRef: "owned-head",
    comparisonLabel: "owned-base...owned-head",
    changes: [
      { path: "work/owned.txt", originalPath: null, kind: "modified", added: 4, removed: 2 },
    ],
  };
}

export async function projectionFixture() {
  const emitted = process.env.KNORVIA_GIT_READ_PROJECTION_TARGET === "dist";
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
    HOME: root,
    ProgramFiles: root,
    ProgramW6432: root,
    "ProgramFiles(x86)": root,
  };
  after(() => {
    process.env = parentEnv;
  });
  mock.module(url("git/repo/gitCliRepo"), {
    namedExports: {
      createGitCliRepo: () => assert.fail("default repo must not be constructed"),
    },
  });
  const warnings: unknown[][] = [];
  mock.module(uiUrl("logger"), {
    namedExports: {
      logger: {
        warn: (...args: unknown[]) => warnings.push(args),
      },
    },
  });
  const { createGitService } = await import(url("git/gitService"));
  const { IGitService: descriptor } = await import(url("git/git"));
  function service(
    options: {
      status?: GitStatusSnapshot;
      branch?: GitBranchComparisonSnapshot;
      generator?: GitCommitMessageGenerator;
      ports?: Partial<GitCliRepo>;
    } = {},
  ) {
    const status = options.status ?? snapshot(),
      branch = options.branch ?? comparison();
    const trace: string[] = [];
    const identity = {
      userName: "Owned synthetic",
      userEmail: "owned@example.invalid",
      nameSource: "local",
      emailSource: "local",
      scopeLabel: "owned",
    };
    const methods = {
      getStatus: async (path: string) => {
        assert.equal(path, workspace);
        trace.push("status");
        return status;
      },
      getBranchComparison: async (path: string) => {
        assert.equal(path, workspace);
        trace.push("branch");
        return branch;
      },
      getIdentity: async (path: string) => {
        assert.equal(path, workspace);
        trace.push("identity");
        return identity;
      },
      ...options.ports,
    };
    const repo = new Proxy(methods, {
      get(target, key) {
        if (key in target) return target[key as keyof typeof target];
        return () => assert.fail(`unapproved repo/process/fs/mutation port: ${String(key)}`);
      },
    }) as GitCliRepo;
    const api: IGitService = createGitService({ repo, commitMessageGenerator: options.generator });
    return { api, status, branch, trace, identity };
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
    const server = new rpc.ChannelServer(serverProtocol, "owned-git-read-host");
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
  return { service, remote, url, uiUrl, warnings };
}
