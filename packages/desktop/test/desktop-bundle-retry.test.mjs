import assert from "node:assert/strict";
import test from "node:test";
import { shouldRetryElectronBuilderFailure } from "../scripts/bundle.mjs";

test("successful resource download does not retry a later metadata failure", () => {
  const output = [
    "downloaded url=https://github.com/electron-userland/electron-builder-binaries/releases/download/appimage-12.0.1/appimage-12.0.1.7z duration=298ms",
    "Please specify project homepage, see https://www.electron.build/configuration#metadata",
    "Please specify author 'email' in the application package.json",
    "failedTask=build",
  ].join("\n");
  assert.equal(shouldRetryElectronBuilderFailure(output), false);
});

test("a cached NSIS asset and generic helper error are not network evidence", () => {
  const output = [
    "Using cached electron-builder-binaries/nsis-resources-3.4.1 archive",
    "wine: No such file or directory",
    "ERR_ELECTRON_BUILDER_CANNOT_EXECUTE",
  ].join("\n");
  assert.equal(shouldRetryElectronBuilderFailure(output), false);
});

test("actual interrupted network responses retain bounded-retry eligibility", () => {
  for (const output of [
    'Get "https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-resources-3.4.1/nsis-resources-3.4.1.7z": EOF',
    "read: connection reset by peer",
    "socket hang up",
    "request timed out",
    "unexpected end of file",
  ]) {
    assert.equal(shouldRetryElectronBuilderFailure(output), true, output);
  }
});

test("ordinary target compilation failures do not retry", () => {
  assert.equal(shouldRetryElectronBuilderFailure("NSIS script compilation failed"), false);
});
