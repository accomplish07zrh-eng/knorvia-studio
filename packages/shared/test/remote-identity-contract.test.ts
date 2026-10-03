// New contract checks under retained root Apache-2.0; no clean-room/MIT claim.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  loadRemoteHelpers,
  observeRemote,
  remoteContractCases,
  sshTarget,
} from "./remote-identity-contract-cases.js";

const api = await loadRemoteHelpers();
const frozen = JSON.parse(
  await readFile(new URL("./remote-identity-observations.json", import.meta.url), "utf8"),
);
const cases = remoteContractCases();
test("remote identity frozen case inventory and baseline are exact", () => {
  assert.deepEqual(
    Object.keys(frozen.observations),
    cases.map((item) => item.name),
  );
  assert.equal(frozen.baseline, "5277f8074c5071d3fc90b72370347ddf6d53ee51");
});
for (const item of cases)
  test(`remote contract: ${item.name}`, () =>
    assert.deepEqual(
      observeRemote(() => item.run(api)),
      frozen.observations[item.name],
    ));
test("WSL complete ASCII/C1 interior character boundary agrees with the frozen rule", () => {
  assert.equal(api.WSL_USER_MAX_LENGTH, 64);
  for (let code = 0; code < 160; code++) {
    const input = `a${String.fromCharCode(code)}b`;
    const expected = !(code < 32 || code === 127 || [58, 47, 92].includes(code));
    assert.equal(api.isValidWslUser(input), expected, `predicate code=${code}`);
    assert.equal(api.wslUserSchema.safeParse(input).success, expected, `schema code=${code}`);
  }
});
test("workspace identity preserves path truth and does not resolve dot segments", () => {
  assert.equal(
    api.buildRemoteWorkspaceIdentity("\\fixture\\.\\..\\project\\", sshTarget),
    "remote:ssh:example.invalid:22:fixture-user:/fixture/./../project",
  );
  assert.deepEqual(api.parseRemoteWorkspaceIdentity("remote:wsl:d:user:/fixture:name/../project"), {
    kind: "wsl",
    workspacePath: "/fixture:name/../project",
  });
});
test("host keys never include authentication secret values", () => {
  const target = Object.freeze({
    ...sshTarget,
    password: "synthetic-password-value",
    privateKeyPassphrase: "synthetic-passphrase-value",
    passwordCredentialKey: "synthetic-credential-value",
  });
  const key = api.buildSshRemoteHostKey(target);
  for (const value of [target.password, target.privateKeyPassphrase, target.passwordCredentialKey])
    assert.equal(key.includes(value), false);
  assert.deepEqual(JSON.parse(key), [
    "ssh:v1",
    "example.invalid",
    22,
    "fixture-user",
    "password",
    "",
  ]);
});
