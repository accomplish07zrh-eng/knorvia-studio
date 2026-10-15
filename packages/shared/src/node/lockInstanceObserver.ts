// SPDX-License-Identifier: Apache-2.0
// 锁实例观测器：给「无主」锁的 grace 计时提供「这个锁我第一次看见是什么时候」的读数。
// 背景：owner 元数据的时间戳可能损坏或超前（见 atomicFileLock 的承认规则），此时只能退回
// 「等待者自己第一次观测到该锁实例的时刻」来起算 ownerless grace。同一把锁若被后来的写者
// 整体替换（目录被删又重建），等待者必须重新起算，不能把在旧锁上已等过的时长带过来。
import type { Stats } from "node:fs";

// 观测函数：给定锁路径、当前 stat 与观测时刻，返回该锁实例「首次被看见」的时刻。
export type ObserveLockInstance = (lockPath: string, lockStat: Stats, observedAt: number) => number;

// 一条观测记录：这把锁第一次落进表的时刻，加上判「还是不是同一把锁」用的四元组签名。
interface LockSighting {
  openedAt: number;
  signature: string;
}

// dev / ino / 出生时刻 / 最近修改时刻里任一变化都算换了一把锁；签名用模板串拼，全仓只此一处。
const signatureOf = ({ dev, ino, birthtimeMs, mtimeMs }: Stats): string =>
  `${dev}|${ino}|${birthtimeMs}|${mtimeMs}`;

// 把一次新观测落表并把时刻交回去。分开写是为了让「换锁后重新起算」这条规则只出现一次：
// 读路径只负责比对签名，落表与回值全在这里。
const rememberSighting = (
  ledger: Map<string, LockSighting>,
  path: string,
  signature: string,
  at: number,
): number => {
  ledger.set(path, { openedAt: at, signature });
  return at;
};

// 建立一张按锁路径索引的观测表并交出观测函数。表只在单次 acquireFileLock 调用内有效，
// 调用结束即丢弃，因此不需要清理，也不需要防并发写。
export const createLockInstanceObserver = (): ObserveLockInstance => {
  const ledger = new Map<string, LockSighting>();

  return (path, stat, at) => {
    const signature = signatureOf(stat);
    const prior = ledger.get(path);
    if (prior !== undefined && prior.signature === signature) {
      return prior.openedAt;
    }
    return rememberSighting(ledger, path, signature, at);
  };
};
