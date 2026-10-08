import { record, text } from "../../domain/kernelPolicy.js";
import type { KernelRun } from "./kernelRun.js";

interface Scope {
  id: string;
  mode: "turn" | "compact" | "status";
  bound: boolean;
  failed: boolean;
  bytes: number;
  pending: Record<string, unknown>[];
}
const scopes = new WeakMap<KernelRun, Scope>();
export function beginCodexScope(run: KernelRun, mode: Scope["mode"]): Scope {
  const scope: Scope = {
    id: "",
    mode,
    bound: mode === "status",
    failed: false,
    bytes: 0,
    pending: [],
  };
  scopes.set(run, scope);
  return scope;
}

export function bindCodexScope(
  run: KernelRun,
  id: string,
  deliver: (message: Record<string, unknown>) => Promise<void>,
): void {
  const scope = scopes.get(run)!;
  if (scope.failed || (scope.mode === "turn" && !id))
    throw new Error("Codex 未返回可核验的当前 turn ID，执行结果不确定");
  scope.id = id;
  scope.bound = true;
  const pending = scope.pending;
  scope.pending = [];
  scope.bytes = 0;
  // 请求处理不能串行 await，否则问题等待会阻塞同批撤回和终态通知。
  for (const message of pending) void deliver(message).catch((error) => run.process.fail(error));
}

/** thread fence 与 turn fence 先于任何输出、终态和审批副作用。 */
export function acceptCodexMessage(run: KernelRun, message: Record<string, unknown>): boolean {
  const params = record(message.params);
  const method = text(message.method);
  const reject = () => {
    if (message.id !== undefined && method)
      run.process.reject(message.id, "不是当前根线程/轮次的交互");
    return false;
  };
  if (params.threadId && params.threadId !== run.sessionId) return reject();
  const scope = scopes.get(run);
  const ids = [
    text(params.turnId),
    text(record(params.turn).id),
    text(record(params.item).turnId),
  ].filter(Boolean);
  // 线程级用量可先于用户输入；它不归某轮所有，仍先受根线程 fence 约束。
  if (method === "thread/tokenUsage/updated" && ids.length === 0 && !scope?.failed) return true;
  if (!scope || scope.failed || !run.submitted) return reject();
  if (!scope.bound) {
    const bytes = Buffer.byteLength(JSON.stringify(message));
    if (scope.pending.length >= 256 || scope.bytes + bytes > 1024 * 1024) {
      scope.failed = true;
      scope.pending = [];
      throw new Error("Codex 启动确认前事件超过缓存预算，执行结果不确定");
    }
    scope.pending.push(message);
    scope.bytes += bytes;
    return false;
  }
  if (scope.mode === "status") return false;
  // compact 的旧协议响应没有 turn；仅其独立命令生命周期沿用首次 started，绝不影响 turn/start 归属。
  if (scope.mode === "compact" && !scope.id && method === "turn/started") scope.id = ids[0] ?? "";
  if (ids.some((id) => id !== scope.id)) return reject();
  if (method === "turn/completed" && (!scope.id || !ids.length)) return false;
  return true;
}
