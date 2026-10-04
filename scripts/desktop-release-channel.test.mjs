import assert from "node:assert/strict";
import { test } from "node:test";
import { getReleaseChannel } from "./desktop-release-channel.mjs";

test("stable version never selects prerelease metadata or publication", () => {
  assert.deepEqual(getReleaseChannel("0.8.0"), { prerelease: false, label: "Stable release" });
});
test("explicit semver prerelease suffixes remain prereleases and malformed versions fail", () => {
  for (const version of ["0.8.0-preview.4", "0.8.0-rc.1", "0.8.0-beta.1"])
    assert.deepEqual(getReleaseChannel(version), { prerelease: true, label: "Prerelease channel" });
  for (const version of ["", undefined, "v0.8.0", "0.8"])
    assert.throws(() => getReleaseChannel(version), /Invalid/);
});
