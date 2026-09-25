/**
 * 分层探测相关的文案（阶段、状态、失败代码、发送前拒绝、只读登录提示）。
 *
 * 单独成文件的原因与后端拆分 `kernelInspection.ts` 相同：文案随代码词表增长，
 * 与 Agent 管理的其它文案分开维护，避免单个文件越过行数上限。
 * 词表以 `packages/services/src/studio-runtime/adapters/kernels/probeResult.ts` 为准。
 */
export const agentProbeZhCN = {
  "studio.agents.reprobe": "重新探测",
  "studio.agents.reprobing": "正在重新探测…",
  "studio.agents.sshOffline": "SSH 离线",
  "studio.agents.probe.title": "分层探测",
  "studio.agents.probe.legacy":
    "此记录没有分层探测证据（旧数据、远端快照或被拒清单），不能据此确认可用。",
  "studio.agents.probe.cached": "协议段来自缓存",
  "studio.agents.probe.viewDiagnostics": "查看诊断",
  "studio.agents.probe.badgeUnusable": "已安装但不可用",
  "studio.agents.probe.stage.locate": "定位",
  "studio.agents.probe.stage.version": "版本",
  "studio.agents.probe.stage.protocol": "协议",
  "studio.agents.probe.stage.auth": "账号",
  "studio.agents.probe.status.ok": "通过",
  "studio.agents.probe.status.failed": "失败",
  "studio.agents.probe.status.skipped": "跳过",
  "studio.agents.probe.status.cancelled": "已取消",
  "studio.agents.probe.status.timeout": "超时",
  "studio.agents.probe.status.unknown": "未知",
  "studio.agents.probe.code.locate.missing": "没有找到可执行文件",
  "studio.agents.probe.code.locate.path-invalid": "配置的程序路径无效",
  "studio.agents.probe.code.locate.launcher-unresolved": "无法解析启动器",
  "studio.agents.probe.code.locate.registry-closed": "内核注册表已关闭",
  "studio.agents.probe.code.locate.manager-unavailable": "内核管理锁或运行租约不可用",
  "studio.agents.probe.code.locate.failed": "定位失败",
  "studio.agents.probe.code.version.spawn": "无法启动版本进程",
  "studio.agents.probe.code.version.exit": "版本进程非零退出",
  "studio.agents.probe.code.version.timeout": "版本探测超时",
  "studio.agents.probe.code.version.cancelled": "版本探测已取消",
  "studio.agents.probe.code.version.output-invalid": "版本输出无效或超限",
  "studio.agents.probe.code.version.unparsable": "无法解析版本号",
  "studio.agents.probe.code.version.failed": "版本探测失败",
  "studio.agents.probe.code.protocol.unavailable": "此内核不使用 ACP 协议",
  "studio.agents.probe.code.protocol.mismatch": "ACP 协议版本不匹配",
  "studio.agents.probe.code.protocol.rpc": "协议请求返回错误应答",
  "studio.agents.probe.code.protocol.transport": "协议传输失败",
  "studio.agents.probe.code.protocol.timeout": "协议握手超时",
  "studio.agents.probe.code.protocol.cancelled": "协议探测已取消",
  "studio.agents.probe.code.protocol.failed": "协议握手失败",
  "studio.agents.probe.code.auth.not-requested": "未请求账号核验；握手成功不代表账号可用",
  "studio.agents.probe.code.auth.unavailable": "账号核验不可用",
  "studio.agents.probe.code.auth.failed": "账号核验失败",
  "studio.agents.probe.code.auth.timeout": "账号核验超时",
  "studio.agents.probe.code.auth.cancelled": "账号核验已取消",
  "studio.agents.probe.code.stage.not-reached": "前序阶段未通过，本段未执行",
  "studio.agents.probe.authHint.title": "需要先在原 CLI 登录",
  "studio.agents.probe.authHint.body":
    "Studio 不会代替 {name} 登录，也不保存任何凭据。请在该 CLI 自己的登录流程完成后重新探测。",
  "studio.agents.probe.authHint.action": "如何登录原 CLI",
  "studio.agents.capabilityEvidence.verified": "已核验",
  "studio.agents.capabilityEvidence.reported": "按当前接入声明",
  "studio.agents.capabilityEvidence.unverified": "版本未核验",
  "studio.agents.capabilityEvidence.unsupported": "不支持",
  "studio.agents.capabilitiesUnverified":
    "版本 {version} 不在已核验范围内，相关能力按失败关闭显示；更新内核或重新探测后再确认。",
  "studio.agents.sendRefusal.statusUnknown": "尚未检测 {name} 的可用性，草稿未发送。请先重新检测。",
  "studio.agents.sendRefusal.remoteOffline": "{name} 的 SSH 连接已断开，草稿未发送。",
  "studio.agents.sendRefusal.notInstalled":
    "未检测到可用的 {name} 安装，草稿未发送。Studio 不会改用其它内核或模型。",
  "studio.agents.sendRefusal.probeFailed":
    "{name} 的程序存在，但{stage}阶段未通过（{code}），草稿未发送。请查看诊断后重试。",
  "studio.agents.sendRefusal.versionUnverified":
    "当前 {name} 的{capability}能力未被核验，无法满足“{permission}”，草稿未发送；Studio 不会自动放宽权限或改换模型。",
  "studio.agents.sendRefusal.permissionUnsupported":
    "{name} 不支持{capability}，无法满足“{permission}”，草稿未发送；Studio 不会自动放宽权限或改换模型。",
} as const;

export const agentProbeEnUS: Record<keyof typeof agentProbeZhCN, string> = {
  "studio.agents.reprobe": "Probe again",
  "studio.agents.reprobing": "Probing again…",
  "studio.agents.sshOffline": "SSH offline",
  "studio.agents.probe.title": "Layered probe",
  "studio.agents.probe.legacy":
    "This record has no layered probe evidence (older data, a remote snapshot or a rejected manifest), so it cannot confirm usability.",
  "studio.agents.probe.cached": "Protocol stage from cache",
  "studio.agents.probe.viewDiagnostics": "View diagnostics",
  "studio.agents.probe.badgeUnusable": "Installed but unusable",
  "studio.agents.probe.stage.locate": "Locate",
  "studio.agents.probe.stage.version": "Version",
  "studio.agents.probe.stage.protocol": "Protocol",
  "studio.agents.probe.stage.auth": "Account",
  "studio.agents.probe.status.ok": "Passed",
  "studio.agents.probe.status.failed": "Failed",
  "studio.agents.probe.status.skipped": "Skipped",
  "studio.agents.probe.status.cancelled": "Cancelled",
  "studio.agents.probe.status.timeout": "Timed out",
  "studio.agents.probe.status.unknown": "Unknown",
  "studio.agents.probe.code.locate.missing": "No executable was found",
  "studio.agents.probe.code.locate.path-invalid": "The configured program path is invalid",
  "studio.agents.probe.code.locate.launcher-unresolved": "The launcher could not be resolved",
  "studio.agents.probe.code.locate.registry-closed": "The engine registry is closed",
  "studio.agents.probe.code.locate.manager-unavailable":
    "The engine management lock or run lease is unavailable",
  "studio.agents.probe.code.locate.failed": "Locating failed",
  "studio.agents.probe.code.version.spawn": "The version process could not start",
  "studio.agents.probe.code.version.exit": "The version process exited non-zero",
  "studio.agents.probe.code.version.timeout": "Version probing timed out",
  "studio.agents.probe.code.version.cancelled": "Version probing was cancelled",
  "studio.agents.probe.code.version.output-invalid": "Version output was invalid or oversized",
  "studio.agents.probe.code.version.unparsable": "The version number could not be parsed",
  "studio.agents.probe.code.version.failed": "Version probing failed",
  "studio.agents.probe.code.protocol.unavailable": "This engine does not use the ACP protocol",
  "studio.agents.probe.code.protocol.mismatch": "The ACP protocol version does not match",
  "studio.agents.probe.code.protocol.rpc": "The protocol request returned an error response",
  "studio.agents.probe.code.protocol.transport": "The protocol transport failed",
  "studio.agents.probe.code.protocol.timeout": "The protocol handshake timed out",
  "studio.agents.probe.code.protocol.cancelled": "Protocol probing was cancelled",
  "studio.agents.probe.code.protocol.failed": "The protocol handshake failed",
  "studio.agents.probe.code.auth.not-requested":
    "Account verification was not requested; a successful handshake does not prove the account works",
  "studio.agents.probe.code.auth.unavailable": "Account verification is unavailable",
  "studio.agents.probe.code.auth.failed": "Account verification failed",
  "studio.agents.probe.code.auth.timeout": "Account verification timed out",
  "studio.agents.probe.code.auth.cancelled": "Account verification was cancelled",
  "studio.agents.probe.code.stage.not-reached":
    "An earlier stage did not pass, so this stage never ran",
  "studio.agents.probe.authHint.title": "Sign in with the original CLI first",
  "studio.agents.probe.authHint.body":
    "Studio never signs in to {name} for you and never stores credentials. Finish that CLI's own sign-in flow, then probe again.",
  "studio.agents.probe.authHint.action": "How to sign in to the original CLI",
  "studio.agents.capabilityEvidence.verified": "Verified",
  "studio.agents.capabilityEvidence.reported": "As reported by this connection",
  "studio.agents.capabilityEvidence.unverified": "Version not verified",
  "studio.agents.capabilityEvidence.unsupported": "Unsupported",
  "studio.agents.capabilitiesUnverified":
    "Version {version} is outside the verified range, so the affected capabilities fail closed. Update the engine or probe again to confirm.",
  "studio.agents.sendRefusal.statusUnknown":
    "{name} has not been checked yet, so the draft was not sent. Detect local agents first.",
  "studio.agents.sendRefusal.remoteOffline":
    "The SSH connection to {name} is offline. The draft was not sent.",
  "studio.agents.sendRefusal.notInstalled":
    "No usable {name} installation was detected, so the draft was not sent. Studio will not switch to another engine or model.",
  "studio.agents.sendRefusal.probeFailed":
    "The {name} program exists, but the {stage} stage did not pass ({code}). The draft was not sent; review the diagnostics and retry.",
  "studio.agents.sendRefusal.versionUnverified":
    "The {capability} capability of {name} is not verified for this version, so “{permission}” cannot be honoured. The draft was not sent; Studio never widens permissions or swaps models on its own.",
  "studio.agents.sendRefusal.permissionUnsupported":
    "{name} does not support {capability}, so “{permission}” cannot be honoured. The draft was not sent; Studio never widens permissions or swaps models on its own.",
};
