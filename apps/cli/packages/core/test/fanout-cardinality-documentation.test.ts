import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectComments, syntaxDigest } from "./causality-reduction-documentation-proof.js";
import {
  assertCardinalityDeclarationShape,
  loadCardinalityDeclarationProof,
} from "./fanout-cardinality-documentation-proof.js";

const root = new URL("../../dynamic-workflow/", import.meta.url);
const documentation = `/**
 * Returns a positive dense array-literal length, directly or through a const initializer.
 * AST and checker evidence are inspected during analysis; uncertain cases return undefined.
 * Writes to the binding or its recognized array operations invalidate the count.
 * Alias escapes and wrapped mutation receivers are not tracked by this syntactic check.
 */`;

test("cardinality documentation preserves source, emitted and declaration syntax", async () => {
  const proof = await loadCardinalityDeclarationProof();
  const source = await readFile(new URL("src/analysis/fanout-cardinality.ts", root), "utf8");
  const emitted = await readFile(new URL("dist/analysis/fanout-cardinality.js", root), "utf8");
  const declaration = await readFile(
    new URL("dist/analysis/fanout-cardinality.d.ts", root),
    "utf8",
  );
  assert.equal(syntaxDigest(source), proof.sourceSyntaxSha256);
  assert.equal(syntaxDigest(emitted, true), proof.emittedSyntaxSha256);
  await assertCardinalityDeclarationShape(declaration, proof.declarationSha256);
  assert.notEqual(declaration, proof.declaration);
  const privateComments = [
    "// The query returns its decision through the AST walk, without shared traversal state.",
    "// Destructuring admission uses its syntactic role and the enclosing assignment's span.",
  ];
  assert.deepEqual(inspectComments(source), [documentation, ...privateComments]);
  assert.deepEqual(inspectComments(emitted, true), [documentation, ...privateComments]);
  assert.deepEqual(inspectComments(declaration), [
    documentation,
    "//# sourceMappingURL=fanout-cardinality.d.ts.map",
  ]);
  assert.deepEqual(
    inspectComments("const text = `literal /* text */ ${1}`; /* after template */\n// trailing"),
    ["/* after template */", "// trailing"],
  );
  assert.notEqual(
    syntaxDigest(
      source.replace(
        "if (count === undefined) return undefined",
        "if (count === undefined) return 1",
      ),
    ),
    syntaxDigest(source),
  );
});

test("cardinality historical declaration and documentary API proof fail closed", async () => {
  await assert.rejects(
    loadCardinalityDeclarationProof(async () => "wrong proof"),
    assert.AssertionError,
  );
  await assert.rejects(
    loadCardinalityDeclarationProof(async () => {
      throw new Error("Owned missing proof");
    }),
    /Owned missing proof/u,
  );
  const proof = await loadCardinalityDeclarationProof();
  await assert.rejects(
    assertCardinalityDeclarationShape(proof.declaration, "wrong digest"),
    assert.AssertionError,
  );
  await assert.rejects(
    assertCardinalityDeclarationShape(
      proof.declaration.replace("number | undefined", "string | undefined"),
      proof.declarationSha256,
    ),
    assert.AssertionError,
  );
});
