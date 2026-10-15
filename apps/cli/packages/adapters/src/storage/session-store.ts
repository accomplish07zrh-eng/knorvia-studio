// SPDX-License-Identifier: Apache-2.0
// 会话存储的公开入口：只做再导出，实现全部在 session-store/ 子目录。
//
// 为什么 run 内省类型留在本包：它们描述的是 journal 行的词汇（dwf_run 的列与时间戳），
// 而不是跨进程边界的工具载荷；bootstrap 已经依赖 @knorvia/adapters，直接复用这份签名
// 可以避免宿主侧再抄一遍并随之漂移。

export {
  createSqliteSessionStore,
  getDefaultSessionDbPath,
  openStartupSqliteSessionStore,
  SqliteSessionStore,
} from "./session-store/sqlite-session-store.js";
export { createDwfJournalStore } from "./session-store/repositories/dwf-journal.js";
export type {
  DwfArtifactItem,
  DwfArtifactItemsQuery,
  DwfListRunsQuery,
  DwfNodeStatusCounts,
  DwfRunIntrospectionQueries,
} from "./session-store/repositories/dwf-journal.js";
export type {
  DwfRunDetailRow,
  DwfRunListItem,
  DwfRunSessionListItem,
  DwfRunSessionRow,
  DwfRunTimestamps,
  DwfWorldNodeRow,
} from "./session-store/repositories/dwf-journal-codecs.js";
export { SqliteSessionMigrationError } from "./session-store/errors.js";
export type {
  SqliteSessionMigrationErrorKind,
  SqliteSessionMigrationErrorOptions,
} from "./session-store/errors.js";
export type {
  SessionStoreDebugCounts,
  SqliteSessionStoreOptions,
} from "./session-store/options.js";
export type {
  AsyncSqliteMigrationOptions,
  SqliteMigrationProgress,
} from "./session-store/migration-runner.js";

// 再导出的分组与用途：
// 1) 存储主体 —— createSqliteSessionStore / SqliteSessionStore / openStartupSqliteSessionStore；
// 2) 默认库路径 —— getDefaultSessionDbPath（数据目录下的 cli/sessions.sqlite）；
// 3) journal 写入 —— createDwfJournalStore 及其查询类型（run 内省、工件、节点统计）；
// 4) 行形状 —— dwf-journal-codecs 里的 run/session/节点行与时间戳；
// 5) 错误 —— SqliteSessionMigrationError 及 kind/options；
// 6) 选项与进度 —— SqliteSessionStoreOptions、SessionStoreDebugCounts、迁移进度与异步选项。
// 约定一：本文件不实现任何逻辑；调用方只依赖这里列出的名字，内部文件可自由重组。
// 约定二：迁移相关的名字单独列出，因为迁移文件承担数据格式（DDL/SQL），改动必须另走评审。
// 使用方一（CLI bootstrap）：openStartupSqliteSessionStore + SqliteStoreOptions。
// 使用方二（会话运行时）：createSqliteSessionStore + SqliteSessionStore。
// 使用方三（工作流内省）：createDwfJournalStore + DwfRunIntrospectionQueries。
// 使用方四（迁移自检）：AsyncSqliteMigrationOptions + SqliteMigrationProgress。
// 维护一：改名或移动内部文件时，只需同步本文件的导出清单，其它模块不深入 session-store/。
// 维护二：某个类型若要外露，先判断它是否属于 journal 行词汇，再决定放这里还是 contracts。
// 维护三：新增导出时同时补一行说明，保持「名字 → 用途」可检索。
// 维护四：删除导出前先确认包外没有引用，可用 dep:refs --list-exports 查询。
