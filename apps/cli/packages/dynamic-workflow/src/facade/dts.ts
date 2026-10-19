// SPDX-License-Identifier: Apache-2.0

// Knorvia 动态工作流运行时：Facade 声明定义与嵌入式 dts 资产
// 包含工作流脚本面向作者的完整 API 表面，由运行时注入编译器环境，不依赖磁盘 node_modules。
// 声明定义采用段式拼接组织：FACADE_DTS 为全量执行面，SNIPPET_FACADE_DTS 为纯逻辑/世界读取的安全子集。

export const FACADE_FILE_NAME = "workflow-facade.d.ts";

const SEGMENTS = {
  actor: String.raw`
/** Knorvia 动态工作流原语节点：承载分配给智能体的单个执行步骤。
 * 该接口实现 PromiseLike 语义，可直接使用 await 或 Promise.all 进行并发汇总与依赖等待。
 * 返回强类型化结果 T，由工作流运行时自动执行类型验证与数据校验。 */
declare interface Node<T> extends PromiseLike<T> { /* 执行原语句柄 */ }

/** Knorvia 智能体人设与静态身份描述，在创建时确定并在智能体生命周期中保持不变。
 * 智能体具备只读探索、模式检索、文件编辑以及受控命令执行等基础工作能力。
 * 具体任务执行意图与关注边界在具体的 ask 任务指派中明确阐述。 */
declare interface AgentPersona { /* 角色人设声明 */
  /** 描述智能体专职角色与系统指导原则的提示词。 */ system?: string;
}

/** Knorvia 智能体交互实体：维护持久化的对话上下文并按串行先进先出队列执行指派任务。
 * 多个 ask 调用在同一智能体实例上按提交顺序排队，历史上下文跨任务自动累积。 */
declare interface Agent { /* 智能体交互契约 */
  /** 向当前智能体指派一项具体任务。
   * 类型参数 T 标识任务期望产出的结构化数据结构：可在当前脚本中通过标准 interface 声明定义；
   * 若省略类型参数，则默认返回智能体最终回复的完整字符串正文。 */
  ask<T = string>(instructions: string): Node<T>;
}

/** 创建全新的 Knorvia 工作流智能体执行实例。
 * 每次调用均分配独立的对话上下文；若需共享上下文环境，需在步骤间传递该实例引用。
 * 智能体名称为可选参数；若提供非空名称，则该名称作为智能体的唯一全局身份标识。
 * 在单次工作流执行中，若存在两个同名智能体，整个工作流将报错终止。
 * 该名称也是工作流在脚本修订重跑时定位缓存并继承已完成成果的关键依据。
 * 未命名的匿名智能体合法，但不会继承或复用先前的执行成果。
 * 在扇出并发或循环遍历场景下，每次迭代均应作为独立的智能体运作：
 * 应为每次迭代派生专属标识名称（如 agent("checker-" + item)），或保持匿名。
 * 循环体内使用重复的静态字面量名称将在编译期或运行时被检测并拒绝。 */
declare function agent(name?: string, persona?: string | AgentPersona): Agent;
`,
  args: String.raw`
/** 工作流启动时由调用方传入的全局输入参数集合。
 * 在项目中保存的持久化工作流中，脚本可预先声明输入参数的名称、类型、必填性以及默认值；
 * 宿主环境在启动执行前会根据声明严格校验入参格式并补齐默认取值，因此此处接收到的实参对象始终完整可靠。
 * 在内联脚本以及评估代码片段中，该参数集合默认为只读空对象。
 * 该变量始终保持定义状态，脚本可安全读取属性（例如 args.target）而无需担心空指针崩溃。
 * 所有参数值均声明为 unknown 类型，脚本作者应在代码中通过显式类型守卫或类型转换处理输入。 */
declare const args: Readonly<Record<string, unknown>>;
`,
  log: String.raw`
/** 向工作流运行面板或控制台输出实时进度日志通知。
 * 该函数用于向用户实时展示当前工作流推进阶段，不阻塞执行流程，无返回值。 */
declare function log(message: string): void;
`,
  report: String.raw`
/** 在工作流执行过程中发布一项中间分析成果或阶段性数据项。
 * 与普通的进度日志类似，该函数为纯发后即忘操作，无需也不支持 await 等待。
 * 与非持久化的临时日志不同，上报的数据项会被记录到执行日记（journal）中：
 * 当工作流恢复执行时，已上报的项目绝不会重复推送；即使执行中途因异常中断，
 * 先前已落盘的成果仍会随终止通知完整交付给调用方，最大程度保留已完成的计算价值。
 * 运行时对上报施加双重硬性上限（超出时将导致整个工作流失败）：
 * 单次执行最多允许上报 256 个数据项，单个序列化后的数据项体积不得超过 32KB。
 * 这些阈值旨在鼓励提炼关键结论与结构化发现，避免充斥无意义的高频流水日志。
 * 数据项必须可被标准 JSON 正确序列化：允许纯对象、数组、字符串、数字、布尔值及 null。
 * 函数、类实例、日期对象或 Promise 等不可序列化类型在脚本编译期会被直接静态拦截。
 * 可选的第二个参数用于将上报数据定向路由至看板预置产物：
 * 传入通过 artifact.chart、table、metrics 或 board 声明的预置产物标识，
 * 该数据项将转换为图表上的数据点、表格中的一行记录、指标卡片的新值或看板泳道卡片。
 * 该标识必须是脚本中通过字面量声明且已生效的预置产物 ID；
 * 若指定了不存在的标识或指向普通文件产物，将导致工作流报错终止。
 * 未指定目标标识的数据项将直接进入工作流通用的结果列表展现。 */
declare function report(item: unknown, artifactId?: string): void;
`,
  artifact: String.raw`
/** 已发布的产物版本元数据：记录产物绑定的唯一标识以及本次发布所生成的自增版本号。 */
declare interface ArtifactRef { /* 产物版本标识对象 */ id: string; version: number; }

/** 各类产物卡片均支持的基础通用展示元数据配置项。 */
declare interface ArtifactOptions { /* 通用产物配置选项 */
  /** 产物卡片标题文本；若未提供则默认使用产物标识名称。 */ title?: string;
  /** 产物卡片辅助摘要描述，展示在标题旁用于概述产物内容。 */ description?: string;
  /** 标记该产物是否为本次工作流的核心终态交付物。
   * 全局至多允许一个产物被标记为主产物；一旦确立为主产物，后续新版本将沿用该标记。 */ primary?: boolean;
}

/** 工作区文件产物专属发布配置项。 */
declare interface ArtifactFileOptions extends ArtifactOptions { /* 文件发布选项 */
  /** 显式覆盖根据文件扩展名推导出的 MIME 内容类型（如 application/pdf 等）。 */ contentType?: string;
}

/** 从已上报数据项中提取字段值的映射规则定义：支持点号分割的嵌套路径语法（如 timing.after）。 */
declare interface ArtifactField { /* 字段映射定义 */ field: string; label?: string; unit?: string; }

/** 数据图表预置产物规范定义。 */
declare interface ChartSpec extends ArtifactOptions { /* 图表视图规格 */
  /** 图表呈现形式：支持折线图 line、柱状图 bar 或散点图 scatter，默认为折线图。 */ type?: "line" | "bar" | "scatter";
  /** 横轴对应的数据字段路径。 */ x: ArtifactField;
  /** 纵轴对应的数据字段路径；指定多个字段时将绘制多条对比数据序列。 */ y: ArtifactField | ArtifactField[];
  /** 纵轴数值缩放标尺模式：支持线性刻度 linear 或对数刻度 log，默认为线性刻度。 */ scale?: "linear" | "log";
  /** 水平基准参考线，取自首个包含该指定字段的数据项数值。 */ baseline?: ArtifactField;
}

/** 表格视图预置产物规范定义。 */
declare interface TableSpec extends ArtifactOptions { /* 表格视图规格 */
  /** 表格呈现的数据列定义列表。 */ columns: ArtifactField[];
  /** 用于唯一标识行记录的主键字段路径；后续相同主键的数据项将原地更新该行。缺省时为追加模式。 */ key?: string;
}

/** 核心度量指标卡片预置产物规范定义。 */
declare interface MetricsSpec extends ArtifactOptions { /* 度量指标规格 */
  /** 统计卡片指标列表；每个指标卡片展示该字段最新到达的数据项取值。 */ metrics: ArtifactField[];
}

/** 任务泳道看板预置产物规范定义。 */
declare interface BoardSpec extends ArtifactOptions { /* 看板视图规格 */
  /** 标识看板卡片的唯一主键字段路径；具有相同主键的新数据将移动或更新已有卡片。 */ key: string;
  /** 确定卡片所在分组或列的字段路径。 */ status: string;
  /** 看板各列展示的有序名称清单；未列出的状态值将统一归入末尾的其它分类列。 */ columns: string[];
  /** 卡片主标题所对应的字段路径（缺省时使用主键值），以及卡片额外展示的信息字段。 */ cardTitle?: string;
  /** 看板卡片额外展示的辅助字段信息列表。 */ detail?: ArtifactField[];
}

/** Knorvia 产物管理原语：发布面向用户最终可见的工作流成果与实时监控看板。
 * 产物系统支持两大互补门类：
 * - 内容型产物（file、markdown）：属于副作用效应，返回异步 Promise 并解析出 ArtifactRef；
 *   支持 catch 异常捕获（如文件不存在、路径越界等）。发布时即时拷贝文件快照，后续编辑不影响已归档版本。
 * - 预置看板型产物（chart、table、metrics、board）：属于同步声明原语，无返回值，定义数据项的呈现结构；
 *   后续通过 report(item, id) 为看板注入数据驱动可视化渲染。
 * 产物标识必须是有效的非空字符串字面量（最长 64 字符，仅限字母数字及下划线短横线点号）。
 * 系统限制每次运行最多发布 32 个不同产物标识，每个标识最多归档 16 个历史版本。 */
declare const artifact: {
  /** 将工作区中的物理文件发布为交付产物。
   * path 为相对于工作区根目录的相对路径，在发布瞬间完成文件字节拷贝并记录快照。 */
  file(id: string, path: string, opts?: ArtifactFileOptions): Promise<ArtifactRef>;
  /** 将脚本在内存中生成的 Markdown 格式文本发布为富文本总结交付物。 */
  markdown(id: string, content: string, opts?: ArtifactOptions): Promise<ArtifactRef>;
  /** 声明一个图表视图预置产物，后续通过带有对应产物标识的 report 调用提供数据点支撑。 */
  chart(id: string, spec: ChartSpec): void;
  /** 声明一个表格视图预置产物，后续通过带有对应产物标识的 report 调用提供表格行数据支撑。 */
  table(id: string, spec: TableSpec): void;
  /** 声明一个指标卡片集合预置产物，各卡片动态反映最新上报的数值变化。 */
  metrics(id: string, spec: MetricsSpec): void;
  /** 声明一个任务泳道看板预置产物，根据上报数据项的状态字段自动归类排布卡片。 */
  board(id: string, spec: BoardSpec): void;
};
`,
  phase: String.raw`
/** 标记一个工作流逻辑阶段的起始位置。
 * 传入简洁、可读且面向用户认知的阶段名称，该名称将在前端工作流可视化流程图中呈现为一个节点。
 * 该原语纯粹用于结构化展示和进度编排，不产生阻塞等待，亦无返回值。
 * 每个提交的工作流脚本均应合理组织阶段划分，为用户呈现清晰的任务全景推进脉络。
 * 阶段名称应以用户使用的自然语言表达该阶段达成的目标（如"并行分析各变更文件"、"执行测试验证"等）。
 * 阶段作用域覆盖当前所在代码块中自该标记起至块末尾的所有步骤操作；
 * 包含的子代码块执行完毕后，控制流自动回归外层阶段。相同名称的重复标记将被合并为同一阶段继续推进。 */
declare function phase(name: string): void;
`,
  world: String.raw`
/** 文件文本正则搜索匹配结果单项条目。 */
declare interface GrepMatch { /* 文本搜索匹配结果 */
  /** 发生匹配的文件相对于工作区根目录的相对路径。 */ path: string;
  /** 匹配发生处的起始行号（从 1 开始计数）。 */ line: number;
  /** 匹配行的整行文本正文内容。 */ text: string;
}

/** 工作区文件系统只读观测原语集合，所有读取均受工作流执行日记（journal）追踪管理。
 * 在重放模式下直接返回已记录的历史结果。若需进行文件修改等写操作，应指派给智能体完成。 */
declare const files: {
  /** 检索匹配指定 glob 通配符的工作区文件路径列表，结果按字母字典序升序排列。
   * 最多返回 2000 个匹配文件；超出上限将抛出异常以防止无意的大规模遍历。 */
  glob(pattern: string): Promise<string[]>;
  /** 以 UTF-8 编码读取指定工作区文件的完整文本正文。设有读取体积安全上限。 */
  read(path: string): Promise<string>;
  /** 使用正则引擎搜索文件内容，可通过 glob 模式限定检索路径范围。
   * 最多返回 2000 处匹配或累计 256KB 匹配结果文本，超限将抛出错误。 */
  grep(pattern: string, glob?: string): Promise<GrepMatch[]>;
};

/** Git 工作区变更状态概览，由 git.status() 统一获取并呈现。 */
declare interface GitStatus { /* 版本控制状态集合 */
  /** 当前检出的分支名称；若处于游离 HEAD 状态则该字段缺省。 */ branch?: string;
  /** 工作树是否处于完全干净状态（无已暂存、未暂存或未跟踪文件）。 */ clean: boolean;
  /** 已暂存且等待进入下一次提交的文件相对路径列表。 */ staged: string[];
  /** 在工作树中已发生修改但尚未暂存的文件相对路径列表。 */ unstaged: string[];
  /** 未受 Git 版本追踪的文件相对路径列表（严格遵从 .gitignore 忽略规则）。 */ untracked: string[];
}

/** 单条 Git 提交历史记录对象，由 git.log() 读取解析生成。 */
declare interface GitCommit { /* 单条提交历史记录 */
  /** 完整的 Git 提交对象校验散列值哈希串。 */ hash: string;
  /** 提交说明信息的第一行标题摘要。 */ subject: string;
  /** 提交作者姓名。 */ author: string;
  /** 提交创建时间，采用 ISO 8601 标准日期时间格式。 */ date: string;
}

/** 只读 Git 仓库观测原语集合，所有查询操作同样受工作流日记记录并用于精确回放。
 * 所有命令参数均由底层运行时安全构造，完全避免 Shell 命令拼接风险。
 * 检索范围严格限定在当前工作区对应的仓库边界内；超出上限或非 Git 环境将抛出可捕获异常。 */
declare const git: {
  /** 获取发生变更的文件相对路径列表；未指定基准引用时对比 HEAD 并包含未跟踪文件。 */
  changedFiles(base?: string): Promise<string[]>;
  /** 针对指定基准引用（默认为 HEAD）生成统一 diff 补丁文本；支持限定单个文件路径。 */
  diff(base?: string, path?: string): Promise<string>;
  /** 检查并返回当前工作区的 Git 状态概览。 */
  status(): Promise<GitStatus>;
  /** 获取按时间倒序排列的最新提交历史列表，默认返回 20 条，最多允许获取 100 条。 */
  log(count?: number): Promise<GitCommit[]>;
};
`,
  worldRun: String.raw`
/** 执行外部命令的输出结果封装，完整记录进程退出状态与标准流输出。 */
declare interface WorldRunResult { /* 外部执行结果 */
  /** 子进程终止时的退出状态码；非零状态码代表执行失败或检查未通过，作为普通结果返回。 */ exitCode: number;
  /** 子进程标准输出捕获的 UTF-8 编码文本内容；设有 256KB 安全体积截断阈值。 */ stdout: string;
  /** 子进程标准错误捕获的 UTF-8 编码文本内容；同样遵循 256KB 安全体积截断阈值。 */ stderr: string;
}

/** 经日记化追踪记录的受控外部命令执行原语。
 * 针对每个调用位置和循环迭代严格执行一次并由日记持久化，在断点重放时直接返回历史记录。
 * 与常规异常机制不同，即便子进程返回非零退出码，Promise 仍会正常 resolve 出 WorldRunResult，
 * 便于门禁检查脚本基于状态码进行条件分支处理。仅在进程无法启动或超时时才会触发 catch 拒绝。
 * 命令参数 cmd 必须为编译期静态字符串字面量；所有参数以直接参数数组形式派发，杜绝 Shell 注入漏洞。 */
declare const world: {
  run(cmd: string, args?: string[], opts?: { timeoutMs?: number }): Promise<WorldRunResult>;
};
`,
};

export const FACADE_DTS = [
  SEGMENTS.actor,
  SEGMENTS.args,
  SEGMENTS.log,
  SEGMENTS.report,
  SEGMENTS.artifact,
  SEGMENTS.phase,
  SEGMENTS.world,
  SEGMENTS.worldRun,
].join("");

export const SNIPPET_FACADE_DTS = [
  SEGMENTS.args,
  SEGMENTS.log,
  SEGMENTS.world,
  SEGMENTS.worldRun,
].join("");
