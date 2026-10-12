// SPDX-License-Identifier: Apache-2.0
// core-hooks 桩定义的公共常量（被 definitions-*.mjs 与 build-stubs.mjs 共用）。
export const NOT_IMPLEMENTED = 'throw new Error("not implemented: core-hooks");';

export const header = (path) =>
  `// SPDX-License-Identifier: Apache-2.0\n// core-hooks 合同 v1 的最小桩（对应 ${path}）。仅签名，无实现。\n`;

const SHARED_TYPES = new Set(["WorkspaceHookReviewDecision", "WorkspaceHookReviewRequestPayload"]);

/** 生成按需的 type-only 导入行：只导入该桩真正使用的类型。 */
export const imports = (names) => {
  const contracts = names.filter((name) => !SHARED_TYPES.has(name)).sort();
  const shared = names.filter((name) => SHARED_TYPES.has(name)).sort();
  const lines = [];
  if (contracts.length > 0)
    lines.push(`import type { ${contracts.join(", ")} } from "@knorvia/contracts";`);
  if (shared.length > 0)
    lines.push(`import type { ${shared.join(", ")} } from "@knorvia/shared/protocol-v4";`);
  return lines.join("\n");
};
