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
    "815f57ebb52a8e1c56544f254ccc0e26564832aad6a5f1b05433712612684aea",
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
    "/**\n * Reduce ordering graphs using edge-kind strength. Data and control have equal\n * witness strength, followed by fifo and seq. Carry edges represent one iteration\n * boundary and are tested separately from forward edges.\n */",
    "/** Ordered-pair deduplication ranks; witness eligibility uses separate rules. */",
    "/** Forward kind used to judge a carry witness; omitted values use data. */",
    "/**\n * Visit forward edges in input order, then carry edges, removing candidates with\n * surviving eligible witnesses. Return original edge references in input order;\n * shared input references share deletion decisions. Inputs are not modified.\n */",
  ];
  const strength = "// Witness strength is separate from the public dedup rank.";
  const privateComments = [
    "// Input occurrences retain their order; aliases share only the liveness decision.",
    "// Multi-source forward closure, optionally excluding the candidate's direct pair.",
    "// A bridge joins two forward closures; no second carry can enter either closure.",
  ];
  assert.deepEqual(inspectComments(source), [
    ...publicComments.slice(0, 3),
    strength,
    publicComments[3],
    ...privateComments,
  ]);
  assert.deepEqual(inspectComments(emitted, true), [
    ...publicComments.slice(0, 2),
    strength,
    publicComments[3],
    ...privateComments,
  ]);
  assert.deepEqual(inspectComments(declaration), [
    ...publicComments,
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
