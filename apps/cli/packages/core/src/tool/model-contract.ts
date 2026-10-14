// SPDX-License-Identifier: Apache-2.0
// 工具模型契约投影：把工具条目上的 `resolveModelContract` 结果叠到对外可见的契约上。
//
// 两个函数面向不同方向：
// - `resolveToolEntryModelContract` 从 ToolEntry 出发，返回新的 ToolEntry（条目本身不变）；
// - `projectToolModelContract` 从已经算好的 ModelToolContract 出发，返回叠加后的契约。
//
// 共同约定：
// 1. **只覆盖投影真正给出的字段**：没给 `description` 就不动描述，没给 `inputSchema` 就不动 schema；
//    因此空投影与「没有投影函数」是同一结果（返回入参本身，不做无意义复制）。
// 2. 投影函数是可选的；缺失时直接返回入参，不构造中间对象。
// 3. 不修改入参：返回的是新对象（或原对象），调用方持有的旧对象保持可预测。
// 4. 不做校验与兜底：schema 合法性由注册表校验负责，这里只做形状叠加。
//
// 投影失败（函数抛错）不在这里吞掉：异常原样向上传播，由调用链上真正能处理的一层决定重试或降级；
// 因此这两个函数不返回「部分成功」的结果，也不记录日志。

import type { ModelToolContract } from "@knorvia/contracts";
import type { ToolEntry, ToolExecutionModelContext } from "./types.js";

/**
 * 从工具条目出发投影一次模型契约。
 * - 条目没有 `resolveModelContract`，或它返回 undefined → 原样返回该条目；
 * - 只叠加投影真正给出的字段：`inputSchema` 直接覆盖，`description` 写进 `metadata`；
 * - 返回新对象（`metadata` 也是新的浅拷贝），调用方持有的旧对象不被改写。
 */
export function resolveToolEntryModelContract(
  entry: ToolEntry,
  context: ToolExecutionModelContext,
): ToolEntry {
  const projected = entry.resolveModelContract?.(context);
  if (projected === undefined) return entry;
  const schemaPatch = projected.inputSchema ? { inputSchema: projected.inputSchema } : {};
  const descriptionPatch =
    projected.description === undefined ? {} : { description: projected.description };
  return { ...entry, ...schemaPatch, metadata: { ...entry.metadata, ...descriptionPatch } };
}

/**
 * 把条目上的投影叠到已经算好的模型契约上。
 * - `entry` 缺失或它没有投影函数 → 原样返回 `contract`；
 * - `description` 与 `inputSchema` 各自只在给出时覆盖，二者互不影响；
 * - 同样不改写入参，只返回新对象。
 */
export function projectToolModelContract(
  contract: ModelToolContract,
  entry: ToolEntry | undefined,
  context: ToolExecutionModelContext,
): ModelToolContract {
  const projected = entry?.resolveModelContract?.(context);
  if (projected === undefined) return contract;
  const descriptionPatch =
    projected.description === undefined ? {} : { description: projected.description };
  const schemaPatch = projected.inputSchema ? { inputSchema: projected.inputSchema } : {};
  return { ...contract, ...descriptionPatch, ...schemaPatch };
}
