// SPDX-License-Identifier: Apache-2.0
import { canonicalJson } from "./hash.js";
import type {
  ActorRef,
  ActorSessionSeed,
  ImportedActorCandidate,
  ImportedAskEntry,
  ImportedRunCache,
  ImportedWorldEntry,
  InstanceRef,
  NodeRecord,
  PersonaSpec,
} from "./types.js";

// 命名 actor 的消费态。闸门只有开/关两态，已消费位置独立保存：
// 关闸之后仍要把新会话种在已消费前缀的末尾。
export class ImportedActorState {
  readonly #candidate: ImportedActorCandidate;
  #closed = false;
  #taken = 0;

  constructor(candidate: ImportedActorCandidate) {
    this.#candidate = candidate;
  }

  // 纯度策略由调用点决定：普通命中接受任意条目，缓存关闭后只接受没碰过世界的。
  #consume(position: number, digest: string, purity: "any" | "pure"): ImportedAskEntry | undefined {
    const entry = this.#candidate.entries[position];
    const hit =
      !this.#closed &&
      entry !== undefined &&
      entry.inputHash === digest &&
      (purity === "any" || entry.stats?.worldToolCalls === 0);
    if (hit) this.#taken = position + 1;
    else this.#closed = true;
    return hit ? entry : undefined;
  }

  take(position: number, digest: string): ImportedAskEntry | undefined {
    return this.#consume(position, digest, "any");
  }

  takeIfPure(position: number, digest: string): ImportedAskEntry | undefined {
    return this.#consume(position, digest, "pure");
  }

  // resume 时用已记录的 ask 重建原次判定。wasLive 补的是哈希看不出的分歧：
  // 关闸后带工具的一次 ask 即便与前驱条目同哈希，也是本世 live 跑的。
  reconcileRecorded(position: number, recordedHash: string, wasLive: boolean): void {
    const entry = this.#candidate.entries[position];
    const replayable =
      !this.#closed && !wasLive && entry !== undefined && entry.inputHash === recordedHash;
    if (replayable) this.#taken = Math.max(this.#taken, position + 1);
    else this.#closed = true;
  }

  // 分歧后的会话种子：源转录 + 最后一条已消费条目的消息边界 + 承袭的模型 pin。
  // 一条也没消费时没有可接续的历史，也就没有种子。
  seed(): ActorSessionSeed | undefined {
    const tail = this.#taken === 0 ? undefined : this.#candidate.entries[this.#taken - 1];
    if (tail === undefined) return undefined;
    const { transcriptSourceSessionId: sourceSessionId, resolvedModel: model } = this.#candidate;
    const base = { sourceSessionId, messageCount: tail.messageBoundary };
    return model === undefined ? base : { ...base, resolvedModel: model };
  }
}

// 前驱 world 结果的按哈希队列。构造时把注入的只读表拷成自己的队列；
// 同一内容的第 n 次读取取第 n 条，耗尽后由调用方转 live。
export class ImportedWorldQueue {
  readonly #pending = new Map<string, ImportedWorldEntry[]>();

  constructor(source: ReadonlyMap<string, ImportedWorldEntry[]>) {
    for (const [hash, queue] of source) this.#pending.set(hash, queue.slice());
  }

  take(contentHash: string): ImportedWorldEntry | undefined {
    return this.#pending.get(contentHash)?.shift();
  }
}

type ActorResolver = (
  cache: ImportedRunCache | undefined,
  spec: PersonaSpec,
) => ImportedActorState | undefined;

// 按有效名查前驱；persona 经 canonicalJson 规范化后必须相等（键序与 undefined 成员不影响身份）。
// 匿名 actor 没有身份键，永不附着。
export const matchImportedActor: ActorResolver = (cache, spec) => {
  const wanted = spec.name;
  if (cache === undefined || wanted === undefined || wanted === "") return undefined;
  const source = cache.actors.get(wanted);
  return source !== undefined && canonicalJson(source.persona) === canonicalJson(spec)
    ? new ImportedActorState(source)
    : undefined;
};

type AskRowBuilder = (
  runId: string,
  instance: InstanceRef,
  actor: ActorRef,
  seq: number,
  hash: string,
  entry: ImportedAskEntry,
) => NodeRecord;

// 导入命中要落的真节点行：结果、用量与转录边界原样拷入，供本 run 再被修订。
export const importedAskRecord: AskRowBuilder = (runId, instance, actor, seq, hash, entry) => {
  const { result, stats, messageBoundary } = entry;
  const place = { runId, siteId: instance.siteId, ordinal: instance.ordinal };
  const speaker = { actorSiteId: actor.siteId, actorOrdinal: actor.ordinal };
  const position = { actorSeq: seq, inputHash: hash };
  const settled = { status: "completed" as const, result, messageBoundary };
  const row: NodeRecord = { ...place, kind: "ask", ...speaker, ...position, ...settled };
  if (stats !== undefined) row.stats = stats;
  return row;
};
