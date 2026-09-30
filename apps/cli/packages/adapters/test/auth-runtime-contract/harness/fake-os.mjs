// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

const env = () => process.env;

export const EOL = "\n";
export const constants = {};
export function homedir() {
  return env().KNORVIA_TEST_FAKE_HOME ?? "/owned/fake-home";
}
export function platform() {
  return env().KNORVIA_TEST_FAKE_PLATFORM ?? "linux";
}
export function userInfo() {
  if (env().KNORVIA_TEST_FAKE_USERINFO_ERROR === "1") {
    throw new Error("owned userInfo failure");
  }
  return {
    gid: 1000,
    homedir: homedir(),
    shell: null,
    uid: 1000,
    username: env().KNORVIA_TEST_FAKE_USERNAME ?? "fixture-user",
  };
}
export function hostname() {
  return "owned-fixture-host";
}
export function tmpdir() {
  return env().KNORVIA_TEST_TEMP_ROOT ?? homedir();
}
export function type() {
  return "OwnedFixtureOS";
}
export function release() {
  return "1";
}
export function arch() {
  return "x64";
}
export default {
  EOL,
  constants,
  homedir,
  platform,
  userInfo,
  hostname,
  tmpdir,
  type,
  release,
  arch,
};
