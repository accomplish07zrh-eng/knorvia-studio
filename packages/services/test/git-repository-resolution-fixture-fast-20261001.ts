// All production read effects are owned synthetic ports. No live repository IO.
import assert from "node:assert/strict";
import { after, mock } from "node:test";
import * as rpc from "@knorvia/rpc";
import type { IGitService } from "../src/git/git.js";
import type {
  GitCommandExecutionOptions,
  GitCommandExecutionResult,
} from "../src/git/providers/gitCommandProvider.js";

export const workspace = "owned synthetic workspace/--path 中文";
export const root = "owned synthetic repository/--root 中文";
export const revArgs = [
  "rev-parse",
  "--show-toplevel",
  "--show-prefix",
  "--absolute-git-dir",
  "--git-common-dir",
];
export function result(values: Partial<GitCommandExecutionResult> = {}): GitCommandExecutionResult {
  return {
    binaryPath: "owned fake binary",
    cwd: workspace,
    args: [],
    stdout: `${root}\nsubdir/\nowned git dir\n\n`,
    stderr: "",
    exitCode: 0,
    signal: null,
    durationMs: 7,
    timedOut: false,
    outputTruncated: false,
    ...values,
  };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export function entry(directory: boolean, file: boolean, trace: unknown[] = []) {
  const value = {
    isDirectory() {
      assert.equal(this, value);
      trace.push("directory");
      return directory;
    },
    isFile() {
      assert.equal(this, value);
      trace.push("file");
      return file;
    },
  };
  return value;
}
export async function resolutionFixture() {
  const emitted = process.env.KNORVIA_GIT_RESOLUTION_TARGET === "dist";
  const url = (name: string) =>
    new URL(`../${emitted ? "dist" : "src"}/${name}.${emitted ? "js" : "ts"}`, import.meta.url)
      .href;
  const uiUrl = (name: string) =>
    new URL(
      `../../ui/${emitted ? "dist" : "src"}/${name}.${emitted ? "js" : "ts"}`,
      import.meta.url,
    ).href;
  const previous = process.env;
  process.env = {
    ...(previous.NODE_TEST_CONTEXT ? { NODE_TEST_CONTEXT: previous.NODE_TEST_CONTEXT } : {}),
    HOME: "owned synthetic home",
    ProgramFiles: "owned synthetic programs",
    ProgramW6432: "owned synthetic programs64",
    "ProgramFiles(x86)": "owned synthetic programs32",
  };
  after(() => {
    process.env = previous;
  });
  const forbidden = () => assert.fail("unapproved resolution process/fs/settings/time port");
  mock.module(url("git/providers/gitCommandProvider"), {
    namedExports: { createGitCommandProvider: forbidden },
  });
  mock.module(url("paths"), { namedExports: { getKnorviaDataRootDir: forbidden } });
  let fsPort: {
    stat(path: unknown): unknown;
    readFile(path: unknown, encoding: unknown): unknown;
  } = {
    stat: forbidden,
    readFile: forbidden,
  };
  mock.module("node:fs/promises", {
    namedExports: {
      access: forbidden,
      open: forbidden,
      realpath: forbidden,
      mkdir: forbidden,
      mkdtemp: forbidden,
      rm: forbidden,
      stat: (path: unknown) => fsPort.stat(path),
      readFile: (path: unknown, encoding: unknown) => fsPort.readFile(path, encoding),
    },
  });
  const logs: unknown[][] = [];
  const logger = {
    info: forbidden,
    debug: forbidden,
    warn: (...args: unknown[]) => logs.push(args),
    error: forbidden,
  };
  mock.module(url("logger/serviceLogger"), { namedExports: { createServiceLogger: () => logger } });
  mock.module(uiUrl("logger"), { namedExports: { logger } });
  const { createGitCliRepo } = await import(url("git/repo/gitCliRepo"));
  const { createGitService } = await import(url("git/gitService"));
  const { IGitService: descriptor } = await import(url("git/git"));
  function fixture(
    options: {
      binary?: () => unknown;
      run?: (command: GitCommandExecutionOptions) => unknown;
      stat?: (path: unknown) => unknown;
      read?: (path: unknown, encoding: unknown) => unknown;
    } = {},
  ) {
    const trace: unknown[] = [],
      commands: GitCommandExecutionOptions[] = [];
    const provider = {
      resolveGitBinary() {
        assert.equal(this, provider);
        trace.push("binary");
        return (options.binary ? options.binary() : Promise.resolve("owned fake git")) as Promise<
          string | null
        >;
      },
      run(command: GitCommandExecutionOptions) {
        assert.equal(this, provider);
        trace.push(["run", command.cwd]);
        commands.push(command);
        return (
          options.run ? options.run(command) : Promise.resolve(result())
        ) as Promise<GitCommandExecutionResult>;
      },
    };
    fsPort = {
      stat(path) {
        trace.push(["stat", path]);
        return options.stat ? options.stat(path) : entry(true, false, trace);
      },
      readFile(path, encoding) {
        trace.push(["read", path, encoding]);
        return options.read ? options.read(path, encoding) : forbidden();
      },
    };
    const repo = createGitCliRepo({ commandProvider: provider });
    return { repo, provider, trace, commands, api: createGitService({ repo }) };
  }
  function remote(t: { after(fn: () => void): void }, api: IGitService) {
    const toServer = new rpc.Emitter<rpc.VSBuffer>(),
      toClient = new rpc.Emitter<rpc.VSBuffer>();
    const serverProtocol: rpc.IMessagePassingProtocol = {
      onMessage: toServer.event,
      send: (value) => queueMicrotask(() => toClient.fire(value)),
    };
    const clientProtocol: rpc.IMessagePassingProtocol = {
      onMessage: toClient.event,
      send: (value) => queueMicrotask(() => toServer.fire(value)),
    };
    const server = new rpc.ChannelServer(serverProtocol, "owned-resolution-host");
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
