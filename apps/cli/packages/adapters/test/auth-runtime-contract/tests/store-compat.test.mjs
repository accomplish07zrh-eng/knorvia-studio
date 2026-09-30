// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import { authModule, caseTemp, ensureCaseTemp, identityCipher } from "../harness/test-context.mjs";

test(
  "A-STO-13 canonical and legacy mirrors publish and invalidate as one generation",
  { timeout: 7000 },
  async () => {
    await ensureCaseTemp();
    const { createSharedKnorviaCredentialStore } = await authModule();
    const filePath = caseTemp("compat", "credentials.json");
    const writer = createSharedKnorviaCredentialStore({
      filePath,
      cipher: identityCipher(),
      env: {},
    });
    const observer = createSharedKnorviaCredentialStore({
      filePath,
      cipher: identityCipher(),
      env: {},
    });
    await writer.saveMany({ canonical: "generation-2", legacyA: "mirror-a", legacyB: "mirror-b" });
    assert.deepEqual(await observer.loadMany(["canonical", "legacyA", "legacyB"]), {
      canonical: "generation-2",
      legacyA: "mirror-a",
      legacyB: "mirror-b",
    });
    assert.equal(
      await observer.deleteManyIfValue("canonical", "generation-1", [
        "canonical",
        "legacyA",
        "legacyB",
      ]),
      false,
    );
    assert.deepEqual(await writer.loadMany(["canonical", "legacyA", "legacyB"]), {
      canonical: "generation-2",
      legacyA: "mirror-a",
      legacyB: "mirror-b",
    });
    assert.equal(
      await observer.deleteManyIfValue("canonical", "generation-2", [
        "canonical",
        "legacyA",
        "legacyB",
      ]),
      true,
    );
    assert.deepEqual(await writer.loadMany(["canonical", "legacyA", "legacyB"]), {
      canonical: null,
      legacyA: null,
      legacyB: null,
    });
  },
);
