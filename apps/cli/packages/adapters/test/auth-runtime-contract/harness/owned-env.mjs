// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import path from "node:path";

const OS_ALLOWLIST = Object.freeze([
  "ComSpec",
  "NUMBER_OF_PROCESSORS",
  "OS",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
  "PROCESSOR_IDENTIFIER",
  "PROCESSOR_LEVEL",
  "PROCESSOR_REVISION",
  "SystemDrive",
  "SystemRoot",
  "WINDIR",
]);

const OWNED_TEST_ALLOWLIST = Object.freeze([
  "KNORVIA_TEST_AUTH_MODULE_URL",
  "KNORVIA_TEST_CASE_ID",
  "KNORVIA_TEST_FAKE_HOME",
  "KNORVIA_TEST_FAKE_PLATFORM",
  "KNORVIA_TEST_FAKE_USERNAME",
  "KNORVIA_TEST_REPO_ROOT",
  "KNORVIA_TEST_TEMP_ROOT",
  "KNORVIA_TEST_TOOLING_ROOT",
  "KNORVIA_TEST_WRITE_DELAY_MS",
]);

function copyCaseInsensitive(source, destination, requestedKey) {
  const actualKey = Object.keys(source).find(
    (key) => key.toLowerCase() === requestedKey.toLowerCase(),
  );
  if (actualKey && typeof source[actualKey] === "string") {
    destination[requestedKey] = source[actualKey];
  }
}

export function ownedEnvironment(base, tempRoot, extra = {}) {
  const env = {};
  for (const key of OS_ALLOWLIST) copyCaseInsensitive(base, env, key);
  for (const key of OWNED_TEST_ALLOWLIST) copyCaseInsensitive(base, env, key);
  const resolvedTemp = path.resolve(tempRoot);
  const fakeHome = path.join(resolvedTemp, "fake-home");
  Object.assign(env, {
    APPDATA: fakeHome,
    HOME: fakeHome,
    KNORVIA_TEST_FAKE_HOME: fakeHome,
    KNORVIA_TEST_FAKE_PLATFORM: "linux",
    KNORVIA_TEST_FAKE_USERNAME: "fixture-user",
    KNORVIA_TEST_TEMP_ROOT: resolvedTemp,
    LOCALAPPDATA: fakeHome,
    NODE_DISABLE_COLORS: "1",
    TEMP: resolvedTemp,
    TMP: resolvedTemp,
    TMPDIR: resolvedTemp,
    TZ: "UTC",
    USERPROFILE: fakeHome,
    XDG_CONFIG_HOME: fakeHome,
  });
  for (const [key, value] of Object.entries(extra)) {
    if (typeof value === "string") env[key] = value;
  }
  return env;
}

export const OWNED_ENV_ALLOWLIST = Object.freeze({
  os: OS_ALLOWLIST,
  test: OWNED_TEST_ALLOWLIST,
});
