// SPDX-License-Identifier: Apache-2.0
// 子代理档案的模型选择解析：正式 Markdown codec 在 @knorvia/shared，这里只做转发。
// Provider 迁移必须先落到用户存储边界完成，所以这一层不自行解析 frontmatter 文本。
import { parseSubagentMarkdownSelection, type ModelSelection } from "@knorvia/shared";

type ProfileFrontmatter = Record<string, unknown>;
type ModelSelectionOrUndefined = ModelSelection | undefined;

export function resolveProfileModelSelection(
  frontmatter: ProfileFrontmatter,
): ModelSelectionOrUndefined {
  return parseSubagentMarkdownSelection(frontmatter);
}
