import assert from "node:assert/strict";
import { test } from "node:test";
import { selectReleaseVariants } from "./desktop-release-variant-selection.mjs";

test("default release retains every variant and cannot silently become diagnostic", () => {
  const result = selectReleaseVariants();
  assert.equal(result.diagnostic, false);
  assert.equal(result.matrix.include.length, 4);
  assert.deepEqual(
    result.matrix.include.map((v) => `${v.os}-${v.variant}`),
    ["win-installed", "win-portable", "linux-installed", "linux-portable"],
  );
});
test("targeted diagnosis selects only failed variants and requires explicit dry run", () => {
  assert.throws(() => selectReleaseVariants("remaining", false), /dry_run/);
  assert.throws(() => selectReleaseVariants("unknown", true), /Unsupported/);
  for (const choice of ["win-installed", "linux-portable"])
    assert.deepEqual(
      selectReleaseVariants(choice, true).matrix.include.map((v) => `${v.os}-${v.variant}`),
      [choice],
    );
  const result = selectReleaseVariants("remaining", true);
  assert.equal(result.diagnostic, true);
  assert.deepEqual(
    result.matrix.include.map((v) => `${v.os}-${v.variant}`),
    ["win-installed", "linux-portable"],
  );
});
