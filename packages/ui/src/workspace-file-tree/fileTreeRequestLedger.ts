// SPDX-License-Identifier: Apache-2.0
// Contract-authored acceptance ledger; source review and verification pending.
type ScopeTicket = { generation: number };
export type DirectoryTicket = ScopeTicket & { path: string };
export type RefreshTicket = ScopeTicket & { revision: number };

/** Unique object reservations prevent a pruned/recreated path from adopting an old response. */
export class WorkspaceFileTreeRequestLedger {
  generation = 0;
  private live = false;
  private directories = new Map<string, DirectoryTicket>();
  private git: ScopeTicket | null = null;
  private refreshRevision = 0;

  openScope(): number {
    this.generation += 1;
    this.live = true;
    this.directories.clear();
    this.git = null;
    this.refreshRevision += 1;
    return this.generation;
  }

  closeScope(): void {
    this.live = false;
    this.directories.clear();
    this.git = null;
    this.refreshRevision += 1;
  }

  acceptsScope(generation: number): boolean {
    return this.live && this.generation === generation;
  }

  reserveDirectory(path: string, generation: number): DirectoryTicket {
    const ticket = { path, generation };
    this.directories.set(path, ticket);
    return ticket;
  }

  acceptsDirectory(ticket: DirectoryTicket): boolean {
    return this.acceptsScope(ticket.generation) && this.directories.get(ticket.path) === ticket;
  }

  invalidateDirectory(path: string): void {
    this.directories.delete(path);
  }

  invalidateDirectories(match: (path: string) => boolean): void {
    for (const path of this.directories.keys()) if (match(path)) this.directories.delete(path);
  }

  reserveGit(generation: number): ScopeTicket {
    const ticket = { generation };
    this.git = ticket;
    return ticket;
  }

  acceptsGit(ticket: ScopeTicket): boolean {
    return this.acceptsScope(ticket.generation) && this.git === ticket;
  }

  invalidateGit(): void {
    this.git = null;
  }

  refreshTicket(replace = false): RefreshTicket {
    if (replace) this.refreshRevision += 1;
    return { generation: this.generation, revision: this.refreshRevision };
  }

  acceptsRefresh(ticket: RefreshTicket): boolean {
    return this.acceptsScope(ticket.generation) && this.refreshRevision === ticket.revision;
  }
}
