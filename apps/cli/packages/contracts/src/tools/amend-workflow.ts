// SPDX-License-Identifier: Apache-2.0
// AmendWorkflow 工具声明：修订一次 run —— 前驱还在跑就先停掉、导入它已完成的工作、再启动修订版。
// 与 CreateWorkflow 分成两个工具：修订是另一种动作、另一张卡——模型不是在启动什么，而是在改一个
// 用户正看着的东西，且前驱可能仍在运行。两者共用同一个输出形状，所以 executor 的后台追踪、
// backgrounded 契约与 display 载荷只需一份。

import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";
import {
  WORKFLOW_RUN_LIFECYCLE_STATUSES,
  WORKFLOW_RUN_STOP_REASONS,
} from "./list-workflow-runs.js";

export const AMEND_WORKFLOW_TOOL_NAME = "AmendWorkflow";

// 「至多给一个修订脚本」的违规说明。与 CREATE_WORKFLOW_SOURCE_ERROR 同一位置、同一种语气；
// 差别在于这里两个都不给是合法的——那表示沿用前驱的脚本。
export const AMEND_WORKFLOW_SOURCE_ERROR =
  "Provide at most one revised script: `path` for the script file you edited (the usual form), or `script` for the whole revised script inline. Passing both is ambiguous; omit both to keep the predecessor's script unchanged.";

// 模型面入参：只有 run_id 必填，其余字段守同一条规则——省略即沿用前驱。predecessor 不在这里，
// 它是 resolveInput 回填的事实（见下），模型的 JSON schema 不列出它。
// 字段 schema 各自命名：同一套「必填字符串 / 可选字符串」约束在多处复用，链式写法只保留在
// 命名常量那一行，字段表里就不再出现裸方法调用行。
const requiredStringField = z.string().min(1);
const optionalStringField = z.string().min(1).optional();
const optionalPositiveIntField = z.number().int().positive().nullable().optional();
const optionalTrimmedStringField = z.string().trim().min(1).nullable().optional();

const AmendWorkflowModelInputSchema = z.object({
  run_id: requiredStringField.describe(
    "ID of the run to amend — from CreateWorkflow's or AmendWorkflow's result, a notification, GetWorkflowRun or ListWorkflowRuns. Any run of this project qualifies, settled or still running; a running run is stopped and superseded by the new one.",
  ),
  // script 与 path 都省略表示沿用前驱存档的脚本：只改设定的修订不必把整段脚本再抄一遍。
  // 与两个设定共用同一生命周期——resolveInput 读前驱脚本回填、并盖上 predecessor.script_inherited，
  // 此后 hook、确认窗与 handler 面对的都是同一份脚本。运行时 schema 仍须接受缺席：
  // hook 改写后 call-runner 会按模型的原始形状二次校验。
  script: optionalStringField.describe(
    "The WHOLE revised workflow script, inline, written against the same facade as CreateWorkflow. Provide this OR `path`, never both — `path` is the usual form. OMIT both to keep the predecessor's script unchanged and change only the settings (max_concurrency, subagent_model, name). Named subagents whose asks you left byte-identical settle from the predecessor's recorded results at zero token cost; the first changed or new ask runs live, and from that point everything runs live.",
  ),
  // 修订的常态来源：把前驱的脚本文件就地改一行，再把同一路径交回来。内联形式仍然接受，
  // 但它要把整段脚本重新流一遍——而那正是这条路要省掉的。
  path: optionalStringField.describe(
    "The revised script's file, relative to the working directory or absolute — usually the predecessor's own script file, which the errored notification and GetWorkflowRun name. Provide this OR `script`, never both; omit both when the script is not changing. Edit that file in place and pass the same path back: a revision then costs one Edit instead of a second copy of the whole script. Submitting a file whose bytes are unchanged is refused (`script_unchanged`) unless the call also changes `max_concurrency` or `subagent_model`.",
  ),
  name: optionalStringField.describe(
    "Optional display label for the new run. Defaults to the predecessor's name.",
  ),
  // 三态：省略 = 沿用前驱的上界；null = 解除（回到本机天花板）；数 = 设定（钳到天花板之下）。
  // 三态只活到 resolveInput：那里把它归一成一个数或缺席，确认窗与 handler 读到的是将要生效的值。
  // 运行时 schema 保留 nullable 是因为 hook 改写后 call-runner 会二次校验模型的原始形状。
  max_concurrency: optionalPositiveIntField.describe(
    "Upper bound on how many subagents work at the same time in the new run. Three states: OMIT the field to keep the predecessor's limit; pass null to remove that limit (run at this machine's default); pass a number to set one. Set a number ONLY when the user asks to limit parallelism — never on your own initiative and never in response to provider rate limits or errors, which the runtime already adapts to. A value above what this machine allows is lowered to that maximum.",
  ),
  // 三态，与 max_concurrency 逐字同规：省略 = 沿用前驱的选型（resolveInput 从前驱快照回填后重新
  // 解析一次，使一个已被删除的模型现在就失败、而不是拖到子代理第一次开口）；null = 清除
  // （回到会话模型）；字符串 = 设定。三态只活到 resolveInput，那里归一成规范形字符串或缺席。
  subagent_model: optionalTrimmedStringField.describe(
    "Model for the workflow's subagents in the new run, as `providerId/modelId` or a bare model id (optionally `$reasoningLevel`). Set it ONLY when the user asks for the subagents to run on a specific model; pass the name the user used, and if the tool answers that it cannot resolve it, pick from the listed ids or call ListModels. The main agent (you) keeps the session model regardless. Three states: OMIT to keep the predecessor's choice; null to return to the session model; a string to set one.",
  ),
});

// resolveInput 回填的前驱事实（流水线第 2 步）。
// 权限判定（本会话的 run 免确认）与确认窗（「仍在运行，将被停止」）都读它，而两处都在 handler
// 之前且必须同步——所以由 resolveInput（异步、全流程唯一一次读端口）算好放进入参。
// 归一化无条件覆盖：模型伪造它无效（与 saved.path 同一条先例）。
export const AmendWorkflowPredecessorSchema = z
  .object({
    name: z.string().min(1).optional(),
    status: z.enum(WORKFLOW_RUN_LIFECYCLE_STATUSES),
    stop_reason: z.enum(WORKFLOW_RUN_STOP_REASONS).optional(),
    owned_by_this_session: z.boolean(),
    // 本次调用 script 与 path 都没给，入参里的 script 是 resolveInput 从前驱存档读来的。
    // 只有「在场即真」一种取值：确认窗据此在 lineage 行说「脚本不变」，handler 据此改用「沿用」
    // 的文案与诊断首句。与整块一起被无条件覆盖，模型伪造无效。
    script_inherited: z.literal(true).optional(),
  })
  .strict();

export type AmendWorkflowPredecessor = z.infer<typeof AmendWorkflowPredecessorSchema>;

// 运行时入参：模型面那些键 + 回填的 predecessor 与 script_line_offset。.strict() 让
// resume_from 这类旧拼写在这里也成为可见错误。
export const AmendWorkflowInputSchema = AmendWorkflowModelInputSchema.extend({
  predecessor: AmendWorkflowPredecessorSchema.optional(),
  // 正文行 → 文件行的偏移；path 指向的文件带 knorvia-workflow 块时才非零。与 predecessor 同一
  // 姿态：它是解析结果而不是可填参数，模型的 JSON schema 不列出它。
  script_line_offset: z.number().int().nonnegative().optional(),
}).strict();

export type AmendWorkflowInput = z.infer<typeof AmendWorkflowInputSchema>;

// 交给模型的 JSON schema：不含 predecessor，也不含 script_line_offset。
export const AmendWorkflowInputJsonSchema = toToolJsonSchema(
  AmendWorkflowModelInputSchema.strict(),
);
