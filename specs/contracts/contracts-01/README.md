# contracts-01 合同

包：`apps/cli/packages/contracts`（`@knorvia/contracts`）· 范围：`src` 下 `capabilities`、`commands`、`compact`、`config`、`events`、`hooks`、`interfaces`、`logging`、`model`、`network`、`path`、`plugins`（57 个继承文件）· 版本：**v1**（2026-10-11）

`contracts-02` 覆盖同一包的其余范围（`.`, `tools`, `tracing`, `workflow`），不在本合同内。

## 文件

| 文件                   | 内容                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `README.md`            | 本文件：范围、版本、条目→测试对照表                                                          |
| `behavior.md`          | 行为规格 B1–B24（输入/输出/错误语义/时序与并发/幂等/资源释放/平台差异/状态所有者/日志级别）  |
| `interface.md`         | 兼容面：包入口与子路径、按文件的导出名与签名（纯声明文件按本文件列出的名字剔除兼容行）       |
| `callers.md`           | 仓库内 `@knorvia/contracts` 的调用方清单（按入口分组）                                       |
| `tests/`               | 契约测试（黑盒，只走公开入口；`entry.mjs` 负责 source/dist 双入口）                          |
| `stubs/src/`           | 每个将被删除的模块路径一个最小桩（只含导出与签名，函数体抛 `not implemented: contracts-01`） |
| `known-differences.md` | 预登记差异（当前为空）                                                                       |
| `acceptance.md`        | 旧门结果、门禁、未覆盖内容                                                                   |
| `gate-old.json`        | 旧门记录：用例数、通过/失败、两种入口、主仓提交号                                            |

## 运行契约测试

```powershell
# 源码入口（默认；需要 --import tsx）
node --import tsx --test specs/contracts/contracts-01/tests/api-surface.test.mjs specs/contracts/contracts-01/tests/behavior.test.mjs

# dist 入口（先构建 CLI 包）
pnpm build:cli-packages
$env:KNORVIA_CONTRACTS_ENTRY = "dist"
node --import tsx --test specs/contracts/contracts-01/tests/api-surface.test.mjs specs/contracts/contracts-01/tests/behavior.test.mjs
```

`pnpm test:studio` 会自动收录 `specs/contracts/*/tests` 顶层测试（源码入口），CI 因此在两个平台持续守住旧行为。

## 条目 → 测试对照表

| 条目                         | 测试文件 · 用例                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| B1 包入口导出面              | `api-surface.test.mjs` · 「每个公开子路径都能载入，空 capabilities 允许零导出」「interface.md 列出的运行时导出都能从公开入口取到」 |
| B2 会话标识工厂              | `behavior.test.mjs` · 「标识工厂保留既有前缀且同一毫秒内不重复」                                                                   |
| B3 日志级别常量              | `behavior.test.mjs` · 「日志级别常量与名称映射保持既有取值」                                                                       |
| B4 命令参数切分              | `behavior.test.mjs` · 「命令参数切分：引号、转义与未闭合引号」                                                                     |
| B5 命令模板展开              | `behavior.test.mjs` · 「命令模板展开：$ARGUMENTS、位置参数与 User arguments 追加」                                                 |
| B6 命令提示格式化            | `behavior.test.mjs` · 「命令提示格式化：来源行、技能指令与正文顺序」                                                               |
| B7 动态语法拒绝              | `behavior.test.mjs` · 「动态 shell 语法被识别并让 expandCustomCommandPrompt 抛错」                                                 |
| B8 命令契约字面量            | `api-surface.test.mjs` · 导出面用例（字面量取值由 TypeScript 编译期约束）                                                          |
| B9 紧凑边界常量              | `behavior.test.mjs` · 「紧凑相关常量取值保持既有字面量」                                                                           |
| B10 紧凑边界 payload         | `behavior.test.mjs` · 「紧凑边界 payload：必填、默认值与 strict 拒绝未知字段」                                                     |
| B11 时间线 payload           | `behavior.test.mjs` · 「时间线 payload：display 默认值且 text 被剔除」                                                             |
| B12 微紧凑边界 payload       | `behavior.test.mjs` · 「微紧凑边界 payload：枚举、id 数组与非负计数」                                                              |
| B13 紧凑辅助函数             | `behavior.test.mjs` · 「紧凑辅助函数：边界判定、构造顺序、切片与注解」                                                             |
| B14 会话投影初值             | `behavior.test.mjs` · 「投影初值字段与默认值保持既有取值」                                                                         |
| B15 reducer 纯度与确定性     | `behavior.test.mjs` · 「reduce 不修改输入事件数组，且对同一输入得到等值投影」                                                      |
| B16 保留策略                 | `behavior.test.mjs` · 「保留策略：unbounded 空淘汰、turn-window 的 seal/清空/超时淘汰」「瞬时事件集合与宽限期常量」                |
| B17 内存事件存储             | `behavior.test.mjs` · 「内存事件存储：追加/读取/序号/删除/统计」                                                                   |
| B18 投影提交与领域 changes   | `behavior.test.mjs` · 「投影提交不改入参；紧凑/流式/后台任务 changes 语义」                                                        |
| B19 投影队列 changes         | `behavior.test.mjs` · 「队列 changes：admission 原位、order 重排与 mode 授权」                                                     |
| B20 媒体策略                 | `behavior.test.mjs` · 「媒体策略：provider-visible 判定与不支持媒体文案」                                                          |
| B21 公网出口 IP              | `behavior.test.mjs` · 「公网出口 IP：规范化、版本与阻断原因」                                                                      |
| B22 Git Bash 路径转换        | `behavior.test.mjs` · 「Git Bash 路径双向转换」                                                                                    |
| B23 插件与配置契约（导出面） | `api-surface.test.mjs` · 导出面用例（运行时契约见 B25/B26）                                                                        |
| B24 hooks 契约（导出面）     | `api-surface.test.mjs` · 导出面用例（hook 信任判定由 `specs/contracts/core-hooks` 覆盖）                                           |
| B25 运行时配置契约           | `behavior.test.mjs` · 「配置常量与默认运行配置保持既有取值与优先级」                                                               |
| B26 插件运行时契约           | `behavior.test.mjs` · 「插件常量与官方 marketplace 判定矩阵」                                                                      |

无空行：B1–B26 每条都至少有一个断言。

## 合同变更规则

合同任何改动都要重跑旧门（源码与 dist 两个入口）并升版本号；`behavior.md` 的编号发布后不重用。
