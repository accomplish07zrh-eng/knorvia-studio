// Synthetic filesystem/process ports and an explicitly copied test-only oracle.
import assert from "node:assert/strict";
import { after, mock } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import ts from "typescript";
import * as rpc from "@knorvia/rpc";
import type { IGitService } from "../src/git/git.js";
import type { GitStatusEntry } from "../src/git/repo/gitCliTypes.js";
import { deferred, result } from "./git-repository-resolution-fixture-fast-20261001.js";
export { deferred, result };
export const root = resolve("owned synthetic line-stat repository 中文");
export const workspace = resolve(root, "sub");
export function entry(path: string, isUntracked = true): GitStatusEntry {
  return {
    path,
    originalPath: null,
    kind: "added",
    x: null,
    y: null,
    isUntracked,
    isConflicted: false,
  };
}
type FilePorts = {
  stat(path: string): unknown;
  open(path: string, flags: string): unknown;
  run?: (command: { args: string[] }) => unknown;
};
export async function untrackedStatsFixture() {
  const dist = process.env.KNORVIA_GIT_RESOLUTION_TARGET === "dist";
  const url = (name: string) =>
    new URL(`../${dist ? "dist" : "src"}/${name}.${dist ? "js" : "ts"}`, import.meta.url).href;
  const previous = process.env;
  process.env = previous.NODE_TEST_CONTEXT ? { NODE_TEST_CONTEXT: previous.NODE_TEST_CONTEXT } : {};
  after(() => {
    process.env = previous;
  });
  mock.method(Date, "now", () => 123456);
  const forbidden = () => assert.fail("unowned line-stat IO/process/settings port");
  let owned: FilePorts = { stat: forbidden, open: forbidden };
  let trace: unknown[] = [];
  const fs = {
    stat: (path: string) => {
      trace.push(["stat", path]);
      return owned.stat(path);
    },
    open: (path: string, flags: string) => {
      trace.push(["open", path, flags]);
      return owned.open(path, flags);
    },
  };
  mock.module("node:fs/promises", {
    namedExports: {
      ...fs,
      readFile: forbidden,
      access: forbidden,
      realpath: forbidden,
      mkdir: forbidden,
      mkdtemp: forbidden,
      rm: forbidden,
    },
  });
  mock.module(url("git/providers/gitCommandProvider"), {
    namedExports: { createGitCommandProvider: forbidden },
  });
  mock.module(url("paths"), { namedExports: { getKnorviaDataRootDir: forbidden } });
  mock.module(url("logger/serviceLogger"), {
    namedExports: {
      createServiceLogger: () => ({
        info: forbidden,
        debug: forbidden,
        error: forbidden,
        warn: forbidden,
      }),
    },
  });
  const helpers = await import(url("git/repo/gitCliHelpers"));
  const config = await import(url("git/config"));
  const source = readFileSync(new URL(url("git/repo/gitCliHelpers")), "utf8");
  const sf = ts.createSourceFile("owned-counter.ts", source, ts.ScriptTarget.Latest, true);
  const counter = sf.statements.find(
    (n): n is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(n) && n.name?.text === "countUntrackedFileLines",
  );
  assert.ok(counter);
  const oracle = JSON.parse(
    readFileSync(
      new URL("./git-untracked-stats-legacy-fast-20261001.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(oracle.commit, "4959ec0ef6fd2d4b21b41b7728a1b48f8b6857ec");
  assert.equal(oracle.copiedExposedTestOnly, true);
  assert.deepEqual(
    oracle.spans.map((s: { name: string }) => s.name),
    ["countUntrackedFileLines", "buildUntrackedStats"],
  );
  for (const s of oracle.spans)
    assert.equal(createHash("sha256").update(s.text).digest("hex"), s.sha256);
  const compile = (text: string, exports: string) => {
    const js = ts.transpileModule(text.replace(/^export /gm, ""), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const bindings = {
      ...fs,
      resolve,
      Buffer,
      GIT_UNTRACKED_STAT_MAX_BYTES: config.GIT_UNTRACKED_STAT_MAX_BYTES,
      GIT_UNTRACKED_STAT_CHUNK_BYTES: config.GIT_UNTRACKED_STAT_CHUNK_BYTES,
      GIT_UNTRACKED_STAT_CONCURRENCY: config.GIT_UNTRACKED_STAT_CONCURRENCY,
    };
    return new Function(...Object.keys(bindings), js + `;return {${exports}};`)(
      ...Object.values(bindings),
    );
  };
  const currentCount = compile(
    counter.getText(sf),
    "countUntrackedFileLines",
  ).countUntrackedFileLines;
  const legacy = compile(
    oracle.spans.map((s: { text: string }) => s.text).join("\n"),
    "countUntrackedFileLines,buildUntrackedStats",
  );
  const { createGitCliRepo } = await import(url("git/repo/gitCliRepo"));
  const { createGitService } = await import(url("git/gitService"));
  const { IGitService: descriptor } = await import(url("git/git"));
  function fixture(options: FilePorts) {
    owned = options;
    trace = [];
    const effects = trace,
      commands: unknown[] = [];
    const provider = {
      resolveGitBinary() {
        assert.equal(this, provider);
        return Promise.resolve("owned fake git");
      },
      run(command: { args: string[] }) {
        assert.equal(this, provider);
        commands.push(command);
        return options.run
          ? options.run(command)
          : result({
              stdout:
                command.args[0] === "rev-parse"
                  ? `${root}\nsub/\n${root}/.git\n${root}/.git\n`
                  : command.args[0] === "status"
                    ? "# branch.head main\0? sub/a.txt\0? sub/dir/\0"
                    : "",
            });
      },
    };
    const repo = createGitCliRepo({ commandProvider: provider as never });
    return { trace: effects, commands, repo, api: createGitService({ repo }) };
  }
  function remote(t: { after(fn: () => void): void }, api: IGitService) {
    const toServer = new rpc.Emitter<rpc.VSBuffer>(),
      toClient = new rpc.Emitter<rpc.VSBuffer>();
    const server = new rpc.ChannelServer(
      { onMessage: toServer.event, send: (v) => queueMicrotask(() => toClient.fire(v)) },
      "owned-line-stat-host",
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
  return { fixture, remote, helpers, currentCount, legacy, config };
}
