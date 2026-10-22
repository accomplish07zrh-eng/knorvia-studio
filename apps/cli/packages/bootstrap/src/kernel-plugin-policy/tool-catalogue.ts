// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-policy：工具元数据来源。
//
// 契约依据：specs/contracts/kernel-plugin-policy/interface.md §五、behavior.md B3、
//           known-differences.md K8、Lead 2026-10-22 裁决 D7。
//
// 为什么独立成文件：这是「工具元数据从 DSH 拿还是自维护表」的实质决策点。
//
// **当前决策：声明优先，缺省表兜底，都不在 → 未知名档（更严格）。**
// 不从 DSH 读的原因：DSH 的 `ToolSchema` 只是 JSON Schema，**不含** `readOnly` /
// `destructive` / `sideEffectScope` 语义 —— 那些是 Knorvia 的产品概念，
// DSH 侧 schema 只用于参数校验，不参与权限判定（K8）。

import {
  hasNameDefault,
  knownToolNames,
  resolveCapability,
  type ResolvedCapability,
  type ToolCapabilityDeclaration,
} from "./capability-resolver.js";

/** 元数据来源。用于日志与漂移检测，**不参与判定**（判定只看解析结果）。 */
export type MetadataSource = "declaration" | "name-default" | "unknown-default";

export interface ToolMetadata {
  readonly toolName: string;
  readonly source: MetadataSource;
  readonly declaration?: ToolCapabilityDeclaration;
}

export interface ToolCatalogue {
  /** 查一个工具的元数据。永不返回 undefined：未知工具落到 `unknown-default`。 */
  inspect(toolName: string): ToolMetadata;
  /** 查解析后的能力（`inspect` + `resolveCapability` 的组合，判定侧直接用这个）。 */
  resolve(toolName: string): ResolvedCapability;
}

export interface ToolCatalogueConfig {
  /** 声明读取器。**必需**；返回 `undefined` 表示该工具无声明。 */
  readonly readToolCapability: (toolName: string) => ToolCapabilityDeclaration | undefined;
}

/** 创建工具元数据目录。 */
export function createToolCatalogue(config: ToolCatalogueConfig): ToolCatalogue {
  return {
    inspect(toolName) {
      const declaration = config.readToolCapability(toolName);
      if (declaration !== undefined) {
        return { toolName, source: "declaration", declaration };
      }
      if (hasNameDefault(toolName)) return { toolName, source: "name-default" };
      return { toolName, source: "unknown-default" };
    },
    resolve(toolName) {
      return resolveCapability(toolName, config.readToolCapability(toolName));
    },
  };
}

/** 漂移检测结果。 */
export interface CatalogueDrift {
  /** 宿主注册了、但缺省表里没有的工具（按未知名档处理，偏严格但仍需登记）。 */
  readonly unlisted: readonly string[];
  /** 缺省表里有、但宿主没注册的工具（可能是表过期，也可能是该工具未挂载）。 */
  readonly stale: readonly string[];
}

/**
 * 工具清单漂移检测（Lead 2026-10-22 裁决的「约束 2」）。
 *
 * 为什么要它：`NAME_DEFAULTS` 是硬编码表，新增工具时若忘记登记，
 * 该工具会静默落到「未知名」档（非只读 / workspace / 需批准 / medium）。
 * 那个后果**偏严格所以安全**，但可能不符合产品预期 —— 所以要让 **CI 提醒**，
 * 而不是靠人记得。
 *
 * @param registeredToolNames 宿主当前注册的全部工具名（DSH `ctx.tools` + Knorvia 工具插件）
 * @returns 双向漂移：`unlisted`（宿主有、表里没有）与 `stale`（表里有、宿主没有）
 */
export function detectCatalogueDrift(registeredToolNames: readonly string[]): CatalogueDrift {
  const registered = new Set(registeredToolNames);
  const known = new Set(knownToolNames());
  const unlisted = [...registered].filter((name) => !known.has(name)).sort();
  const stale = [...known].filter((name) => !registered.has(name)).sort();
  return Object.freeze({ unlisted, stale });
}

/** 缺省表覆盖的工具名（漂移检测与测试用，重新导出以免调用方 import 两个模块）。 */
export { knownToolNames };
