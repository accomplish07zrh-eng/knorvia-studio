import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectComments, syntaxDigest } from "./causality-reduction-documentation-proof.js";
import {
  assertSettlementDeclarationShape,
  loadSettlementDocumentaryProof,
} from "./causality-order-settlement-documentation-proof.js";

const root = new URL("../../dynamic-workflow/", import.meta.url);
export const sourceComments = [
  "// SPDX-License-Identifier: Apache-2.0",
  "// Claims, barriers, and guard bindings. The empty claim is shared and must stay immutable.",
  "// Certain steps are committed before maybe steps are filtered, so a step named",
  "// both ways is only certain. No evidence widens to every issued step still",
  "// unsettled on the open frames, and that widen is a may-settle. Joins ride on",
  "// the first published event, including an empty certain event.",
];
export const emittedComments = sourceComments.filter((_, index) => index !== 1);
export const declarationComments = ["//# sourceMappingURL=causality-order-settle.d.ts.map"];

test("settlement documentation preserves source/emitted/API syntax and all parsed comment boundaries", async () => {
  const proof = await loadSettlementDocumentaryProof();
  const source = await readFile(new URL("src/analysis/causality-order-settle.ts", root), "utf8");
  const emitted = await readFile(new URL("dist/analysis/causality-order-settle.js", root), "utf8");
  const declaration = await readFile(
    new URL("dist/analysis/causality-order-settle.d.ts", root),
    "utf8",
  );
  assert.equal(syntaxDigest(source), proof.sourceSyntaxSha256);
  assert.equal(syntaxDigest(emitted, true), proof.emittedSyntaxSha256);
  await assertSettlementDeclarationShape(declaration, proof.declarationSha256);
  assert.notEqual(declaration, proof.declaration);
  assert.deepEqual(inspectComments(source), sourceComments);
  assert.deepEqual(inspectComments(emitted, true), emittedComments);
  assert.deepEqual(inspectComments(declaration), declarationComments);
  assert.deepEqual(
    inspectComments("const value = `literal /* text */ ${1}`; /* after template */\n// trailing"),
    ["/* after template */", "// trailing"],
  );
  assert.notEqual(
    syntaxDigest(source.replace("return NO_CLAIM;", "return { certain: [], maybe: [] };")),
    proof.sourceSyntaxSha256,
  );
});
test("settlement documentary proof rejects wrong/missing history and changed declaration shape", async () => {
  for (const suffix of ["documentation-baseline.json", "settlement-baseline.json"]) {
    await assert.rejects(
      loadSettlementDocumentaryProof(async (url) =>
        url.pathname.endsWith(suffix) ? "wrong proof" : readFile(url, "utf8"),
      ),
      assert.AssertionError,
    );
    await assert.rejects(
      loadSettlementDocumentaryProof(async (url) => {
        if (url.pathname.endsWith(suffix)) throw new Error("Owned missing proof");
        return readFile(url, "utf8");
      }),
      /Owned missing proof/u,
    );
  }
  const proof = await loadSettlementDocumentaryProof();
  await assert.rejects(
    assertSettlementDeclarationShape(proof.declaration, "wrong digest"),
    assert.AssertionError,
  );
  await assert.rejects(
    assertSettlementDeclarationShape(
      proof.declaration.replace("maybe: readonly string[];", "maybe: string;"),
      proof.declarationSha256,
    ),
    assert.AssertionError,
  );
});
