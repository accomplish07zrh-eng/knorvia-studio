// Owned fake ports and labelled exposed test oracle; never product/user IO.
import assert from "node:assert/strict";
import { after, mock } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as path from "node:path";
import ts from "typescript";
import * as rpc from "@knorvia/rpc";
import type { IGitService } from "../src/git/git.js";
import type { GitCommandExecutionOptions } from "../src/git/providers/gitCommandProvider.js";
import { result, deferred } from "./git-repository-resolution-fixture-fast-20261001.js";
export { result, deferred };
export const root = path.resolve("owned synthetic diff-query repository 中文");
export const workspace = path.resolve(root, "sub");
export const revOutput = `${root}\nsub/\n${root}/.git\n${root}/.git\n`;
export const statusOutput = "# branch.head main\0# branch.upstream owned-origin/main\0";
export function answer(c: GitCommandExecutionOptions) {
  return result({
    stdout:
      c.args[0] === "rev-parse"
        ? revOutput
        : c.args[0] === "status"
          ? statusOutput
          : c.args[0] === "merge-base"
            ? "owned-base\n"
            : c.args[0] === "show"
              ? `owned blob ${c.args[1]}\n`
              : c.args[0] === "diff" && c.args.includes("--numstat")
                ? ""
                : "owned patch\n",
  });
}
export async function diffReadFixture() {
  const dist = process.env.KNORVIA_GIT_RESOLUTION_TARGET === "dist";
  const url = (name: string) =>
    new URL(`../${dist ? "dist" : "src"}/${name}.${dist ? "js" : "ts"}`, import.meta.url).href;
  const previous = process.env;
  process.env = previous.NODE_TEST_CONTEXT ? { NODE_TEST_CONTEXT: previous.NODE_TEST_CONTEXT } : {};
  after(() => {
    process.env = previous;
  });
  mock.method(Date, "now", () => 123456);
  const forbidden = () => assert.fail("unowned diff-query process/fs/settings port");
  type Options = {
    commitFixture?: boolean;
    run?: (c: GitCommandExecutionOptions) => unknown;
    binary?: () => unknown;
    fs?: Partial<
      Record<"realpath" | "access" | "stat" | "readFile", (...args: unknown[]) => unknown>
    >;
  };
  let owned: Options = {},
    trace: unknown[] = [];
  const fs = {
    realpath: async (p: unknown) => {
      trace.push(["realpath", p]);
      return owned.fs?.realpath ? owned.fs.realpath(p) : p;
    },
    access: async (p: unknown) => {
      trace.push(["access", p]);
      return owned.fs?.access ? owned.fs.access(p) : undefined;
    },
    stat: async (p: unknown) => {
      trace.push(["stat", p]);
      return owned.fs?.stat ? owned.fs.stat(p) : { isFile: () => true, size: 12 };
    },
    readFile: async (p: unknown, encoding?: unknown) => {
      trace.push(["readFile", p, encoding]);
      return owned.fs?.readFile
        ? owned.fs.readFile(p, encoding)
        : encoding
          ? "owned text\n"
          : Buffer.from("owned text\n");
    },
  };
  const tempPort =
    (name: string, value: unknown) =>
    async (...args: unknown[]) => {
      if (!owned.commitFixture) forbidden();
      trace.push([name, ...args]);
      return value;
    };
  mock.module("node:fs/promises", {
    namedExports: {
      ...fs,
      open: forbidden,
      mkdir: tempPort("mkdir", undefined),
      mkdtemp: tempPort("mkdtemp", path.resolve(root, "owned-temp-index")),
      rm: tempPort("rm", undefined),
    },
  });
  mock.module(url("git/providers/gitCommandProvider"), {
    namedExports: { createGitCommandProvider: forbidden },
  });
  mock.module(url("paths"), {
    namedExports: {
      getKnorviaDataRootDir: () =>
        owned.commitFixture ? path.resolve(root, "owned-data") : forbidden(),
    },
  });
  mock.module(url("logger/serviceLogger"), {
    namedExports: {
      createServiceLogger: () => ({
        info: forbidden,
        debug: forbidden,
        error: forbidden,
        warn: (...args: unknown[]) => trace.push(["warn", ...args]),
      }),
    },
  });
  const helpers = await import(url("git/repo/gitCliHelpers")),
    config = await import(url("git/config"));
  const oracle = JSON.parse(
    readFileSync(new URL("./git-diff-read-legacy-fast-20261001.json", import.meta.url), "utf8"),
  );
  assert.equal(oracle.commit, "a115bbe2b247551136591568f658fa4dbb70e193");
  assert.equal(oracle.spans.length, 10);
  for (const s of oracle.spans)
    assert.equal(createHash("sha256").update(s.text).digest("hex"), s.sha256);
  const declarations = oracle.spans
    .filter((s: { name: string }) => s.name !== "getDiff")
    .map((s: { text: string }) => s.text)
    .join("\n");
  const method = oracle.spans.find((s: { name: string }) => s.name === "getDiff").text;
  const compiled = ts.transpileModule(
    `${declarations}\nfunction frozen(commandProvider){return {${method}}.getDiff;}`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const bindings = {
    isAbsolute: path.isAbsolute,
    resolve: path.resolve,
    sep: path.sep,
    stat: fs.stat,
    readFile: fs.readFile,
    normalizeInputPath: helpers.normalizeInputPath,
    toDiffResult: helpers.toDiffResult,
    fileExists: helpers.fileExists,
    buildUntrackedTextDiffResult: helpers.buildUntrackedTextDiffResult,
    DEFAULT_GIT_DIFF_TIMEOUT_MS: config.DEFAULT_GIT_DIFF_TIMEOUT_MS,
    DEFAULT_GIT_DIFF_BYTES: config.DEFAULT_GIT_DIFF_BYTES,
    DEFAULT_GIT_COMMAND_TIMEOUT_MS: config.DEFAULT_GIT_COMMAND_TIMEOUT_MS,
    DEFAULT_GIT_OUTPUT_BYTES: config.DEFAULT_GIT_OUTPUT_BYTES,
    getGitNullDevicePath: config.getGitNullDevicePath,
  };
  const frozen = new Function(...Object.keys(bindings), compiled + ";return frozen;")(
    ...Object.values(bindings),
  );
  const { createGitCliRepo } = await import(url("git/repo/gitCliRepo")),
    { createGitService } = await import(url("git/gitService")),
    { IGitService: descriptor } = await import(url("git/git"));
  function fixture(options: Options = {}, legacy = false) {
    owned = options;
    trace = [];
    const effects = trace,
      commands: GitCommandExecutionOptions[] = [];
    const provider = {
      get resolveGitBinary() {
        effects.push("binary-get");
        return function (this: unknown) {
          assert.equal(this, provider);
          effects.push("binary");
          return options.binary ? options.binary() : "owned fake git";
        };
      },
      get run() {
        effects.push("run-get");
        return function (this: unknown, c: GitCommandExecutionOptions) {
          assert.equal(this, provider);
          effects.push(["run", c]);
          commands.push(c);
          return options.run ? options.run(c) : answer(c);
        };
      },
    };
    const repo = createGitCliRepo({ commandProvider: provider as never });
    if (legacy) repo.getDiff = frozen(provider);
    return { repo, api: createGitService({ repo }), commands, trace: effects, provider };
  }
  function remote(t: { after(fn: () => void): void }, api: IGitService) {
    const toServer = new rpc.Emitter<rpc.VSBuffer>(),
      toClient = new rpc.Emitter<rpc.VSBuffer>();
    const server = new rpc.ChannelServer(
      { onMessage: toServer.event, send: (v) => queueMicrotask(() => toClient.fire(v)) },
      "owned-diff-query-host",
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
  return { fixture, remote, url, fs, config };
}
