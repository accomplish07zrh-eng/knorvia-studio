import type { ExecutionShellSelection } from "@knorvia/contracts";

// 执行层只在明确支持 POSIX shell function 的会话 shell 里注入 find()/grep() alias；
// provider-visible embedded branch 本身已默认开启。
const ENABLE_EMBEDDED_SEARCH_BASH_PRELUDE = true;

// 允许注入 alias 的 dialect 白名单（字符串是兼容面）。
const PRELUDE_DIALECTS: ReadonlySet<string> = new Set(["posix", "git-bash"]);

/** find()/grep() alias 注入总开关。 */
export function shouldInjectEmbeddedSearchBashPrelude(): boolean {
  return ENABLE_EMBEDDED_SEARCH_BASH_PRELUDE;
}

/** 会话 shell 的 dialect 是否在注入白名单内；未选择 shell 时视为否。 */
export function supportsEmbeddedSearchShellSelection(
  selection: ExecutionShellSelection | undefined,
): boolean {
  const dialect = selection?.dialect;
  return dialect !== undefined && PRELUDE_DIALECTS.has(dialect);
}
