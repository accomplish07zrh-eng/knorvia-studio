// 仅存视图所绑定的 Host 引用；不保存执行状态。窗口内 Host 换代后，旧格不能借同 ID 重绑新 Host。
const connections = new Map<string, object>();
export function claimWorkbenchConnection(tileId: string, service: object): boolean {
  const previous = connections.get(tileId);
  if (previous) return previous === service;
  connections.set(tileId, service);
  return true;
}
/** 内核或项目变化、移出工作台、用户显式重新加入时解除旧认领。 */
export function resetWorkbenchConnection(tileId: string) {
  connections.delete(tileId);
}
export function forgetWorkbenchConnection(tileId: string) {
  connections.delete(tileId);
}
