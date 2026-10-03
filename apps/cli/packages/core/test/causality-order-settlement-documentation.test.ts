import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectComments, syntaxDigest } from "./causality-reduction-documentation-proof.js";
import {
  assertSettlementDeclarationShape,
  loadSettlementDocumentaryProof,
} from "./causality-order-settlement-documentation-proof.js";

const root = new URL("../../dynamic-workflow/", import.meta.url);
const claim =
  "/** Ordered site claims; empty results share readonly arrays and must not be mutated. */";
const ancestry = `/**
 * Cache lexical loop/callback ancestors by node identity. Parent links and iteration
 * indexes must remain stable while this TraceState cache is in use.
 */`;
const admission = `/**
 * Admit issued requests, or later sites sharing an indexed lexical iteration with
 * the await. Unissued sites outside that shared iteration are excluded.
 */`;
const classify = `/**
 * Classify real, admitted sites in first-witness order, combining duplicate exactness.
 * Only one exact issued site is certain. Repetition stays maybe: boundary iterations
 * can await a seed or leave the final request pending. Guard reads omit temporal
 * admission because they describe control evidence rather than settlement.
 */`;
const settle = "/** Read await-position witnesses using the current temporal admission rule. */";
const barrier = `/**
 * Settle witnesses and joined summaries in certain-before-maybe order. Visibility
 * spans active frames; writes affect only the current frame. Already-settled claims
 * add no steps. Empty evidence widens to pending issued sites and may overstate order.
 * Joins attach to the first event, including an empty event when only a join remains.
 * Strand ownership and await-operand interpretation stay in joinStrands.
 */`;
const bind =
  "/** Bind each pattern leaf to ordered step identities; ignore identifiers without symbols. */";
const control = `/**
 * Scan guard bindings without entering nested functions, then merge oracle witnesses.
 * Syntactic and exact singleton controllers take precedence over ambiguous sites.
 * Both inputs are needed for implicit-control and derived-value evidence.
 */`;
const record = "/** Append a control record only when either controller list has entries. */";
export const sourceComments = [
  "// Oracle witnesses, barriers and guard bindings share the existing TraceState.",
  claim,
  ancestry,
  admission,
  classify,
  "// First admission owns eligibility; any admitted exact witness can establish exactness.",
  settle,
  barrier,
  "// Commit one side before reading the next; certain steps become visible to maybe.",
  "// Resolve all state changes before publishing; a join with no steps still has an event.",
  bind,
  control,
  record,
];
export const emittedComments = sourceComments.slice(2);
export const declarationComments = [
  claim,
  settle,
  barrier,
  bind,
  record,
  "//# sourceMappingURL=causality-order-settle.d.ts.map",
];

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
