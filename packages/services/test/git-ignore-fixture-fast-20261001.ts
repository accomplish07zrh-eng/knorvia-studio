// Owned fake ports; harness conventions reuse earlier source-exposed lane fixtures.
import assert from "node:assert/strict";
import { after, mock } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, resolve, sep } from "node:path";
import ts from "typescript";
import * as rpc from "@knorvia/rpc";
import type { IGitService } from "../src/git/git.js";
import type { GitCommandExecutionOptions } from "../src/git/providers/gitCommandProvider.js";
import { deferred, result } from "./git-repository-resolution-fixture-fast-20261001.js";
export { deferred, result };
export const root = resolve("owned synthetic ignore repository 中文");
export const workspace = resolve(root, "sub");
export const revOutput = `${root}\nsub/\n${root}/.git\n${root}/.git\n`;
export async function ignoreFixture() {
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
  process.env = previous.NODE_TEST_CONTEXT ? { NODE_TEST_CONTEXT: previous.NODE_TEST_CONTEXT } : {};
  after(() => {
    process.env = previous;
  });
  const forbidden = () => assert.fail("unowned ignored-path process/fs/settings/clock port");
  mock.module(url("git/providers/gitCommandProvider"), {
    namedExports: { createGitCommandProvider: forbidden },
  });
  mock.module(url("paths"), { namedExports: { getKnorviaDataRootDir: forbidden } });
  let realpath: (path: unknown) => unknown = forbidden;
  mock.module("node:fs/promises", {
    namedExports: {
      access: forbidden,
      open: forbidden,
      stat: forbidden,
      readFile: forbidden,
      mkdir: forbidden,
      mkdtemp: forbidden,
      rm: forbidden,
      realpath: (path: unknown) => realpath(path),
    },
  });
  const logs: unknown[][] = [];
  const logger = {
    info: forbidden,
    debug: forbidden,
    error: forbidden,
    warn: (...args: unknown[]) => logs.push(args),
  };
  mock.module(url("logger/serviceLogger"), { namedExports: { createServiceLogger: () => logger } });
  mock.module(uiUrl("logger"), { namedExports: { logger } });
  const { createGitCliRepo } = await import(url("git/repo/gitCliRepo"));
  const { createGitService } = await import(url("git/gitService"));
  const { IGitService: descriptor } = await import(url("git/git"));
  const config = await import(url("git/config"));
  const helpers = await import(url("git/repo/gitCliHelpers"));
  // Exact inherited method, compiled only in test memory. Never production code.
  const oracle = JSON.parse(
    readFileSync(new URL("./git-ignore-legacy-fast-20261001.json", import.meta.url), "utf8"),
  );
  assert.equal(oracle.commit, "e9cd7fca050a59e484ebe8f7aa9a42cd7e2ed4bf");
  assert.equal(
    oracle.sourceSha256,
    "c28a066566656c3402edbe89f4b40d4090dc0ae9635795a9de5109097c11e189",
  );
  assert.equal(createHash("sha256").update(oracle.method.text).digest("hex"), oracle.method.sha256);
  const compiled = ts.transpileModule(
    `function frozen(commandProvider) {return {${oracle.method.text}}.getIgnoredPaths;}`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const frozen = new Function(
    "isAbsolute",
    "resolve",
    "sep",
    "normalizeInputPath",
    "ensureGitCommandSucceeded",
    "DEFAULT_GIT_COMMAND_TIMEOUT_MS",
    "DEFAULT_GIT_OUTPUT_BYTES",
    compiled + ";return frozen;",
  )(
    isAbsolute,
    resolve,
    sep,
    helpers.normalizeInputPath,
    helpers.ensureGitCommandSucceeded,
    config.DEFAULT_GIT_COMMAND_TIMEOUT_MS,
    config.DEFAULT_GIT_OUTPUT_BYTES,
  );
  function fixture(
    options: {
      binary?: () => unknown;
      run?: (command: GitCommandExecutionOptions) => unknown;
      realpath?: (path: unknown) => unknown;
    } = {},
    legacy = false,
  ) {
    const commands: GitCommandExecutionOptions[] = [],
      trace: unknown[] = [];
    const provider = {
      resolveGitBinary() {
        assert.equal(this, provider);
        trace.push("binary");
        return options.binary ? options.binary() : "owned fake git";
      },
      run(command: GitCommandExecutionOptions) {
        assert.equal(this, provider);
        commands.push(command);
        trace.push(["run", command.args]);
        return options.run
          ? options.run(command)
          : result({ stdout: command.args[0] === "rev-parse" ? revOutput : "sub/item\n" });
      },
    };
    realpath = (path) => {
      trace.push(["realpath", path]);
      return Promise.resolve(options.realpath ? options.realpath(path) : path);
    };
    const repo = createGitCliRepo({ commandProvider: provider as never });
    if (legacy) repo.getIgnoredPaths = frozen(provider);
    return { repo, provider, commands, trace, api: createGitService({ repo }) };
  }
  function remote(t: { after(fn: () => void): void }, api: IGitService) {
    const toServer = new rpc.Emitter<rpc.VSBuffer>(),
      toClient = new rpc.Emitter<rpc.VSBuffer>();
    const server = new rpc.ChannelServer(
      { onMessage: toServer.event, send: (v) => queueMicrotask(() => toClient.fire(v)) },
      "owned-ignore-host",
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
    return rpc.ProxyChannel.toService<IGitService>(client.getChannel(descriptor.channelName));
  }
  return { fixture, remote, url, uiUrl, logs };
}
