// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 已保存工作流（saved workflows）的读写与序列化 —— 从 `@knorvia/core` 内联。
//
// 背景（2026-10-23，kernel-switch 前置）：
// 这些实现原先在 `@knorvia/core` 的 `tool/handlers/saved-workflows/` 与
// `plugin-reference/catalog.ts`。而 `kernel-bridge/legacy/domain-handlers.ts` 用到它们，
// 该文件在**新引擎路径上**（`kernel/process.ts` 动态 import `kernel-bridge/entry.js`），
// 而新引擎路径必须零 `@knorvia/core` 依赖，否则「删 core」会打断新引擎。
//
// 为什么内联到 bootstrap 而不是 `@knorvia/shared`：
//   这些实现依赖 `@knorvia/contracts`，而 contracts 位于 `apps/cli/packages/` 下。
//   `packages/*` 层按设计不依赖 `apps/cli/*` 层（根 `typecheck` 的 `tsc -b` 列表只含
//   `packages/*`），若放进 `packages/shared` 会造成跨目录反向依赖 —— 那正是 #315 修过的坑。
//   而 bootstrap 本身已依赖 contracts，且它就在新引擎路径上，所以放这里最合适。
//
// 行为与 core 中的原实现逐字一致：本模块只做「读 / 写 / 序列化 / 移动」，
// 不引入任何运行时状态。

export {
  SAVED_WORKFLOW_SENTINEL,
  isSavedWorkflowSentinel,
  parseSavedWorkflow,
  serializeSavedWorkflow,
  type SavedWorkflowParseErrorReason,
  type SavedWorkflowParseResult,
} from "./frontmatter.js";

export {
  findSavedWorkflowShadowing,
  listSavedWorkflows,
  moveSavedWorkflow,
  resolveSavedWorkflow,
  saveSavedWorkflow,
  savedWorkflowExists,
  savedWorkflowFileName,
  savedWorkflowPath,
  savedWorkflowRoot,
  savedWorkflowRoots,
  type ResolvedSavedWorkflow,
  type SavedWorkflowListResult,
  type SavedWorkflowMoveResult,
  type SavedWorkflowResolveFailure,
  type SavedWorkflowResolveResult,
  type SavedWorkflowRoot,
  type SavedWorkflowRootsOptions,
} from "./store.js";

export { validateWorkflowArgs, type WorkflowArgsValidation } from "./args.js";

export {
  buildPluginReferenceCatalog,
  findPluginReferenceCatalogEntry,
} from "./plugin-reference-catalog.js";
