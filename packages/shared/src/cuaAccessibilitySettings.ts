// SPDX-License-Identifier: Apache-2.0
// CUA 权限 onboarding 的设置面类型（纯声明）。
const CUA_PERMISSION_TABLE = {
  accessibility: "accessibility",
  screenRecording: "screen_recording",
} as const;
export type CuaPermissionKind = (typeof CUA_PERMISSION_TABLE)[keyof typeof CUA_PERMISSION_TABLE];

export type OpenCuaPermissionOnboardingOptions = {
  // 每次调用由 renderer 生成一个不透明 id；关掉权限 surface 时只撤销对应那一个 participant。
  operationId?: /* 不透明调用 id */ string;
  initialPermission?: /* 起始权限项 */ CuaPermissionKind;
  // 按最新鲜状态仍缺的权限清单；main 逐项打开系统设置页并等应用回前台。
  requiredPermissions?: /* 仍缺失的权限 */ CuaPermissionKind[];
};

export type CuaAccessibilitySettingsResult = {
  success: /* 是否成功 */ boolean;
  canceled?: /* 用户是否取消 */ boolean;
  // main 级 onboarding 会话 id；同一 Helper identity 下的并发窗口共用同一个。
  sessionId?: /* onboarding 会话 id */ string;
  // 全部 staged 设置页都看到任意 Knorvia 窗口回前台，才置 true。
  returnedFromSettings?: /* 是否确认返回过设置页 */ boolean;
  // 一个 main onboarding 会话可能被多个窗口同时加入：每个独立 renderer/host 只允许一个调用
  // 拿到 true 去重启本 host 的 Helper，同 renderer 的后续调用拿 false。不能全局只挑一个窗口——
  // 每个窗口各有 host/Helper，授权前已拉起的进程必须逐个恢复。undefined 是旧 main 的兼容形状，
  // 按单窗口 owner 解释。
  restartHelperAfterReturn?: /* 是否负责重启 Helper */ boolean;
  error?: /* 可读错误文本 */ string;
};

// 拖拽预热结果（renderer 能看到的形状）。
//
// helperBundleFingerprint 刻意不出现在这里：它属于 main 进程内存缓存的同步 TOCTOU 证据
// （dragstart 那一刻比对「自验签以来字节没变」），跨 IPC 暴露给 renderer 毫无用处还扩大攻击面。
// main 侧的 PrepareCuaHelperPermissionDragMainResult 才带该字段，IPC handler 返回前显式剥掉。
export type PrepareCuaHelperPermissionDragResult = {
  success: /* 是否成功 */ boolean;
  error?: /* 可读错误文本 */ string;
  helperAppPath?: /* Helper 应用路径 */ string;
  helperDisplayName?: /* Helper 展示名 */ string;
  helperBundleId?: /* Helper bundle 标识 */ string;
};
