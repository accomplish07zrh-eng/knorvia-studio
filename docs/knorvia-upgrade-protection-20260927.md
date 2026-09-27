# 升级数据保护补齐验收（2026-09-27）

对应 `specs/knorvia-upgrade-protection.md` 的 2026-09-27 增补。基线 `d4b5515`，Windows、Node `24.14.0`，隔离工作区实施；没有接触用户数据、生产服务、真实模型或便携安装目录。

## 完成行为

- Agent 会话库在已有应用表且待升级时，先用 SQLite `VACUUM INTO` 保存一致快照，包含 WAL 中已提交的会话记录。同步构造与异步启动共用一个 runner；空库、内存库及已迁移库不额外生成快照。
- 快照目标使用独占创建，冲突顺延、目录占用即失败，不覆盖已有恢复点。失败仅清理由本次创建的未完成文件，保留原始异常；清理也失败时不会继续升级。
- Agent 和任务索引发现任何未知迁移 id 即拒绝打开；不是仅比较最大编号。拒绝与备份失败发生在切 WAL 之前，未知编号不被拼入文件路径或跨进程诊断。
- 任务索引的 Worker 启动、TaskIndexRepo、AutomationRepo、prepared/migrated 快速路径和事务内检查均覆盖。直接 Repo 打开先完成校验／快照／事务，再设置 WAL；Worker 先完成校验／快照再设置 WAL。
- 新增 `newer_database` 和 `backup_failed` 启动错误契约及中英文提示。较新数据库不能由同一旧程序点击重试；空间和权限等底层首因仍优先显示。
- 未更改冻结迁移 SQL、id 或 checksum。原事务、锁等待、迁移进度及失败首因保持；清理阶段改为事务结束后统一抛首因，覆盖假值异常。

## 本轮实际验证

以下主工作区结果由整合验收确认，均使用 Node `24.14.0`：

| 检查                                                     | 结果                                         |
| -------------------------------------------------------- | -------------------------------------------- |
| `node scripts/check-workspace-freshness.mjs`（开工基线） | 通过：相对 `origin/main` ahead 0 / behind 0  |
| 主工作区升级／便携数据回归，六个文件，见下               | **41 / 41 通过**                             |
| 根 `pnpm typecheck`                                      | **通过，退出 0**；含 5419 个中英文对应键校验 |
| 根 `pnpm lint`                                           | **通过，0 警告、0 错误**                     |
| `pnpm architecture:check --changed`                      | **通过，违规 0**                             |
| `pnpm --dir apps/cli typecheck`                          | **通过，退出 0**                             |
| `pnpm --dir apps/cli lint`                               | **通过，退出 0**                             |
| 新增／修改文件的 `oxfmt` 与 scoped `oxlint`              | 通过                                         |
| 根 `pnpm test:studio`                                    | **838 / 838 通过，0 失败、0 跳过**           |

主工作区实际运行的六个回归文件：

1. `apps/cli/packages/adapters/test/session-upgrade-protection.test.ts`：10 条，真实 WAL 快照、幂等重开、同步／异步未知账本拒绝、备份失败、SQL 失败回滚、进度通道失败、进程强退恢复、空库／内存库、假值首因、真实双进程启动等待。
2. `apps/cli/packages/adapters/test/session-migration-snapshot.test.ts`：2 条，同毫秒目标冲突／目录占用与部分写入失败清理；既有快照始终保留。
3. `packages/services/test/tasks-future-database.test.ts`：10 条，已完成／待迁移账本中的未知 id、三个打开入口及 ready 缓存、锁内复查、快照失败原文件字节不变和修复后重试。
4. `packages/shared/test/database-upgrade-errors.test.ts`：1 条，新码分类、重试限制与底层首因。
5. `packages/services/test/studio-upgrade-protection.test.ts`：既有 11 条全部通过。
6. `packages/desktop/test/portable-upgrade-preserves-data.test.ts`：便携交付与用户数据保留回归通过。

此前隔离工作区还完成了 37 / 37 回归（含 `tasks-storage-startup.test.ts` 的 3 条首因／关闭失败用例）。隔离依赖曾指向旧共享契约，整合后已由上述真实 CLI 类型检查通过结果取代，不是当前代码缺陷。所有测试使用真实 SQLite，异常注入仅限临时数据库或进度回调；新增测试已由 `test:studio` 自动收录。

## 整合结果与边界

- 根类型、lint、架构及 CLI 检查已经完成；最终全量 `pnpm test:studio` 为 **838 / 838 通过，0 失败、0 跳过**。`pnpm fmt:check` 全部通过。
- Windows Node 24 实跑通过；macOS/Linux 没有实机验证。没有进行磁盘实际耗尽、物理断电或损坏真实用户库的测试，使用受控 IO 错误与真实进程中断。
- 快照与 `BEGIN IMMEDIATE` 之间仍有窗口：快照包含生成时全部已提交数据，不承诺包含随后其他写入者新提交的数据；SQLite 仍保证迁移事务的原子性。真实双进程回归证明等待者不会重复应用已提交迁移，不能据此宣称备份与写锁形成一个原子操作。
- Agent 使用同步 SQLite 迁移契约，独占预留目标及其清理同样在存储 adapter 内同步执行；异步启动仅在锁竞争时让出事件循环。大库快照成本应纳入后续升级耗时测量，不把空库启动速度当升级速度。
- 自动恢复和自动删除旧快照不在本轮范围。人工恢复必须先关闭所有连接，备份为普通 SQLite 单文件；恢复主文件时需同时清理残留 WAL/SHM，见原升级保护规格。断电留下的未完成文件不会被程序自动当作数据库打开。
- `KNORVIA_ENV=production node packages/desktop/scripts/bundle.mjs --os win --arch x64` 构建退出 0，产物位于 `packages/desktop/dist-stability-20260927`；仅用于隔离验收，未覆盖桌面便携目录、提交或推送。
