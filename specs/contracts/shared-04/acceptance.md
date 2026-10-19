# shared-04 合同验收（v1）

对应计划书「合同八件套」验收清单。旧门产物：[`gate-old.json`](gate-old.json)。

## 1. 范围

`packages/shared/src` 顶层（不含 `node/`、`protocol-v4/`）继承剩余、shared-02 之外的
**44 个文件**（六簇，见 [`README.md`](README.md) §一.3）；分类为 upstream-modified 34 / upstream-unchanged 10。
`index.ts` 根桶按 shared-03 README 归 shared-04 **末批**，不在本批；`unreviewed` 21 件不在选包口径。

## 2. 八件套完成度

| 件       | 位置                                                                                                                     | 状态     |
| -------- | ------------------------------------------------------------------------------------------------------------------------ | -------- |
| 行为规格 | [`behavior.md`](behavior.md)（B1–B49，九项 + 语义常量对照 + 金样口径）                                                   | ✅       |
| 接口面   | [`interface.md`](interface.md) + [`interface-appendix.json`](interface-appendix.json)（机器生成：204 运行时/152 纯类型） | ✅       |
| 调用方   | [`callers.md`](callers.md)（550 处 / 252 文件，入口五类）                                                                | ✅       |
| 黑盒测试 | [`tests/`](tests/)（8 文件 51 断言，源码 + dist 两入口）                                                                 | ✅       |
| 金样     | [`fixtures/`](fixtures/)（①remote/identity ②plugins/mcp ③config/UI ④feedback ⑤diagnostics ⑥auth/model）                  | ✅       |
| 已知差异 | [`known-differences.md`](known-differences.md)（红线清单 + 平台边界）                                                    | ✅       |
| 合同桩   | [`stubs/`](stubs/)（44 目标，import 即抛；替换落地后删除）                                                               | ✅       |
| 旧门     | [`gate-old.json`](gate-old.json)                                                                                         | ✅ 见 §3 |

## 3. 旧门输出（gate-old.json 实测）

| 入口                                        | tests        | pass  | fail | skipped | exit |
| ------------------------------------------- | ------------ | ----- | ---- | ------- | ---- |
| 源码入口                                    | 51           | 51    | 0    | 0       | 0    |
| dist 入口（`KNORVIA_SHARED_04_ENTRY=dist`） | 51           | 51    | 0    | 0       | 0    |
| 桩替换 44 目标后重跑                        | 8 个测试文件 | **0** | 8    | —       | 1    |

`allFail=true`：桩替换后契约测试 8 文件全部失败（file 级），说明测试确实测到公开行为。
金样口径：`fixtures/*.json` 由旧实现录制（`.scratch-shared04/record-fixtures.mjs`，不入库），
两入口断言全部对金样逐字段比较；JSON 不可表达 `undefined` 的字段用 `jsonValue`/`assertJsonEqual`
保留旧实现的实际序列化形状。

## 4. 首败与修正（代表性）

- 金样常量名按旧实现回写：`MEMORY_SAMPLE_INTERVAL_MS/HEAP_DELTA_RATIO/NATIVE_DELTA_RATIO/HEARTBEAT_MS`；
  `LOCAL_TTFT_MAX_PENDING/TTL_MS/CLOCK_TTL_MS/CLOCK_MAX_ERROR_MS`（无批量上限常量）；
  `SESSION_DEBUG_LIMITS={rounds:200,network:100,dedupe:2000}`；认证头/元数据/失败理由四组常量名；
  `desktopMenuMessageIds` 是对象而非可迭代集合。
- schema 形状三修：`databaseStartupStateSchema` 是 strict 对象而非枚举、
  `databaseStartupControlSchema` 是判别联合（retry 需 `attemptId`）、
  `databaseStartupPortPayloadSchema` 为 `{databaseStartupId}`；WSL 目标字段名是 `user`；
  server-remote 的 workspace schema 名为 `serverRemoteWorkspaceInfoSchema`。
- 桩生成路径曾剥掉 `packages/` 前缀生成到 `stubs/shared/...`，改为保留
  `packages/shared/src/...` 后 44 目标全部命中。
- JSON 金样会丢弃 `undefined` 属性（clientConfig、插件排序、help 配置、serviceAuthority）：
  统一改用 `jsonValue`/`assertJsonEqual` 比对，而非放宽断言。
- 断言口径修正：`app-runtime-preferences` 的 `askUserQuestionAutoResolutionEnabled` 必填，
  默认 false 断言落在 `modelIoFullRetentionEnabled`；`serviceAuthority` 用结构比对而非引用相等；
  openrouter 常量只含 `X-OpenRouter-Title` 与 `X-OpenRouter-Categories`；
  `intranetDefaults` 缺参错误按旧实现逐字（`Configure …` 开头）。

## 5. 说明

- 测试断言与金样零改动原则同样适用于本合同：fixtures 一旦落库只读；
- 本批不动 `packages/shared/src`；替换实现按本合同的 B 条目与红线清单另起批次；
- 登记与 CI/合并记录见 PR「contract: shared-04 v1」与 issue #190。
