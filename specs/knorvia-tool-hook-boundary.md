<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 工具 Hook 边界与改写复核

2026-09-28，以 `88d0afb` 为固定行为基线。独立替换 permission-capability、permission-input-recheck 和 hook-flow；HookRunner、memory 路径/IO、公共类型、权限服务与交互所有者不在替换范围。已读取旧源码，不作无接触声明；标准浅合并、固定协议字段和必要兼容文案不声称为发明。

## 设计与所有者

能力适配只合成注册声明和逐次运行时声明，不保存能力缓存。Hook 适配使用按事件声明的字段序列和惰性读取器，集中生成同一协议 envelope；纯结果投影处理单个 HookRunResult，不能再仲裁多个 Hook。改写复核分为同步评估、三路出口（拒绝／沿用／再询问）及原 prepared-request 激活，不新增审批状态。新文件归现有 unmanaged CLI，不新增跨模块依赖。

```text
已规范化的 Hook 改写输入 → 同步能力与策略评估 → 原 PermissionService
                                              ↓ 原 memory 判定
                                      拒绝 / 沿用 / 再询问
                                                       ↓
原请求 ID + 同一父 signal → broker.prepare → activate → result → dispose
                                                       ↓
                                              原权限计划收口一次
```

Service 仍独占会话权限，存储端口拥有项目规则，prepared owner/交互注册表拥有待答生命周期，调用方权限计划拥有最终执行输入。Desktop continuous / Web replay 均沿原 ID、Host 事件和取消链，不新增 Requested 事件或重跑 PermissionRequest Hook。原预览、输入规范化和模式不会在本层重跑。

## 必须保持

- 运行时 resolver 以 entry 为 receiver，每次使用原输入和 runtime context；metadata 在运行时覆盖之前，permission 子对象另行浅合并。可信 permissionCapabilityGroup 最终只取注册 entry，不接纳运行时/模型伪造。Started 与评估分别解析，不声称一次共享缓存。
- context 按 runtimeScope、workingDirectory、workspaceRoot 顺序读取；复核先 runtime context，再权限上下文（含 mode、prePlanMode、planEnabled、risk、名称、另一次 cwd），策略、能力、Service、memory，保持异常原值和端口先后。
- 显式 deny 返回原决定及 deny 回复；只有 project ask 或仍指向 memory 的 ask 再询问，其他决定返回空结果。memory 自身路径/安全性语义继续归既有 helper，不改其 IO 或许可。
- 再询问保留原 requestId、mode、projectRules、trace、signal、timeout、修改输入引用，缺理由时用既有文案；先 prepare，激活一次，成功/拒绝均 dispose。策略建议优先（包括空数组），没有额外队列、预览或 store 读取。
- 上下文、评估、memory 和 prepare 调用均在首次等待之前；显式 deny 不能提前跳过 memory，project ask 不额外检查 memory 目标。二次请求不带 claimResponse。prepare 失败尚无 handle，只有取得 handle 后才由既有 activatePermissionRequest 保证 finally dispose。
- 无 Hook runner 时惰性返回：Pre/Post/Failure 每次新建空 contexts；PermissionRequest 为 undefined；不读 cwd/mode、不转换错误和输出。有 runner 时保持 receiver、别名匹配、原输入/输出引用、ISO 时间、nullish turnId 回退与异常原值。
- Pre/Post/Failure 同步调用 run 并直接返回其 Promise，不增加 async 包装；PermissionRequest 仅保留原先一次等待再同步投影。adapter 不包装错误，原调用方继续负责各阶段错误归属。
- 字段回调前先捕获本次 runner/run；Failure 的错误 String 转换仍先于捕获。复核仅在选中再询问、算完建议后捕获 broker/prepare，再生成请求字段，防止回调把请求移交给替换端口。字段序列在类型层检查合法键和必填覆盖，reader 返回值另受字段类型约束。
- Pre/PermissionRequest 用传入 mode，Post/Failure 读取当前 mode。Post 的 artifactRefs 只在路径 truthy 时是单元素数组，保留 undefined 字段；预览沿既有 4000 UTF-16 截断。Failure 仅在有 runner 时归一 Error，保留 CoreError 类型与 ToolCancelled 判断。
- 单个 PermissionRequest 结果优先级是 preventContinuation、结构化结果、兼容 permissionBehavior。拒绝理由保留空字符串；更新使用 permissionUpdates ?? updatedPermissions；updatedInput 为 null 仍是 modify，undefined 为 allow；结构化回复保留 own undefined 更新字段。
- PreToolUse 的 allow 不覆盖 deny 或 alwaysAsk；ask 仅提升已有 allow，其余返回原决定引用。Hook 上下文标题、编号、换行和稀疏数组空位行为兼容。
- 有限访问器边界保持有序读取：兼容回复先检查 deny、再读取 allow；Pre 转移在读取 Hook 行为后检查当前决定，不能沿用回调前状态；上下文入口长度只捕获一次，不纳入读取期间追加的条目。未确认生产 HookRunner 使用此类字段访问器，不把这些迁移回归称为桌面既有故障。

## 三项有意修复（先失败回归）

1. 改写后再询问必须复用纯 AskProjection 的 optionsPolicy，遵守 entry.permission.askOptions.allowAlways：false 不提供长期允许，session 只提供会话允许。不得重跑工具 prepareApproval。基线漏传该字段；已在合法自定义工具+project ask 复现，尚无证据称现有内置工作流有同一用户故障。
2. 默认复核建议必须传入可信 entry.permissionCapabilityGroup，保留 CUA reserved 规则名。规则策略建议仍优先。基线退化为具体工具名后失去可信来源匹配门；回归验证非可信同名条目不能复用新组授权。
3. Started sideEffectScope 与 Service 的显式声明优先级一致：permission.sideEffectScope ?? 顶层 sideEffectScope。readOnly 和缺席值继续原投影，不擅自补 Service 的工具名默认值。基线只取顶层，在合法运行时仅覆盖嵌套 workspace 时误报 none；当前 Bash 同时设置两处，未确认现有内置触发。

## 相邻缺陷与边界

真实 InMemoryHookRunner 多 Hook 结构化 deny→allow 可被后者覆盖，根因在 hooks/output.ts 合并所有者，留待该 owner 迁移；本适配不复制跨 Hook 仲裁。项目权限读后覆盖写仍有并发丢更新，继续留给存储 owner 原子更新。上述问题均不能标作本批已修复。

同 ID 复核验证旧 RPC 迟到续调不清理或回答新 owner、第二次用户应答和父取消最终无 pending，Requested/Resolved 各一次。V4 回答只携带 ID，不承诺能够区分旧客户端发出的同 ID 回答版本。所有验收使用内存端口，不访问用户数据库、文件、模型或设备。

## 验收与许可

先行测试锁定四类 Hook 请求/结果、能力合成、复核出口、异常和生命周期，并令上述三项缺口先失败。新实现做固定基线有限对照，单列有意差异，编译公开执行入口验证；根/CLI 类型与 lint、变更严格 lint、架构、格式、完整离线回归和当前提交双平台 CI 均实际执行并报告。有限测试不证明任意 Proxy、全局原型替换或全部客户端交错等价。

MIT 只覆盖本批经复核的替换、新辅助、测试与规格。根 Apache-2.0、0.8.0-preview.3、历史发行、UI、数据、安装/便携包与官网保持当前状态；整体独立迁移和最终稳定发布仍未完成。
