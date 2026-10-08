// 仅存视图所绑定的 Host 引用；不保存执行状态，不把新 Host 的同 ID 当原会话。
const connections = new Map<string, object>();
export function claimWorkbenchConnection(tileId: string, service: object): boolean {
  const previous = connections.get(tileId);
  if (previous) return previous === service;
  connections.set(tileId, service);
  return true;
}
export function forgetWorkbenchConnection(tileId: string) {
  connections.delete(tileId);
}
