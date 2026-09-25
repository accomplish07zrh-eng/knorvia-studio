// T01 同版本不可变发布判定测试。
// 运行：pnpm exec tsx --test scripts/release-gate.test.ts
// 覆盖 specs/knorvia-release-gates.md 判定表的全部情形，纯本地、无网络。
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EXIT_ASSET_HASH_MISMATCH,
  EXIT_OK,
  EXIT_QUERY_FAILED,
  EXIT_TAG_TARGET_MISMATCH,
  decideReleasePlan,
  normalizeSha256,
} from "./release-immutability.mjs";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const COMMIT = "c".repeat(40);
const OTHER_COMMIT = "d".repeat(40);

const artifact = { name: "Knorvia-Studio-0.8.0-preview.2-win-x64-portable.zip", sha256: SHA_A };

test("normalizeSha256 去掉前缀并转小写", () => {
  assert.equal(normalizeSha256("sha256:ABCDEF"), "abcdef");
  assert.equal(normalizeSha256("  AB  "), "ab");
  assert.equal(normalizeSha256(""), null);
  assert.equal(normalizeSha256(undefined), null);
});

test("同标签不存在：创建 Release 并上传全部产物", () => {
  const decision = decideReleasePlan({
    tag: "v0.8.0-preview.2",
    deliveredSha: COMMIT,
    tagExists: false,
    tagSha: null,
    releaseState: "missing",
    artifacts: [artifact],
  });
  assert.equal(decision.action, "create");
  assert.equal(decision.exitCode, EXIT_OK);
  assert.deepEqual(decision.toUpload, [artifact.name]);
});

test("同标签存在、目标一致、附件缺失：补传", () => {
  const decision = decideReleasePlan({
    tag: "v0.8.0-preview.2",
    deliveredSha: COMMIT,
    tagExists: true,
    tagSha: COMMIT,
    releaseState: "exists",
    artifacts: [artifact],
    existingAssets: [
      { name: "Knorvia-Studio-0.8.0-preview.1-win-x64-portable.zip", digest: `sha256:${SHA_B}` },
    ],
  });
  assert.equal(decision.action, "upload");
  assert.equal(decision.exitCode, EXIT_OK);
  assert.deepEqual(decision.toUpload, [artifact.name]);
});

test("同标签存在、目标一致、附件字节一致：幂等结束且不上传", () => {
  const decision = decideReleasePlan({
    tag: "v0.8.0-preview.2",
    deliveredSha: COMMIT,
    tagExists: true,
    tagSha: COMMIT,
    releaseState: "exists",
    artifacts: [artifact],
    existingAssets: [{ name: artifact.name, digest: `sha256:${SHA_A.toUpperCase()}`, size: 123 }],
  });
  assert.equal(decision.action, "skip");
  assert.equal(decision.exitCode, EXIT_OK);
  assert.deepEqual(decision.toUpload, []);
  assert.deepEqual(decision.alreadyPresent, [artifact.name]);
});

test("同标签存在、同名附件内容不一致：拒绝且不复用旧字节", () => {
  const decision = decideReleasePlan({
    tag: "v0.8.0-preview.2",
    deliveredSha: COMMIT,
    tagExists: true,
    tagSha: COMMIT,
    releaseState: "exists",
    artifacts: [artifact],
    existingAssets: [{ name: artifact.name, sha256: SHA_B }],
  });
  assert.equal(decision.action, "reject");
  assert.equal(decision.exitCode, EXIT_ASSET_HASH_MISMATCH);
  assert.equal(decision.reason, "asset-hash-mismatch");
});

test("同标签存在但无法取得已有摘要：拒绝，不假设内容一致", () => {
  const decision = decideReleasePlan({
    tag: "v0.8.0-preview.2",
    deliveredSha: COMMIT,
    tagExists: true,
    tagSha: COMMIT,
    releaseState: "exists",
    artifacts: [artifact],
    existingAssets: [{ name: artifact.name, size: 123 }],
  });
  assert.equal(decision.action, "reject");
  assert.equal(decision.exitCode, EXIT_ASSET_HASH_MISMATCH);
  assert.equal(decision.reason, "existing-digest-unavailable");
});

test("标签指向另一提交：拒绝并要求新版本", () => {
  const decision = decideReleasePlan({
    tag: "v0.8.0-preview.2",
    deliveredSha: COMMIT,
    tagExists: true,
    tagSha: OTHER_COMMIT,
    releaseState: "exists",
    artifacts: [artifact],
    existingAssets: [],
  });
  assert.equal(decision.action, "reject");
  assert.equal(decision.exitCode, EXIT_TAG_TARGET_MISMATCH);
  assert.equal(decision.reason, "tag-target-mismatch");
});

test("标签存在但尚无 Release 且目标不一致：仍拒绝", () => {
  const decision = decideReleasePlan({
    tag: "v0.8.0-preview.2",
    deliveredSha: COMMIT,
    tagExists: true,
    tagSha: OTHER_COMMIT,
    releaseState: "missing",
    artifacts: [artifact],
  });
  assert.equal(decision.action, "reject");
  assert.equal(decision.exitCode, EXIT_TAG_TARGET_MISMATCH);
});

test("Release 查询失败：拒绝，不按不存在继续发布", () => {
  const decision = decideReleasePlan({
    tag: "v0.8.0-preview.2",
    deliveredSha: COMMIT,
    tagExists: true,
    tagSha: COMMIT,
    releaseState: "unknown",
    artifacts: [artifact],
  });
  assert.equal(decision.action, "reject");
  assert.equal(decision.exitCode, EXIT_QUERY_FAILED);
  assert.equal(decision.reason, "release-query-failed");
});

test("标签无法解析：拒绝", () => {
  const decision = decideReleasePlan({
    tag: "v0.8.0-preview.2",
    deliveredSha: COMMIT,
    tagExists: true,
    tagSha: null,
    releaseState: "exists",
    artifacts: [artifact],
  });
  assert.equal(decision.action, "reject");
  assert.equal(decision.exitCode, EXIT_QUERY_FAILED);
  assert.equal(decision.reason, "tag-unresolvable");
});

test("缺少产物或参数：用法错误，不静默创建空 Release", () => {
  const noArtifacts = decideReleasePlan({
    tag: "v0.8.0-preview.2",
    deliveredSha: COMMIT,
    releaseState: "missing",
    artifacts: [],
  });
  assert.equal(noArtifacts.exitCode, 1);
  const noTag = decideReleasePlan({
    deliveredSha: COMMIT,
    releaseState: "missing",
    artifacts: [artifact],
  });
  assert.equal(noTag.exitCode, 1);
});
