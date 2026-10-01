import assert from "node:assert/strict";
import { test } from "node:test";
import {
  identityReadFixture,
  identityAnswer,
  result,
  workspace,
  root,
  deferred,
} from "./git-identity-read-fixture-fast-20261001.js";
const f = await identityReadFixture();
const fields = (scope: string | null, source: string | null, value: string | null) => ({
  scope,
  source,
  value,
});
const samples: [string, ReturnType<typeof fields>][] = [
  ["", fields(null, null, null)],
  ["\n", fields(null, null, null)],
  ["  owned value  \n", fields(null, null, "  owned value  ")],
  [
    "local\tfile:owned-config\tOwned author\r\n",
    fields("local", "file:owned-config", "Owned author"),
  ],
  ["local\tfile:owned-config", fields(null, null, "local\tfile:owned-config")],
  ["\towned-source\t", fields("", "owned-source", null)],
  ["local\t\tX", fields("local", "", "X")],
  ["\t\t", fields("", "", null)],
  ["local\tsource\t x\t y \r\n", fields("local", "source", " x\t y ")],
  [
    "local\tfile:C:\\owned\\文\tUnicode文\0X",
    fields("local", "file:C:\\owned\\文", "Unicode文\0X"),
  ],
  ["local\tsource\tfirst\nsecond\r\n", fields("local", "source", "first\nsecond")],
  ["owned\r\n\n", fields(null, null, "owned\r\n")],
  ["owned\n\r\n", fields(null, null, "owned\n")],
  ["local\tsource\tvalue\r", fields("local", "source", "value\r")],
];
for (const [stdout, expected] of samples)
  test(`config record ${JSON.stringify(stdout)}`, () => {
    const input = Object.freeze(result({ stdout }));
    assert.deepEqual(f.parse(input), expected);
    assert.deepEqual(f.parse(input), f.legacyParse(input));
    assert.notEqual(f.parse(input), f.parse(input));
  });
for (const flags of [
  {},
  { timedOut: true },
  { outputTruncated: true },
  { timedOut: true, outputTruncated: true },
])
  test(`missing config exit1 priority ${JSON.stringify(flags)}`, () => {
    for (const parse of [f.parse, f.legacyParse]) {
      const r = result({ exitCode: 1, ...flags });
      Object.defineProperty(r, "stdout", {
        get() {
          assert.fail("missing exit1 must not read stdout");
        },
      });
      assert.deepEqual(parse(r), fields(null, null, null));
    }
  });
for (const [flags, message] of [
  [{ timedOut: true, timeoutMs: 15 }, "git config timed out after 15ms (elapsed=7ms)"],
  [{ outputTruncated: true }, "git config output exceeded limit"],
  [{ exitCode: 2, stderr: " owned error " }, "git config failed: owned error"],
  [{ exitCode: null, stdout: "", stderr: "" }, "git config failed: exitCode=null"],
] as const)
  test(`config failure ${message}`, () => {
    for (const parse of [f.parse, f.legacyParse])
      assert.throws(() => parse(result(flags)), { message });
  });
for (const stop of ["none", "exitCode", "timedOut", "outputTruncated", "stdout", "stderr"] as const)
  test(`config lazy read/throw identity ${stop}`, () => {
    const e = new Error("owned config getter failure");
    function observe(parse: typeof f.parse) {
      const reads: string[] = [],
        r = {} as ReturnType<typeof result>;
      for (const [key, value] of Object.entries(
        result({
          exitCode: stop === "stderr" ? 2 : 0,
          stdout: "local\towned-source\tOwned value\n",
        }),
      ))
        Object.defineProperty(r, key, {
          get() {
            reads.push(key);
            if (key === stop) throw e;
            return value;
          },
        });
      try {
        return { output: parse(r), reads };
      } catch (error) {
        assert.equal(error, e);
        return { error: true, reads };
      }
    }
    assert.deepEqual(observe(f.parse), observe(f.legacyParse));
  });
for (const transport of ["service", "RPC"] as const)
  for (const scenario of [
    "normal",
    "missing",
    "opaque",
    "empty-scope",
    "unavailable",
    "nonrepo",
    "name-error",
    "email-error",
    "name-reject",
    "email-throw",
  ] as const)
    test(`actual identity ${transport}/${scenario}`, async (t) => {
      const error = new Error("owned identity command failure");
      async function observe(legacy: boolean) {
        const s = f.fixture(
            {
              binary: () => (scenario === "unavailable" ? null : "owned fake git"),
              run: (c) => {
                if (scenario === "nonrepo" && c.args[0] === "rev-parse")
                  return result({ exitCode: 128, stderr: "not a git repository" });
                if (c.args[0] !== "config") return identityAnswer(c);
                const name = c.args.at(-1) === "user.name";
                if (scenario === "name-reject" && name) return Promise.reject(error);
                if (scenario === "email-throw" && !name) throw error;
                if ((scenario === "name-error" && name) || (scenario === "email-error" && !name))
                  return result({ exitCode: 2, stderr: "owned config invalid" });
                if (scenario === "missing") return result({ exitCode: 1, stdout: "" });
                if (scenario === "opaque") return result({ stdout: " owned raw \ttext\r\n" });
                if (scenario === "empty-scope")
                  return result({
                    stdout: `${name ? "" : "global"}\towned-source\t${name ? "Owned author" : "owned@example.invalid"}\n`,
                  });
                return identityAnswer(c);
              },
            },
            legacy,
          ),
          api = transport === "RPC" ? f.remote(t, s.api) : s.api;
        let output: unknown;
        try {
          output = await api.getIdentity({ workspacePath: workspace });
        } catch (e) {
          output = {
            name: (e as Error).name,
            message: (e as Error).message,
            samePortError: e === error,
          };
        }
        const commands = s.commands.filter((c) => c.args[0] === "config");
        assert.equal(commands.length, ["unavailable", "nonrepo"].includes(scenario) ? 0 : 2);
        commands.forEach((c, i) =>
          assert.deepEqual(c, {
            cwd: root,
            args: [
              "config",
              "--show-scope",
              "--show-origin",
              "--get",
              i === 0 ? "user.name" : "user.email",
            ],
            timeoutMs: 15000,
          }),
        );
        if (scenario === "empty-scope")
          assert.equal((output as { scopeLabel: string }).scopeLabel, "");
        if (scenario === "normal")
          assert.deepEqual(output, {
            userName: "Owned author",
            userEmail: "owned@example.invalid",
            nameSource: "file:owned-config",
            emailSource: "file:owned-config",
            scopeLabel: "local",
          });
        return { output, commands: s.commands, effects: s.trace };
      }
      assert.deepEqual(await observe(false), await observe(true));
    });
for (const transport of ["service", "RPC"] as const)
  for (const includeIdentity of [false, true])
    test(`actual refresh ${transport} includeIdentity=${includeIdentity}`, async (t) => {
      async function observe(legacy: boolean) {
        const s = f.fixture({}, legacy),
          api = transport === "RPC" ? f.remote(t, s.api) : s.api;
        const value = await api.refresh({
          workspacePath: workspace,
          includeIdentity,
          includeBranchComparison: false,
        });
        assert.equal(s.commands.filter((c) => c.args[0] === "rev-parse").length, 1);
        assert.equal(
          s.commands.filter((c) => c.args[0] === "config").length,
          includeIdentity ? 2 : 0,
        );
        assert.equal(value.identity?.userName ?? null, includeIdentity ? "Owned author" : null);
        return { value, effects: s.trace };
      }
      assert.deepEqual(await observe(false), await observe(true));
    });
test("config name error has precedence after both results, despite earlier email completion", async () => {
  for (const legacy of [false, true]) {
    const name = deferred<ReturnType<typeof result>>(),
      email = deferred<ReturnType<typeof result>>(),
      started = deferred<void>();
    let n = 0;
    const s = f.fixture(
      {
        run: (c) => {
          if (c.args[0] !== "config") return identityAnswer(c);
          if (++n === 2) started.resolve();
          return c.args.at(-1) === "user.name" ? name.promise : email.promise;
        },
      },
      legacy,
    );
    const request = s.api.getIdentity({ workspacePath: workspace });
    await started.promise;
    email.resolve(result({ exitCode: 2, stderr: "owned email failure" }));
    name.resolve(result({ exitCode: 2, stderr: "owned name failure" }));
    await assert.rejects(request, { message: "git config failed: owned name failure" });
  }
});
