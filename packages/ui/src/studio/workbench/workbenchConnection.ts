// 仅存视图所绑定的 Host 引用；不保存执行状态，不把新 Host 的同 ID 当原会话。
const connections = new Map<string, object | null>();
export function claimWorkbenchConnection(tileId: string, service: object): boolean {
  const previous = connections.get(tileId);
  if (connections.has(tileId)) return previous === service;
  connections.set(tileId, service);
  return true;
}
export function restoreWorkbenchConnection(tileId: string) {
  // 重载丢失原 service 证明；当前 Host 的同 ID/项目索引不能证明原连接。
  connections.set(tileId, null);
}
export function isWorkbenchConnectionUnverified(tileId: string): boolean {
  return connections.get(tileId) === null;
}
export function resetWorkbenchConnection(tileId: string) {
  // 自动目标更新不能解除恢复引用的 unknown；只有用户明确重新加入/打开才可解除。
  if (!isWorkbenchConnectionUnverified(tileId)) connections.delete(tileId);
}
export function forgetWorkbenchConnection(tileId: string) {
  connections.delete(tileId);
}
