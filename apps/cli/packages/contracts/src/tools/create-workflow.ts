// SPDX-License-Identifier: Apache-2.0
// CreateWorkflow 工具：先给动态工作流脚本做类型检查，再起一个后台 run。
// 本文件同时装着三组声明：模型面入参、运行态入参、以及 display 用的因果图投影。

import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";
import { SAVED_WORKFLOW_MAX_NAME_CHARS, SavedWorkflowScopeSchema } from "./saved-workflow.js";

export const CREATE_WORKFLOW_TOOL_NAME = "CreateWorkflow";

// 「恰好给一个执行体来源」的违规说明。模型是它唯一的读者，三条路径共用同一句话，故抽成常量。
export const CREATE_WORKFLOW_SOURCE_ERROR =
  "Provide exactly one workflow source: `script` for a one-off script written inline, `saved` to run a workflow saved in this project, or `path` for a script file on disk (the file a previous result named). Passing more than one, or none, is ambiguous.";

// `args` 只属于 `path` 来源（`saved` 用自己的 `saved.args`，内联脚本不声明参数），故单独一条文案。
export const CREATE_WORKFLOW_ARGS_WITHOUT_PATH_ERROR =
  "`args` belongs to the `path` source: it carries values for the arguments a script file declares in its `/* knorvia-workflow` block. For a saved workflow pass `saved.args`; an inline `script` declares no arguments, so it takes none.";

// saved 来源的模型面形状：name 必填，args 与 scope 可选，后者只在同名歧义时用来消歧。
export const CreateWorkflowSavedSourceSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(SAVED_WORKFLOW_MAX_NAME_CHARS)
      .describe("Name of a workflow saved in this project or globally (see ListSavedWorkflows)."),
    args: z
      .record(z.unknown())
      .optional()
      .describe(
        "Values for the arguments the saved workflow declares. Unknown keys and type mismatches are rejected before anything runs.",
      ),
    /** 解析回填：保存文件的落点。模型不填。 */
    path: z.string().min(1).optional(),
    /**
     * 消歧：从哪一档取这个 workflow。缺省走既有查找顺序（同名时项目档遮蔽全局档）。
     * 归一化后 `scope` 变成**命中**的那一根，见 create-workflow-source.ts。
     */
    scope: SavedWorkflowScopeSchema.optional().describe(
      "Which archive to take the workflow from. Omit to use the normal lookup order (a project workflow hides a global one with the same name).",
    ),
  })
  .strict();

export type CreateWorkflowSavedSource = z.infer<typeof CreateWorkflowSavedSourceSchema>;

// 运行态的 saved 块：模型面字段之外再加一个 draft，即 resolveInput 写下的工作副本落点。
// 保存的定义不会因为一次 run 被改动，模型要改的是这份拷贝；草稿写不出来时整个字段缺席。
export const CreateWorkflowResolvedSavedSourceSchema = CreateWorkflowSavedSourceSchema.extend({
  draft: z.string().min(1).optional(),
}).strict();

export type CreateWorkflowResolvedSavedSource = z.infer<
  typeof CreateWorkflowResolvedSavedSourceSchema
>;

// 执行体来源有三个、必须恰好给一个，但这条 XOR 刻意不落在 schema 上。
// 原因在归一化：resolveInput 解析保存的脚本（或 path 文件）之后，输入会同时带着 script（要跑的
// 字节）和 saved / path（它的来龙去脉）。若用一条 superRefine 拦截，这个合法形状会在两个地方被
// 判错——handler 自己的 parse，以及 hook 改写输入后 call-runner 的二次校验——而且只在非内联路径
// 上出问题，属于「测不到就上线」的那类错误。XOR 因此交给 entry.validateInput 在模型入参上强制，
// 那里才是它唯一成立的地方；JSON schema 本身也表达不了 refinement，模型侧靠字段描述引导。
// 七个字段的形状各自收成一行：形状用命名基础 schema，模型可见 description 用命名常量，
// 字段行于是只表达「哪个字段、哪种形状、哪段文案」。
const nameField = z.string().min(1).optional();
const scriptField = z.string().optional();
const pathField = z.string().min(1).optional();
const argsField = z.record(z.unknown()).optional();
const concurrencyField = z.number().int().positive().optional();
const subagentModelField = z.string().trim().min(1).optional();

// 字段文案：三条来源（script / saved / path）的说明都点明「只给一个」，与工具侧错误文案同源。
const NAME_DESCRIPTION =
  'Short display label for this run, in the user\'s language ("PR review", "代码评审"). Always pass it for an inline script: it labels the run everywhere and names its draft file under .knorvia-studio/workflow-drafts/. Defaults to the saved workflow\'s name when running a saved workflow.';
const SCRIPT_DESCRIPTION =
  "Full TypeScript workflow script written against the dynamic-workflow facade, inline. Provide exactly one of `script`, `saved` and `path`. An inline script is saved to a file for you, and the result names it: revise it with `path`, not by pasting the script again.";
const SAVED_DESCRIPTION =
  "Run a workflow saved in this project or globally instead of an inline script. Provide exactly one of `script`, `saved` and `path`.";
const PATH_DESCRIPTION =
  "A script file on disk, relative to the working directory or absolute — normally the file a previous CreateWorkflow/AmendWorkflow result named. Provide exactly one of `script`, `saved` and `path`. Prefer this over pasting a revised script: edit the file and pass its path.";
const ARGS_DESCRIPTION =
  "Values for the arguments a `path` file declares in its `/* knorvia-workflow` block. Only with `path`; with `saved` use `saved.args`. Unknown keys, missing required values and type mismatches are rejected before anything runs.";
const CONCURRENCY_DESCRIPTION =
  'Upper bound on how many subagents work at the same time in this run. Set it ONLY when the user asks to limit parallelism ("at most 3 at a time", "don\'t run so many at once"). Never set it on your own initiative and never in response to provider rate limits or errors — the runtime already adapts to those. A value above what this machine allows is lowered to that maximum. Omit for the default.';
const SUBAGENT_MODEL_DESCRIPTION =
  'Model for the workflow\'s subagents, as `providerId/modelId` or a bare model id (optionally `$reasoningLevel`). Set it ONLY when the user asks for the subagents to run on a specific model ("run the subagents on GLM-5.3-Flash"). Pass the name the user used; if the tool answers that it cannot resolve it, pick from the listed ids or call ListModels. The main agent (you) keeps the session model regardless. Omit to run subagents on the session model.';

// 第二个来源是盘上的脚本文件：它是内联提交的回程——工具写下草稿、结果点名那个文件，模型下次
// 只改一行、把同一路径交回来即可；带 knorvia-workflow 块的文件按保存定义解析（块剥掉、正文当
// 脚本、args 按块里的声明校验）。
// max_concurrency 与 subagent_model 都属于「只压低、不抬高」的运行面上界：resolveInput 先解析
// 并钳制，确认窗与 handler 读到的就是将要生效的值；解析不出来在开窗之前就作为业务失败退回。
const CreateWorkflowModelInputSchema = z
  .object({
    name: nameField.describe(NAME_DESCRIPTION),
    script: scriptField.describe(SCRIPT_DESCRIPTION),
    saved: CreateWorkflowSavedSourceSchema.optional().describe(SAVED_DESCRIPTION),
    path: pathField.describe(PATH_DESCRIPTION),
    args: argsField.describe(ARGS_DESCRIPTION),
    max_concurrency: concurrencyField.describe(CONCURRENCY_DESCRIPTION),
    subagent_model: subagentModelField.describe(SUBAGENT_MODEL_DESCRIPTION),
  })
  .strict();

// 运行态入参 = 模型面字段 + resolveInput 回填的事实。回填项与 AmendWorkflow.predecessor 同一
// 姿态：它们不是可填参数而是解析结果，所以模型的 JSON schema 不列它们；模型硬填也会被归一化
// 无条件覆盖。
export const CreateWorkflowInputSchema = CreateWorkflowModelInputSchema.extend({
  saved: CreateWorkflowResolvedSavedSourceSchema.optional(),
  /**
   * 正文行 → 文件行的偏移（`path` / `saved` 文件带元数据块时才非零）。诊断按文件行报出来时
   * 加它，好让行号能直接粘进一次对该文件的 `Edit`。
   */
  script_line_offset: z.number().int().nonnegative().optional(),
}).strict();

export type CreateWorkflowInput = z.infer<typeof CreateWorkflowInputSchema>;

// 交给模型的 JSON schema：不含 script_line_offset，saved 里也不含 draft。
export const CreateWorkflowInputJsonSchema = toToolJsonSchema(CreateWorkflowModelInputSchema);

export const CreateWorkflowDiagnosticSchema = z
  .object({
    code: z.number(),
    column: z.number(),
    line: z.number(),
    message: z.string(),
  })
  .strict();

export type CreateWorkflowDiagnostic = z.infer<typeof CreateWorkflowDiagnosticSchema>;

// CreateWorkflow 的 display 是独立于模型文本的有界投影：诊断条数可能很多，必须在协议边界限长，
// 免得一次类型检查把 continuous/replayable 消息撑成无界载荷。
// 诊断条目的 display 形状被 create_workflow 与 eval_workflow_snippet 两块 payload 共用（同一 TS
// 诊断、同一道限长），因此定义在本文件；挪进 tool-result-metadata.ts 会形成反向引用成环。
export const CREATE_WORKFLOW_DISPLAY_MAX_DIAGNOSTICS = 100;
export const CREATE_WORKFLOW_DISPLAY_MAX_MESSAGE_CHARS = 2_048;

export const createWorkflowToolResultDisplayDiagnosticSchema = z
  .object({
    line: z.number().int().nonnegative(),
    column: z.number().int().nonnegative(),
    code: z.number().int().nonnegative(),
    message: z.string().min(1).max(CREATE_WORKFLOW_DISPLAY_MAX_MESSAGE_CHARS),
  })
  .strict();

// 因果图同样是 display 通道的有界投影，但界直接落在工具输出上：持久化的 tool output 与实时
// display 载荷共用一个契约，两处不会各自演化出不同的截断语义。
// 载荷只装 GUI 真正读的东西：边只有 {from, to, back?} 一种形状，region / certainty / 边种类留在
// 分析器里；第二层以子代理为导向——每阶段的参与者卡加交接边。step 级边没有读者，因此不进载荷，
// step 与车道只作运行状态和检视器的键。
export const CREATE_WORKFLOW_GRAPH_MAX_STEPS = 64;
export const CREATE_WORKFLOW_GRAPH_MAX_LANES = 32;
export const CREATE_WORKFLOW_GRAPH_MAX_PARTICIPANTS = 64;
export const CREATE_WORKFLOW_GRAPH_MAX_HANDOFFS = 256;
export const CREATE_WORKFLOW_GRAPH_MAX_HANDOFF_TYPES = 8;
export const CREATE_WORKFLOW_GRAPH_MAX_PHASES = 32;
export const CREATE_WORKFLOW_GRAPH_MAX_PHASE_EDGES = 128;
export const CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS = 64;
export const CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS = 128;

export const CREATE_WORKFLOW_STEP_KINDS = ["ask", "world-read"] as const;

// 名字只在运行时成形（例如 agent 的模板串带洞）时，静态能拿到的就是第一个洞之前的字面量（head）
// 与最后一个洞之后的字面量（tail）；两者至少有一个在场，分析器拿不到就让整个字段缺席，绝不发空
// pattern。这里只搬数据——把 head/tail 渲染成「研究员…」是渲染层的决定。
export const CreateWorkflowNamePatternSchema = z
  .object({
    head: z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS).optional(),
    tail: z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS).optional(),
  })
  .strict();

export type CreateWorkflowNamePattern = z.infer<typeof CreateWorkflowNamePatternSchema>;

// 一个 step 对应一次要等待的 facade 操作（ask / files.*）。lane 是执行它的 actor（也可能是
// workspace / unknown）；lanes 只在接收者是 may-set 时出现，那种 step 已按候选车道展开成每车道
// 一份拷贝（各带 source）。repeat 区分两种多重性线索：stack 表示实例共存（画叠卡），serial 表示
// 实例相继（已由闭环箭头表达）。certainty / region 不进载荷，GUI 不画它们。
export const CreateWorkflowStepSchema = z
  .object({
    id: z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
    kind: z.enum(CREATE_WORKFLOW_STEP_KINDS),
    label: z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS),
    /** `label` 只拿到兜底串（内联 `agent()` receiver）时，那个名字的静态形状。 */
    labelPattern: CreateWorkflowNamePatternSchema.optional(),
    line: z.number().int().positive().optional(),
    column: z.number().int().positive().optional(),
    lane: z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
    lanes: z
      .array(z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS))
      .max(CREATE_WORKFLOW_GRAPH_MAX_LANES)
      .optional(),
    /**
     * 展开自的站点 id，只在 may-set 车道展开的拷贝上出现（拷贝 id 形如 `ask#2~actor#1`）。
     * 它是实时叠加的关联键：运行时实例报的是站点 id，所以带 source 的卡片按
     * `(node.siteId === source, node.actorSiteId === lane)` 收状态。刻意不参与引用完整性
     * 收敛——它指向的是被拷贝替换掉的那个站点，图里没有这个节点。
     */
    source: z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS).optional(),
    /**
     * 作者用 `phase("…")` 标记划入的阶段（`phase#2`，或保留的 `unphased`）。与图的
     * `phases` / `phaseEdges` / `exits` 同进同退：四者要么全在场（此时**每个** step 都带一个，
     * 划分是全的），要么全缺席（零标记脚本）。
     */
    phase: z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS).optional(),
    repeat: z.enum(["stack", "serial"]).optional(),
  })
  .strict();

export type CreateWorkflowStep = z.infer<typeof CreateWorkflowStepSchema>;

// lane 就是一个 actor（外加一条 workspace 车道）。多重性不再挂在车道上（它曾叫 families →
// nesting）：车道不再渲染，家族成员数改由参与者的 member / many 表达。
export const CreateWorkflowLaneSchema = z
  .object({
    id: z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
    name: z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS).optional(),
    /** `name` 缺席而 `agent()` 首参是带洞的模板串时的静态形状；与 `name` 互斥。 */
    namePattern: CreateWorkflowNamePatternSchema.optional(),
    line: z.number().int().positive().optional(),
    column: z.number().int().positive().optional(),
  })
  .strict();

export type CreateWorkflowLane = z.infer<typeof CreateWorkflowLaneSchema>;

// 边只表达一件事：runs after。阶段边与交接边同一形状；back 标记循环回边——画法与其它边完全
// 一样、不做标注，只有布局排秩（回边不参与列序）与帧头 cycle 计数读它。分析器的 kind /
// certainty / exact 不进载荷；两层边都做过统一的传递归约。
export const CreateWorkflowEdgeSchema = z
  .object({
    from: z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
    to: z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
    back: z.literal(true).optional(),
  })
  .strict();

export type CreateWorkflowEdge = z.infer<typeof CreateWorkflowEdgeSchema>;

// 参与者是板面第二层的一张卡：某阶段里在某条车道上有 step 的那个子代理（也可能是工作区 /
// 未解析）。fan-out 家族按字面量基数展开时每个成员一张卡（member），基数未知时用一张 many 卡
// 代表全部成员。steps 是它在本阶段的 step：运行状态由此聚合，检视器由此列 ask。数组顺序就是
// 交接序（分析器定）：折叠面自上而下、展开面自左而右，第一张是开局者。
export const CreateWorkflowParticipantSchema = z
  .object({
    /** `${phase}:${lane}`，家族成员 `${phase}:${lane}[${index}]`。 */
    id: z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
    /** 阶段 id；脚本无阶段词汇时恒为 `unphased`（此时 `phases` 缺席）。 */
    phase: z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
    lane: z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
    steps: z
      .array(z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS))
      .min(1)
      .max(CREATE_WORKFLOW_GRAPH_MAX_STEPS),
    member: z
      .object({
        index: z.number().int().nonnegative(),
        of: z.number().int().positive(),
      })
      .strict()
      .optional(),
    many: z.literal(true).optional(),
  })
  .strict();

export type CreateWorkflowParticipant = z.infer<typeof CreateWorkflowParticipantSchema>;

// 交接 = 参与者之间的 runs after（归约后的 happens-before 按卡取商）。types 是跨越这条边的
// 产物类型（站点图的 data 边），只进检视器，不上箭头。
export const CreateWorkflowHandoffSchema = CreateWorkflowEdgeSchema.extend({
  types: z
    .array(z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS))
    .min(1)
    .max(CREATE_WORKFLOW_GRAPH_MAX_HANDOFF_TYPES)
    .optional(),
}).strict();

export type CreateWorkflowHandoff = z.infer<typeof CreateWorkflowHandoffSchema>;

// phase = 作者标记出的一组 step。名字就是键（同名的两处标记属于同一阶段），所以 name 取作者
// 原词；合成的兜底阶段 unphased 没有 name，显示名由 UI 本地化（与 workspace/unknown 车道同一
// 模式）。位置取首个标记。
export const CreateWorkflowPhaseSchema = z
  .object({
    id: z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
    name: z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS).optional(),
    line: z.number().int().positive().optional(),
    column: z.number().int().positive().optional(),
    /**
     * 进入本阶段时**还在跑**的其他阶段：它们 fan-out 出去的 strand 当时尚未 join。阶段表序，
     * 列出的阶段 id，不含自己，为空时整个字段缺席（与词汇表同进同退）。
     *
     * 它是**节点事实**而不是边——控制并没有从那些阶段转移过来，两边是同时在场的，所以它既不
     * 进 `phaseEdges` 也不参与边的归约（归约会把它当成 runs after，砍掉真正的边）。
     * 读者是时间轴：把由它串起来的相邻阶段折成一条分叉的「带」，主线之上再起支线轨道；
     * 侧栏迷你轨道据此画双线段。
     */
    alongside: z
      .array(z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS))
      .min(1)
      .max(CREATE_WORKFLOW_GRAPH_MAX_PHASES)
      .optional(),
  })
  .strict();

export type CreateWorkflowPhase = z.infer<typeof CreateWorkflowPhaseSchema>;

// 名字沿用历史（这个字段曾经只装因果图）。这里按三层读：step 层是站点（运行状态的键，不再画）；
// 参与者层是每阶段的卡与交接（因果事实按卡取商）；阶段层是控制流事实（控制流图的阶段商）。
// 层与层之间的桥是 Participant.phase / Participant.steps、Step.phase 与 exits。
export const CreateWorkflowCausalityGraphSchema = z
  .object({
    steps: z.array(CreateWorkflowStepSchema).max(CREATE_WORKFLOW_GRAPH_MAX_STEPS),
    lanes: z.array(CreateWorkflowLaneSchema).max(CREATE_WORKFLOW_GRAPH_MAX_LANES),
    participants: z
      .array(CreateWorkflowParticipantSchema)
      .max(CREATE_WORKFLOW_GRAPH_MAX_PARTICIPANTS),
    handoffs: z.array(CreateWorkflowHandoffSchema).max(CREATE_WORKFLOW_GRAPH_MAX_HANDOFFS),
    /**
     * 阶段词汇表，与 `phaseEdges`、`exits`、`Step.phase` **全有或全无**：零标记脚本四者全
     * 缺席，UI 的视图切换条件就是「词汇表在场与否」。超界时也是整体缺席（+ `truncated`）
     * ——裁一半的阶段图会说谎。零成员的阶段（只有标记、没有 step）也在表里：控制流会经过它。
     */
    phases: z.array(CreateWorkflowPhaseSchema).max(CREATE_WORKFLOW_GRAPH_MAX_PHASES).optional(),
    phaseEdges: z
      .array(CreateWorkflowEdgeSchema)
      .max(CREATE_WORKFLOW_GRAPH_MAX_PHASE_EDGES)
      .optional(),
    /**
     * 控制流可以在其后正常完成的阶段（控制流图阶段商里指向 sink 终端的边的源），阶段表序。
     * 阶段视图的「阶段 → 返回物」箭头读它，让那张画面上的每条箭头都是控制流。组内可为空
     * （脚本没有正常完成路径），组外不得单独出现。
     */
    exits: z
      .array(z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS))
      .max(CREATE_WORKFLOW_GRAPH_MAX_PHASES)
      .optional(),
    /** 返回物由哪些 step 供给（数据事实，下钻用）；脚本无返回时缺省。 */
    sink: z
      .array(z.string().min(1).max(CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS))
      .max(CREATE_WORKFLOW_GRAPH_MAX_STEPS)
      .optional(),
    truncated: z.boolean().optional(),
  })
  .strict();

export type CreateWorkflowCausalityGraph = z.infer<typeof CreateWorkflowCausalityGraphSchema>;

// run 的声明阶段表：因果图里有名字的阶段，按声明序。运行状态只知道已经进入过哪些阶段，而侧栏
// 迷你轨道要画「前方还有哪些站」，就得在提交时把这张表交给引擎、记进 run-launched。两条提交路径
// （CreateWorkflow 工具与中枢直接启动）共用本函数，同一份脚本因此在两条路上画出同一条轨道。
// 无图、无阶段词汇表、只有合成的 unphased → undefined（字段整个缺席而非空数组：UI 据缺席画一个
// 隐含站点）。
export function createWorkflowPhaseNames(
  graph: Pick<CreateWorkflowCausalityGraph, "phases"> | undefined,
): string[] | undefined {
  return namedPhases(graph)?.map((phase) => phase.name);
}

// 与 createWorkflowPhaseNames 逐位置对齐的「同时在跑」表：out[i] 是声明表里第 i 个有名阶段被
// 进入时，strand 仍在跑的其他阶段的下标（同一张有名阶段表里的下标）。
// 下标空间取的是有名阶段，而不是因果图的原阶段表：无名阶段（合成的 unphased）被跳过，指向它、
// 指向未列出阶段、或指向自己的引用一并丢掉——侧栏拿到越界下标会把「同时在跑」连到错误的站上。
// 它随 DynamicWorkflowRunSubmitRequest.phaseAlongside 进入 run-launched，侧栏迷你轨道据此把带内
// 相邻的两站画成双线段。
// 无图、无阶段词汇表、没有任何阶段带 alongside → undefined（整个字段缺席，而不是一串空数组：
// 缺席的含义就是这条轨道是一条直线）。
export function createWorkflowPhaseAlongside(
  graph: Pick<CreateWorkflowCausalityGraph, "phases"> | undefined,
): number[][] | undefined {
  const named = namedPhases(graph);
  if (named === undefined) return undefined;
  const indexOf = new Map(named.map((phase, index) => [phase.id, index]));
  let any = false;
  const out = named.map((phase, self) => {
    const indexes: number[] = [];
    for (const id of phase.alongside ?? []) {
      const index = indexOf.get(id);
      if (index === undefined || index === self || indexes.includes(index)) continue;
      indexes.push(index);
    }
    any = any || indexes.length > 0;
    return indexes;
  });
  return any ? out : undefined;
}

// 有名阶段（声明序，截到上界），name 已收窄为 string。
type CreateWorkflowNamedPhase = CreateWorkflowPhase & { name: string };

// 上面两个函数共用的那张表：因果图里有名字的阶段，声明序，截到 CREATE_WORKFLOW_GRAPH_MAX_PHASES。
// 抽成一个函数是为了让两者走同一条过滤、落在同一个下标空间里——phaseAlongside[i] 说的必须是
// phaseNames[i] 这一站。
function namedPhases(
  graph: Pick<CreateWorkflowCausalityGraph, "phases"> | undefined,
): CreateWorkflowNamedPhase[] | undefined {
  if (graph?.phases === undefined) return undefined;
  const named: CreateWorkflowNamedPhase[] = [];
  for (const phase of graph.phases) {
    const name = phase.name;
    if (name === undefined) continue;
    named.push({ ...phase, name });
    if (named.length >= CREATE_WORKFLOW_GRAPH_MAX_PHASES) break;
  }
  return named.length === 0 ? undefined : named;
}

// 两个新字段只在「确认后真的启动了 run」时出现；只有诊断的结果保持原形状。走显式 schema 而不是
// 借 raw 夹带：.strict() 的意义就是形状变更必须是一次显式提交。
export const CreateWorkflowOutputSchema = z
  .object({
    diagnostics: z.array(CreateWorkflowDiagnosticSchema),
    ok: z.boolean(),
    response: z.string(),
    causalityGraph: CreateWorkflowCausalityGraphSchema.optional(),
    /** 仅在启动了后台 run 时出现；不是通用状态字段，故只收这一个字面量。 */
    status: z.literal("backgrounded").optional(),
    /** 后台任务 id ≡ taskId ≡ runId（取消与状态查询都以它为键）。 */
    backgroundTaskId: z.string().min(1).optional(),
  })
  .strict();

export type CreateWorkflowOutput = z.infer<typeof CreateWorkflowOutputSchema>;

export const CreateWorkflowOutputJsonSchema = toToolJsonSchema(CreateWorkflowOutputSchema);
