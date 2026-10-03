// 旧 selector/receipt 保留原字节；当前只接受真实构建的新固定版本，不自动刷新。
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

interface CurrentSelection {
  historicalSelectorSha256: string;
  readerRoot: string;
  paths: string[];
  additionalPaths: string[];
}
interface CurrentReceipt {
  formatVersion: number;
  sourceCheckpoint: string;
  previousReceipt: { path: string; sha256: string };
  selectors: Record<string, CurrentSelection>;
  files: Record<string, string>;
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const text = await readFile(
  new URL("./current-build-artifact-receipt-20261003.json", import.meta.url),
  "utf8",
);
assert.equal(sha(text), "02a3149427eaff8d6c2b3e1d68771abece7e869d7f150a2a47f9e2e4b1e95553");
const receipt: CurrentReceipt = JSON.parse(text);
assert.equal(receipt.formatVersion, 2);
assert.equal(receipt.sourceCheckpoint, "c4f9bbb01cffa283e7179cc5adb53bc5956cb72a");
assert.equal(
  receipt.previousReceipt.path,
  "apps/cli/packages/core/test/current-artifact-receipt-20261003.json",
);
assert.equal(
  receipt.previousReceipt.sha256,
  "9ceb5294d0a9f5885a5eec65f85283e3bac6797407bf03809cc6e9ce52bdc714",
);
const repository = new URL("../../../../../", import.meta.url);
const packages = new URL("apps/cli/packages/", repository);

export async function verifyCurrentArtifacts(
  selector: string,
  historicalText: string,
  historicalFiles: Record<string, string>,
  root: URL,
  readArtifact: (url: URL) => Promise<string>,
): Promise<void> {
  assert.ok(Object.hasOwn(receipt.selectors, selector), selector);
  const selection = receipt.selectors[selector]!;
  assert.equal(sha(historicalText), selection.historicalSelectorSha256, selector);
  assert.equal(root.href, new URL(selection.readerRoot + "/", repository).href, selector);
  assert.deepEqual(Object.keys(historicalFiles), selection.paths, selector);
  const paths = [...selection.paths, ...selection.additionalPaths];
  assert.equal(new Set(paths).size, paths.length, selector);
  for (const path of paths) {
    const url = new URL(path, root);
    // 旧清单含 ../contracts 只读兄弟路径；按真实 URL 对照明确明细，不能逃出包目录。
    assert.ok(url.href.startsWith(packages.href), path);
    const registered = decodeURIComponent(url.href.slice(repository.href.length));
    assert.ok(Object.hasOwn(receipt.files, registered), path);
    assert.equal(sha(await readArtifact(url)), receipt.files[registered], path);
  }
}
