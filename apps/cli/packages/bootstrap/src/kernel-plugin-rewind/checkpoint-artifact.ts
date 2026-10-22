// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-rewind：从 artifactStore 读检查点的文件清单。
//
// 契约依据：specs/contracts/kernel-plugin-rewind/{interface,known-differences}.md §2.3、K10
//
// **K10（实现阶段发现的合同遗漏）**：
//   `CheckpointCreatedPayload` 的 schema 是 **`.strict()`** 的，只带 `snapshotRef`（URI），
//   **文件内容不在 payload 里**。所以「读检查点的文件清单」必须经第三个端口：
//
//     artifactStore.readToolResultArtifact({ uri: snapshotRef })
//
//   而 `artifactStore` 在旧实现里是**可选**的（`artifactStore?: ToolArtifactStorePort`），
//   缺失时旧实现返回 `unavailableFile("workspace", "checkpoint_unreadable",
//   "ArtifactStore is not configured.")` —— 新实现保持同一语义（B9 fail closed）。
//
// **按能力分级依赖**：`listCheckpoints` / `planConversationRewind` 不需要它；
// 只有 `previewFileRewind` / `applyFileRewind` 需要（要读文件清单）。

import { parseWorkspaceCheckpointArtifact, type ToolArtifactStorePort } from "@knorvia/contracts";
import type { CheckpointFileEntry } from "./file-rewind-plan.js";

/**
 * 读检查点文件清单的结果。
 *
 * 用「带 `kind` 判别字段的联合」而不是「`ok` 布尔 + 可选字段」——
 * 这样调用方必须先判 `kind` 才能取到负载，编译器会盯住漏判的分支。
 */
export type CheckpointFilesOutcome =
  | { readonly kind: "loaded"; readonly files: readonly CheckpointFileEntry[] }
  | { readonly kind: "unconfigured" }
  | { readonly kind: "unreadable"; readonly detail: string }
  | { readonly kind: "malformed"; readonly detail: string };

/** 未注入端口时给的说明（与旧实现同一语义：明确不可用，不是抛错）。 */
export const ARTIFACT_STORE_UNCONFIGURED = "artifact store is not configured";

/**
 * 从 artifactStore 读检查点的文件清单。
 *
 * @param artifactStore 第三个端口（**可选**；`undefined` 表示组合根未注入）
 * @param snapshotRef 检查点 payload 里的 artifact 引用
 */
export async function readCheckpointFiles(
  artifactStore: ToolArtifactStorePort | undefined,
  snapshotRef: string,
): Promise<CheckpointFilesOutcome> {
  // 缺失 → 明确不可用（与旧实现同一文案语义），不是抛错、也不是「无需回退」。
  if (artifactStore === undefined) return { kind: "unconfigured" };

  let rawArtifact: unknown;
  try {
    const readResult = await artifactStore.readToolResultArtifact({ uri: snapshotRef });
    rawArtifact = extractArtifactPayload(readResult);
  } catch (error) {
    return {
      kind: "unreadable",
      detail: `cannot read checkpoint artifact ${snapshotRef}: ${describeFailure(error)}`,
    };
  }

  if (rawArtifact === undefined) {
    return {
      kind: "unreadable",
      detail: `checkpoint artifact ${snapshotRef} has no readable content`,
    };
  }

  try {
    const parsed = parseWorkspaceCheckpointArtifact(rawArtifact);
    // 「变更前的内容」就是回退目标；`existedBefore: false` 表示当时不存在。
    const files = parsed.files.map((file) => ({
      path: file.path,
      content: file.existedBefore ? (file.beforeContent ?? null) : null,
    }));
    return { kind: "loaded", files };
  } catch (error) {
    // 解析失败 → 明确不可用（K8.1 的容错语义：不抛错，但也不假装成功）。
    return {
      kind: "malformed",
      detail: `checkpoint artifact ${snapshotRef} does not match the expected schema: ${describeFailure(error)}`,
    };
  }
}

/**
 * 从端口读结果里取出 artifact 的原始数据。
 *
 * 端口的读结果可能把内容放在 `content`（文本）或 `value`（已解析）字段里 ——
 * 两种都试，取第一个能用的。**按形状探测而非类型断言**：
 * 不同实现可能填不同字段，而本包只需要「能拿到可解析的对象」。
 */
function extractArtifactPayload(readResult: unknown): unknown {
  if (readResult === null || typeof readResult !== "object") return undefined;
  const fields = readResult as Record<string, unknown>;
  const candidates = [fields.artifact, fields.value, fields.content];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    if (typeof candidate === "object") return candidate;
    if (typeof candidate !== "string") continue;
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // 不是 JSON → 试下一个字段
    }
  }
  return undefined;
}

/** 把任意失败转成可读短句（不含文件内容）。 */
function describeFailure(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
