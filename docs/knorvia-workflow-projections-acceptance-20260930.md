# 工作流 shared 第三组验收

基线 `bc36df98da36e56cda66051137b99d31f2184666`，分支
`parallel/protocol-workflow-projections-20260930-batch3`，先行契约检查点
`b65d9f01ed74c0c844273a49eee6fd8e942a4b7e`。生产所有权恰为：

- `packages/shared/src/protocol-v4/workflow-runs-concurrency.ts`
- `packages/shared/src/protocol-v4/workflow-runs-phases.ts`
- `packages/shared/src/protocol-v4/workflow-runs-node-progress.ts`

三者原为 upstream-unchanged、review=null，历史仅 `7619e41` 初始快照。前两组六个
源码及交接材料保持原字节。没有改 UI、services、CLI、schema、协议 owners、恢复与
userdata；本组纯函数无时钟或外部 IO。规格见
[工作流事件投影第三小组](../specs/knorvia-workflow-projections-20260930.md)。

## 工程行为验收

并发 run-started 先规划配置与桶观测变更，最后只复制一次 run；桶观测按原字段次序
投影。阶段邻接用 Set 判重但保留首次原标量（包括 -0），阶段更新只复制命中槽；节点
字段用明确的出生/携带/覆盖投影，保持 lifecycle 与 usage 原 owner。固定公共注释和
必要判读规则继续保留，不能把这种重构据为法律去来源。源码净减少6行，行数不是验收目标。

实现前冻结301个旧观察值，保存完整 JSON、缺席字段、异常、引用别名和不变性结果。
冻结 JSON 与检查点逐字节一致。另有库存、阶段单调/命中路径、-0、节点出生/生命周期
检查及五个消费者检查。

| 目标                | 通过 | 失败 | 跳过 |
| ------------------- | ---: | ---: | ---: |
| 实现前旧 source     |  310 |    0 |    0 |
| 实现前旧 dist       |  310 |    0 |    0 |
| 旧 dist，加审阅回归 |  311 |    0 |    0 |
| 最终候选 source     |  311 |    0 |    0 |
| 最终候选 dist       |  311 |    0 |    0 |

审阅发现用 `< ordinal` 替代旧 `>= ordinal` 的反向分支会改变旧 rounds=NaN 的结果。
候选使用原比较方向，新增回归在保留的旧 dist 和候选 source/dist 均通过，没有修改或
放宽301个冻结观察值。三个 emitted `.d.ts` 与旧 dist 逐字节一致。

真实消费者为 unchanged shared 公共 workflow reducer、原 CLI TUI mirror、原 UI
workflowRunCardJoin 及公共 state.updated apply。测试 bundle 绑定 source/dist 公共
协议入口，验证重复 envelope 不抬 revision、resume 不覆盖已知 cap、节点重新 queue
清计数、UI 保原 run 引用，以及 continuous 多次更新与 replayable 最终快照同终态。
envelope 为合成 accepted 数据；没有声称执行真实引擎、journal 读取或消息传输。

可重复的 `packages/shared/test/workflow-projection-cross-version.mjs` 与外部旧 dist
进行4,800次 helper 比较、400条公共 reducer 事件轨迹比较，另在无 Buffer/process
的 browser-target VM 中执行6组边界检查。全部通过；VM 不代表实机浏览器或 GUI。

## 实际命令与质量结果

使用临时 PATH 中的 Node24.14.0、pnpm10.33.2，在根目录执行：

```sh
pnpm exec tsc -b packages/shared
node --import tsx --test packages/shared/test/workflow-projection-contract.test.ts packages/shared/test/workflow-projection-consumers.test.ts
KNORVIA_WORKFLOW_TEST_TARGET=dist node --import tsx --test packages/shared/test/workflow-projection-contract.test.ts packages/shared/test/workflow-projection-consumers.test.ts
KNORVIA_WORKFLOW_TEST_TARGET=../../../../tmp/knorvia-workflow-baseline/shared-dist node --import tsx --test packages/shared/test/workflow-projection-contract.test.ts packages/shared/test/workflow-projection-consumers.test.ts
node packages/shared/test/workflow-projection-cross-version.mjs --baseline /tmp/knorvia-workflow-baseline/shared-dist
pnpm exec turbo run build --cwd apps/cli --filter=@knorvia/bootstrap...
pnpm typecheck
pnpm lint
pnpm exec tsc -p /tmp/knorvia-workflow-baseline/tsconfig.tests.json
pnpm exec oxlint --deny-warnings packages/shared/src/protocol-v4/workflow-runs-concurrency.ts packages/shared/src/protocol-v4/workflow-runs-phases.ts packages/shared/src/protocol-v4/workflow-runs-node-progress.ts packages/shared/test/workflow-projection-cases.ts packages/shared/test/workflow-projection-contract.test.ts packages/shared/test/workflow-projection-consumers.test.ts packages/shared/test/workflow-projection-cross-version.mjs
pnpm verify:pre-push
git diff --check
pnpm provenance:check
```

shared emit、根 typecheck/i18n、根 lint、scoped 测试类型与 deny-warnings lint、格式、
架构和 pre-push 通过，new/baseline architecture violations 为0。bootstrap 依赖构建
9/9，全命中缓存。没有重复全量 CI；新增 test 文件由现有 test-studio 自动发现。

临时测试 tsconfig extends 根 tsconfig.base.json，noEmit、composite=false、
declaration/declarationMap=false、jsx=react-jsx、lib=es2025/dom/dom.iterable、types=node，
typeRoots 指向仓库 node_modules/@types（及 UI 对应目录），`@/*` 使用原 UI alias，
files 为本组三个 TypeScript 测试文件。动态 UI bundle surface 只类型化实际断言的
字段；真实 UI 类型由根 typecheck 检查。没有改写生产 ambient declaration 或全局配置。
外部旧 dist 保留 ESM context，解析链接只给其实际 shared 依赖 zod/model-option-map。

保留失败记录：初次 CLI journal/launch 消费者 bundle 带入 core/REPL 的 Node 依赖，
ESM 动态 require(fs) 失败，未完成该入口验证；测试收窄到原纯消费者，未用 stub 冒充
journal。直接类型读入 UI 深层实现时缺少 ImportMeta.env ambient 声明，曾失败；将
动态 bundle surface 限于实际断言字段后 scoped 类型通过，原 UI 仍由根检查。外部旧
dist 首次 consumer 解析缺 model-option-map 链接，修正临时解析后通过。初次本地编辑
脚本未匹配单行签名而停止，尚未写入生产文件；修正后才实施替换。之前 Electron 下载
失败仍限制 GUI 验证。以上不作产品通过或真实端到端结果。

## 来源资格、分母与交接

shared/src 分母227；12个既有 accepted independent 记录与实际摘要匹配。215来源
待闭合文件中，本轨三组累计行为验收9个，206个未在本轨替换；这9个仍需来源资格复核，
新增 MIT/来源接受数为0。原源码暴露、保留 public docs、判读和截断表达均明确记录，
Apache/NOTICE 继续适用。

[来源闭合策略](knorvia-protocol-source-review-strategy-20260930.md)给出前六文件逐项
待审表达、独立复核和必要权利人确认的触发条件，以及可保留 TypeScript、Playwright、
ECharts、PDF.js 等 Apache 依赖的具体 inventory 依据。合法共存不能代替用户消除
ZCode 产品实现的最终目标，不能据此给整个应用贴 MIT 标签。

[本组机器证据](../licensing/evidence/workflow-projections-20260930.json)提供三个源码
before/after、声明、冻结摘要、保留文件摘要及清单建议。不修改 shared ledger、
lockfile、global config 或旧交接提交。实际 provenance:check 仍因继承的 wire-codec
input binding 失败；父任务统一对账、刷新新增文件清单并运行整体集成 CI。本组不写
independent/MIT review，不建 PR、不合并或发布。到此检查点停止选择其他生产所有权。

未运行 Windows/macOS、实机 GUI/浏览器、实际 journal 铸造入口或模型工作流。等价性
证据覆盖冻结反例、固定种子及普通协议记录，不承诺任意 getter/builtin monkeypatch。
