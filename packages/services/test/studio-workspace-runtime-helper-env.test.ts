// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspaceRuntimePort } from "../src/studio-runtime/adapters/workspaceRuntimeProcess.js";

const names = [
  "GH_TOKEN",
  "OPENAI_API_KEY",
  "AWS_SECRET_ACCESS_KEY",
  "KNORVIA_TOOL_ENV_PASSTHROUGH_JSON",
];
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";

test(
  "actual workspace proof, stop and recovery helpers never inherit ambient credentials",
  {
    skip: process.platform !== "linux",
  },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "knorvia-runtime-helper-"));
    const log = join(root, "observed.jsonl");
    const original = ["PATH", ...names].map((name) => [name, process.env[name]] as const);
    t.after(async () => {
      for (const [name, value] of original) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      await rm(root, { recursive: true, force: true });
    });
    const observer = `require('fs').appendFileSync(${JSON.stringify(log)},JSON.stringify(Object.fromEntries(${JSON.stringify(names)}.map(k=>[k,process.env[k]!==undefined])))+'\\n')`;
    const shim = join(root, "ps");
    await writeFile(
      shim,
      `#!/bin/sh\n${quote(process.execPath)} -e ${quote(observer)}\nexec /bin/ps "$@"\n`,
    );
    await chmod(shim, 0o755);
    process.env.PATH = `${root}:${process.env.PATH ?? "/usr/bin:/bin"}`;
    for (const name of names) process.env[name] = "synthetic-helper-sentinel";
    const port = createWorkspaceRuntimePort();
    const command = { executable: process.execPath, args: ["-e", "setInterval(()=>{},1000)"] };
    const expected = Object.fromEntries(names.map((name) => [name, false]));
    async function assertSafe() {
      const rows = (await readFile(log, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      assert(rows.length > 0, "The real process helper must be observed");
      for (const row of rows) assert.deepEqual(row, expected);
      await writeFile(log, "");
    }
    const normal = await port.spawn(root, command, undefined, () => {});
    t.after(() => normal.stop());
    assert((await normal.proof()).identities.length > 0);
    assert.equal(await normal.stop(), true);
    await normal.exited;
    await assertSafe();
    const recovering = await port.spawn(root, command, undefined, () => {});
    t.after(() => recovering.stop());
    const proof = await recovering.proof();
    assert(proof.identities.length > 0);
    assert.equal(await port.recover(proof), true);
    await recovering.exited;
    await assertSafe();
  },
);
