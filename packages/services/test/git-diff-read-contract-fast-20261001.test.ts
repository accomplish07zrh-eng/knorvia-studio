import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import type { GitDiffQuery } from "@knorvia/shared";
import {
  diffReadFixture,
  answer,
  result,
  root,
  workspace,
  statusOutput,
} from "./git-diff-read-fixture-fast-20261001.js";
const f = await diffReadFixture();
type Scenario = {
  name: string;
  query?: Partial<GitDiffQuery>;
  options?: (e: Error) => Parameters<typeof f.fixture>[0];
  availability?: string;
  summary?: string;
};
const diff = (r: ReturnType<typeof result>) => ({
  run: (c: Parameters<typeof answer>[0]) =>
    c.args[0] === "diff" && !c.args.includes("--numstat") ? r : answer(c),
});
const cases: Scenario[] = [
  { name: "staged", availability: "patch" },
  { name: "unstaged", query: { sourceId: "unstaged" }, availability: "patch" },
  { name: "explicit false wins staged source", query: { staged: false }, availability: "patch" },
  {
    name: "explicit true wins unstaged source",
    query: { sourceId: "unstaged", staged: true },
    availability: "patch",
  },
  {
    name: "absolute option-looking Unicode path",
    query: { path: resolve(workspace, "--文.txt") },
    availability: "patch",
  },
  {
    name: "native relative backslash path",
    query: { path: "dir\\--文.txt" },
    availability: "patch",
  },
  {
    name: "branch wins explicit staged",
    query: { sourceId: "branch", staged: true },
    availability: "patch",
  },
  {
    name: "branch missing upstream",
    query: { sourceId: "branch" },
    options: () => ({
      run: (c) => (c.args[0] === "status" ? result({ stdout: "# branch.head main\0" }) : answer(c)),
    }),
    availability: "unavailable",
    summary: "Current branch does not have an upstream branch.",
  },
  {
    name: "branch merge-base failure fallback",
    query: { sourceId: "branch" },
    options: () => ({
      run: (c) => (c.args[0] === "merge-base" ? result({ exitCode: 1, stdout: "" }) : answer(c)),
    }),
    availability: "patch",
  },
  {
    name: "missing blob preserves patch without content pair",
    options: () => ({
      run: (c) =>
        c.args[0] === "show" && c.args[1]?.startsWith("HEAD:")
          ? result({ exitCode: 1, stdout: "" })
          : answer(c),
    }),
    availability: "patch",
  },
  {
    name: "binary blob preserves patch without content pair",
    options: () => ({
      run: (c) => (c.args[0] === "show" ? result({ stdout: "owned\0blob" }) : answer(c)),
    }),
    availability: "patch",
  },
  {
    name: "working preview stat failure preserves patch",
    query: { sourceId: "unstaged" },
    options: (e) => ({
      fs: {
        stat: () => {
          throw e;
        },
      },
    }),
    availability: "patch",
  },
  {
    name: "truncated current still attempts content",
    query: { sourceId: "unstaged" },
    options: () => diff(result({ stdout: "owned", outputTruncated: true })),
    availability: "truncated",
  },
  {
    name: "binary current still attempts content",
    query: { sourceId: "unstaged" },
    options: () => diff(result({ stdout: "GIT binary patch" })),
    availability: "binary",
  },
  {
    name: "empty staged never enters untracked fallback",
    options: () => diff(result({ stdout: "" })),
    availability: "unavailable",
    summary: "No Git diff is available for this file.",
  },
  {
    name: "empty current stable CRLF untracked patch",
    query: { sourceId: "unstaged" },
    options: () => ({
      ...diff(result({ stdout: "" })),
      fs: { readFile: () => Buffer.from("owned\r\ntext") },
    }),
    availability: "patch",
  },
  {
    name: "empty untracked file",
    query: { sourceId: "unstaged" },
    options: () => ({ ...diff(result({ stdout: "" })), fs: { readFile: () => Buffer.alloc(0) } }),
    availability: "patch",
  },
  {
    name: "binary untracked has no no-index effect",
    query: { sourceId: "unstaged" },
    options: () => ({
      ...diff(result({ stdout: "" })),
      fs: { readFile: () => Buffer.from("owned\0") },
    }),
    availability: "binary",
  },
  {
    name: "oversized untracked has no no-index effect",
    query: { sourceId: "unstaged" },
    options: () => ({
      ...diff(result({ stdout: "" })),
      fs: { readFile: () => Buffer.alloc(1048577, 65) },
    }),
    availability: "truncated",
  },
  {
    name: "missing current file retains initial failure",
    query: { sourceId: "unstaged" },
    options: (e) => ({
      ...diff(result({ stdout: "", exitCode: 2, stderr: "owned diff error" })),
      fs: { access: () => Promise.reject(e) },
    }),
    availability: "unavailable",
    summary: "owned diff error",
  },
  {
    name: "unreadable current accepts no-index exit1",
    query: { sourceId: "unstaged" },
    options: (e) => ({
      fs: { readFile: () => Promise.reject(e) },
      run: (c) =>
        c.args.includes("--no-index")
          ? result({ stdout: "owned no-index patch", exitCode: 1 })
          : c.args[0] === "diff" && !c.args.includes("--numstat")
            ? result({ stdout: "" })
            : answer(c),
    }),
    availability: "patch",
  },
  {
    name: "no-index rejected code/prose",
    query: { sourceId: "unstaged" },
    options: (e) => ({
      fs: {
        readFile: () => {
          throw e;
        },
      },
      run: (c) =>
        c.args.includes("--no-index")
          ? result({ stdout: "owned stdout", stderr: " owned no-index error ", exitCode: 2 })
          : c.args[0] === "diff" && !c.args.includes("--numstat")
            ? result({ stdout: "" })
            : answer(c),
    }),
    availability: "unavailable",
    summary: "owned no-index error",
  },
  {
    name: "Git unavailable",
    options: () => ({ binary: () => null }),
    availability: "unavailable",
    summary: "Git binary is not available in the current environment.",
  },
  {
    name: "not repository",
    options: () => ({
      run: (c) =>
        c.args[0] === "rev-parse"
          ? result({ exitCode: 128, stderr: "not a git repository" })
          : answer(c),
    }),
    availability: "unavailable",
    summary: "Workspace is not inside a Git repository.",
  },
  { name: "outside root error", query: { path: "../../--outside.txt" } },
  {
    name: "realpath escape error",
    options: () => ({ fs: { realpath: (p) => resolve(root, "..", "outside.txt") } }),
  },
  {
    name: "resolution synchronous provider throw",
    options: (e) => ({
      binary: () => {
        throw e;
      },
    }),
  },
  {
    name: "diff synchronous provider throw",
    options: (e) => ({
      run: (c) => {
        if (c.args[0] === "diff") throw e;
        return answer(c);
      },
    }),
  },
  {
    name: "diff rejected provider",
    options: (e) => ({ run: (c) => (c.args[0] === "diff" ? Promise.reject(e) : answer(c)) }),
  },
  {
    name: "blob rejected provider",
    options: (e) => ({ run: (c) => (c.args[0] === "show" ? Promise.reject(e) : answer(c)) }),
  },
  {
    name: "branch status rejected provider",
    query: { sourceId: "branch" },
    options: (e) => ({ run: (c) => (c.args[0] === "status" ? Promise.reject(e) : answer(c)) }),
  },
];
for (const transport of ["service", "RPC"] as const)
  for (const c of cases)
    test(`frozen diff read ${transport}: ${c.name}`, async (t) => {
      const e = new Error("owned diff query port failure");
      async function observe(legacy: boolean) {
        const s = f.fixture(c.options?.(e), legacy),
          api = transport === "RPC" ? f.remote(t, s.api) : s.api;
        const query = Object.freeze({
          workspacePath: workspace,
          path: "--owned 文.txt",
          sourceId: "staged",
          ...c.query,
        }) as GitDiffQuery;
        let output: unknown;
        try {
          output = await api.getDiff(query);
        } catch (error) {
          output = {
            name: (error as Error).name,
            message: (error as Error).message,
            samePortError: error === e,
          };
        }
        if (c.availability)
          assert.equal((output as { availability: string }).availability, c.availability);
        if (c.summary) assert.equal((output as { summary: string }).summary, c.summary);
        for (const command of s.commands.filter(
          (x) => x.args[0] === "diff" && !x.args.includes("--numstat"),
        )) {
          assert.equal(command.cwd, root);
          assert.equal(command.timeoutMs, 20000);
          assert.equal(command.maxOutputBytes, 1048576);
          if (command.args.includes("--no-index"))
            assert.deepEqual(command.args.slice(0, 6), [
              "diff",
              "--no-index",
              "--no-ext-diff",
              "--no-color",
              "--binary",
              f.config.getGitNullDevicePath(),
            ]);
          else assert.equal(command.args.at(-2), "--");
        }
        if (c.name.includes("no no-index"))
          assert.equal(
            s.commands.some((x) => x.args.includes("--no-index")),
            false,
          );
        if (c.name === "missing blob preserves patch without content pair")
          assert.equal((output as { beforeContent: unknown }).beforeContent, null);
        if (c.name === "branch merge-base failure fallback")
          assert.ok(
            s.commands.some(
              (x) => x.args[0] === "show" && x.args[1] === "owned-origin/main:sub/--owned 文.txt",
            ),
          );
        return { output, commands: s.commands, trace: s.trace };
      }
      assert.deepEqual(await observe(false), await observe(true));
    });

for (const sourceId of ["branch", "staged", "unstaged"] as const)
  for (const throws of [false, true])
    test(`frozen receiver/params/getter order ${sourceId} throws=${throws}`, async () => {
      async function observe(legacy: boolean) {
        const s = f.fixture({}, legacy),
          events: string[] = [];
        for (const name of ["resolveRepository", "getStatus"] as const) {
          const original = s.repo[name];
          Object.defineProperty(s.repo, name, {
            get() {
              events.push(name + "-get");
              return function (this: unknown, p: string) {
                assert.equal(this, s.repo);
                events.push(name + "-call");
                return original.call(s.repo, p);
              };
            },
          });
        }
        const query = {} as GitDiffQuery;
        let n = 0;
        for (const name of ["workspacePath", "path", "sourceId", "staged"] as const)
          Object.defineProperty(query, name, {
            get() {
              events.push(name);
              if (throws && name === "path" && ++n === 2)
                throw new Error("owned second path getter");
              return name === "workspacePath"
                ? workspace
                : name === "path"
                  ? "--owned 文.txt"
                  : name === "sourceId"
                    ? sourceId
                    : undefined;
            },
          });
        let output: unknown;
        try {
          output = await s.api.getDiff(query);
        } catch (e) {
          output = (e as Error).message;
        }
        return { output, events, trace: s.trace };
      }
      assert.deepEqual(await observe(false), await observe(true));
    });
test("frozen params read path before unavailable guard and status only for branch", async () => {
  for (const legacy of [false, true]) {
    const s = f.fixture({ binary: () => null }, legacy);
    await assert.rejects(
      s.repo.getDiff({
        get workspacePath() {
          return workspace;
        },
        get path(): string {
          throw new Error("owned unavailable path getter");
        },
      }),
      /owned unavailable path getter/,
    );
    assert.equal(s.commands.length, 0);
  }
});
test("frozen branch status non-upstream suppresses diff/blob effects", async () => {
  for (const legacy of [false, true]) {
    const s = f.fixture(
      {
        run: (c) =>
          c.args[0] === "status"
            ? result({ stdout: statusOutput.replace("owned-origin/main", "") })
            : answer(c),
      },
      legacy,
    );
    await s.api.getDiff({ workspacePath: workspace, path: "owned.txt", sourceId: "branch" });
    assert.equal(
      s.commands.filter((c) => c.args[0] === "diff" && !c.args.includes("--numstat")).length,
      0,
    );
    assert.equal(s.commands.filter((c) => c.args[0] === "show").length, 0);
  }
});
