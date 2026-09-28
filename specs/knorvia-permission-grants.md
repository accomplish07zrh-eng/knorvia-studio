<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 授权建议、项目读写与会话应用

2026-09-28。以 `26c7302` 为固定基线，按纯建议投影、单次授权阶段和项目端口适配三个边界，独立替换 permission-suggestions、permission-grants、permission-rules-persistence。先锁定现有合同再实现；已访问旧源码，不作无接触声明，不把机械提取、改名、行数变化或测试通过视为独立来源证明。

## 所有者和范围

PermissionService 仍是会话授权唯一所有者，sessionStore 是项目授权和 session→project 身份的事实来源；本层只调用端口，没有授权缓存、跨请求队列或重试。所属模块是现有 unmanaged CLI，不改变公开存储接口、数据库、UI、模式政策、Hook、审批胜者或取消所有权。

```text
输入 / 可信能力 → 纯建议投影 → 原审批选项
已接受回复 → user-only 拒绝记忆 → 项目阶段 → 会话阶段 → 原调用计划继续
项目阶段 → sessionStore 查询 session→project → 读规则 → 合并 → 等待保存 → 项目日志
会话阶段 → PermissionService 应用原更新引用 → 会话日志
```

调用方已先发布 Resolved 并拒绝 deny/escalate，本 helper 不再判断 decision。修改后的最终工具输入校验由原计划在授权之后处理。user-only 入口必须先于任何更新字段、store、Service 或日志读取返回。

## 纯建议合同

可信 OfficialCua group 优先生成保留组规则，不读 input；其他 truthy group 抛出原错误。普通输入先接受非空白字符串，否则按 command/url/file_path/path/pattern 取首个非空白字符串；结果保留原始文本，不 trim。没有可用内容则只保留工具名；不增加 patch_text 回退。每次返回新的数组/记录，输出字段顺序保持 behavior/rules/type，规则字段顺序 toolName/ruleContent。不改变初评传入 group 而 Hook 输入复查未传 group 的现有调用合同。

## 项目端口合同

- load 缺少 store、session 或 truthy projectID 时返回 null，正常读取原 ruleset 引用；每次重新查询当前 session 身份，不按 workspacePath 猜项目，不缓存。
- persist 空更新直接返回，不读 store 或日志。非空但无 store/session/project 时记录原 skipped 消息和 trace/event/module/status 字段，再返回。没有 logger 时不构造日志元数据或读取 trace getter。
- 正常依次查询 session、读取当前项目规则、调用已有有序合并、等待 save、记录 saved；读到 null 用 version:1 空规则。保存返回值不影响结果。保留端口方法 receiver、当前 deps 引用及更新读取时机；不在 helper 里新增状态或路径 IO。
- projectID 是读取会话后捕获的本次身份，但 store 端口仍按原调用阶段从 deps 读取；不无声切换成提前快照的存储 owner。
- 读取/保存/日志失败均由原调用层处理；load 和 persist 本身传播原异常，不做重试或包装。

## 单次应用与错误边界

项目更新先完成，随后才读取和执行会话更新。项目更新检查的 getter 失败直接抛出；进入项目阶段后的实际更新读取、项目端口或项目日志失败转换为原 StorageError 工具结果，保留 request/session/tool 上下文，Error 才作为 cause，recoverable:true，跳过会话阶段。

会话更新检查、Service 调用和会话日志的异常都原样拒绝 Promise。会话日志保持 trace、event、module、requestId、status、toolCallId、toolName、updateCount 顺序；仅在 logger 存在时读取元数据。更新对象不做深拷贝，保存 await 期间发生的会话更新替换在下一阶段可见。

已完成写入没有自动回滚：保存成功而项目日志失败时项目规则已写、会话未授予；会话 grant 后日志失败时已授予状态仍在。这些是兼容边界，不将失败报告描述成“没有任何状态改变”。

## 已确认的存储待办

两个同项目 persist 并发读取同一旧规则并覆盖保存，可使一条授权消失。已用共享 fake store 和可控 Promise 屏障复现，未访问真实数据库。此缺口由真正存储 owner 在后续存储迁移中通过原子更新、CAS 或事务解决。本批仅替换这三个适配边界，不能用进程内 mutex 或额外缓存宣称跨会话/进程安全，也不把兼容此缺口当成功修复。

## 验收

先行测试锁定建议字段选择、CUA/非法 group、输出新记录和字段顺序；缺 store/session/project、端口 receiver、实时项目身份、日志与错误；项目保存阻塞时会话不提前授权，恢复后使用最新会话更新；user-only 零读取；项目 Error/非 Error、会话失败和日志失败的部分成功状态。有限 accessor 测试用于已承诺读取阶段，不声称支持任意 Proxy 或全局原型篡改。

以固定基线对照正常及错误轨迹，保留实际 permission-flow 与 CUA 集成验收，核对编译公共入口和 CLI 打包模块。执行根/CLI 类型和 lint、专项严格类型/lint、架构、格式、完整离线回归、逐文件来源和暂存密钥扫描；提交后跟踪两平台 CI。第三方/继承声明、根许可与预览版本、全量独立门槛和最终安装/便携/官网交付不提前改变。

### 迁移边界回归

新阶段程序必须在入口一次捕获六个调用参数引用；保存 await 期间替换调用参数容器不能将会话授权或日志交给另一 deps、回复或请求身份。捕获的是原回复引用，其内部会话更新字段仍在下一阶段实时读取。缺 store 的 skipped 日志应在返回 Promise 前同步发生，不能被新定位步骤的 await 推后。两项均通过迁移版的先失败测试锁定，然后修复。

另经只读复核锁定第三项时序：项目阶段只能保留原一次 await；新增 async 包装会让两轮微任务中的回复修改先于会话授权，改变被授予的内容。错误结果投影应同步执行，不新增异步层。已用普通 fake store、日志回调和两层 queueMicrotask 先失败再修复。
