import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { syntaxDigest } from "./causality-reduction-documentation-proof.js";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const proofUrl = new URL(
  "./causality-order-settlement-documentation-baseline.json",
  import.meta.url,
);
const archiveUrl = new URL("./causality-order-settlement-baseline.json", import.meta.url);
const proofSha256 = "b3f86f07a8d7b3cc1fc1d38bed4bb26d11daf88cd6b50b4dbe2a6ac6131a0f36";
const archiveSha256 = "62a3e3eb5de6eb5ee0e56e2867494ac13cbd51aef773c978cf37ff7dd61d16ac";
const declarationSha256 = "699b1382dc27895a9553f4706e1a4020e204f05a240d0bc245f320de95cfa6e5";

export async function loadSettlementDocumentaryProof(
  readProof = (url: URL) => readFile(url, "utf8"),
) {
  const bytes = await readProof(proofUrl);
  assert.equal(sha(bytes), proofSha256, "exact pre-documentary settlement proof");
  const archiveBytes = await readProof(archiveUrl);
  assert.equal(sha(archiveBytes), archiveSha256, "exact historical settlement archive");
  const proof = JSON.parse(bytes),
    archive = JSON.parse(archiveBytes);
  assert.equal(proof.historicalArchiveSha256, archiveSha256);
  assert.equal(sha(archive.compiled), archive.emittedSha256);
  assert.equal(sha(archive.declaration), declarationSha256);
  assert.equal(archive.declarationSha256, declarationSha256);
  assert.equal(proof.declarationSha256, declarationSha256);
  assert.equal(syntaxDigest(archive.declaration), proof.declarationSyntaxSha256);
  return { ...proof, declaration: archive.declaration };
}

export async function assertSettlementDeclarationShape(current: string, historical: string) {
  const proof = await loadSettlementDocumentaryProof();
  assert.equal(historical, declarationSha256);
  assert.equal(syntaxDigest(current), proof.declarationSyntaxSha256, "settlement public API shape");
}
