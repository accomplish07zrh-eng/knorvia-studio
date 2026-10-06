import { useCallback, useEffect, useState } from "react";
import type {
  CliProviderSwitchApplyRequest,
  CliProviderSwitchApplyResult,
  CliProviderSwitchView,
} from "@knorvia/shared";
import { useServices } from "@/hooks/useServices.js";
import { logger } from "@/logger.js";

/**
 * CLI 模型配置切换（specs/knorvia-cli-provider-switch.md）。
 * 状态的唯一所有者是 Host 上的切换服务；这里只缓存最近一次读取的视图用于展示。
 */
export function useCliProviderSwitch() {
  const service = useServices().cliProviderSwitchService;
  const [view, setView] = useState<CliProviderSwitchView | null>(null);
  const [loading, setLoading] = useState(Boolean(service));
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!service) return;
    setLoading(true);
    try {
      setView(await service.getView());
      setError("");
    } catch (cause) {
      logger.warn("[CliProviderSwitch] 读取状态失败", cause);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const apply = useCallback(
    async (request: CliProviderSwitchApplyRequest): Promise<CliProviderSwitchApplyResult> => {
      if (!service) throw new Error("unavailable");
      try {
        return await service.apply(request);
      } finally {
        await refresh();
      }
    },
    [refresh, service],
  );

  return { available: Boolean(service), view, loading, error, refresh, apply };
}
