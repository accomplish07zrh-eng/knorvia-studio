// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

/** 握手协议版本；Server 与 Host 必须同版才交出能力，不做隐式降级。 */
export const SERVER_REMOTE_PROTOCOL_VERSION = 1 as const;

const PROTOCOL_VERSION = SERVER_REMOTE_PROTOCOL_VERSION;
const text = () => z.string();
const trimmed = () => z.string().trim().min(1);

/* 能力表分成「必须声明」与「可选观测」两组，后者允许旧 Server 缺省。 */
// 旧 Server 缺少新增 dynamic event，必须先声明能力再订阅，避免异常打进对端读循环；
// 因此动态事件能力单独列为可选，false literal 的两项是握手成立的前提。
const capabilitiesShape = () => ({
  desktopContinuous: z.literal(true),
  websocketRpc: z.literal(true),
  processResourceTelemetry: z.boolean().optional(),
});

const workspaceShape = () => ({
  path: trimmed(),
  label: trimmed().optional(),
  workspaceIdentity: trimmed().optional(),
});

const infoShape = () => ({
  serverId: trimmed(),
  name: trimmed().optional(),
  version: text(),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  authRequired: z.boolean(),
  workspaces: z.array(serverRemoteWorkspaceInfoSchema),
  capabilities: z.object(capabilitiesShape()),
});

export const serverRemoteWorkspaceInfoSchema = z.object(workspaceShape());

export const serverRemoteInfoSchema = z.object(infoShape());

export type ServerRemoteWorkspaceInfo = z.output<typeof serverRemoteWorkspaceInfoSchema>;
export type ServerRemoteInfo = z.output<typeof serverRemoteInfoSchema>;

const hostCapabilityShape = () => ({
  capability: trimmed(),
  expiresAt: z.number().int().positive(),
});

export const serverRemoteHostCapabilitySchema = z.object(hostCapabilityShape()).strict();

export type ServerRemoteHostCapability = z.output<typeof serverRemoteHostCapabilitySchema>;
