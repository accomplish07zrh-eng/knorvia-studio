// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  CoreErrorType,
  createCoreError,
  type PermissionBrokerPort,
  type PermissionBrokerRequest,
  type PermissionBrokerRequestOptions,
  type PermissionBrokerResult,
  type PreparedPermissionRequest,
} from "@knorvia/contracts";
import { PermissionPreparation, activatePermissionRequest } from "./prepared-request.js";

export interface ManualPermissionBrokerOptions {
  onRequest?: (request: PermissionBrokerRequest) => Promise<void> | void;
}
interface PendingPermission {
  request: PermissionBrokerRequest;
  owner: PermissionPreparation;
}
function cancelled(request: PermissionBrokerRequest) {
  return createCoreError(CoreErrorType.ToolCancelled, "Permission request cancelled", {
    context: {
      requestId: request.requestId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
    },
    recoverable: true,
  });
}

export class DenyPermissionBroker implements PermissionBrokerPort {
  async preparePermission(
    request: PermissionBrokerRequest,
    options?: PermissionBrokerRequestOptions,
  ): Promise<PreparedPermissionRequest> {
    return new PermissionPreparation({
      signal: options?.signal,
      cancelled: () => cancelled(request),
      activate: (owner) =>
        owner.resolve({
          decision: "deny",
          reason: `No permission client configured for ${request.toolName}`,
          resolvedAt: new Date(),
        }),
    });
  }
  requestPermission(
    request: PermissionBrokerRequest,
    options?: PermissionBrokerRequestOptions,
  ): Promise<PermissionBrokerResult> {
    return activatePermissionRequest(this.preparePermission(request, options));
  }
}

/** The ordered registry indexes the same preparation object used by the returned handle. */
export class ManualPermissionBroker implements PermissionBrokerPort {
  private readonly pending = new Map<string, PendingPermission>();
  constructor(private readonly options: ManualPermissionBrokerOptions = {}) {}

  async preparePermission(
    request: PermissionBrokerRequest,
    options?: PermissionBrokerRequestOptions,
  ): Promise<PreparedPermissionRequest> {
    const id = request.requestId;
    if (this.pending.has(id))
      throw createCoreError(
        CoreErrorType.InvalidStateTransition,
        `Permission request already pending: ${id}`,
        {
          context: { requestId: id, toolCallId: request.toolCallId },
          recoverable: true,
        },
      );
    const owner = new PermissionPreparation({
      signal: options?.signal,
      cancelled: () => cancelled(request),
      activate: () => this.options.onRequest?.(request),
      dispose: () => {
        if (this.pending.get(id)?.owner === owner) this.pending.delete(id);
      },
      ...(options?.timeoutMs === undefined
        ? {}
        : {
            timeout: {
              milliseconds: options.timeoutMs,
              error: () =>
                createCoreError(
                  CoreErrorType.PermissionTimeout,
                  `Permission request timed out after ${options.timeoutMs}ms`,
                  {
                    context: {
                      requestId: id,
                      timeoutMs: options.timeoutMs,
                      toolCallId: request.toolCallId,
                      toolName: request.toolName,
                    },
                    recoverable: true,
                  },
                ),
            },
          }),
    });
    this.pending.set(id, { request, owner });
    return owner;
  }

  requestPermission(
    request: PermissionBrokerRequest,
    options?: PermissionBrokerRequestOptions,
  ): Promise<PermissionBrokerResult> {
    return activatePermissionRequest(this.preparePermission(request, options));
  }

  resolvePermission(id: string, result: PermissionBrokerResult): boolean {
    const found = this.lookup(id);
    if (!found) return false;
    // 先锁定结算和清理登记，再读取应答；回调重入不能接受第二次结果。
    found.owner.resolveFrom(() => ({ ...result, resolvedAt: result.resolvedAt ?? new Date() }));
    return true;
  }
  rejectPermission(id: string, error: Error): boolean {
    const found = this.lookup(id);
    if (!found) return false;
    found.owner.reject(error);
    return true;
  }
  getPendingRequest(id: string): PermissionBrokerRequest | undefined {
    return this.lookup(id)?.request;
  }
  listPendingRequests(): PermissionBrokerRequest[] {
    return Array.from(this.pending.values(), (value) => value.request);
  }
  private lookup(id: string): PendingPermission | undefined {
    return (
      this.pending.get(id) ??
      Array.from(this.pending.values()).find((value) => value.request.toolCallId === id)
    );
  }
}

export const createDenyPermissionBroker = (): PermissionBrokerPort => new DenyPermissionBroker();
export const createManualPermissionBroker = (
  options?: ManualPermissionBrokerOptions,
): ManualPermissionBroker => new ManualPermissionBroker(options);
