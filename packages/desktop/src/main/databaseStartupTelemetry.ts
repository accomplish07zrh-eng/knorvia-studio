import type { DatabaseStartupState } from "@knorvia/shared";
import { logger } from "./logger.js";

/** 数据库启动保留本机故障记录，不采集设备标识或发送产品遥测。 */
export function reportDatabaseStartupState(state: DatabaseStartupState): void {
  if (state.phase !== "ready" && state.phase !== "failed") return;
  logger.info("[database-startup] terminal", {
    status: state.phase,
    durationMs: state.updatedAt - state.startedAt,
    errorCode: state.errorCode,
  });
}
