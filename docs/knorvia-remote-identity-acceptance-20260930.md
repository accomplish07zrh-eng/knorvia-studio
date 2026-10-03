# 远程身份 shared 第二组验收

本组从已交接的 `5277f8074c5071d3fc90b72370347ddf6d53ee51` 派生，使用
`parallel/protocol-remote-identities-20260930-batch2`。契约检查点为 `9eeb789`。
上一组两个提交及三个 wire 文件未改写；初始共同基线仍是 draft PR 7 的
`8e8f6310d5ca70a57a454054e44f7b61db30b83f`。生产所有权恰为：

- `packages/shared/src/remote-workspace-identity.ts`
- `packages/shared/src/remoteSshHostKey.ts`
- `packages/shared/src/wslUserValidation.ts`

三者的旧来源记录均为 upstream-unchanged、review=null，历史只有初始快照
`7619e41`。没有重写已接受的独立模块。原代码已为提取契约阅读，源码暴露明确披露；
Apache-2.0、NOTICE 与第三方材料保留。本次不提出生产 MIT 或独立来源接受决定。
规格见 [远程身份纯函数第二小组](../specs/knorvia-remote-identity-helpers-20260930.md)。

## 替换结果与行为证据

workspace parser 改为三类锚定文法，构造路径按分隔符 token 折叠；它仍保留冒号、
换行和点段路径，不添加 authority 验证。SSH 私钥路径改为根分类、受保护 authority
与路径 token reducer，保留 POSIX、UNC、盘符、相对路径及 `~/` 的既有差异。
WSL predicate 用固定禁用字符集合匹配，UTF-16 长度和 Zod trim/max/refine 顺序保留。
生产代码净减少 94 行。

实现前冻结了 249 个精确旧观察值，包含负例、native TypeError、getter 读取顺序、
JSON 身份字节及完整 Zod issues。冻结 JSON 与契约检查点逐字节一致，没有放宽反例。
另有库存一致性、完整 ASCII/C1 字符边界、身份/真实路径分离、秘密值不进入身份键，
以及四个真实消费者检查。三个 emitted `.d.ts` 与基线逐字节相同。

| 目标                  | 通过 | 失败 | 跳过 |
| --------------------- | ---: | ---: | ---: |
| 实现前旧 source       |  257 |    0 |    0 |
| 实现前旧 emitted dist |  257 |    0 |    0 |
| 候选 source           |  257 |    0 |    0 |
| 最终 emitted dist     |  257 |    0 |    0 |

真实消费者测试以 esbuild 绑定选定的 shared 公共入口，执行原来的 CLI workspace ref、
UI WSL 向导、Desktop 窗口连接注册表和遥测环境 key。dist 模式执行编译后的 CLI
workspace 模块，其他消费者在测试 bundle 中编译。注册表用注入的无网络连接服务：
等价身份复用一次连接、不同 username/key path 隔离为三个连接，最终全部释放。
这些消费者的源码、UI、数据、状态 owner、租约及 continuous/replayable 语义没有改动。

额外的可重复差分脚本
`packages/shared/test/remote-identity-cross-version.mjs` 对外部旧 dist 与候选 dist
进行 7,200 次固定种子比较，覆盖 workspace 构造/解析、随机 authority、根/点段路径
与完整 WSL schema 结果。六组 browser-target bundle 边界在无 Buffer/process 的 VM
中与旧实现及 Node 结果相同。这是模拟浏览器环境，没有声称实机 GUI 或浏览器验收。

## 实际执行的检查

工具版本为 Node 24.14.0、pnpm 10.33.2，通过临时 PATH 选择。从仓库根目录运行：

```sh
pnpm exec tsc -b packages/shared
node --import tsx --test packages/shared/test/remote-identity-contract.test.ts packages/shared/test/remote-identity-consumers.test.ts
KNORVIA_REMOTE_TEST_TARGET=dist node --import tsx --test packages/shared/test/remote-identity-contract.test.ts packages/shared/test/remote-identity-consumers.test.ts
node packages/shared/test/remote-identity-cross-version.mjs --baseline /tmp/knorvia-remote-baseline/shared-dist
pnpm exec turbo run build --cwd apps/cli --filter=@knorvia/bootstrap...
pnpm typecheck
pnpm lint
pnpm exec tsc -p /tmp/knorvia-remote-baseline/tsconfig.tests.json
pnpm exec oxlint --deny-warnings packages/shared/src/remote-workspace-identity.ts packages/shared/src/remoteSshHostKey.ts packages/shared/src/wslUserValidation.ts packages/shared/test/remote-identity-contract-cases.ts packages/shared/test/remote-identity-contract.test.ts packages/shared/test/remote-identity-consumers.test.ts packages/shared/test/remote-identity-cross-version.mjs
pnpm architecture:check --changed
pnpm verify:pre-push
git diff --check
pnpm provenance:check
```

shared emission、根 typecheck/i18n、最终根 lint、测试类型/lint、格式、架构和 pre-push
通过；架构 new/baseline violations 均为零。bootstrap 依赖构建 9/9，9 项均命中
上一组留下的缓存；编译消费者另经上述 dist 测试执行。没有重复全量应用测试。
新增 `.test.ts` 自动进入现有 `scripts/test-studio.mjs`，未改注册表或全局配置。

临时测试 tsconfig extends 仓库 `tsconfig.base.json`，设置 noEmit、composite=false、
declaration/declarationMap=false、jsx=react-jsx、lib=es2025/dom/dom.iterable、types=node，
typeRoots 指向仓库 node_modules/@types，`@/*` 指向 packages/ui/src/\*，files 为本组
三个 TypeScript 测试文件。它只修复测试读入原消费者类型时的 alias 解析，没有修改
生产配置。旧 dist 基线需要原 ESM package context 和仓库根 node_modules 解析链接。

首次测试类型检查因反例 null 超出 port 声明及原 UI alias 缺失失败，已用明确的反例
类型 cast 和临时配置修正。首次差分检查因外部旧 dist 的 Zod 依赖链接缺失失败，
修正临时链接后通过。首次 lint 提示契约有意匹配控制字符；仅在该正则前说明并关闭
no-control-regex 单条规则，最终 scoped deny-warnings 和根 lint 均为零警告。早前
Electron 下载 ECONNREFUSED 仍限制原生 GUI 验证，未将环境失败写成产品通过。

## 分母、来源与父任务增量

shared/src 的受跟踪源码分母为 227。既有清单投影为 94 upstream-unchanged、
83 upstream-modified、38 unreviewed、12 independent-replacement；12 个接受的
替换记录仍与当前摘要匹配。来源未闭合部分为 215，两个协议/shared 小组累计完成
6/215 个行为验收替换，另外 209 个未在这两组替换。6 个仍待来源复核，不能累加
进 12 个已接受记录，也不代表全仓、运行时依赖或 MIT 完成比例。

固定公开注释、字段投影、认证类别规则、schema 表达与标准词法结果为兼容约束；
来源暴露和保留表达需要单独复核。证据文件
[remote-identity-20260930.json](../licensing/evidence/remote-identity-20260930.json)
给出三个源码 before/after、声明、冻结观察、保留文件摘要及清单更新建议。
实际 ledger、lockfile、global config 与上一组交接文件都逐字节未改。

`pnpm provenance:check` 仍失败：

```text
Third-party input changed: packages/shared/src/protocol-v4/wire-codec.ts
```

这是基线继承的上一组清单绑定，不是本组三个文件新增的第三方材料变化。仅在内存
应用上一组已提供的 wire-codec input 摘要建议，第三方审计为 0 issues，保留全部
27 项 material obligations；实际清单没有写入，实际门禁仍未通过。父任务应统一
更新该 binding、刷新 current-files、复核新增三个生产文件和本组支撑材料，并运行
整体集成 CI。本组不提出独立/MIT review，也没有合并、PR、发布或部署动作。

未运行原生 GUI、installer、Windows/macOS 或实机浏览器。差分证据以被冻结行为、
固定种子与 typed contract 为界；不承诺任意 builtin monkeypatch 或未知对象输入
的等价性。本组到此检查点停止选取下一组所有权。
