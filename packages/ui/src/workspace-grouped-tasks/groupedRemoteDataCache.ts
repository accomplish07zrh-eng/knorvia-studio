// SPDX-License-Identifier: Apache-2.0
// Contract-authored cache ownership; source review and verification pending.
import type { KnorviaGroupedTaskView } from "@knorvia/services";

type Demand = object;
type Reservation<T> = { epoch: object; demand: Demand; result: Promise<T> };

/** One completed value, shared pending work, and last-demand acceptance across all keys. */
export class GroupedRemoteDataSingleFlight<T> {
  private epoch: object = {};
  private latestDemand: Demand = {};
  private accepted: { key: string; value: T } | null = null;
  private pending = new Map<string, Reservation<T>>();

  load(key: string, fetchValue: () => Promise<T>): Promise<T> {
    const demand = {};
    this.latestDemand = demand;
    if (this.accepted?.key === key) return Promise.resolve(this.accepted.value);
    const shared = this.pending.get(key);
    if (shared) {
      shared.demand = demand;
      return shared.result;
    }
    const epoch = this.epoch;
    // Reserve before calling user code, including code which synchronously throws/reenters.
    const reservation: Reservation<T> = {
      epoch, demand,
      result: Promise.resolve().then(fetchValue).then((value) => {
        if (this.epoch === epoch && this.latestDemand === reservation.demand) this.accepted = { key, value };
        return value;
      }).finally(() => {
        if (this.pending.get(key) === reservation) this.pending.delete(key);
      }),
    };
    this.pending.set(key, reservation);
    return reservation.result;
  }

  isCurrent(key: string, value: T): boolean {
    return this.accepted?.key === key && this.accepted.value === value;
  }

  invalidate(): void {
    this.epoch = {};
    this.latestDemand = {};
    this.accepted = null;
    this.pending.clear();
  }
}

/** Historical last-refresh snapshots; reads retain the established stale-data window. */
export class GroupedViewCarryCache {
  private entries = new Map<string, KnorviaGroupedTaskView>();

  constructor(private readonly capacity = 8) {}

  read(signature: string): KnorviaGroupedTaskView | undefined {
    return this.entries.get(signature);
  }

  write(signature: string, view: KnorviaGroupedTaskView): void {
    this.entries.delete(signature);
    this.entries.set(signature, view);
    let overflow = this.entries.size - this.capacity;
    for (const key of this.entries.keys()) {
      if (overflow <= 0) break;
      this.entries.delete(key);
      overflow -= 1;
    }
  }
}

const carriedViews = new GroupedViewCarryCache();
export const readCachedGroupedView = (signature: string) => carriedViews.read(signature);
export const writeCachedGroupedView = (signature: string, view: KnorviaGroupedTaskView) => carriedViews.write(signature, view);
