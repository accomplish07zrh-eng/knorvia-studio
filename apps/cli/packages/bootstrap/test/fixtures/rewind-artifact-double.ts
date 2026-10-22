// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-rewind 测试替身：`ToolArtifactStorePort` 的内存实现。
//
// 契约依据：specs/contracts/kernel-plugin-rewind/acceptance.md §5、interface.md §2.3（K10）
//
// **为什么需要第三个替身**：检查点的文件清单来自 artifactStore（`snapshotRef` 是 URI），
// 不在事件 payload 里。所以测 preview/apply 时必须能提供 artifact。
//
// 覆盖的契约子集：
//   ✅ readToolResultArtifact（按 uri 查；未命中抛错，与真实实现的「找不到即失败」一致）
//   ❌ 不覆盖：writeToolResultArtifact / readToolResultBinaryArtifact / statToolResultArtifact
//   ❌ 不覆盖：真实存储的分块、压缩、GC、并发（真实实现负责）

import type { WorkspaceCheckpointArtifact } from "@knorvia/contracts";

/** artifact 引用前缀（与构造器里的 `snapshotRef` 格式一致）。 */
export const ARTIFACT_URI_PREFIX = "artifact://";

/** `ToolArtifactStorePort` 的内存替身。 */
export class InMemoryArtifactStore {
  private readonly artifacts = new Map<string, unknown>();

  /** 已发生的读取次数（断言「列表不读 artifact」用）。 */
  readCount = 0;

  /** 预置一个 artifact。 */
  seed(uri: string, artifact: WorkspaceCheckpointArtifact): void {
    this.artifacts.set(uri, artifact);
  }

  /** 按检查点 id 预置（内部按 `artifact://<checkpointId>` 约定拼 uri）。 */
  seedForCheckpoint(checkpointId: string, artifact: WorkspaceCheckpointArtifact): void {
    this.seed(`${ARTIFACT_URI_PREFIX}${checkpointId}`, artifact);
  }

  /** 让后续读取全部抛错（用于测「artifact 不可读」的 fail closed）。 */
  failReads(): void {
    this.failAll = true;
  }

  private failAll = false;

  // ── ToolArtifactStorePort 接口（本包用到的子集）────────────────────────

  async readToolResultArtifact(request: { uri: string }): Promise<{ content: unknown }> {
    this.readCount += 1;
    if (this.failAll) {
      throw new Error(`artifact store unavailable (fixture): ${request.uri}`);
    }
    const found = this.artifacts.get(request.uri);
    if (found === undefined) {
      throw new Error(`artifact not found: ${request.uri}`);
    }
    // 真实端口可能把内容放在 `content`（文本）或 `value`（已解析）里；
    // 替身用 `content` 传对象，与 `extractArtifactPayload` 的「对象直接可用」路径一致。
    return { content: found };
  }
}
