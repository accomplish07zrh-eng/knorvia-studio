import {
  DISABLED_RENDERER_ACTION_TRACE_CONFIG,
  RENDERER_ACTION_TRACE_SERVICE_NAME,
  KNORVIA_ENV,
  KNORVIA_VERSION,
  type IPlatformService,
  type RendererActionTraceConfigV1,
} from "@knorvia/shared";
import { RendererUserActionTelemetry, setUserActionTelemetry } from "@knorvia/ui";

class RendererTraceLifetime {
  private readonly telemetry: RendererUserActionTelemetry;
  private stopConfiguration: (() => void) | undefined;
  private readonly pageHidden = () => {
    void this.telemetry.shutdown();
  };
  private readonly configure = (config: RendererActionTraceConfigV1) =>
    this.telemetry.updateConfig(config);

  constructor(
    sendBatch: NonNullable<IPlatformService["reportRendererActionTraceBatch"]>,
    options: { isLocalDevelopmentRuntime: boolean },
  ) {
    const rendererInstanceId = crypto.randomUUID();
    this.telemetry = new RendererUserActionTelemetry({
      config: DISABLED_RENDERER_ACTION_TRACE_CONFIG,
      resource: {
        serviceName: RENDERER_ACTION_TRACE_SERVICE_NAME,
        serviceVersion: KNORVIA_VERSION || "unknown",
        deploymentEnvironment: options.isLocalDevelopmentRuntime ? "development" : KNORVIA_ENV,
        rendererInstanceId,
      },
      sendBatch: (batch) => sendBatch(batch),
    });
  }

  publish(
    options: { platform: IPlatformService },
    readConfiguration: NonNullable<IPlatformService["getRendererActionTraceConfig"]>,
  ): void {
    setUserActionTelemetry(this.telemetry);
    void readConfiguration()
      .then(this.configure)
      .catch(() => {
        this.telemetry.updateConfig(DISABLED_RENDERER_ACTION_TRACE_CONFIG);
      });
    this.stopConfiguration = options.platform.onRendererActionTraceConfigChanged?.(this.configure);
    window.addEventListener("pagehide", this.pageHidden, { once: true });
  }

  release(): void {
    window.removeEventListener("pagehide", this.pageHidden);
    const stopConfiguration = this.stopConfiguration;
    stopConfiguration?.();
    setUserActionTelemetry(null);
    void this.telemetry.shutdown();
  }
}

export function initializeDesktopUserActionTrace(options: {
  platform: IPlatformService;
  isLocalDevelopmentRuntime: boolean;
}): () => void {
  const sendBatch = options.platform.reportRendererActionTraceBatch;
  const readConfiguration = options.platform.getRendererActionTraceConfig;
  if (!sendBatch || !readConfiguration) {
    setUserActionTelemetry(null);
    return () => {};
  }
  const lifetime = new RendererTraceLifetime(sendBatch, options);
  lifetime.publish(options, readConfiguration);
  return () => lifetime.release();
}
