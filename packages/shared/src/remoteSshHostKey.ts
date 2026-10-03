import type { RemoteTargetSnapshot } from "./protocol.js";
import type { SSHConnectOptions } from "./remoteTarget.js";

type SshRemoteHostKeyTarget = SSHConnectOptions | Extract<RemoteTargetSnapshot, { kind: "ssh" }>;

// 既有 JSON 身份契约；词法归一不访问私钥或展开 home。
// 来源暴露与兼容验收见 specs/knorvia-remote-identity-helpers-20260930.md。
// Apache-2.0 与 NOTICE 继续适用。
interface KeyPathPlan {
  prefix: string;
  parts: string[];
  anchored: boolean;
}

function planKeyPath(value: string): KeyPathPlan {
  const code = value.charCodeAt(0);
  const drive = value[1] === ":" && ((code >= 65 && code <= 90) || (code >= 97 && code <= 122));
  if (drive) value = value[0]!.toUpperCase() + value.slice(1);

  // 原盘符文法的 '.' 不匹配内部行分隔符；保留其回落到普通相对路径的结果。
  const driveRoot = drive && !/[\n\r\u2028\u2029]/.test(value.slice(2));
  if (driveRoot) {
    const anchored = value[2] === "/";
    return {
      prefix: value.slice(0, anchored ? 3 : 2),
      parts: value.slice(anchored ? 3 : 2).split("/"),
      anchored,
    };
  }

  if (value.startsWith("//")) {
    const parts = value.split("/").filter(Boolean);
    // UNC 的前两段是受保护的 server/share，点段名称也不进入 reducer。
    return parts.length < 2
      ? { prefix: "//", parts, anchored: true }
      : { prefix: `//${parts[0]}/${parts[1]}/`, parts: parts.slice(2), anchored: true };
  }
  if (value.startsWith("/")) {
    return { prefix: "/", parts: value.split("/"), anchored: true };
  }
  if (value.startsWith("~/")) {
    return { prefix: "~/", parts: value.slice(2).split("/"), anchored: false };
  }
  return { prefix: "", parts: value.split("/"), anchored: false };
}

function normalizePrivateKeyPath(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }

  const plan = planKeyPath(trimmed.replace(/\\/g, "/"));
  const remaining: string[] = [];
  for (const part of plan.parts) {
    if (part === "" || part === ".") continue;
    if (part !== "..") {
      remaining.push(part);
    } else if (remaining.length && remaining[remaining.length - 1] !== "..") {
      remaining.pop();
    } else if (!plan.anchored) {
      remaining.push("..");
    }
  }
  return plan.prefix + remaining.join("/");
}

function resolveSshAuthKind(target: SshRemoteHostKeyTarget): "agent" | "password" | "private-key" {
  if (target.privateKeyPath?.trim()) {
    return "private-key";
  }
  if (
    ("password" in target && typeof target.password === "string") ||
    ("passwordCredentialKey" in target && Boolean(target.passwordCredentialKey?.trim()))
  ) {
    return "password";
  }
  return "agent";
}

/**
 * 构造窗口内 SSH Remote Host 的共享身份。
 * 密码和私钥口令只用于建连，禁止进入共享键或日志。
 */
export function buildSshRemoteHostKey(target: SshRemoteHostKeyTarget): string {
  return JSON.stringify([
    "ssh:v1",
    target.host.trim().toLowerCase(),
    target.port ?? 22,
    target.username.trim(),
    resolveSshAuthKind(target),
    normalizePrivateKeyPath(target.privateKeyPath),
  ]);
}
