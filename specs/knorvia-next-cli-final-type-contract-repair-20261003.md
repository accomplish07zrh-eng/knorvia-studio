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
