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
  ["zcodeSessionProjection", "sessionProjection"],
];

const aliases = [
  ...helpers.map(([oldName, newName]) => ["lib", oldName, newName]),
  ...["Selectors", "Navigation", "Types"].map((suffix) => [
    "store",
    `zcodeSessionStore${suffix}`,
    `sessionStore${suffix}`,
  ]),
];

for (const [directory, oldName, newName] of aliases) {
  const oldPath = `packages/ui/src/${directory}/${oldName}.ts`;
  const newPath = `packages/ui/src/${directory}/${newName}.ts`;
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
    "packages/ui/src/lib/zcodeSessionStoreTypes.ts",
  ])
    assert.equal(currentPath(path), path);
});
