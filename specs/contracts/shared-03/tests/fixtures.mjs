// SPDX-License-Identifier: Apache-2.0
// shared-03 金样加载：四组 fixtures（旧实现录制，逐字节真值）。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { repoRoot } from "./entry.mjs";

const fixture = (name) =>
  JSON.parse(readFileSync(resolve(repoRoot, "specs/contracts/shared-03/fixtures", name), "utf8"));

/** ① workspaceFileEntriesCodec 往返（含转义）。 */
export const fileEntriesRoundtrip = fixture("file-entries-roundtrip.json");

/** ② workspace-hook 配置往返 + 摘要。 */
export const workspaceHookGolden = fixture("workspace-hook-golden.json");

/** ③ task-realtime 事件 gate 握手（B42/B43 七口径）。 */
export const taskRealtimeGate = fixture("task-realtime-gate.json");

/** ④ 分享 schema 往返。 */
export const conversationShareRoundtrip = fixture("conversation-share-roundtrip.json");
