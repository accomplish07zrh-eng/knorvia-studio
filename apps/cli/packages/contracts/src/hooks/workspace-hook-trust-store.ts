// SPDX-License-Identifier: Apache-2.0
// workspace hook 的策略 schema 与 trust store 文件的再导出。
// trust store 文件的 schema 已下沉到 `@knorvia/shared/workspace-hook-trust-store-file` 作为单一权威实现：
// services 层无法依赖 apps 下的 contracts，只好手写局部校验，曾导致 UI 与 runtime 对同一个损坏文件结论分裂。
// 这里 re-export 保持 contracts 既有 import 路径（adapters/bootstrap/core 等）不变；shared 与 contracts
// 分属 zod4 / zod3 实例，因此本 re-export 不得被 contracts 内部的 zod3 schema 组合引用。

export {
  WORKSPACE_HOOK_TRUST_STORE_SCHEMA_VERSION,
  workspaceHookTrustRecordSchema,
  workspaceHookTrustStoreFileSchema,
} from "@knorvia/shared/workspace-hook-trust-store-file";
export type {
  WorkspaceHookTrustRecord,
  WorkspaceHookTrustStoreFile,
} from "@knorvia/shared/workspace-hook-trust-store-file";

import { z } from "zod";

const trimmedNonEmptyString = z.string().trim().min(1);

/** 三种策略各自的字段表（不含判别字段 `mode`）。 */
const POLICY_FIELD_SHAPES = {
  deny: { reason: trimmedNonEmptyString, policyRevision: trimmedNonEmptyString },
  userDecides: { policyRevision: trimmedNonEmptyString },
  allowTrustedOnly: {
    reason: trimmedNonEmptyString.optional(),
    policyRevision: trimmedNonEmptyString,
  },
};

/** 策略 schema：判别字段是 `mode`，三个分支各自补上判别值。 */
export const workspaceHookPolicySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("deny"), ...POLICY_FIELD_SHAPES.deny }).strict(),
  z.object({ mode: z.literal("user_decides"), ...POLICY_FIELD_SHAPES.userDecides }).strict(),
  z
    .object({ mode: z.literal("allow_trusted_only"), ...POLICY_FIELD_SHAPES.allowTrustedOnly })
    .strict(),
]);

export type WorkspaceHookPolicy = z.infer<typeof workspaceHookPolicySchema>;
