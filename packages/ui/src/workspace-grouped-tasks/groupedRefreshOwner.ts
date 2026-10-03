// SPDX-License-Identifier: Apache-2.0
// Contract-authored async acceptance; source review and verification pending.
type RefreshJob<T> = {
  hasNodes: () => boolean;
  load: () => Promise<T>;
  isCurrent: (value: T) => boolean;
  accept: (value: T) => void;
  setLoading: (loading: boolean) => void;
  initialize: () => void;
  onError: (error: unknown) => void;
};

/** Owns refresh permissions; the hook/store/cache continue owning their original data. */
export class GroupedTaskViewRefreshOwner {
  private scope: object | null = null;
  private latest: object | null = null;

  activate(): () => void {
    const scope = {};
    this.scope = scope;
    this.latest = null;
    return () => {
      if (this.scope !== scope) return;
      this.scope = null;
      this.latest = null;
    };
  }

  async run<T>(job: RefreshJob<T>): Promise<void> {
    const scope = this.scope;
    if (!scope) return;
    const ticket = {};
    this.latest = ticket;
    const accepts = () => this.scope === scope && this.latest === ticket;
    if (!job.hasNodes()) job.setLoading(true);
    try {
      const value = await job.load();
      if (accepts() && job.isCurrent(value)) job.accept(value);
    } catch (error) {
      if (accepts()) job.onError(error);
    } finally {
      if (accepts()) {
        job.setLoading(false);
        job.initialize();
      }
    }
  }
}
