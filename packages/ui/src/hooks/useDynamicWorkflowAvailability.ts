/** 独立版本使用随应用分发的本地工作流能力，不查询产品账号灰度服务。 */
const LOCAL_AVAILABILITY = Object.freeze({ status: "ready" as const, enabled: true, config: null });
export function useDynamicWorkflowAvailability() {
  return LOCAL_AVAILABILITY;
}
