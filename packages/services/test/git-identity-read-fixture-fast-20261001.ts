// Exact exposed oracle and existing owned fake ports; no real config or identity.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import {
  diffReadFixture,
  result,
  deferred,
  answer,
  workspace,
  root,
  revOutput,
} from "./git-diff-read-fixture-fast-20261001.js";
export { result, deferred, workspace, root, revOutput };
export function identityAnswer(c: Parameters<typeof answer>[0]) {
  return c.args[0] === "config"
    ? result({
        stdout: `local\tfile:owned-config\t${c.args.at(-1) === "user.name" ? "Owned author" : "owned@example.invalid"}\n`,
      })
    : answer(c);
}
export async function identityReadFixture() {
  const f = await diffReadFixture(),
    helpers = await import(f.url("git/repo/gitCliHelpers"));
  const oracle = JSON.parse(
    readFileSync(new URL("./git-identity-read-legacy-fast-20261001.json", import.meta.url), "utf8"),
  );
  assert.equal(oracle.commit, "69e4fc140b10d1429f1541b2d1fac8cf6991a124");
  assert.equal(oracle.spans.length, 2);
  for (const s of oracle.spans)
    assert.equal(createHash("sha256").update(s.text).digest("hex"), s.sha256);
  const parser = oracle.spans
    .find((s: { name: string }) => s.name === "parseGitConfigValue")
    .text.replace(/^export /, "");
  const method = oracle.spans.find((s: { name: string }) => s.name === "getIdentity").text;
  const code = ts.transpileModule(
    `${parser}\nfunction frozen(commandProvider){return {${method}}.getIdentity;}`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const [legacyParse, frozen] = new Function(
    "ensureGitCommandSucceeded",
    "DEFAULT_GIT_COMMAND_TIMEOUT_MS",
    code + ";return [parseGitConfigValue,frozen];",
  )(helpers.ensureGitCommandSucceeded, f.config.DEFAULT_GIT_COMMAND_TIMEOUT_MS);
  function fixture(options: Parameters<typeof f.fixture>[0] = {}, legacy = false) {
    const s = f.fixture({ ...options, run: options.run ?? identityAnswer });
    if (legacy) s.repo.getIdentity = frozen(s.provider);
    return s;
  }
  return {
    ...f,
    fixture,
    parse: helpers.parseGitConfigValue,
    legacyParse: legacyParse as typeof helpers.parseGitConfigValue,
  };
}
