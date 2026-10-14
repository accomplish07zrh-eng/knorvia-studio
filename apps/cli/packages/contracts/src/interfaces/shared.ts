// SPDX-License-Identifier: Apache-2.0
// 协议共享标识面。会话、消息、工具、工作区等领域都从这里取 id 类型与生成函数，
// 调用方只依赖「哪种 id」和「前缀长什么样」，不关心片段怎么生成。
// 组织方式：先给出不导出的品牌与片段工具，再按领域列出 id 类型，最后按同一领域顺序放出工厂。

// 内部工具（不导出）：品牌化与片段策略
// 品牌只在编译期区分 id 种类，运行时始终是普通字符串；片段策略决定默认取值。

/** 给字符串叠加品牌标签：不同种类的 id 互不能赋值，品牌名与类型名保持同名。 */
type BrandedId<Brand extends string> = string & { readonly __brand: Brand };

/** 默认片段一：一次性 UUID，唯一性由随机源保证，不带时间排序信息。 */
const randomIdSegment = (): string => crypto.randomUUID();

/** 默认片段二：毫秒时间戳（36 进制）在前、UUID 在后，便于按生成时间排序。 */
const sortableIdSegment = (): string => `${Date.now().toString(36)}_${crypto.randomUUID()}`;

/**
 * 所有 id 生成函数的唯一出口：先拼「前缀_片段」，再打上品牌。
 * 调用方给出片段时按原样采用，不会再追加随机内容（便于测试与恢复场景复现同一个 id）。
 */
function issuePrefixedId<Id extends string>(
  prefix: string,
  segment: () => string,
  id?: string,
): Id {
  return `${prefix}_${id ?? segment()}` as Id;
}

// 会话主链路：一次会话、一轮工作、一条任务链、一条事件

/** 会话主键。session store、事件流与界面路由都以它定位一次对话。 */
export type SessionId = BrandedId<"SessionId">;

/** 一次产品轮次的标识，由会话运行时分配，用于把输入、工具与产出归到同一轮。 */
export type TurnId = BrandedId<"TurnId">;

/** 顶层任务链标识，层级高于 SessionId；子会话、子代理与后台工作都应继续传播同一值。 */
export type TraceId = BrandedId<"TraceId">;

/** 会话事件流里单条事件的标识，用于追加去重与增量读取。 */
export type EventId = BrandedId<"EventId">;

// 消息域：一条消息与其内部片段

/** 单条消息的标识，transcript 与投影都按它索引。 */
export type MessageId = BrandedId<"MessageId">;

/** 消息内部一个内容片段的标识，例如文本块、推理块或工具调用块。 */
export type PartId = BrandedId<"PartId">;

// 输入与查询

/** 用户输入历史中的条目标识，用于回看与重复投递。 */
export type InputHistoryId = BrandedId<"InputHistoryId">;

/** 一次模型查询的标识，把请求、用量与错误串到同一条链路上。 */
export type QueryId = BrandedId<"QueryId">;

// 工具与作用域

/** 一次工具调用的标识，权限审批、结果回填与后台任务都围绕它关联。 */
export type ToolCallId = BrandedId<"ToolCallId">;

/** 项目容器标识，会话与工作区可挂靠其下。 */
export type ProjectId = BrandedId<"ProjectId">;

/** 工作区标识。身份隔离用它区分同名路径的不同工作区，文件操作仍以路径为准。 */
export type WorkspaceId = BrandedId<"WorkspaceId">;

// 交互请求来源

/**
 * 子代理发起交互请求（提问、选择、确认）时的来源描述。
 * 由子代理运行时在请求中填写；宿主据此把响应路由回对应的父会话、父轮次与父工具调用。
 */
export interface SubagentInteractionRequestOrigin {
  kind: "subagent";
  agentId: string;
  agentType: string;
  childSessionId: SessionId | string;
  childTurnId?: TurnId | string;
  description?: string;
  parentSessionId: SessionId | string;
  parentToolCallId?: ToolCallId | string;
  parentTurnId?: TurnId | string;
}

/**
 * 交互请求来源的公共别名：权限、提问等端口只引用这个名字，
 * 来源种类的收口放在本文件，新增来源时在此扩展而不必改动调用方。
 */
export type InteractionRequestOrigin = SubagentInteractionRequestOrigin;

// 公开工厂：前缀是外部契约，取值与领域一一对应
// 会话主链路

/** 生成会话 id，前缀 `sess_`。 */
export function createSessionId(id?: string): SessionId {
  return issuePrefixedId<SessionId>("sess", randomIdSegment, id);
}

/** 生成轮次 id，前缀 `turn_`。 */
export function createTurnId(id?: string): TurnId {
  return issuePrefixedId<TurnId>("turn", randomIdSegment, id);
}

/** 生成事件 id，前缀 `evt_`。 */
export function createEventId(id?: string): EventId {
  return issuePrefixedId<EventId>("evt", randomIdSegment, id);
}

/** 生成任务链 id。trace 不加领域前缀，直接采用裸 UUID。 */
export function createTraceId(): TraceId {
  return randomIdSegment() as TraceId;
}

// 公开工厂：消息域

/** 生成消息 id，前缀 `msg_`；默认片段可排序，保证同一毫秒内连续生成也不重复。 */
export function createMessageId(id?: string): MessageId {
  return issuePrefixedId<MessageId>("msg", sortableIdSegment, id);
}

/** 生成片段 id，前缀 `part_`；默认片段可排序。 */
export function createPartId(id?: string): PartId {
  return issuePrefixedId<PartId>("part", sortableIdSegment, id);
}

// 公开工厂：输入与查询

/** 生成输入历史 id，前缀 `input_`；默认片段可排序。 */
export function createInputHistoryId(id?: string): InputHistoryId {
  return issuePrefixedId<InputHistoryId>("input", sortableIdSegment, id);
}

/** 生成查询 id，前缀 `query_`。 */
export function createQueryId(id?: string): QueryId {
  return issuePrefixedId<QueryId>("query", randomIdSegment, id);
}

// 公开工厂：工具与作用域

/** 生成工具调用 id，前缀 `tool_`。 */
export function createToolCallId(id?: string): ToolCallId {
  return issuePrefixedId<ToolCallId>("tool", randomIdSegment, id);
}

/** 生成项目 id，前缀 `proj_`。 */
export function createProjectId(id?: string): ProjectId {
  return issuePrefixedId<ProjectId>("proj", randomIdSegment, id);
}

/** 生成工作区 id，前缀 `ws_`。 */
export function createWorkspaceId(id?: string): WorkspaceId {
  return issuePrefixedId<WorkspaceId>("ws", randomIdSegment, id);
}
