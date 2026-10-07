// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const deliveredSha = "a".repeat(40);
const version = "0.9.0";
const repository = "accomplish07zrh-eng/knorvia-studio";
const publisher = new URL("./desktop-release-publish.mjs", import.meta.url).href;

test("publisher reads committed changes before any create/upload through its existing path", async (t) => {
  let calls = [];
  const fakeExecFile = () => assert.fail("Only the declared promisified fixture is allowed");
  fakeExecFile[promisify.custom] = async (command, args) => {
    calls.push({ command, args });
    if (command === "git" && args.join(" ") === "rev-parse HEAD") return { stdout: deliveredSha };
    if (command === "git" && args.join(" ") === "fetch origin --tags") return { stdout: "" };
    if (command === "git" && args[0] === "rev-parse" && args[1] === "--verify")
      throw Object.assign(new Error("Fixture tag is absent"), { code: 128 });
    if (command === "gh" && args[0] === "api")
      throw Object.assign(new Error("Fixture release is absent"), { stderr: "HTTP 404" });
    if (command === "gh" && args[0] === "release" && ["create", "upload"].includes(args[1]))
      return { stdout: "" };
    assert.fail(`Unexpected fixture command: ${command} ${args.join(" ")}`);
  };
  t.mock.module("node:child_process", { namedExports: { execFile: fakeExecFile } });
  t.mock.method(console, "log", () => {});
  const cases = [
    {
      name: "matching version changes and source link reach the stable create command",
      mode: "valid",
    },
    { name: "wrong-version changelog prevents every publication write", mode: "wrong-version" },
    { name: "a changelog read error is not treated as legacy absence", mode: "read-error" },
    {
      name: "missing legacy changelog preserves package notes and publication route",
      mode: "absent",
    },
  ];
  for (const item of cases) {
    await t.test(item.name, async () => {
      const root = await mkdtemp(join(tmpdir(), "knorvia-publish-notes-"));
      const oldCwd = process.cwd();
      const oldArgv = [...process.argv];
      const selectedEnv = {
        DELIVERED_SHA: deliveredSha,
        RELEASE_TAG: `v${version}`,
        RELEASE_VERSION: version,
        GITHUB_REPOSITORY: repository,
      };
      const oldEnv = Object.fromEntries(
        Object.keys(selectedEnv).map((key) => [key, process.env[key]]),
      );
      calls = [];
      try {
        const asset = Buffer.from("Synthetic accepted package; no actual product build");
        const artifact = {
          name: "fixture.zip",
          sha256: createHash("sha256").update(asset).digest("hex"),
        };
        await Promise.all([
          writeFile(join(root, artifact.name), asset),
          writeFile(join(root, "release-artifacts.json"), JSON.stringify([artifact])),
          writeFile(
            join(root, "release-decision.json"),
            JSON.stringify({ deliveredSha, action: "create" }),
          ),
          writeFile(
            join(root, "release-metadata.json"),
            JSON.stringify({ deliveredSha, version, prerelease: false }),
          ),
        ]);
        if (item.mode === "valid")
          await writeFile(
            join(root, "CHANGELOG.md"),
            "## 0.9.0\n- Current fixture feature.\n## 0.8.8\n- Old fixture feature.",
          );
        if (item.mode === "wrong-version")
          await writeFile(join(root, "CHANGELOG.md"), "## 0.8.8\n- Old fixture feature.");
        if (item.mode === "read-error") await mkdir(join(root, "CHANGELOG.md"));
        process.chdir(root);
        process.argv[2] = root;
        Object.assign(process.env, selectedEnv);
        const run = import(`${publisher}?fixture=${item.mode}`);
        if (item.mode === "wrong-version") {
          await assert.rejects(run, /exactly one section for 0\.9\.0/);
          assert.equal(calls.filter(({ args }) => args[0] === "release").length, 0);
        } else if (item.mode === "read-error") {
          await assert.rejects(run, (error) => ["EISDIR", "EPERM", "EACCES"].includes(error.code));
          assert.equal(calls.filter(({ args }) => args[0] === "release").length, 0);
        } else {
          await run;
          const writes = calls.filter(({ args }) => args[0] === "release");
          assert.deepEqual(
            writes.map(({ args }) => args.slice(0, 2)),
            [
              ["release", "create"],
              ["release", "upload"],
            ],
          );
          const create = writes[0].args;
          assert.equal(create[create.indexOf("--target") + 1], deliveredSha);
          assert.ok(!create.includes("--prerelease"));
          const notes = await readFile(create[create.indexOf("--notes-file") + 1], "utf8");
          assert.ok(notes.includes(`https://github.com/${repository}/commit/${deliveredSha}`));
          assert.ok(notes.includes("SHA256SUMS"));
          assert.equal(notes.includes("Current fixture feature"), item.mode === "valid");
          assert.ok(!notes.includes("Old fixture feature"));
        }
      } finally {
        process.chdir(oldCwd);
        process.argv.splice(0, process.argv.length, ...oldArgv);
        for (const [key, value] of Object.entries(oldEnv)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});
