// SPDX-License-Identifier: Apache-2.0
// Source-exposed contract implementation; source review and verification pending.
import type { IFileWatcherService } from "@knorvia/services";
import type { WorkspaceFileTreeWatcherRegistration } from "./types.js";

type WatchTicket = {
  path: string;
  service: IFileWatcherService;
  epoch: number;
  onChange: (path: string) => void;
};

type WatchFailure = (operation: "watch" | "unwatch", path: string, error: unknown) => void;

/** Owns subscriptions and in-flight reservations, never file-tree data. */
export class WorkspaceFileTreeWatcherRegistry {
  private service: IFileWatcherService | null = null;
  private epoch = 0;
  private wanted = new Set<string>();
  private pending = new Map<string, WatchTicket>();
  private registrations = new Map<string, WorkspaceFileTreeWatcherRegistration>();

  constructor(private readonly reportFailure: WatchFailure) {}

  reconcile(
    service: IFileWatcherService,
    wanted: Set<string>,
    onChange: (path: string) => void,
  ): void {
    if (this.service !== service) {
      this.dispose();
      this.service = service;
    }
    this.wanted = wanted;
    for (const [path, registration] of this.registrations) {
      if (wanted.has(path)) continue;
      this.registrations.delete(path);
      this.release(service, path, registration);
    }
    for (const path of wanted) {
      if (this.registrations.has(path) || this.pending.has(path)) continue;
      const ticket = { path, service, epoch: this.epoch, onChange };
      this.pending.set(path, ticket);
      void this.open(ticket);
    }
  }

  /** Invalidates reservations first, so cleanup can safely be followed by effect replay. */
  dispose(): void {
    const service = this.service;
    const owned = this.registrations;
    this.epoch += 1;
    this.service = null;
    this.wanted = new Set();
    this.pending = new Map();
    this.registrations = new Map();
    if (!service) return;
    let failed = false;
    let failure: unknown;
    for (const [path, registration] of owned) {
      try {
        this.release(service, path, registration);
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
    if (failed) throw failure;
  }

  private accepts(ticket: WatchTicket): boolean {
    return (
      this.service === ticket.service &&
      this.epoch === ticket.epoch &&
      this.pending.get(ticket.path) === ticket &&
      this.wanted.has(ticket.path)
    );
  }

  private async open(ticket: WatchTicket): Promise<void> {
    const { path, service } = ticket;
    try {
      const { id } = await service.watch({ path });
      if (!this.accepts(ticket)) {
        void this.releaseHost(service, path, id);
        return;
      }
      let registration: WorkspaceFileTreeWatcherRegistration;
      try {
        const subscription = service.onDynamicChange(id)((event) => ticket.onChange(event.dirPath));
        registration = { id, subscription, unwatch: () => service.unwatch({ id }) };
      } catch (error) {
        void this.releaseHost(service, path, id);
        throw error;
      }
      // A synchronous subscription callback can change the wanted scope during setup.
      if (this.accepts(ticket)) this.registrations.set(path, registration);
      else this.release(service, path, registration);
    } catch (error) {
      this.reportFailure("watch", path, error);
    } finally {
      if (this.pending.get(path) === ticket) this.pending.delete(path);
    }
  }

  private release(
    service: IFileWatcherService,
    path: string,
    registration: WorkspaceFileTreeWatcherRegistration,
  ): void {
    try {
      registration.subscription.dispose();
    } finally {
      void this.releaseHost(service, path, registration.id);
    }
  }

  private async releaseHost(service: IFileWatcherService, path: string, id: string): Promise<void> {
    try {
      await service.unwatch({ id });
    } catch (error) {
      this.reportFailure("unwatch", path, error);
    }
  }
}
