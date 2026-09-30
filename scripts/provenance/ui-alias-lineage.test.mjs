import assert from "node:assert/strict";
import { test } from "node:test";
import { BASELINE_COMMIT, createIndexes, currentPath } from "./model.mjs";

const helpers = [
  ["zcodeUiError", "uiError"],
  ["zcodeTaskMetaMerge", "taskMetaMerge"],
  ["zcodeDraftSkillInvalidation", "draftSkillInvalidation"],
  ["zcodeCustomModelValue", "customModelValue"],
  ["zcodeFileCitation", "fileCitation"],
  ["zcodeFileCitationRemarkPlugin", "fileCitationRemarkPlugin"],
];

for (const [oldName, newName] of helpers) {
  const oldPath = `packages/ui/src/lib/${oldName}.ts`;
  const newPath = `packages/ui/src/lib/${newName}.ts`;
  test(`verified UI lineage: ${oldName}`, () => {
    assert.equal(currentPath(oldPath), newPath);
    assert.throws(
      () =>
        createIndexes(
          {
            schemaVersion: 1,
            commit: BASELINE_COMMIT,
            files: [oldPath, newPath].map((path) => ({
              path,
              normalizedSha256: "a".repeat(64),
            })),
          },
          { schemaVersion: 1, files: [] },
          {},
        ),
      /duplicate baseline/,
    );
  });
}

test("unverified UI names and directories are not guessed", () => {
  for (const path of [
    "packages/ui/src/lib/zcodeUnknown.ts",
    "packages/ui/src/other/zcodeUiError.ts",
    "other/ui/src/lib/zcodeFileCitation.ts",
  ])
    assert.equal(currentPath(path), path);
});
