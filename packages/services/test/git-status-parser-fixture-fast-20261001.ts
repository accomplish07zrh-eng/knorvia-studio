// Source-exposed oracle and existing lane fake-port conventions; no user IO.
import assert from "node:assert/strict";
import { after, mock } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import * as rpc from "@knorvia/rpc";
import type { IGitService } from "../src/git/git.js";
import type { GitCommandExecutionOptions } from "../src/git/providers/gitCommandProvider.js";
import {
  result,
  deferred,
  root,
  workspace,
  revOutput,
} from "./git-ignore-fixture-fast-20261001.js";
export { result, deferred, root, workspace, revOutput };
export const ordinary = (tag: "1" | "2" | "u", xy = "MM", path = "sub/owned.txt") =>
  `${tag} ${xy} ${Array(tag === "1" ? 6 : tag === "2" ? 7 : 8)
    .fill("owned")
    .join(" ")} ${path}`;
export async function statusParserFixture() {
  const dist = process.env.KNORVIA_GIT_RESOLUTION_TARGET === "dist";
  const url = (name: string) =>
    new URL(`../${dist ? "dist" : "src"}/${name}.${dist ? "js" : "ts"}`, import.meta.url).href;
  const previous = process.env;
  process.env = previous.NODE_TEST_CONTEXT ? { NODE_TEST_CONTEXT: previous.NODE_TEST_CONTEXT } : {};
  after(() => {
    process.env = previous;
  });
  const forbidden = () => assert.fail("unowned status-parser process/filesystem/settings port");
  let ownedStat = (_p: unknown) => ({ isFile: () => false, size: 0 });
  mock.module("node:fs/promises", {
    namedExports: {
      access: forbidden,
      open: forbidden,
      readFile: forbidden,
      mkdir: forbidden,
      mkdtemp: forbidden,
      rm: forbidden,
      realpath: async (p: unknown) => p,
      stat: async (p: unknown) => ownedStat(p),
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
        warn: () => undefined,
      }),
    },
  });
  const helpers = await import(url("git/repo/gitCliHelpers")),
    config = await import(url("git/config"));
  const oracle = JSON.parse(
    readFileSync(new URL("./git-status-parser-legacy-fast-20261001.json", import.meta.url), "utf8"),
  );
  assert.equal(oracle.commit, "47d2ae16e44050525a792f30f1feba77047aac71");
  assert.equal(oracle.spans.length, 3);
  for (const s of oracle.spans)
    assert.equal(createHash("sha256").update(s.text).digest("hex"), s.sha256);
  const code = ts.transpileModule(
    oracle.spans.map((s: { text: string }) => s.text.replace(/^export /, "")).join("\n"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const legacy = new Function("normalizeGitPath", code + ";return parseStatusPorcelain;")(
    config.normalizeGitPath,
  ) as typeof helpers.parseStatusPorcelain;
  const { createGitCliRepo } = await import(url("git/repo/gitCliRepo")),
    { createGitService } = await import(url("git/gitService")),
    { IGitService: descriptor } = await import(url("git/git"));
  function fixture(
    options: {
      run?: (c: GitCommandExecutionOptions) => unknown;
      binary?: () => unknown;
      stat?: typeof ownedStat;
    } = {},
  ) {
    const commands: GitCommandExecutionOptions[] = [];
    ownedStat = options.stat ?? (() => ({ isFile: () => false, size: 0 }));
    const provider = {
      resolveGitBinary() {
        assert.equal(this, provider);
        return options.binary ? options.binary() : "owned fake git";
      },
      run(c: GitCommandExecutionOptions) {
        assert.equal(this, provider);
        commands.push(c);
        return options.run
          ? options.run(c)
          : result({ stdout: c.args[0] === "rev-parse" ? revOutput : "" });
      },
    };
    const repo = createGitCliRepo({ commandProvider: provider as never });
    return { repo, api: createGitService({ repo }), commands };
  }
  function remote(t: { after(fn: () => void): void }, api: IGitService) {
    const toServer = new rpc.Emitter<rpc.VSBuffer>(),
      toClient = new rpc.Emitter<rpc.VSBuffer>();
    const server = new rpc.ChannelServer(
      { onMessage: toServer.event, send: (v) => queueMicrotask(() => toClient.fire(v)) },
      "owned-status-parser-host",
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
  return { parse: helpers.parseStatusPorcelain, legacy, fixture, remote };
}
