// SPDX-License-Identifier: Apache-2.0
// core 工具声明的汇总入口：把各工具模块的类型与 schema 一次性再导出给消费方。
// 只做再导出，不含实现；个别入口在注释里点明「漏掉这一行谁会静默失效」。

export * from "./contract.js";
export * from "./json-schema.js";
export * from "./read.js";
export * from "./write.js";
export * from "./edit.js";
export * from "./apply-patch.js";
export * from "./bash.js";
export * from "./node-repl.js";
export * from "./glob.js";
export * from "./grep.js";
export * from "./webfetch.js";
export * from "./agent.js";
export * from "./skill.js";
export * from "./todo.js";
export * from "./automation.js";
export * from "./off-peak.js";
export * from "./target.js";
export * from "./plan-mode.js";
export * from "./ask-user-question.js";
export * from "./send-message.js";
export * from "./respond-to-coordinator.js";
export * from "./task-output.js";
export * from "./task-stop.js";
export * from "./read-session-context.js";
export * from "./submit-result.js";
export * from "./websearch.js";
export * from "./workflow.js";
export * from "./create-workflow.js";
// 修订入口：名字常量被 core 的分派、权限服务的 owner 规则、bootstrap 的 actor 禁用名单
// 以及 TUI/headless 旁路读取。
export * from "./amend-workflow.js";
export * from "./saved-workflow.js";
export * from "./save-workflow.js";
export * from "./list-saved-workflows.js";
// dwf 选型的发现面：名字常量被 core 的工具注册与 bootstrap 的 actor 禁用名单读取，
// 漏掉这一行消费方就拿不到 schema 与 LIST_MODELS_TOOL_NAME。
export * from "./list-models.js";
export * from "./eval-workflow-snippet.js";
export * from "./list-workflow-runs.js";
export * from "./get-workflow-run.js";
// 恢复入口与两个内省工具同族（run_id 键、端口探测失败同款）；漏掉这一行消费方拿不到
// schema 与 RESUME_WORKFLOW_RUN_TOOL_NAME，core 的扩名分派会静默失效。
export * from "./resume-workflow-run.js";
// 升级问答的两个工具面：actor 侧 escalate 与主代理侧 ResolveWorkflowQuestion。两者的名字
// 常量被 core 的 allowlist 补回逻辑与 bootstrap 的 actor 禁用名单读取，漏掉会让那两处静默失效。
export * from "./escalate.js";
export * from "./resolve-workflow-question.js";
export * from "./workflow-observation-display.js";
export * from "./tool-result-metadata.js";
export * from "./performance.js";

// 共享类型只导出一次，避免重复导出冲突。
export type { DiffHunk, GitDiff } from "./write.js";
