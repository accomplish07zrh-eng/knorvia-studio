// SPDX-License-Identifier: Apache-2.0
// ListModels 工具声明：列出本宿主已配置的模型。
// 只读、无副作用的发现面，只服务一件事：主代理给一次 workflow run 挑子代理模型
// （CreateWorkflow / AmendWorkflow 的 subagent_model）。它不是选模开关——改不了会话自己的模型，
// 主代理恒留在用户选定的那一个上。
// 与模型名解析器是两条互补的路：解析器按用户说的名字直接传，解不出来时连同候选一起退回；
// 本工具是主动问「有哪些可用」的那条。两者读同一份活目录（ModelCatalogPort）。

import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

export const LIST_MODELS_TOOL_NAME = "ListModels";

export const ListModelsInputSchema = z
  .object({})
  // 与 ListSavedWorkflows 同一约束：零入参。过滤、分页、模糊查询一律不给——目录本来只有
  // 几十行，多一个旋钮就多一处让模型怀疑「是不是没列全」的地方。
  .strict();

export type ListModelsInput = z.infer<typeof ListModelsInputSchema>;

export const ListModelsInputJsonSchema = toToolJsonSchema(ListModelsInputSchema);

/** 目录里的一行。`id` 是可以**逐字**填进 `subagent_model` 的规范形。 */
export const ListModelsEntrySchema = z
  .object({
    /** 规范形 `providerId/modelId`（不含推理档位；要档位就自己接 `$level`）。 */
    id: z.string(),
    providerId: z.string(),
    modelId: z.string(),
    /** provider 的人类可读名；注册表没给就缺席。 */
    providerLabel: z.string().optional(),
    /** 合法的 `$level` 取值。没有档位的模型是空数组——读侧据此知道"接 `$` 是错的"。 */
    reasoningLevels: z.array(z.string()),
    /** 不接 `$level` 时会用上的档位；`reasoningLevels` 为空时缺席。 */
    defaultReasoningLevel: z.string().optional(),
    contextWindow: z.number().optional(),
    /** 不可选用的理由；可选用即缺席（而不是空字符串）。 */
    disabledReason: z.string().optional(),
  })
  .strict();

export type ListModelsEntry = z.infer<typeof ListModelsEntrySchema>;

export const ListModelsOutputSchema = z
  .object({
    /**
     * 会话此刻用的模型（规范形）。**只是坐标，不是推荐**：子代理省略 `subagent_model` 时跑的
     * 就是它，所以"把子代理设成这一个"等于什么都不做。目录里一条都对不上时缺席。
     */
    current: z.string().optional(),
    models: z.array(ListModelsEntrySchema),
  })
  .strict();

export type ListModelsOutput = z.infer<typeof ListModelsOutputSchema>;

export const ListModelsOutputJsonSchema = toToolJsonSchema(ListModelsOutputSchema);
