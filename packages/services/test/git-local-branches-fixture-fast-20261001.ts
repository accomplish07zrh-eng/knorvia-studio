// Reuse owned fake-port harness; copied old method/parser are test-only evidence.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import {
  ignoreFixture,
  result,
  revOutput,
  workspace,
  root,
  deferred,
} from "./git-ignore-fixture-fast-20261001.js";
import { snapshot } from "./git-read-projection-fixture-fast-20261001.js";
export { result, revOutput, workspace, root, deferred };
export const branchOutput = "owned-main\u0000owned-remote/main\u0000owned-hash\u0000123\n";
export const statusOutput = [
  "# branch.oid owned-hash",
  "# branch.head owned-main",
  "# branch.upstream owned-remote/main",
  "",
].join("\0");
export async function localBranchesFixture() {
  const f = await ignoreFixture();
  const data = JSON.parse(
    readFileSync(
      new URL("./git-local-branches-legacy-fast-20261001.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(data.commit, "9248efe60bd1711a1393806cad81664f5dc53e9e");
  assert.equal(data.spans.length, 2);
  for (const span of data.spans)
    assert.equal(createHash("sha256").update(span.text).digest("hex"), span.sha256);
  const span = (name: string) => data.spans.find((x: { name: string }) => x.name === name).text;
  const code = ts.transpileModule(
    `function frozen(commandProvider){${span("parseBranchRefRecords")};return {${span("listLocalBranches")}}.listLocalBranches;}`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const config = await import(f.url("git/config")),
    helpers = await import(f.url("git/repo/gitCliHelpers"));
  const frozen = new Function(
    "ensureGitCommandSucceeded",
    "DEFAULT_GIT_COMMAND_TIMEOUT_MS",
    "DEFAULT_GIT_OUTPUT_BYTES",
    code + ";return frozen;",
  )(
    helpers.ensureGitCommandSucceeded,
    config.DEFAULT_GIT_COMMAND_TIMEOUT_MS,
    config.DEFAULT_GIT_OUTPUT_BYTES,
  );
  function fixture(options: Parameters<typeof f.fixture>[0] = {}, legacy = false) {
    const s = f.fixture({
      ...options,
      run:
        options.run ??
        ((c) =>
          result({
            stdout:
              c.args[0] === "rev-parse"
                ? revOutput
                : c.args[0] === "status"
                  ? statusOutput
                  : c.args[0] === "for-each-ref"
                    ? branchOutput
                    : "",
          })),
    });
    if (legacy) s.repo.listLocalBranches = frozen(s.provider);
    return s;
  }
  function status() {
    const value = snapshot([]);
    Object.assign(value.resolution, { workspacePath: workspace, repoRoot: root });
    Object.assign(value.summary, {
      workspacePath: workspace,
      repoRoot: root,
      branchName: "owned-main",
      headRefType: "branch",
    });
    return value;
  }
  return { ...f, fixture, status };
}
