import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { syntaxDigest } from "./causality-reduction-documentation-proof.js";

const hash = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
const proofUrl = new URL("./causality-lane-documentation-baseline.json", import.meta.url);
const archiveUrl = new URL("./may-set-lane-expansion-baseline.json", import.meta.url);
const proofSha256 = "db05c41b50287365ed49cfb5ff8c65c368a0843fbc5a58a2fc7407c6711d3e6e";
const archiveSha256 = "d410a01e92e7ed22f51bf9e82048c71800c83f3e24d72142ca886fedc41610b0";
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
