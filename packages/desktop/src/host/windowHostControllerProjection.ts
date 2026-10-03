// 投影实现迁至共享 Node 入口，避免 Web 装配产生第二套列表规则。
export { createWindowHostControllerProjection } from "@knorvia/services/window-controller";
export type {
  WindowHostControllerMutation,
  WindowHostControllerMutationResult,
  WindowHostControllerSessionOverlay,
  WindowHostControllerSourceScope,
} from "@knorvia/services/window-controller";
