// SPDX-License-Identifier: Apache-2.0
// SSH Remote Host 共享身份键（B35）。
// 既有 JSON 身份契约；词法归一不碰私钥内容、不展开 home。
// 来源与兼容验收记录：specs/knorvia-remote-identity-helpers-20260930.md。
import type { RemoteTargetSnapshot } from "./protocol.js";
import type { SSHConnectOptions } from "./remoteTarget.js";

type SshKeyTarget = SSHConnectOptions | Extract<RemoteTargetSnapshot, { kind: "ssh" }>;

type KeyPathPlan = {
  prefix: /* 归一后的前缀（盘符/UNC/根/~） */ string;
  parts: /* 剩余路径段 */ string[];
  anchored: /* 是否锚定在根上 */ boolean;
};

function planKeyPath(rawPath: string): KeyPathPlan {
  const firstCode = rawPath.charCodeAt(0);
  const driveHit =
    rawPath[1] === ":" &&
    ((firstCode >= 65 && firstCode <= 90) || (firstCode >= 97 && firstCode <= 122));
  const working = driveHit ? rawPath[0]!.toUpperCase() + rawPath.slice(1) : rawPath;

  // 原盘符文法的 '.' 不匹配内部行分隔符；保留它回落成普通相对路径的结果。
  const driveRoot = driveHit && !/[\n\r\u2028\u2029]/.test(working.slice(2));
  if (driveRoot) {
    const rootAnchored = working[2] === "/";
    const cut = rootAnchored ? 3 : 2;
    return {
      prefix: working.slice(0, cut),
      parts: working.slice(cut).split("/"),
      anchored: rootAnchored,
    };
  }

  if (working.startsWith("//")) {
    const segments = working.split("/").filter(Boolean);
    // UNC 的前两段是受保护的 server/share，点段名称也不进入归约。
    return segments.length < 2
      ? { prefix: "//", parts: segments, anchored: true }
      : { prefix: `//${segments[0]}/${segments[1]}/`, parts: segments.slice(2), anchored: true };
  }
  if (working.startsWith("/")) {
    return { prefix: "/", parts: working.split("/"), anchored: true };
  }
  if (working.startsWith("~/")) {
    return { prefix: "~/", parts: working.slice(2).split("/"), anchored: false };
  }
  return { prefix: "", parts: working.split("/"), anchored: false };
}

function normalizePrivateKeyPath(keyPath: string | undefined): string {
  const trimmedKey = keyPath?.trim();
  if (!trimmedKey) {
    return ""; // 没有私钥路径就归一成空串
  }

  const pathPlan = planKeyPath(trimmedKey.replace(/\\/g, "/"));
  const keptParts: string[] = [];
  for (const segment of pathPlan.parts) {
    if (segment === "" || segment === ".") continue;
    if (segment !== "..") {
      keptParts.push(segment);
    } else if (keptParts.length && keptParts[keptParts.length - 1] !== "..") {
      keptParts.pop();
    } else if (!pathPlan.anchored) {
      keptParts.push("..");
    }
  }
  return pathPlan.prefix + keptParts.join("/");
}

function resolveSshAuthKind(snapshot: SshKeyTarget): "agent" | "password" | "private-key" {
  if (snapshot.privateKeyPath?.trim()) {
    return "private-key"; // 私钥优先
  }
  const passwordUsable =
    ("password" in snapshot && typeof snapshot.password === "string") ||
    ("passwordCredentialKey" in snapshot && Boolean(snapshot.passwordCredentialKey?.trim()));
  return passwordUsable ? "password" : "agent";
}

// 构造窗口内 SSH Remote Host 的共享身份：密码和私钥口令只用于建连，
// 禁止进入共享键或日志；六元组顺序即 JSON 身份契约（B35 逐字红线）。
export function buildSshRemoteHostKey(snapshot: SshKeyTarget): string {
  const keyTuple = [
    "ssh:v1",
    snapshot.host.trim().toLowerCase(),
    snapshot.port ?? 22,
    snapshot.username.trim(),
    resolveSshAuthKind(snapshot),
    normalizePrivateKeyPath(snapshot.privateKeyPath),
  ];
  return JSON.stringify(keyTuple);
}
