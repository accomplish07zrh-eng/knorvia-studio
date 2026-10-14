// SPDX-License-Identifier: Apache-2.0
// 节点提示更新的校验谓词（实现逻辑，不属兼容面）。
// 旧实现把它写成 schema 定义里的内联箭头函数，这里抽成具名纯函数：
// 规则本身可以单独测试，schema 定义也只剩声明。
// 入参形状只在本文件里用（schema 侧传入结构化副本），不进公开面。
interface NodePromptUpdateFields {
  description?: string;
  prompt?: string;
  title?: string;
}

// 更新必须至少带一个可写字段，否则视为无意义更新（错误文案由 schema 侧提供）。
export function hasNodePromptUpdateField(update: NodePromptUpdateFields): boolean {
  const fields = [update.description, update.prompt, update.title];
  return fields.some((value) => value !== undefined);
}
