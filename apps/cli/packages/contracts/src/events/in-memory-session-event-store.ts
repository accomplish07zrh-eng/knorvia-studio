// SPDX-License-Identifier: Apache-2.0
// 内存事件存储的兼容出口：只声明名字，实现全部在 ./in-memory-session-event-store-core.js。
export {
  createInMemorySessionEventStore,
  InMemorySessionEventStore,
} from "./in-memory-session-event-store-core.js";
export type { InMemorySessionEventStoreOptions } from "./in-memory-session-event-store-core.js";
