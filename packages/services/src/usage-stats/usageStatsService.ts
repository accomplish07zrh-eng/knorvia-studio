import type { AppUsageRequest, AppUsageSnapshot } from "@knorvia/shared";
import type { IKnorviaAgentService } from "../agent/agent.js";
import type { IUsageStatsService } from "./usageStats.js";

/** 使用量来自本机 Agent 的真实记录，与产品账户和远程套餐额度无关。 */
export function createUsageStatsService(dependencies: {
  agentService: Pick<IKnorviaAgentService, "getAppUsageStats">;
}): IUsageStatsService {
  return {
    getAppUsageSnapshot(request: AppUsageRequest): Promise<AppUsageSnapshot> {
      return dependencies.agentService.getAppUsageStats({
        range: request.range,
        timeZone: request.timeZone,
      });
    },
  };
}
