// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-policy：协作模式注册表。
//
// 契约依据：specs/contracts/kernel-plugin-policy/behavior.md B2/B4、interface.md §二、
//           known-differences.md K6。
//
// 为什么需要它（README §二 a）：DSH 的 `Agent` 只有 `id`，`dsh-plan-mode` 的
// `PlanModeController.get()` 只返回 `{ active, pending }` 布尔 —— **DSH 没有五种模式概念**。
// 而规格要求「五种模式行为与现规则一致」，所以模式状态必须由本包持有。
//
// **本层是缓存，不是权威**：权威是组合根的 `readMode` getter（其背后是 DSH session log
// 与 UI 状态）。缓存与权威不一致时以权威为准（miss 时校正）。

/** 五种协作模式（与 `@knorvia/contracts` 的 `CollaborationMode` 一致）。 */
export type CollaborationMode = "plan" | "build" | "edit" | "yolo" | "auto";

/** 模式事实的来源标记。只用于日志与装配期诊断，**不参与判定**。 */
export type ModeSource = "composition-root" | "session-event" | "test";

const MODE_VALUES: ReadonlySet<string> = new Set<CollaborationMode>([
  "plan",
  "build",
  "edit",
  "yolo",
  "auto",
]);

/** 运行时校验：组合根或事件送来的是合法模式名吗。 */
export function isCollaborationMode(value: unknown): value is CollaborationMode {
  return typeof value === "string" && MODE_VALUES.has(value);
}

export interface ModeRegistry {
  /**
   * 读当前模式。**未注册返回 `undefined`** —— 调用方必须按 L3 `deny`，
   * 不得默认任何模式（默认 `build` 会让新 session 意外获得写权限）。
   */
  resolve(sessionId: string): CollaborationMode | undefined;
  /** 记录模式变更。组合根在收到 UI 切换 / `/plan` 命令 / 测试注入时调用。 */
  record(sessionId: string, mode: CollaborationMode, source: ModeSource): void;
  /** session 结束时清理，避免内存增长。 */
  forget(sessionId: string): void;
  /** 当前缓存的 session 数（诊断用）。 */
  size(): number;
}

export interface ModeRegistryConfig {
  /** 权威读取器。**必需**，由组合根接线。 */
  readonly readMode: (sessionId: string) => CollaborationMode | undefined;
}

/**
 * 创建模式注册表。
 *
 * `resolve` 先查缓存；miss 时调权威读取器并回填。
 * **缓存的存在不改变「谁是权威」**：权威值变化后，下一次 resolve 若命中旧缓存会看到旧值，
 * 所以组合根在模式变更时**必须**同时调 `record`（而不是只改自己的状态）。
 */
export function createModeRegistry(config: ModeRegistryConfig): ModeRegistry {
  const cache = new Map<string, CollaborationMode>();

  return {
    resolve(sessionId) {
      const cached = cache.get(sessionId);
      if (cached !== undefined) return cached;
      const authoritative = config.readMode(sessionId);
      if (authoritative === undefined) return undefined;
      // 权威读取器可能返回运行时的非法值（外部状态），这里只在合法时回填。
      if (!isCollaborationMode(authoritative)) return undefined;
      cache.set(sessionId, authoritative);
      return authoritative;
    },
    record(sessionId, mode, source) {
      // 非法模式名一律拒绝写入：把错误挡在写入侧，而不是让判定读到脏值。
      if (!isCollaborationMode(mode)) {
        throw new Error(
          `kernel-plugin-policy: invalid collaboration mode "${String(mode)}" from ${source}`,
        );
      }
      cache.set(sessionId, mode);
    },
    forget(sessionId) {
      cache.delete(sessionId);
    },
    size() {
      return cache.size;
    },
  };
}
