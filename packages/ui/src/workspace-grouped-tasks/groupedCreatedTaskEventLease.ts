// SPDX-License-Identifier: Apache-2.0
// Source-exposed task-created subscription owner; source/runtime review pending.
import type { IKnorviaTaskService } from "@knorvia/services";

type Service = Pick<IKnorviaTaskService, "onDynamicWorkspaceEvent">;
type Scope = Parameters<Service["onDynamicWorkspaceEvent"]>[0];
type Disposable = { dispose: () => void };
type Ports = { invalidate: () => void; refresh: () => void };

class CreatedTaskEventLease {
  private active = true;
  private readonly disposables: Disposable[] = [];

  constructor(private readonly ports: Ports) {}

  install(service: Service, scopes: readonly Scope[]): void {
    try {
      for (const scope of scopes) {
        this.disposables.push(service.onDynamicWorkspaceEvent(scope)((event) => {
          if (!this.active || event.type !== "workspace_task_list_changed" || event.reason !== "task_created") return;
          this.ports.invalidate();
          this.ports.refresh();
        }));
      }
    } catch (error) {
      // map 安装中途抛错不会交出 cleanup；账本释放此前已经交付的 owned leases。
      try { this.dispose(); } catch { /* preserve the installation failure */ }
      throw error;
    }
  }

  dispose = (): void => {
    if (!this.active) return;
    this.active = false;
    const disposables = this.disposables.splice(0);
    let failed = false, failure: unknown;
    for (const disposable of disposables) {
      try { disposable.dispose(); }
      catch (error) { if (!failed) failure = error; failed = true; }
    }
    if (failed) throw failure;
  };
}

export function subscribeGroupedTaskCreationEvents(service: Service, scopes: readonly Scope[], ports: Ports): () => void {
  const lease = new CreatedTaskEventLease(ports);
  lease.install(service, scopes);
  return lease.dispose;
}
