#!/usr/bin/env node
// 同版本不可变发布判定（T01）。
//
// 目的：发布的同一版本不得悄悄改变已发布字节，也不得删除标签、Release 或附件。
// 本脚本只做判定，不执行上传；发布工作流按 action 决定创建、补传、幂等结束或拒绝。
// 纯函数 decideReleasePlan 可离线用夹具验证，不访问网络。
//
// 退出码：
//   0 允许继续（action = create / upload / skip）
//   1 用法错误
//   2 拒绝：标签目标提交与本次交付 SHA 不一致
//   3 拒绝：同名附件已存在但 SHA-256 不一致，或无法取到已有摘要
//   4 拒绝：无法确认 Release 是否存在（查询失败）
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const EXIT_OK = 0;
export const EXIT_USAGE = 1;
export const EXIT_TAG_TARGET_MISMATCH = 2;
export const EXIT_ASSET_HASH_MISMATCH = 3;
export const EXIT_QUERY_FAILED = 4;

/** 归一化 SHA-256：去掉 `sha256:` 前缀、空白，转小写。 */
export function normalizeSha256(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.startsWith("sha256:") ? trimmed.slice("sha256:".length) : trimmed;
}

function findAsset(assets, name) {
  const list = Array.isArray(assets) ? assets : [];
  const exact = list.find((asset) => asset && asset.name === name);
  if (exact) return exact;
  return list.find(
    (asset) =>
      asset && typeof asset.name === "string" && asset.name.toLowerCase() === name.toLowerCase(),
  );
}

/**
 * 判定同版本重跑应当执行的动作。
 *
 * @param {object} input
 * @param {string} input.tag                  版本标签，如 v0.8.0-preview.2
 * @param {string} input.deliveredSha         本次检查并打包的提交 SHA
 * @param {string|null} input.tagSha          该标签当前指向的提交 SHA；标签不存在时为 null
 * @param {boolean} input.tagExists           标签是否存在
 * @param {'exists'|'missing'|'unknown'} input.releaseState  Release 查询结果
 * @param {Array<{name: string, sha256: string}>} input.artifacts  本次构建的产物
 * @param {Array<{name: string, digest?: string, sha256?: string}>} [input.existingAssets]  已发布附件
 * @returns {{action: 'create'|'upload'|'skip'|'reject', exitCode: number, reason: string,
 *            toUpload: string[], alreadyPresent: string[], message: string}}
 */
export function decideReleasePlan(input) {
  const {
    tag,
    deliveredSha,
    tagExists = false,
    tagSha = null,
    releaseState = "missing",
    artifacts = [],
    existingAssets = [],
  } = input ?? {};

  const base = { toUpload: [], alreadyPresent: [] };

  if (!tag || !deliveredSha) {
    return {
      ...base,
      action: "reject",
      exitCode: EXIT_USAGE,
      reason: "missing-arguments",
      message: "缺少标签或交付 SHA",
    };
  }
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return {
      ...base,
      action: "reject",
      exitCode: EXIT_USAGE,
      reason: "no-artifacts",
      message: "没有本次构建产物可供发布",
    };
  }

  if (releaseState === "unknown") {
    return {
      ...base,
      action: "reject",
      exitCode: EXIT_QUERY_FAILED,
      reason: "release-query-failed",
      message: `无法确认标签 ${tag} 是否已有 Release；查询失败不得按“不存在”继续发布`,
    };
  }

  if (releaseState === "missing") {
    if (tagExists) {
      // 标签存在但没有 Release：仍要以标签目标为准，避免把新内容发到旧标签上。
      if (!tagSha) {
        return {
          ...base,
          action: "reject",
          exitCode: EXIT_QUERY_FAILED,
          reason: "tag-unresolvable",
          message: `标签 ${tag} 存在但无法解析其目标提交`,
        };
      }
      if (normalizeSha256(tagSha) !== normalizeSha256(deliveredSha)) {
        return {
          ...base,
          action: "reject",
          exitCode: EXIT_TAG_TARGET_MISMATCH,
          reason: "tag-target-mismatch",
          message: `标签 ${tag} 指向 ${tagSha}，与本次交付 ${deliveredSha} 不一致；请提升版本号`,
        };
      }
    }
    return {
      ...base,
      action: "create",
      exitCode: EXIT_OK,
      reason: "release-missing",
      toUpload: artifacts.map((artifact) => artifact.name),
      message: `标签 ${tag} 尚无 Release，按交付 SHA ${deliveredSha} 创建并上传`,
    };
  }

  // releaseState === 'exists'
  if (!tagExists) {
    return {
      ...base,
      action: "reject",
      exitCode: EXIT_TAG_TARGET_MISMATCH,
      reason: "release-without-tag",
      message: `Release ${tag} 存在但标签缺失，需人工核对，不自动修复`,
    };
  }
  if (!tagSha) {
    return {
      ...base,
      action: "reject",
      exitCode: EXIT_QUERY_FAILED,
      reason: "tag-unresolvable",
      message: `无法解析标签 ${tag} 的目标提交`,
    };
  }
  if (normalizeSha256(tagSha) !== normalizeSha256(deliveredSha)) {
    return {
      ...base,
      action: "reject",
      exitCode: EXIT_TAG_TARGET_MISMATCH,
      reason: "tag-target-mismatch",
      message: `标签 ${tag} 已指向 ${tagSha}，与本次交付 ${deliveredSha} 不一致；拒绝发布，请提升版本号`,
    };
  }

  const toUpload = [];
  const alreadyPresent = [];
  for (const artifact of artifacts) {
    const existing = findAsset(existingAssets, artifact.name);
    if (!existing) {
      toUpload.push(artifact.name);
      continue;
    }
    const existingSha = normalizeSha256(existing.sha256 ?? existing.digest);
    const localSha = normalizeSha256(artifact.sha256);
    if (!existingSha) {
      return {
        ...base,
        action: "reject",
        exitCode: EXIT_ASSET_HASH_MISMATCH,
        reason: "existing-digest-unavailable",
        message: `附件 ${artifact.name} 已存在但无法取得其 SHA-256；不能证明内容一致，拒绝覆盖`,
      };
    }
    if (!localSha || existingSha !== localSha) {
      return {
        ...base,
        action: "reject",
        exitCode: EXIT_ASSET_HASH_MISMATCH,
        reason: "asset-hash-mismatch",
        message: `附件 ${artifact.name} 已发布 (${existingSha})，本次构建为 ${localSha ?? "未知"}；同版本内容不可变，请提升版本号`,
      };
    }
    alreadyPresent.push(artifact.name);
  }

  if (toUpload.length > 0) {
    return {
      ...base,
      action: "upload",
      exitCode: EXIT_OK,
      reason: "missing-assets",
      toUpload,
      alreadyPresent,
      message: `标签目标一致；补传缺失附件：${toUpload.join(", ")}`,
    };
  }

  return {
    ...base,
    action: "skip",
    exitCode: EXIT_OK,
    reason: "already-published-identical",
    toUpload: [],
    alreadyPresent,
    message: `标签 ${tag} 已发布相同字节（${deliveredSha}）；幂等结束，不覆盖、不删除`,
  };
}

function parseArgs(argv) {
  const args = { artifacts: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => argv[(index += 1)];
    switch (token) {
      case "--tag":
        args.tag = next();
        break;
      case "--sha":
        args.deliveredSha = next();
        break;
      case "--tag-sha":
        args.tagSha = next() || null;
        break;
      case "--tag-exists":
        args.tagExists = next() === "true";
        break;
      case "--release-state":
        args.releaseState = next();
        break;
      case "--artifacts-json":
        args.artifacts = JSON.parse(readFileSync(next(), "utf8"));
        break;
      case "--existing-json": {
        const parsed = JSON.parse(readFileSync(next(), "utf8"));
        args.existingAssets = parsed.assets ?? [];
        break;
      }
      case "--out":
        args.out = next();
        break;
      default:
        throw new Error(`未知参数：${token}`);
    }
  }
  return args;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = EXIT_USAGE;
    return;
  }

  let decision;
  try {
    decision = decideReleasePlan(args);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = EXIT_USAGE;
    return;
  }

  const payload = JSON.stringify(
    { ...decision, tag: args.tag, deliveredSha: args.deliveredSha },
    null,
    2,
  );
  process.stdout.write(`${payload}\n`);
  process.stderr.write(`${decision.action}: ${decision.message}\n`);
  if (args.out) writeFileSync(args.out, `${payload}\n`, "utf8");
  process.exitCode = decision.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
