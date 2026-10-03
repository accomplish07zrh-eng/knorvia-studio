import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { syntaxDigest } from "./causality-reduction-documentation-proof.js";

const hash = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
const proofUrl = new URL("./causality-lane-documentation-baseline.json", import.meta.url);
const archiveUrl = new URL("./may-set-lane-expansion-baseline.json", import.meta.url);
const proofSha256 = "a5981e705af1cf27d4c1f6ed65ba9b6a7033a18706d0dcbf63b6cdbb2cefbb30";
const archiveSha256 = "211a58a6d6737900ca4f6331992e8e8ce2e27e8739880a076d8e360c5d6a704b";
const declarationSha256 = "0e29131a14c0104b949792c25696ee4caded78b5c95eaf4caa088f8c982d8889";

export async function loadLaneDocumentaryProof(readProof = (url: URL) => readFile(url, "utf8")) {
  const bytes = await readProof(proofUrl);
  assert.equal(hash(bytes), proofSha256, "exact pre-documentary lane proof");
  const archiveBytes = await readProof(archiveUrl);
  assert.equal(hash(archiveBytes), archiveSha256, "exact historical lane archive");
  const proof = JSON.parse(bytes),
    archive = JSON.parse(archiveBytes);
  assert.equal(proof.historicalArchiveSha256, archiveSha256);
  assert.equal(hash(archive.compiled), archive.emittedSha256);
  assert.equal(hash(archive.declaration), declarationSha256);
  assert.equal(archive.declarationSha256, declarationSha256);
  assert.equal(proof.declarationSha256, declarationSha256);
  assert.equal(syntaxDigest(archive.declaration), proof.declarationSyntaxSha256);
  return { ...proof, declaration: archive.declaration };
}

export async function assertLaneDeclarationShape(current: string, historical: string) {
  const proof = await loadLaneDocumentaryProof();
  assert.equal(historical, declarationSha256);
  assert.equal(syntaxDigest(current), proof.declarationSyntaxSha256, "lane public API shape");
}
