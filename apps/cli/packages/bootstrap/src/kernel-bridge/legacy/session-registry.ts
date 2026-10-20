// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy锛氫細璇濈櫥璁拌〃锛堟湰鍖呭敮涓€鍐欏叆鑰咃級銆?//
// 鐘舵€佹墍鏈夎€咃細杩欓噷銆侱SH 鐨?SessionStore 鎸佹湁浼氳瘽浜嬩欢鏃ュ織锛堝璇濇鏂囧敮涓€鎵€鏈夎€咃級锛?// 鏈〃鍙寔鏈夈€屾棫鍗忚浼氳瘽韬唤 鈫?DSH 浼氳瘽 id銆嶇殑鏄犲皠涓庢棫鍗忚鑷繁鐨勫厓鏁版嵁鎶曞奖
// 锛堝伐浣滃尯銆佹ā寮忋€佹爣棰樸€佸垱寤烘椂闂达級銆備袱渚т竴涓€瀵瑰簲锛屼笉瀛樻鏂囧壇鏈紙specs/knorvia-builtin-kernel-dsh.md锛夈€?
import { randomUUID } from "node:crypto";
import type { WorkspaceRef, SessionMode } from "./contracts.js";

/** 涓€涓棫鍗忚浼氳瘽鍦ㄦ湰杩涚▼涓殑鐧昏淇℃伅銆?*/
export interface LegacySessionRecord {
  readonly sessionId: string;
  readonly workspace: WorkspaceRef;
  readonly traceId: string;
  readonly createdAt: number;
  updatedAt: number;
  /** 浼氳瘽妯″紡锛坧lan/build/edit/yolo/auto锛夛紱榛樿 build锛屼笌榛樿寮曟搸涓€鑷淬€?*/
  mode: SessionMode;
  title: string;
  status: "idle" | "running" | "waiting" | "paused" | "completed" | "error";
  /** 宸插彂鍑虹殑浜嬩欢搴忓彿锛坄session/events` 涓?`session/subscribe` 鐨勬按浣嶏級銆?*/
  eventSeq: number;
  /** 鏃у崗璁殑 stateRevision锛圕AS 鐢級銆?*/
  stateRevision: number;
  /** 閫変腑鐨勬ā鍨嬶紱鏈粦瀹氫负 undefined锛堜笉浼€犻粯璁ゆā鍨嬶級銆?*/
  model?: { readonly providerId: string; readonly modelId: string };
  /** thinking 妗ｄ綅锛涙湭缁戝畾涓?undefined銆?*/
  thoughtLevel?: string;
  closed: boolean;
}

/**
 * 浼氳瘽鐧昏琛ㄣ€傚敮涓€鍐欏叆鑰呮槸浼氳瘽澶勭悊鍣紱鍏跺畠妯″潡鍙銆? *
 * 涓嶅仛 GC锛氫笌榛樿寮曟搸涓€鑷粹€斺€擿session/close` 鍙爣璁?closed 骞朵粠娲昏穬琛ㄧЩ闄わ紝
 * 鍒楄〃锛坄session/list`锛夊彧鍒楁椿璺冧細璇濄€? */
export class LegacySessionRegistry {
  private readonly sessions = new Map<string, LegacySessionRecord>();

  create(input: {
    readonly sessionId?: string;
    readonly workspace: WorkspaceRef;
    readonly traceId: string;
    readonly mode?: SessionMode;
    readonly model?: { readonly providerId: string; readonly modelId: string };
    readonly thoughtLevel?: string;
    readonly now?: number;
  }): LegacySessionRecord {
    const now = input.now ?? Date.now();
    const record: LegacySessionRecord = {
      sessionId: input.sessionId ?? `sess_${randomUUID()}`,
      workspace: input.workspace,
      traceId: input.traceId,
      createdAt: now,
      updatedAt: now,
      mode: input.mode ?? "build",
      title: "",
      status: "idle",
      eventSeq: 0,
      stateRevision: 0,
      ...(input.model ? { model: input.model } : {}),
      ...(input.thoughtLevel ? { thoughtLevel: input.thoughtLevel } : {}),
      closed: false,
    };
    this.sessions.set(record.sessionId, record);
    return record;
  }

  get(sessionId: string): LegacySessionRecord | undefined {
    const record = this.sessions.get(sessionId);
    return record !== undefined && !record.closed ? record : undefined;
  }

  /** 鏄惁鐧昏杩囷紙鍚凡鍏抽棴锛夛紱鐢ㄤ簬鍖哄垎銆屼粠鏈瓨鍦ㄣ€嶄笌銆屽凡鍏抽棴銆嶃€?*/
  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /** 娲昏穬浼氳瘽锛屾寜鍒涘缓椤哄簭锛坄session/list` 鐨勯『搴忎簨瀹烇級銆?*/
  list(): LegacySessionRecord[] {
    return [...this.sessions.values()].filter((record) => !record.closed);
  }

  /** 鎸夊伐浣滃尯杩囨护鐨勬椿璺冧細璇濄€?*/
  listByWorkspace(workspaceKey: string): LegacySessionRecord[] {
    return this.list().filter((record) => record.workspace.workspaceKey === workspaceKey);
  }

  close(sessionId: string): boolean {
    const record = this.get(sessionId);
    if (record === undefined) return false;
    record.closed = true;
    record.updatedAt = Date.now();
    return true;
  }

  touch(sessionId: string): void {
    const record = this.get(sessionId);
    if (record !== undefined) record.updatedAt = Date.now();
  }

  size(): number {
    return this.list().length;
  }
}
