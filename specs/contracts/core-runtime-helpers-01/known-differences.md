# core-runtime-helpers-01 已知差异与边界裁定（v1）

> 每条都写理由与对应测试；门槛不因这些条目放宽。旧行为确有缺陷或有意改进的情况本节为空——
> 本包**没有**登记「为过旧门而放宽」的差异。

## 一、合同前删除的无用代码（不写进行为条目）

| 位置             | 删了什么                                                                                             | 理由                                                                                                                                                  | 对应测试                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `attachments.ts` | `export { parseDataUrlHeader }`、`export { inferImageMimeFromPath, prepareImageDataUrl }` 两行再导出 | knip（与 main 基线同源的既有条目）与 `dep:refs` 双双确认**包外零引用**；三个函数在包内仍被 `attachment-media-resolver/*` 使用，只删「桶再导出」这一层 | `surface.test.ts`（导出面按删除后的 `interface.md` 逐名比对） |
| `compact.ts`     | `export type { CompactEntrySelection }`                                                              | 同上：包外零引用；类型本体在 `compact-selection.ts` 仍导出（见下）                                                                                    | 同上                                                          |

删除是独立提交，行为条目只描述删除之后的导出面。

## 二、保留但 knip 仍会列出的条目

- **`compact-selection.ts` 的 `export interface CompactEntrySelection`**：它是
  `selectCompactEntries` 等 3 个导出函数的**具名返回类型**；去掉 `export` 会让 `tsc` 的声明产物
  无法命名返回形状，去掉类型本身则改变公开签名。knip 仍把它记在「未使用导出类型」——该条目在
  main 基线上就存在（310 条基线之一），本包没有新增。
  **对应测试**：B26（返回对象四字段形状）+ `surface.test.ts`（20 个纯类型导出的集合）。

## 三、行为口径裁定（照旧实现写进合同，重写必须复现）

1. **权限 broker 的两个谓词对 `null`/`undefined` 抛 `TypeError`**，只对「缺方法」「同名字段非函数」
   判 `false`。不补业务兜底：调用方永远传端口对象，判空属于隐藏分支。
   **对应测试**：B14。
2. **`TurnError` 事件负载的 `error.message` 取根因消息**（`projectExecutionErrorPayload` 的投影规则），
   包装错误自身用回退文案，两者并存。
   **对应测试**：B30（「先落事件再打日志」用例）。
3. **流式账本载荷的 `readOnly` 是「元数据 `readOnly` 且副作用范围为 `none`」的合取**，元数据缺失时
   给 `undefined` 而不是 `false`（消费方按「未知」处理）。
   **对应测试**：B33。
4. **回合文件变更的增删行数按 diff 库 `structuredPatch`（5 秒超时）从「改前 → 最后一次改后」重算**，
   hunk 划分与该库实现一致（本包样例实测 3 增 2 删 / 兜底 2 增 0 删）。重写必须复现同一数字，
   不许改用别的 diff 口径让数字变「好看」。**对应测试**：B23。
5. **远程会话路径修复的比对串固定用 `/`**：`workspaceIdentity` 是协议身份串（`remote:ssh|wsl|docker`），
   文法本身跨平台，不随本机分隔符变化；本机路径只做字面比对。
   **对应测试**：B44（四态判定用例）。
6. **计划文件路径用 `path.join` 拼接**，会话 id 中非 `[A-Za-z0-9._-]` 字符统一替换成 `-` 并去首尾连字符，
   两种平台各自得到本地风格路径。**对应测试**：B22（路径清洗断言）。

## 四、测试实现口径（非产品行为）

- 夹具抛出的文件系统错误必须是 `@knorvia/contracts` 同一模块实例上的 `FileSystemPortError`：
  `isFileSystemPortError` 只沿原型链比对，用另一个副本会 `instanceof` 失败。夹具按 contracts 包
  自己的 `exports["."]` 入口解析，与被测代码加载同一个模块。
- 事件序列测试的并发交错用 **gate 握手**（`gateNext()` 放行）而不是计时：账本事件 A 挂起时，
  事件 B 与回合结果先完成，放行后再补 A —— 顺序完全由代码路径决定。
- 模型流来自现有模型适配器测试夹具（`adapters/test/model-subsystem-contract/harness/fixtures.ts`），
  事件序列来自本包 `fixtures/model-stream-events.json`（虚构数据，脱敏）。

## 五、明确不在本合同覆盖范围

- `initializeRuntimeTooling` 内部的**钩子执行器实现细节**（受控钩子 runner、会话邮箱钩子的注册体）
  与 `createToolExecutor` 的参数装配：本包只保证装配顺序、注册面与抑制分支（B38）。
- `captureProjectMemoryAgentContext` 的模型请求元数据组装与 `runMemoryAgentLoop` 的执行过程：
  属模型请求与记忆域（`core-runtime-methods-*` / `memory`），本包只覆盖快照形状与调度前置条件
  （B45、B46）。
- `attachment-media-resolver/*` 各分派分支依赖的端口语义（`stat`/`readTextFileRange` 的字节与行号
  语义）由端口实现的合同负责，本包只按错误码分流。

## 六、环境说明

本机的环境类测试失败（device-fs 60s、plugin-staging 崩溃等）与本包无关，按惯例如实记录不追；
本包结论以 CI 的 Linux + Windows 双平台为准。
