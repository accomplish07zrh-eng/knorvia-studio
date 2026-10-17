import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectComments, syntaxDigest } from "./causality-reduction-documentation-proof.js";
import {
  assertLaneDeclarationShape,
  loadLaneDocumentaryProof,
} from "./causality-lane-documentation-proof.js";

const root = new URL("../../dynamic-workflow/", import.meta.url);
export const sourceComments = [
  "// SPDX-License-Identifier: Apache-2.0",
  "// Finished-graph lane copies and ordered-pair fact joins. No compiler or I/O.",
];

test("lane documentation preserves source, emitted, API syntax and all parsed comments", async () => {
  const proof = await loadLaneDocumentaryProof();
  const source = await readFile(new URL("src/analysis/causality-graph-lanes.ts", root), "utf8");
  const emitted = await readFile(new URL("dist/analysis/causality-graph-lanes.js", root), "utf8");
  const declaration = await readFile(
    new URL("dist/analysis/causality-graph-lanes.d.ts", root),
    "utf8",
  );
  assert.equal(syntaxDigest(source), proof.sourceSyntaxSha256);
  assert.equal(syntaxDigest(emitted, true), proof.emittedSyntaxSha256);
  await assertLaneDeclarationShape(declaration, proof.declarationSha256);
  assert.notEqual(declaration, proof.declaration);
  assert.deepEqual(inspectComments(source), sourceComments);
  assert.deepEqual(inspectComments(emitted, true), sourceComments);
  assert.deepEqual(inspectComments(declaration), [
    "//# sourceMappingURL=causality-graph-lanes.d.ts.map",
  ]);
  assert.deepEqual(
    inspectComments("const text = `literal /* text */ ${1}`; /* after template */\n// trailing"),
    ["/* after template */", "// trailing"],
  );
  assert.notEqual(
    syntaxDigest(source.replace("return joined;", "return prior;")),
    proof.sourceSyntaxSha256,
  );
});
test("lane documentary proof binds exact old declaration and rejects wrong or missing inputs", async () => {
  for (const suffix of ["documentation-baseline.json", "expansion-baseline.json"]) {
    await assert.rejects(
      loadLaneDocumentaryProof(async (url) =>
        url.pathname.endsWith(suffix) ? "wrong proof" : readFile(url, "utf8"),
      ),
      assert.AssertionError,
    );
    await assert.rejects(
      loadLaneDocumentaryProof(async (url) => {
        if (url.pathname.endsWith(suffix)) throw new Error("Owned missing proof");
        return readFile(url, "utf8");
      }),
      /Owned missing proof/u,
    );
  }
  const proof = await loadLaneDocumentaryProof();
  await assert.rejects(
    assertLaneDeclarationShape(proof.declaration, "wrong digest"),
    assert.AssertionError,
  );
  await assert.rejects(
    assertLaneDeclarationShape(
      proof.declaration.replace("Fact[]", "Fact"),
      proof.declarationSha256,
    ),
    assert.AssertionError,
  );
});
