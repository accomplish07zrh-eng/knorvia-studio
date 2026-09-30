# 远程身份纯函数第二小组

2026-09-30。基线为上一组已交接的
`5277f8074c5071d3fc90b72370347ddf6d53ee51`，新分支
`parallel/protocol-remote-identities-20260930-batch2`。不改写两个已交接提交或三个 wire 文件。

## 所有权、分母与边界

本组仅修改以下生产源码：

- `packages/shared/src/remote-workspace-identity.ts`
- `packages/shared/src/remoteSshHostKey.ts`
- `packages/shared/src/wslUserValidation.ts`

三者在现有清单中均为 upstream-unchanged，review 为空，历史只有初始快照；没有已闭合独立来源。
原实现已为行为提取阅读，保留 Apache-2.0 和来源说明，不作 clean-room 或生产 MIT 声明。
受控模块仍为 `shared`，只改纯函数，不引入 IO、状态、缓存、异步或新跨模块依赖。

基线 `packages/shared/src` 共 227 个受跟踪文件；清单的 12 个 independent-replacement
记录仍与实际摘要匹配，其余 215 个来源未闭合。清单投影为 94 unchanged、83 modified、38
unreviewed、12 independent-replacement；上一组造成的三个摘要变化仍待父任务协调入清单。
本组行为验收完成后，两组覆盖 6/215 个待闭合文件，另有 209 个未在两组中替换。
227 是源码分母；6 是本轨道行为验收分子，不能当作 6 个新增来源闭合或 MIT 文件。

```text
连接/UI 原始参数 -> shared 纯身份/校验 -> 现有 Host registry / CLI workspace ref
                                                  |
                           现有 owner、lease、数据、时序和恢复语义保持
```

Host 注册表继续拥有连接、会话、租约与运行状态；用户目录、密码、私钥和认证不由本组读取或修改。
`workspaceIdentity` 为隔离键，`workspacePath` 为真实 IO 路径；不同身份层级继续分别由原调用方使用。
Desktop continuous 与 mobile replayable 的投递及恢复不变。服务、CLI、Desktop 和 UI 只读作消费者验证。
remoteTarget、remoteEnvironmentKey、协议/schema 接口及连接流程不改；不编辑共享许可账本、lockfile、全局配置。

## 实现前冻结的行为

- 保留三个模块的全部 exports、声明、公开注释和参数/返回形状。
- workspace 构造只统一斜杠、重复分隔符与首尾斜杠；不解码百分号、不解析 `.`/`..`、不去路径空白。
  SSH host trim/lowercase、port nullish 默认 22、username trim；WSL distro trim/default，user trim/可省略；
  Docker container 保留原值。身份键按原字段顺序输出，未知 kind 的原返回值不变。
- parser 接受 remote:ssh 的三段非空 authority、wsl/distro 的 legacy 路径或显式 user，及 Docker/container；
  path 必须从 `/` 开始，其后的冒号、换行、重复斜杠、点段原样保留。它不补充 host、端口或 authority 校验。
  WSL 可选 user 仅在路径起点非 `/` 时识别；非法输入返回 null，isRemote 与 parser 同步。
  IPv6/冒号 authority、空段、错误 kind、相对路径和前后空白按既有结果冻结，不隐含修复或格式迁移。
- SSH 共享键仍是 `["ssh:v1", host, port, username, authKind, normalizedPrivateKeyPath]` 的原 JSON。
  authKind 优先 private-key，再 password（包括空字符串或非空 passwordCredentialKey），否则 agent。
  密码、口令及 credential key 的值不进入共享键；字段读取顺序也先行记录。
- 私钥路径只做词法归一，不访问文件或展开 home。根种类包括 POSIX、UNC、Windows drive absolute、
  drive-relative、`~/` 和普通 relative。ASCII drive 大写；`.` 消去；`..` 弹普通段，绝对根阻止越界，
  相对及 `~/` 保留无法消解的 parent。UNC server/share 仍是受保护 authority，即使名为点段。
  根的空值、重复分隔符、trailing slash、内部换行及旧正则的 line-terminator 边界均冻结。
- WSL 先 trim，直接 predicate 要求非空且 UTF-16 长度 <=64，只拒绝 ASCII 0..31、DEL、冒号及两种斜杠。
  C1、非 ASCII、emoji 和孤立 surrogate 按旧结果保留。schema 仍可接受 trim 后的空用户，使用原 Zod
  trim/max/refine 顺序及完整问题载荷，不收紧 Unicode 或默认用户规则。
- 纯调用不修改输入，不共享可变状态；native 类型错误、可观察 getter 顺序及 schema 错误不改。

## 验收与实现依据

先新增可重复的契约反例和只读消费者测试，保存旧 source 的精确观察并与旧 emitted dist 核对，
再提交冻结 checkpoint。新实现由字段词汇与路径 token reducer、锚定 identity grammar 和禁用字符集合构成；
固定 public contract、JSON 字段、标准词法规则和 Zod schema 的表达保留其已有来源，不能据写法变化授予 MIT。

同一测试入口对 source/dist 执行；真实消费者涵盖 CLI workspace ref/fail-closed、Desktop registry 的身份复用隔离、
遥测环境 key，以及 UI WSL 向导的现有校验。消费者代码不改，用独立测试 bundle 绑定目标 source/dist 公共入口。
核对声明、scoped shared emission、CLI bootstrap 依赖构建、根 typecheck/lint、测试类型/lint、格式、架构与 pre-push。
只运行相关测试，不重复全套 CI。父任务负责整体集成 CI 和共享 provenance 报告更新。
