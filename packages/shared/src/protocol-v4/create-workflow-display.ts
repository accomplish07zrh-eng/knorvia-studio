// SPDX-License-Identifier: Apache-2.0
// CreateWorkflow 工具卡的 display 载荷（B40）。诊断条数与单条 message 长度在协议边界限长；
// 因果图的步/车道/参与者/交接/阶段等数量与标签长度同样在工具输出边界已限长，这里镜像同一组上界。
// 图的词汇表刻意很小：参与者卡 + 一种箭头（runs after，back 只标回边）+ 阶段模块 + 返回物标记。
import { z } from "zod";

// 本文件的因果图与诊断 schema 都是模块私有的、不进兼容面：形状收敛靠下面这批私有构造器，
// 每个字段写一行、界只在构造器里出现一次，上界改一处即可覆盖用到它的全部字段。
const siteRef = () => z.string().min(1).max(64);
const textLabel = () => z.string().min(1).max(128);
const stepMarker = () => z.number().int().positive().optional();
const countValue = () => z.number().int().nonnegative();
const positiveValue = () => z.number().int().positive();
const optionalFlag = () => z.boolean().optional();
const trueFlag = () => z.literal(true).optional();
const stepKind = () => z.enum(["ask", "world-read"]);
const repeatShape = () => z.enum(["stack", "serial"]).optional();
const diagnosticText = () => z.string().min(1).max(2_048);

// 名字只在运行时成形时能静态拿到的形状：第一个洞之前的字面量（head）与最后一个洞之后的
// （tail）。渲染的省略号由渲染层加，投影里只存数据。
const agentNameShape = z
  .object({
    head: textLabel().optional(),
    tail: textLabel().optional(),
  })
  .strict();

// 一条边 = runs after；交接边与阶段边同形。trueFlag 只标循环回边（布局排秩与 cycle 计数读）。
const graphEdge = z
  .object({
    from: siteRef(),
    to: siteRef(),
    back: trueFlag(),
  })
  .strict();

// 一步可执行节点：身份、种类、显示标签、画布坐标与它落在哪条车道上，阶段与重复都是可缺席的。
const graphStep = z
  .object({
    id: siteRef(),
    kind: stepKind(),
    label: textLabel(),
    labelPattern: agentNameShape.optional(),
    line: stepMarker(),
    column: stepMarker(),
    lane: siteRef(),
    lanes: z.array(siteRef()).max(32).optional(),
    source: siteRef().optional(),
    phase: siteRef().optional(),
    repeat: repeatShape(),
  })
  .strict();

// 车道 = 竖直泳道；名字可缺席（无名车道由布局按序号补），坐标给的是它在图上的落点。
const graphLane = z
  .object({
    id: siteRef(),
    name: textLabel().optional(),
    namePattern: agentNameShape.optional(),
    line: stepMarker(),
    column: stepMarker(),
  })
  .strict();

// 参与者 = 每阶段一张子代理卡，数组顺序就是交接序；fan-out 家族按字面量基数展开成 member。
const graphParticipant = z
  .object({
    id: siteRef(),
    phase: siteRef(),
    lane: siteRef(),
    steps: z.array(siteRef()).min(1).max(64),
    member: z.object({ index: countValue(), of: positiveValue() }).strict().optional(),
    many: trueFlag(),
  })
  .strict();

// 阶段模块 = 图上的一段区间；alongside 给同区间内的并行车道，零标记的脚本阶段不落图。
const graphPhase = z
  .object({
    id: siteRef(),
    name: textLabel().optional(),
    line: stepMarker(),
    column: stepMarker(),
    alongside: z.array(siteRef()).min(1).max(32).optional(),
  })
  .strict();

// 交接边在普通边上多带一串产物类型：那是检视器素材，不上箭头，因此只在交接处可缺席。
const handoffTypes = z.array(textLabel()).min(1).max(8).optional();
const graphHandoff = graphEdge.extend({ types: handoffTypes }).strict();

// 因果图整体：步、车道、参与者、交接、阶段五张表同进同出；阶段相关的四张表全有或全无。
const causalityGraphSchema = z
  .object({
    steps: z.array(graphStep).max(64),
    lanes: z.array(graphLane).max(32),
    participants: z.array(graphParticipant).max(64),
    handoffs: z.array(graphHandoff).max(256),
    phases: z.array(graphPhase).max(32).optional(),
    phaseEdges: z.array(graphEdge).max(128).optional(),
    exits: z.array(siteRef()).max(32).optional(),
    sink: z.array(siteRef()).max(64).optional(),
    truncated: optionalFlag(),
  })
  .strict();
export type ToolCallCreateWorkflowCausalityGraph = z.infer<typeof causalityGraphSchema>;

// 单条诊断：行列坐标、诊断码与正文；三段坐标共用 countValue 这一个界。
const diagnosticSchema = z
  .object({
    line: countValue(),
    column: countValue(),
    code: countValue(),
    message: diagnosticText(),
  })
  .strict();

// 工具卡本体：ok=false 时诊断区至少一条，因果图只在图真的被产出时在场。
export const toolCallCreateWorkflowDisplaySchema = z
  .object({
    kind: z.literal("create_workflow"),
    ok: z.boolean(),
    errorCount: countValue(),
    diagnostics: z.array(diagnosticSchema).max(100),
    causalityGraph: causalityGraphSchema.optional(),
    truncated: optionalFlag(),
  })
  .strict();
export type ToolCallCreateWorkflowDisplay = z.infer<typeof toolCallCreateWorkflowDisplaySchema>;
