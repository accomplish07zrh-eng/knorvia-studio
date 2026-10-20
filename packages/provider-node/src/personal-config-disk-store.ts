// SPDX-License-Identifier: Apache-2.0
// Personal provider 配置的磁盘存取引擎。
//
// 这一层只回答一个问题：「给定文件路径，如何在锁内安全地读出/写入一个规范层」。
// 它不持有订阅者、不做广播、不安排轮询——那些是仓储的职责。
//
// 三个必须成立的约束：
//   1. **未规范化或缺失的文件必须在锁内处理**：读取、解码、重写补规范与旧配置导入
//      都在同一个临界区，否则两个进程会各写一遍；
//   2. **写前先规范化**：落盘文本必须与 revision 的哈希输入一致，
//      这样「同一逻辑内容 ↔ 同一 revision」才成立；
//   3. **锁内不再抢同一把锁**：`layerUnderLock` 专供已持有锁的调用方使用。
import { ModelConfigRules, ProviderConfigMap } from "@knorvia/provider";
import type { ProviderConfigLayerSnapshot, ProviderConfigLayerUpdate } from "@knorvia/provider";
import { atomicWritePrivateTextFile, withFileLock } from "@knorvia/shared/node";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  decodeProviderConfigFile,
  encodeProviderConfigFile,
} from "./provider-config-file-codec.js";
import {
  canonicalLayer,
  isCanonicalDocument,
  serializeLayer,
} from "./personal-config-canonicalization.js";

/** 文件不存在的哨兵；与「存在但内容需要修复」区分开。 */
const ABSENT = Symbol("provider-config-absent");

type FileState = typeof ABSENT | { readonly document: unknown };

/** 空层：没有配置文件且没有可导入的旧配置时使用。 */
export function emptyLayer(): ProviderConfigLayerUpdate {
  return {
    providers: ProviderConfigMap.empty(),
    models: ModelConfigRules.empty(),
    providerOrder: [],
  };
}

/** 层 → 不可变快照；revision 由编码后字节的哈希派生。 */
export function snapshotOf(layer: ProviderConfigLayerUpdate): ProviderConfigLayerSnapshot {
  const revision = revisionOf(layer);
  return Object.freeze({
    revision,
    providers: layer.providers,
    models: layer.models,
    providerOrder: layer.providerOrder,
    defaultModelSelection: layer.defaultModelSelection,
  });
}

/** revision 的计算口径：规范化后 JSON 的 sha256。 */
function revisionOf(layer: ProviderConfigLayerUpdate): string {
  return createHash("sha256")
    .update(JSON.stringify(encodeProviderConfigFile(layer)))
    .digest("hex");
}

/** ENOENT 判定：只有「不存在」可被吞掉，其余 IO 故障必须上抛。 */
function isMissingFile(fault: unknown): boolean {
  return (
    typeof fault === "object" &&
    fault !== null &&
    "code" in fault &&
    (fault as { code?: unknown }).code === "ENOENT"
  );
}

async function loadState(filePath: string): Promise<FileState> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (fault) {
    if (isMissingFile(fault)) {
      return ABSENT;
    }
    throw fault;
  }
  return { document: JSON.parse(text) };
}

export interface DiskStoreOptions {
  readonly filePath: string;
  /** 旧配置导入器；缺失表示「没有可导入的历史配置」。 */
  readonly importLegacy?: () => Promise<ProviderConfigLayerUpdate | null>;
  /** 每次成功写盘后回调，供仓储维护写代次。 */
  readonly onWritten?: () => void;
}

export interface DiskStore {
  /** 无锁读：已是规范文档就直接给快照，否则进锁重写。 */
  readSnapshot(): Promise<ProviderConfigLayerSnapshot>;
  /** 在锁内读 → 应用变换 → 规范化 → 写盘，返回落盘后的快照。 */
  updateSnapshot(
    transform: (current: ProviderConfigLayerSnapshot) => ProviderConfigLayerUpdate,
  ): Promise<ProviderConfigLayerSnapshot>;
  /** 供轮询用的无锁轻量读取。 */
  inspectSnapshot(): Promise<ProviderConfigLayerSnapshot>;
}

export function createDiskStore(options: DiskStoreOptions): DiskStore {
  const { filePath, importLegacy, onWritten } = options;

  /** 写盘：先规范化，再原子写。返回规范化后的层。 */
  const commit = async (layer: ProviderConfigLayerUpdate): Promise<ProviderConfigLayerUpdate> => {
    const canonical = canonicalLayer(layer);
    await atomicWritePrivateTextFile(filePath, serializeLayer(canonical));
    onWritten?.();
    return canonical;
  };

  /** 已持有文件锁时的读取：补规范重写与旧配置导入都在这里发生。 */
  const underLock = async (): Promise<ProviderConfigLayerSnapshot> => {
    const state = await loadState(filePath);
    if (state !== ABSENT) {
      const decoded = decodeProviderConfigFile(state.document);
      if (!isCanonicalDocument(state.document, decoded)) {
        await commit(decoded);
      }
      return snapshotOf(decoded);
    }
    // 文件缺失：尝试导入历史配置，没有就直接空层。
    const imported = await importLegacy?.();
    return snapshotOf(imported ? await commit(imported) : emptyLayer());
  };

  return {
    async readSnapshot(): Promise<ProviderConfigLayerSnapshot> {
      const state = await loadState(filePath);
      if (state === ABSENT) {
        // 缺失且有导入器时必须在锁内导入，避免并发进程各导一份。
        return importLegacy ? withFileLock(filePath, underLock) : snapshotOf(emptyLayer());
      }
      const decoded = decodeProviderConfigFile(state.document);
      if (isCanonicalDocument(state.document, decoded)) {
        return snapshotOf(decoded);
      }
      // 需要补规范重写 → 进锁。
      return withFileLock(filePath, underLock);
    },

    async updateSnapshot(
      transform: (current: ProviderConfigLayerSnapshot) => ProviderConfigLayerUpdate,
    ): Promise<ProviderConfigLayerSnapshot> {
      return withFileLock(filePath, async () => {
        const base = await underLock();
        const proposed = transform(base);
        const selected = Object.freeze({
          providers: proposed.providers,
          models: proposed.models,
          providerOrder: proposed.providerOrder,
          defaultModelSelection: proposed.defaultModelSelection,
        });
        return snapshotOf(await commit(selected));
      });
    },

    async inspectSnapshot(): Promise<ProviderConfigLayerSnapshot> {
      const state = await loadState(filePath);
      return snapshotOf(state === ABSENT ? emptyLayer() : decodeProviderConfigFile(state.document));
    },
  };
}
