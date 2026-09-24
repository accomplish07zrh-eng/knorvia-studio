import type { KnorviaSessionFile, KnorviaTaskMeta } from "@knorvia/shared";
import { sessionFileSchema, knorviaTaskMetaSchema, knorviaTaskModeSchema } from "@knorvia/shared";

export type LegacyTaskSessionFile = Omit<KnorviaSessionFile, "meta"> & {
  meta: Omit<KnorviaTaskMeta, "mode"> & { mode?: KnorviaTaskMeta["mode"] };
};

const legacyTaskSessionFileSchema = sessionFileSchema.extend({
  // Claude 原生迁移会按清洗路径删除 meta.mode。
  // legacy snapshot 读取/写入仍要校验其它必需字段，但不能再强制把被过滤字段补回文件。
  meta: knorviaTaskMetaSchema.extend({
    mode: knorviaTaskModeSchema.optional(),
  }),
});

export function parseLegacyTaskSessionFile(input: unknown): LegacyTaskSessionFile {
  return legacyTaskSessionFileSchema.parse(input);
}

export function safeParseLegacyTaskSessionFile(input: unknown) {
  return legacyTaskSessionFileSchema.safeParse(input);
}
