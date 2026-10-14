// SPDX-License-Identifier: Apache-2.0
// 交付档案过滤：按订阅者 profile 决定哪些会话事件可以发给它（纯函数，绝不修改入参）。
// 通道层 flush 管线的第一步是 filter → coalesce → 打帧；恢复回放走同一套过滤，以保证断线
// 重连后对同一订阅者的确定性重投递。收口不变量：被 profile 滤掉的流式事件，最终必须由某个
// 不可过滤的完整事件补齐——例如 row.delta(inputText) 被滤掉后，工具定稿的 row.upserted 要带上
// 完整文本，否则 replayable 订阅者会停在缺数据的终态。任何 reducer 改动破坏该不变量都会撞上
// 「两 profile 终态逐字节一致」那条黄金测试。
import type { DeliveryProfile } from "./core.js";
import type { ConversationDelta } from "./delta.js";
import type { ConversationRow } from "./rows.js";

// 行级过滤：当前没有 profile 专属的完整行，因此总是返回等长的新数组（逐元素拷贝）。
// 保留这个纯函数边界，是为了将来受控地引入 profile 专属行时不必改动调用方。
export function filterConversationRowsForProfile(
  sourceRows: readonly ConversationRow[],
  _delivery: DeliveryProfile,
): ConversationRow[] {
  const replica: ConversationRow[] = [];
  for (const row of sourceRows) replica.push(row);
  return replica;
}

// 增量级过滤：row.delta 按 profile 的 streamPaths 开关放行，其余结构性事件一律保留。
// 输出保持权威日志顺序；恢复回放与实时 flush 共用这一条路径，重投递因此是确定的。
export function filterConversationDeltasForProfile(
  streamDeltas: readonly ConversationDelta[],
  delivery: DeliveryProfile,
): ConversationDelta[] {
  const forwarded: ConversationDelta[] = [];
  for (const delta of streamDeltas) {
    const permitted = delta.op === "row.delta" ? delivery.streamPaths[delta.path] : true;
    if (permitted) forwarded.push(delta);
  }
  return forwarded;
}
