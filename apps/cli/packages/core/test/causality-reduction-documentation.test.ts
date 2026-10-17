import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  assertDeclarationShape,
  inspectComments,
  loadDeclarationProof,
  syntaxDigest,
} from "./causality-reduction-documentation-proof.js";
import { loadCurrent } from "./causality-reduction-fixture.js";
import { loadTargetBaseline } from "./causality-reduction-target-fixture.js";

const root = new URL("../../dynamic-workflow/", import.meta.url);
const source = await readFile(new URL("src/analysis/causality-reduce.ts", root), "utf8");
const emitted = await readFile(new URL("dist/analysis/causality-reduce.js", root), "utf8");
const declaration = await readFile(new URL("dist/analysis/causality-reduce.d.ts", root), "utf8");
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

test("historical documentation preserves complete source, emitted and declaration syntax trees", async () => {
  const { source, compiled: emitted } = await loadTargetBaseline();
  const proof = await loadDeclarationProof();
  await assert.rejects(
    loadTargetBaseline(async () => "{}"),
    assert.AssertionError,
  );
  await assert.rejects(
    loadTargetBaseline(async () => {
      throw new Error("Synthetic missing documentary checkpoint");
    }),
    /Synthetic missing documentary checkpoint/u,
  );
  assert.equal(syntaxDigest(source), proof.sourceSyntaxSha256);
  assert.equal(syntaxDigest(emitted, true), proof.emittedSyntaxSha256);
  assert.equal(syntaxDigest(declaration), proof.declarationSyntaxSha256);
  await assertDeclarationShape(declaration, proof.declarationSha256);
  assert.notEqual(hash(source), proof.sourceSha256);
  assert.notEqual(hash(emitted), proof.emittedSha256);
  assert.notEqual(hash(declaration), proof.declarationSha256);
  assert.notEqual(
    syntaxDigest(source.replace("live: true", "live: false")),
    proof.sourceSyntaxSha256,
  );
  await assert.rejects(
    assertDeclarationShape(
      declaration.replace("from: string", "from: number"),
      proof.declarationSha256,
    ),
    assert.AssertionError,
  );
});

test("documentation keeps exact historical declaration and current artifact checks fail closed", async () => {
  const proof = await loadDeclarationProof();
  const archiveBytes = await readFile(
    new URL("./causality-reduction-baseline.json", import.meta.url),
    "utf8",
  );
  assert.equal(
    hash(archiveBytes),
    "be187ed74221eae63b961cbcf332644394fe64743c714695b91bb6fed5641e50",
  );
  const archive = JSON.parse(archiveBytes);
  assert.equal(hash(archive.compiled), archive.emittedSha256);
  assert.equal(hash(proof.declaration), archive.declarationSha256);
  await assert.rejects(
    loadDeclarationProof(async () => "{}"),
    assert.AssertionError,
  );
  await assert.rejects(
    loadDeclarationProof(async () => {
      throw new Error("Synthetic missing proof");
    }),
    /Synthetic missing proof/u,
  );
  for (const suffix of [".ts", ".js", ".d.ts"]) {
    await assert.rejects(
      loadCurrent(async (url) =>
        url.pathname.endsWith(suffix) ? "wrong artifact" : readFile(url, "utf8"),
      ),
      assert.AssertionError,
    );
    await assert.rejects(
      loadCurrent(async (url) => {
        if (url.pathname.endsWith(suffix)) throw new Error("Synthetic missing artifact");
        return readFile(url, "utf8");
      }),
      /Synthetic missing artifact/u,
    );
  }
});

test("documentation inventories every remaining comment including after template literals", () => {
  const publicComments = [
    "// SPDX-License-Identifier: Apache-2.0",
    "/**\n * Remove ordering edges that a surviving path already explains.\n * Data and control witness each other; fifo also accepts fifo; seq accepts\n * every forward kind. Carry edges are a later pass: forward closure, exactly\n * one other eligible carry, then forward closure again. A missing `carryOf`\n * is data. Self-loops are kept. The input array and edge objects stay put.\n */",
    "/** Dedup rank only. Witness checks use a separate lattice, not these numbers. */",
    "/** Forward kind a carry was built from. Absent values are judged as data. */",
  ];
  const strength = "// Queue search over live forward edges. `block` drops every direct hop of that pair.";
  const privateComments = [
    "/**\n * Forward edges first, in input order, then carries. Aliased input objects share\n * one liveness bit, so a repeated reference is deleted everywhere or nowhere.\n */",
  ];
  assert.deepEqual(inspectComments(source), [
    ...publicComments,
    strength,
    ...privateComments,
  ]);
  assert.deepEqual(inspectComments(emitted, true), [
    publicComments[0],
    publicComments[2],
    strength,
    ...privateComments,
  ]);
  assert.deepEqual(inspectComments(declaration), [
    publicComments[1],
    publicComments[2],
    publicComments[3],
    ...privateComments,
    "//# sourceMappingURL=causality-reduce.d.ts.map",
  ]);
  const control =
    "const text = `literal /* not a comment */ ${1}`; /* after template */\n// trailing\n";
  assert.deepEqual(inspectComments(control), ["/* after template */", "// trailing"]);
  assert.equal(
    syntaxDigest(control),
    syntaxDigest(control.replace("after template", "new documentation")),
  );
  assert.notEqual(
    syntaxDigest(control),
    syntaxDigest(control.replace("not a comment", "changed runtime text")),
  );
});
