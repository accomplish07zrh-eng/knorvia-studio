// SPDX-License-Identifier: Apache-2.0
// 流式载荷写入队列：严格串行的尾链 + 高水位背压 + 队列级失败缓存。
// 进入顺序就是 enqueue 调用顺序（与完成顺序无关）；首个失败被缓存后，三个出口都会抛出它。
export interface StreamingQueuePayload {
  [field: string]: unknown;
}

/** 写入队列句柄：入队（同步登记）、排空、背压三出口。 */
export interface StreamingWriteQueue {
  /** 入队一条载荷（已缓存失败时同步抛出）。 */
  enqueue: (payload: StreamingQueuePayload) => void;
  /** 等尾链清空（已缓存失败时抛出）。 */
  drain: () => Promise<void>;
  /** 达到高水位时等尾链，否则立即返回（已缓存失败时抛出）。 */
  maybeApplyBackpressure: () => Promise<void>;
}

/** 队列构造入参：单条写入的执行函数与可注入的水位上限。 */
export interface StreamingWriteSpec {
  /** 单条载荷的写入动作（失败将升级为队列级失败）。 */
  write: (payload: StreamingQueuePayload) => Promise<void>;
  /** 未落盘写入数上限（缺省 128）。 */
  writeCeiling?: number;
}

/** 默认水位上限：未落盘写入达到该值才触发背压等待。 */
const DEFAULT_WRITE_HIGH_WATER_MARK = 128;

/** 建一个串行写入队列。 */
export function createStreamingWriteQueue(spec: StreamingWriteSpec): StreamingWriteQueue {
  const ceiling = spec.writeCeiling ?? DEFAULT_WRITE_HIGH_WATER_MARK;
  const state = {
    cachedFault: undefined as unknown,
    inFlight: 0,
    tail: Promise.resolve() as Promise<void>,
  };

  /** 推进一次写入：先接尾链再写；失败只缓存首个原因。 */
  const advance = async (payload: StreamingQueuePayload): Promise<void> => {
    await state.tail;
    if (state.cachedFault !== undefined) {
      state.inFlight -= 1;
      return;
    }
    try {
      await spec.write(payload);
    } catch (reason: unknown) {
      state.cachedFault ??= reason;
    } finally {
      state.inFlight -= 1;
    }
  };

  const schedule = (payload: StreamingQueuePayload): void => {
    if (state.cachedFault !== undefined) throw state.cachedFault;
    state.inFlight += 1;
    state.tail = advance(payload);
  };

  const settleOrRethrow = async (): Promise<void> => {
    await state.tail;
    if (state.cachedFault !== undefined) throw state.cachedFault;
  };

  const handle = {} as StreamingWriteQueue;
  handle.enqueue = schedule;
  handle.drain = async (): Promise<void> => {
    await settleOrRethrow();
  };
  handle.maybeApplyBackpressure = async (): Promise<void> => {
    if (state.cachedFault !== undefined) throw state.cachedFault;
    if (state.inFlight < ceiling) return;
    await settleOrRethrow();
  };
  return handle;
}
