import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { syntaxDigest } from "./causality-reduction-documentation-proof.js";

const hash = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
const proofUrl = new URL("./fanout-cardinality-declaration-baseline.json", import.meta.url);
const proofSha256 = "be68c51aca8dac53c6b27ffb3f347d9f4b97d452650edda1d6205955b589f256";
const historicalSha256 = "6df2e52e3d50890410d40737bb1eac728909b66b2c8c55dad05a5e9b0c1ead47";

export async function loadCardinalityDeclarationProof(
  readProof = (url: URL) => readFile(url, "utf8"),
) {
  const bytes = await readProof(proofUrl);
  assert.equal(hash(bytes), proofSha256, "exact historical cardinality declaration proof");
  const proof = JSON.parse(bytes);
  assert.equal(hash(proof.declaration), historicalSha256);
  assert.equal(proof.declarationSha256, historicalSha256);
  assert.equal(syntaxDigest(proof.declaration), proof.declarationSyntaxSha256);
  return proof;
}

export async function assertCardinalityDeclarationShape(current: string, historical: string) {
  const proof = await loadCardinalityDeclarationProof();
  assert.equal(historical, historicalSha256);
  assert.equal(syntaxDigest(current), proof.declarationSyntaxSha256, "cardinality API shape");
}
