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
const proofSha256 = "498d44db24381001bcb179b543259cd1bc73c717d25a9a9f556918ca83d69079";
const archiveSha256 = "1069ab83cff3a5af60247db90c749d2a6b2d09989ab12c8f2299e2dab890ce2c";
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
