# CLI 常驻回收、脚本子进程与命令展开的继承替换

授权后续范围固定为三个 CLI 文件；PR19 head `1128e11a98a47d16ad19e9b3e60e65fc8b470cd7` 的 `third-party/source-verification-20261003/bounded-inherited-source-facts.json` 与 `inherited-implementation-next.md` 指定实际单元。当前前驱 `be3e574a416165a54b45c71e3361f2efb3401b36` 三文件与该固定上游原件整字节相同，先冻结原字节再实现。此次是 source-exposed 的行为合同实现，不声称隔离作者、法律独立性或整文件原创；继续 Apache-2.0，保留现有说明、版权/NOTICE 与 Git 历史。固定字段、错误文本、系统 API 与常见原语保留，不为相似度制造复杂度。

## 所有者与边界

- SessionResidentPool 唯一持有进程/逐 session 操作租约、idle 窗口、touch 与回收 gate。宿主唯一持有 resident registry、事实、runtime 关闭与持久内容，pool 不删除用户持久数据。沿用宿主 API，不增加第二份 registry。
- 嵌入脚本中的 IPC channel 唯一持有请求序号/待响应表；call-path scope 唯一持有 AsyncLocalStorage 与计数器；运行状态持有当前 phase/已消费 tokens。父进程仍拥有实际 agent/workflow 副作用，不修改父 process adapter 或协议。
- 命令展开是纯字符串投影，CLI command center 继续负责加载与错误提示。没有新公共 schema、配置、环境变量或跨模块依赖；不写 `apps/cli/contracts/**`、共享配置、CI 或全局来源记录。
- 不改 scheduler/context、Read/PDF、运行存储、用户数据或 UI。本批不创建 managed module；三个既有入口的公开类型/名字保持。

## Resident pool 合同

构造参数仍按 target、high-water、idle-timeout 次序默认/校验；默认分别 8、16、600000ms，既有 RangeError 文本不变。target/high-water 非负整数且 high-water >= target；idle-timeout 有限且非负。时钟为注入 now 或 Date.now。

acquireOperation 先按输入顺序去重/过滤空字符串，立即登记一个全进程租约及各 session 租约，然后逐 id 等待当前回收 gate、touch。即使没有 id，全进程租约也阻止回收。租约返回单次 release：按输入顺序 touch、释放各 session 份额，再释放进程份额并调用 rebalance；重复 release 无效果。等待失败仍尝试 release，原异常传播（release 自身异常遵循既有覆盖行为）。新组织可用 lease 身份集合表达所有权，避免独立算术计数与释放所有权脱节；只保存当前租约，不积累历史。

touch 的默认时钟先求值。非有限时间不修改状态；有限时间仅提高 last-touch，并无论是否更晚都清除 idle 窗口。采样以一次 now 为准，活动租约或重入 rebalance 立即返回。

每轮先列举 registry 并清理孤立 metadata，再收集候选。persisted 必须为真，blocking work、interaction、queue、普通/legacy subscriber 必须全无，当前 session 无租约/回收 gate。失去资格即清除 idle 起点；第一次连续 eligible 以本轮 now 建立起点。LRU 使用 max(lastActivityAt, last-touch)，没有 touch 则 -Infinity。

先执行 TTL pass：到期为 now - eligibleSince >= timeout；排序 eligibleSince、lastUsed、sessionId.localeCompare。每个候选执行前再次读取宿主事实与当前 idle 起点，到期 snapshot 不能代替 fresh facts；touch/新工作/订阅立即阻止该回收。随后重新列举 registry，数量严格大于 high-water 才执行 pressure pass；排序 lastUsed、sessionId.localeCompare，逐个重新查事实，收敛到 target。每次同步成功启动回收后减本轮计数；同步失败不减。任何新进程租约阻止继续回收；finally 清除 rebalance guard，读事实/通知的异常不得永久卡住采样。

宿主 deactivate 的第一同步片仍先摘除 registry，pool 调用之后才安装 gate 与删除 touch/idle metadata。Promise 收尾成功通知 onDeactivated；deactivate/成功通知失败进入 onError；onError 失败可让 gate reject。无论通知结果都在收尾移除仍属于自己的 gate。waitForDeactivation 返回当前同一 Promise；没有 gate 则原生已解决 Promise。Promise 必须覆盖真实关闭、通知和清理，不提前允许旧资源与 cold restore 重叠。使用 async 收尾表达此生命周期，保持因果顺序，不把原 Promise 链的中间微任务个数当作业务状态。

定向场景：默认/校验；重复/空 id 与重叠租约；gate 等待/失败释放；TTL 重新 touch/阻塞与排序；high-water 临界/target 收敛；候选收集后的新事实/新租约；同步 deactivate 与异步/通知失败；gate 同步摘除和正常清理后的恢复。使用虚构 resident 数据与手控 Promise，不访问真实 session。

## Script child 合同

stdout 是单行 JSON 协议，console 全部进入 stderr。payload 来自最后 argv 的 base64url JSON；global args 为 payload.args。事件对象的字段顺序仍 kind/type/payload；请求 id 从 req_1 递增，字段顺序 id/kind/payload/type。发送后安装该 id 的等待者；响应空行忽略、JSON 解析失败写原错误前缀并继续、非 response/未知 id 忽略；已知响应先摘 pending，再按 ok 解决 value 或以原 fallback 文本创建 Error。单个 channel 没有重复待响应真相。

root context 是 root，nextAgent/nextBlock 独立从 0 开始。agent 在当前 context 分配 /agentN，opts 原样传递；phase 为 opts?.phase 的真值或当前 phase。响应 tokens 仍按 Number(total || 0) 累计，返回 result?.value。

parallel 与 pipeline 共享 block 序号空间，分别 /parallelN/itemI 与 /pipelineN/itemI。每个 child scope 计数器重新从 0 开始，异步并发互不串 path。Array.isArray 拒绝文本不变；保留 Array.map 的 holes 和 Promise.all 输入顺序。parallel thunk 的抛错/拒绝变 null；pipeline 按 stage 序号串行使用 /stageJ 子上下文，调用 stage(previous, originalItem, index)，任一失败整个 item 为 null，其他 item 继续。阶段内嵌套组合器与 agent 从当前 stage scope 再分配，不能回到 root。

phase/log 字符串转换、事件次序与当前 phase 含义不变；workflow 只转发 nameOrRef/args 并返回父响应。budget.total 为给定值或 null；spent()/remaining() 原规则保留（无预算为 Infinity，有预算 Math.max(0,total-spent)），不增加预算停止政策。

保持 Date 的确定性限制：argless new Date、Date.now、Math.random 原错误；有参数 Date、parse/UTC 可用。global process 仍 non-configurable/non-writable undefined；不把此限制宣称安全 sandbox。AsyncFunction 接收原八个参数与 body，在 root scope await。成功 complete 的 kind/ok/value 顺序与失败 error/kind/ok/stack 顺序不变，原 Error message/stack 或 String(nonError) 保留；complete 后关闭 reader。保留 IPC JSON 原生错误，不吞掉脚本失败。

独立组织为封装 channel、call-path owner 和共用 fan-out；标准 Promise/ALS/Date 与固定协议写法如实保留。必要定向运行只用本工作区临时、虚构脚本和假的父请求响应，不启动真实 agent、模型、用户工作流或网络。覆盖乱序/重复/错误响应、并发和嵌套 paths、局部失败、预算/事件、确定性拒绝与 complete。

## Custom command 合同

先拒绝原 inline !`…` 或 fenced ```! shell pattern，保留原 Error 文本；不引入动态 shell 执行。trim 原 args 后解析：通用 ECMAScript whitespace 在引号外结束非空 token，引号可在 token 中开闭，非匹配引号在引号内为普通内容；反斜杠在所有位置逃逸下一个 Unicode code point，末尾反斜杠保留。空 quoted token 被忽略，未闭合引号允许到 EOF。独立 tokenizer 使用 lexeme 流（逃逸、引号、whitespace、普通片段）与 fragment buffer，不照搬逐字符 escaping 状态机。

先替换所有 $ARGUMENTS 为 trimmed 原字符串，然后对所得正文中的 $digits 做一次位置展开。因此 args 引入的 $N 也展开，但替换结果不递归；$0、缺位或无限大索引为空，前导零按 Number。采用 capturing split 的 literal/position 段投影，段是否含位置字段决定 usedArgumentsPlaceholder，无回调修改 flag。无任何占位符且 args 非空才追加原 User arguments 区段。返回 argumentCount 是 tokenizer 数量。

prompt 原行次序：Run command、source、可选两行 Required skills / Skill tool 指令、空行、trim 后正文；技能名称逐个反引号包装并逗号连接，原固定文字/空行保留。字段顺序 argumentCount/prompt/usedArgumentsPlaceholder 不变。测试经唯一公开入口和 command-center 的真实加载消费者，覆盖引号/Unicode/escape、参数引入占位符、不递归、空/缺位置、无 placeholder 的尾附及动态 shell 拒绝。

## 交付与未验证

spec 先于三个源码批次；每批在原分支提交并推送同一 draft PR。只比较冻结前驱与当前的必要定向行为；当前 source 与选定实际 JS 发射可做同组检查，记录编译器/配置/源与输出摘要。isolated JS emit 不是项目 build、声明类型验证或全产品产物验收。

原 Registry format-3 receipt 仍只绑定其 core/contracts 实现，不为这三个 bootstrap/CLI 文件虚构新全局证明。全局 inventory/许可判定由整合者刷新。没有运行 full regression、lint、完整 typecheck、root/full CLI build、全量审计或真实平台/UI 验收；最后统一验收。
