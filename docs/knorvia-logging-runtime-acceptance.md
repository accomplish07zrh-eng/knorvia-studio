<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 日志重实现验收

2026-09-30，行为基线 `bd0bb014c0974334557fa51814709d0b78f35f1d`。旧三个生产文件由五模块候选接替，新增永久 source/dist 合同门。没有 UI、数据库结构、workspace identity、V4 协议或用户目录变更。生产源许可复核未收口，继续保留 Apache-2.0；本批不是全库独立迁移或 MIT 完成声明。

## 已执行结果

| 命令或场景                                               | 真实结果                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 原始合同旧 source / 旧实际 dist                          | 各 47/47                                                                              |
| 静态复核补充的旧 source / 旧实际 dist                    | 各 4/4                                                                                |
| 新 source / 重建实际 dist                                | 各 51/51；公开 API 严格类型探针通过                                                   |
| 旧 source / 旧 dist 的同一 API 探针                      | 均通过                                                                                |
| 旧→新→旧真实运行时临时 JSONL 夹具                        | source/dist 均 3 条记录；旧前缀、新前缀和无关 JSON/二进制哨兵摘要保留                 |
| CLI map 核对                                             | 五份实际 dist 的字节与 CLI sourcesContent 一致                                        |
| `pnpm build:cli-packages`                                | 17/17，12 缓存、5 重新构建；已有动态 import 警告保留                                  |
| `pnpm typecheck`                                         | 通过，含 5422 个中英文键及桌面 main/host                                              |
| `pnpm --dir apps/cli typecheck`                          | 通过                                                                                  |
| `pnpm lint` / `pnpm --dir apps/cli lint`                 | 均通过，0 warning/error                                                               |
| `pnpm architecture:check --changed`                      | 0 violation/baseline/new                                                              |
| `pnpm --filter @knorvia/web build`                       | 通过；已有 chunk/dynamic-import 警告保留                                              |
| `pnpm --filter @knorvia/desktop build:no-runtime-assets` | main/host/preload/renderer 静态构建通过；不是原生启动或安装包验收                     |
| `node scripts/licenses.mjs check`                        | 未通过：缺少另架构包 `@napi-rs/canvas-linux-arm64-musl@0.1.100`，完整依赖许可结论受阻 |

来源清单与最终 SHA 全量门在提交/推送阶段执行；最终结果以 PR 检查及运行证据为准，不能用此前的 main CI 代替本提交。完整离线回归、格式、全量架构、最终类型/lint、生产构建及新来源清单均保持现有门槛。

## 首败与修订

- 旧合同首轮两端各 44 通过、1 失败：夹具把运行环境写入 KNORVIA_ENV 而不是公共 KNORVIA_RUNTIME_ENV。计数入口也先误填 46，实际为 45；修正事实与统计后增加两个显式环境隔离场景，冻结为 47。没有生产改动、豁免或延长时限。
- 初版严格 API 探针选 ES2022，现有 shared 公共入口使用 findLastIndex，产生 TS2550 和连带 TS7006。将探针目标设为受检 Node 24 支持的 ESNext 后旧/新 source/dist 均通过，不修改生产或类型断言。
- 旧版补充夹具首次缺少正确 workspace 依赖链接和 ESM 配置，MODULE_NOT_FOUND，未执行行为。补全测试环境后 source/dist 各 4/4。
- 静态复核发现新实现需显式保持 getMinLevel 的 logger receiver，以及数组 getter 删除元素时已受理下标的写入；修正后新门各 51/51。原始 47 行为断言保持。
- Electron 默认安装及正常缓存恢复仍返回 `getaddrinfo EAI_AGAIN github.com`；镜像和 npm 域名也得到 DNS 错误，没有绕过限制。CI 风格的 frozen/ignore-scripts 安装已成功，足够执行离线构建与合同。

## 差异、数据与回滚

公开调用、记录格式、目录、日期、清理规则和错误位置保持。日志的 void 方法继续即时同步追加，清理继续异步串行删除；工厂级别和一次调度标记各有唯一所有者。未新增 flush、队列、后台重试或数据库 migration。

回滚切回父提交并保留数据目录。source/dist 的真实旧版本分别在新版本追加后再次写入同一临时日志文件，新增记录可继续被旧格式 JSONL 读者读取。这里的 JSON/二进制文件是合成哨兵，只证明本日志边界不改动无关文件，不能外推为全应用数据库升级测试。

未执行：Electron 原生启动、自动几何/UI/中断交互、Windows/macOS 本机运行、签名、安装版/便携版、真实模型和用户数据。代码不改变 UI，但未以静态构建冒称原生视觉验收通过。最终构建没有部署或发布。

来源与构建摘要见[依据](../licensing/evidence/logging-runtime.md)。测试冻结后的补充与所有首败都保留，不把新门成功当作 clean-room 或全库 MIT 证明。
