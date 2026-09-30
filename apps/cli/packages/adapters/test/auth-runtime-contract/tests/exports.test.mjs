// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import { checkApi } from "../harness/check-api.mjs";
import { authModule } from "../harness/test-context.mjs";

const RUNTIME_EXPORTS = [
  "MCP_OAUTH_CALLBACK_DENIED_ERROR_CODE",
  "createKnorviaCredentialCipher",
  "createLocalhostOAuthCallbackServer",
  "createSharedKnorviaCredentialStore",
  "isEncryptedKnorviaCredentialValue",
  "loadSharedKnorviaCredentialSync",
  "openUrlInBrowser",
  "resolveSharedKnorviaCredentialsPath",
];

test(
  "A-EXP-01 exact auth declarations/runtime exports and root reachability",
  { timeout: 15000 },
  async () => {
    const module = await authModule();
    assert.deepEqual(Object.keys(module).sort(), [...RUNTIME_EXPORTS].sort());
    const repoRoot = process.env.KNORVIA_TEST_REPO_ROOT;
    const toolingRoot = process.env.KNORVIA_TEST_TOOLING_ROOT;
    assert.ok(repoRoot && toolingRoot);
    const report = checkApi({ repoRoot, toolingRoot });
    assert.equal(report.authNames.length, 17);
    assert.equal(report.rootAuthNames.length, 17);
  },
);
