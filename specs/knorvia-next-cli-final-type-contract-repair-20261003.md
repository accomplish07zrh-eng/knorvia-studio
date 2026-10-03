# CLI 路最终验收：类型与兼容修复

父任务指定先合入整合树 `19f6ccf74ba1064ca81d93194b4f25a36030e361`，复用 `lane/cli-rewrite-20261003`。该树已包含原 PR14；本轮不另开 PR、不改 main。错误入口为 `docs/evidence/backlog-integration-20261003/final-first-pass.json`，历史失败记录原样保留。

本次只修三个明确类型边界，以及本路先前编写文件的定向 lint/format。其他 lane、共享 contracts、根配置、CI、许可证与全局来源台账不写入；其他 CLI owner 的历史改写不重复安装。修正属于 source-exposed 维护，不增加独立来源或 MIT 接受声明。

- `paneLayoutTree.ts` 保留公共 command 联合与唯一 reducer。合并 `bind`/`confirm` 分支只能在显式 `kind === "bind"` 时读取 `sessionId`；confirm 的检查依据仍为原 binding 的待验证标记。相同已确认 session 为引用不变的 no-op，bind/confirm 清验证标记并维持原字段投影，其他命令不经过此分支。
- browser runtime 仍独占 `admissions` 和每个 pending Promise。IIFE 建立前本地 admission 处于未赋值状态；第一处 await 之后仍按登记 Promise 的身份移除 map 项，拒绝、重试、同 session 并发、close/generation 失效及晚到 context 清理顺序不变。不改成额外 Promise 链、不加延时或忽略错误。
- image compression 使用已锁定 Jimp 的真实 codec 参数类型；其 getBuffer 通过 MIME 推导 options，宽 MIME union 会使有参数调用的 options 被推成 undefined。以内部编码请求的判别联合表达无参数、PNG 参数和 JPEG 参数三种调用，再在调用点收窄 MIME；PNG 参数来自 Jimp 公开 defaultFormats 的 PNG encode 声明，JPEG 使用公开 JPEGOptions。保留 PNG 的 deflate level 9 / strategy 3 和 JPEG quality 80→60→40→20。原始字节、PNG→JPEG 的预算顺序、无 settings 时 getBuffer 的参数个数、abort/codec error 以及元数据读取顺序不变。不用 any、ts-ignore、宽泛断言或舍弃 codec 功能绕过类型问题。
- 定向 lint 发现本路两个旧 helper 的四个 warning。tool state 投影使用类型检查的完整四状态表，移除 optional chain 后的非空断言；表须无原型，非法运行时 status（包括原型属性名）继续返回 undefined，不把合法公开 state 改成 optional。turn tool 投影以空数组设置 length 后按原 forEach 填充，保留稀疏数组空槽、原长度、引用与 getter 顺序，不改为填满空槽的 Array.from。

## 定向验收

最终阶段允许必要 types/lint/tests：检查实际项目/codec 声明，验证三个修复的类型边界，执行已有 browser runtime 与 compression 的虚拟端口场景；pane 只运行合成内存契约场景，禁止读取真实持久化数据或启动 UI/browser。格式化只限本路明确文件，并检查实际 lint 覆盖，避免根配置忽略 apps/cli 后产生假通过。必要 dependency declarations/emitted 前置仅供定向 CLI 检查使用，不反复执行全库验证。

所有命令、实际退出码、有效覆盖与剩余跨路阻塞写入 `docs/lane-cli-20261003.md`。历史“未验证”记录只描述先前阶段；不能把本轮局部通过扩张为根 typecheck、全 CLI 构建、React/DOM/desktop/mobile 或来源权利验收通过。

## 后续授权：compact policy 字面量类型

父任务接收 `4893d82b5541b7782dab5c022e45234089f26546` 后，将 `apps/cli/packages/core/src/compact/policy.ts` 的五个 TS2322 明确转交本路独占修复。仓库没有第二个同名 compact policy 路径；不修改 manual/microcompact、其他 runtime owner 或共享协议。

`AutoCompactTokenSource` 已声明为 `"estimate" | "provider_usage"`，provider override 只允许后者；`shouldAutoCompact` 仍是唯一纯决策入口。问题发生在未受上下文类型约束的 common 对象字面量：来源属性被拓宽为 string，随后五个 return 分支不能满足公开 `AutoCompactDecision`。

用 `Omit<AutoCompactDecision, "shouldCompact" | "reason">` 直接声明 common 的实际公共字段契约，让合法来源在构造时完成类型检查。不会改变接口、输入读取次数/顺序、字段存在性/顺序、token 来源选择、零值 override、provider/cache 指标、阈值计算或五个分支的优先级。类型声明在输出 JS 中擦除，不使用断言、any、ts-ignore、新运行时归一化或第二条决策路径。

只执行 core 配置的定向类型检查及纯决策必要回归。回归覆盖 estimate/provider_usage 在 disabled、not_enough_messages、circuit_breaker、below_threshold、above_threshold 的输出，保留零 provider token 与指标投影，并检查修复前后去注释编译 JS 相同。不重跑全 CLI/root 构建、全库 types/lint 或其他无关场景；来源记录仍不表示 MIT 接受。

## 后续授权：bootstrap projection 的十八条类型错误

父任务指定统一树 `f5deb08595725c91d74ca96e09bba338fba1119d`；原分支已 fetch 并快进合入，仓库 AGENTS/architecture skill 相对上一冻结未改。该树没有新增精确 bootstrap 诊断日志，本路直接执行 bootstrap 当前配置的 `tsc --noEmit`，取得全部十八条 TS2322，不等待另外发布日志。仅处理 bootstrap 投影；整合者正在运行 777 文件离线套件，本路不重复执行全量。

十七条是 info role、part/timeline type、goal verification kind/type/display 的固定字符串回调在 tuple recipe 上失去字面量上下文；给这些常量回调声明实际固定返回类型，保留全部输出值、分支与字段顺序。retry 同属同一 part vocabulary，保持一致的固定返回声明。

另一个错误来自 `RecordRecipe<Envelope, KnorviaSessionEvent>` 的 homomorphic mapped type：结果联合被逐个分发，合法返回整个公共 event tag 联合的回调不能匹配单个变体 tag。recipe 以显式 `Keys extends keyof Result = keyof Result` 的字段集合映射，仍按每个 Key 检查 `Result[Key]`；不改成整个字段值的宽联合，不加 any/断言/禁用类型，也不改 event payload/runtime mapper。公共协议保持只读。

必要验收为 bootstrap 项目类型检查、message/session/goal/snapshot 的相关现有回归、实际 recipe 的正反类型契约探针以及五个改动源码的去注释 JS 对比。探针必须接受合法事件 tag 联合，并拒绝未知 key、错误数字/optional 字段类型、非法 tag 与未知 source 属性；负向样本在独立虚拟编译输入中确认实际诊断，禁止用 ignore/expect-error 指令绕过。snapshot fixture 保留 Node module-mock 入口，不改变断言或扩大测试范围。完整 CLI build/typecheck、777 文件套件及根验收由整合者继续。
