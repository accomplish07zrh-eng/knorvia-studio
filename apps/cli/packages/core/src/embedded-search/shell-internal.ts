// SPDX-License-Identifier: Apache-2.0
// embedded search 的 Bash prelude（find()/grep() alias）判定实现。
// 公开文件 shell.ts 只保留两个导出转发，常量与白名单都集中在这里。
//
// 规则：
//   1. alias 注入总开关默认开启（provider-visible embedded branch 已默认开启）；
//   2. 只有明确支持 POSIX shell function 的会话 shell 才注入：dialect 属于白名单；
//   3. 未选择 shell（undefined）时不注入。
// 白名单里的两个 dialect 字符串是兼容面，逐字保留。

const ENABLE_EMBEDDED_SEARCH_BASH_PRELUDE = true;

const PRELUDE_DIALECTS: ReadonlySet<string> = new Set(["posix", "git-bash"]);

export const injectEmbeddedSearchBashPrelude = (): boolean => ENABLE_EMBEDDED_SEARCH_BASH_PRELUDE;

export const isEmbeddedSearchPreludeDialect = (
  selection: { dialect?: string } | undefined,
): boolean => {
  const dialect = selection?.dialect;
  return dialect !== undefined && PRELUDE_DIALECTS.has(dialect);
};
