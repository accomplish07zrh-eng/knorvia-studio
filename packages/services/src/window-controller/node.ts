// Controller 含 Node projection 能力；浏览器只消费 services 根入口的公开服务合同。
export { createWindowHostControllerRuntime } from "./windowHostControllerService.js";
export { createWindowHostControllerProjection } from "./windowHostControllerProjection.js";
export type {
  WindowHostControllerMutation,
  WindowHostControllerMutationResult,
  WindowHostControllerSessionOverlay,
  WindowHostControllerSourceScope,
} from "./windowHostControllerProjection.js";
export { createWindowHostSessionsIndexObserver } from "./windowHostSessionsIndexObserver.js";
export type { WindowHostSessionsIndexObserver } from "./windowHostSessionsIndexObserver.js";
