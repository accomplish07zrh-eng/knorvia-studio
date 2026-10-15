# apps-cli-packages-01-model 合同验收（acceptance.md）

2026-10-15。合同 v1：`apps/cli/packages/adapters/src/model/**` 44 个继承文件（普通模式两道门槛
未过线；51 个文件中 7 个达标不动）的行为合同、契约测试、金样与桩。

## 一、范围

- 44 个继承文件（普通模式 containment 0.111–0.952、run 1–25、structural 0.000–1.000，逐文件
  实测在 [`scope.json`](./scope.json)）；43 个普通+声明双模式未过线，`model-option-map-fetch.ts`
  声明模式过线（残留 0）。
- 51 个文件 5,052 行 / 44 个继承文件 4,823 行（含空行与注释的物理行）。
- 分包总表新行（替换 PR #166 描述备案）：`apps-cli-packages-01-model`，M2，44 继承 / 约 6.5k 行
  （计划书粗估；本合同实测 4,823 行）。

## 二、旧门与桩替换（`gate-old.json` / `stub-gate.json`，Node v24.14.0）

| 项                                         | 结果                                                  |
| ------------------------------------------ | ----------------------------------------------------- |
| 用例数 / 测试文件                          | 68 / 7                                                |
| 源码入口                                   | 68 通过、0 失败、0 跳过                               |
| dist 入口（`KNORVIA_ADAPTERS_ENTRY=dist`） | 68 通过、0 失败、0 跳过                               |
| 预登记差异                                 | 0（`known-differences.md` §一）                       |
| 断言放宽                                   | 无                                                    |
| 桩替换（`stubs/apply.mjs --apply`）        | 0 通过 / 68 失败（`allFail: true`），随后 `--restore` |

## 三、条目与语义常量覆盖

- `behavior.md` B1–B62：装配与 provider 路由（B1–B10）、重试/准入/失败裁决（B11–B26）、
  消息工具媒体投影（B27–B36）、流式边界与兼容（B37–B46）、runner 编排（B47–B52）、
  状态/调试持久化/归一（B53–B62）。
- 「条目 → 测试」对照表 80 行、无空行（`tests/build-case-map.mjs --check` 生成与校验）。
- 模型选择/路由类语义常量显式成条并有锁值断言（M1 教训）：API 格式路由表、header 大小写合并、
  重试默认值与 5 个 `KNORVIA_MODEL_*` 键、off-peak 码与延迟上下限、业务码表 12 组逐码、
  workflow 配额码 19 项、空闲超时 30s 递增、清理 1s 上限、调试限额 64/256 MiB 与 3 文件轮转、
  归因头键名、敏感头清单、`maxRetries: 0`。

## 四、金样（旧实现真值，`fixtures/checksums.json` 记账）

8 个金样由 `tests/build-fixtures.mjs` 在旧实现上一次性生成并冻结（重写阶段禁止重新生成）：
三组消息投影（默认 / openai-compatible 文本化 / stripMedia）、工具投影、选项映射请求体、
Anthropic 元数据形状与脱敏、`projection/inputs.json`（复用同一语料）、调试持久化
`model-io/written/golden-session.jsonl`（生成 + 流式两条，覆盖 baseline/delta 双模式与
成功生产去重）。B54 走「旧写 → 新读 → 新写 → 旧读」往返，动态字段（`completedAt`）掩码比对。

## 五、首次失败与修正（如实记录）

1. B24 口径修正：`statusCode` 取体内的 `status`，缺省用 `statusCode`/`status`/`responseStatus`
   键集（**不含** `response.status`）——测试期望按实测改，`behavior.md` 同步修正。
2. B44/B45 口径修正：`tool_result` 归一只发生在响应侧 SSE 的 `content_block_start`，
   请求体里原样透传——`behavior.md` 修正，断言移到 B45。
3. B36 计数修正：`toolCalls: []` 等同无调用，剔除 reasoning 后的空 assistant 整条剔除——
   测试期望按实测改。
4. `build-fixtures.mjs` 多轮运行会向调试金样追加行——生成器改为先清目录；金样最终在
   本轮一次性冻结。
5. 桩生成器多行签名（多行 const 类型、跨行函数签名、类成员）三轮修正后才生成合法桩。

## 六、门禁（本机 Node v24.14.0）

| 项                                                 | 结果                           |
| -------------------------------------------------- | ------------------------------ |
| `pnpm fmt` / `pnpm fmt:check`                      | 通过                           |
| 契约测试源码 / dist 双入口                         | 68/68 ×2                       |
| 桩替换                                             | 0/68（allFail）                |
| `pnpm typecheck` / `pnpm --dir apps/cli typecheck` | （PR 门禁摘要给出实测值）      |
| `pnpm provenance:report` / `provenance:check`      | reviewProblems 0（登记后实测） |

## 七、未覆盖内容

见 [`known-differences.md`](./known-differences.md) §五：清理超时分支不直接断言；真实网络 /
模型服务 / 操作系统竞态不在范围；设备标识只锁形状不锁值。
