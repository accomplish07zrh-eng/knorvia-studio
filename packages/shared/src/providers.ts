import { z } from "zod";

/**
 * Knorvia agent 提供方的单一真源。
 *
 * 类型 KnorviaProvider、运行时 schema knorviaProviderSchema 都从这里派生,
 * 避免各处内联 z.enum([...]) 副本随新增/删除 provider 漂移。
 * 本模块只依赖 zod(叶子),可被 validation / protocol 等无环引用。
 */
const KNORVIA_PROVIDERS = ["knorvia"] as const;

export const knorviaProviderSchema = z.enum(KNORVIA_PROVIDERS);

export type KnorviaProvider = (typeof KNORVIA_PROVIDERS)[number];
