import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { promisify } from "node:util";
import { artifactIdentity } from "./desktop-release-manifest.mjs";

const exec = promisify(execFile);

export async function acceptOwnedCleanup(repository) {
  assert.equal(process.platform, "win32");
  const require = createRequire(join(repository, "packages/desktop/package.json"));
  // Resolve the pinned builder's exact compiler, with its existing download
  // checksum/cache contract; do not choose a system NSIS or weaken the fixture.
  const { NSIS_PATH, NsisTargetOptions } = require("app-builder-lib/out/targets/nsis/nsisUtil.js");
  NsisTargetOptions.resolve({});
  const compiler = join(await NSIS_PATH(), "Bin/makensis.exe");
  const fixture = join(repository, "packages/desktop/test/windows-owned-cleanup.acceptance.mjs");
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      /^(?:PATH|SystemRoot|WINDIR|ComSpec|LOCALAPPDATA|TEMP|TMP)$/i.test(key),
    ),
  );
  const result = await exec(process.execPath, ["--test", fixture], {
    env: { ...env, KNORVIA_NSIS_COMPILER: compiler },
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.match(result.stdout, /(?:# |ℹ )tests 4/);
  assert.match(result.stdout, /(?:# |ℹ )fail 0/);
  return {
    status: "passed",
    compiler: await artifactIdentity(compiler),
    source: await artifactIdentity(fixture),
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
