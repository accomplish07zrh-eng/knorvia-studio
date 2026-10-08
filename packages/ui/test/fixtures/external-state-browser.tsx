import { createRoot } from "react-dom/client";
import type { IServiceAccessor, IStudioRuntimeService, StudioCommand } from "@knorvia/services";
import { ServiceProvider } from "../../src/hooks/useServices.js";
import { KnorviaIntlProvider } from "../../src/i18n/IntlProvider.js";
import { StudioInteractions } from "../../src/studio/runtime/StudioInteractions.js";
import { StudioTimeline } from "../../src/studio/runtime/StudioTimeline.js";
import "../../src/styles.css";

async function rpc(method: string, args: unknown[] = []) {
  const response = await fetch("/__external_state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method, args }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
const runtime = {
  overview: () => rpc("overview"),
  timeline: (...args: unknown[]) => rpc("timeline", args),
  command: (command: StudioCommand) => rpc("command", [command]),
  inspectKernels: () => rpc("inspectKernels"),
  onDidChange(listener: (event: { revision: number }) => void) {
    let revision = 0;
    const timer = setInterval(() => listener({ revision: ++revision }), 150);
    return { dispose: () => clearInterval(timer) };
  },
} as IStudioRuntimeService;
const services = { studioRuntimeService: runtime } as unknown as IServiceAccessor;
const locale = new URLSearchParams(location.search).get("lang") === "zh" ? "zh-CN" : "en-US";
createRoot(document.getElementById("root")!).render(
  <ServiceProvider services={services}>
    <KnorviaIntlProvider initialLocale={locale}>
      <main className="min-w-0 space-y-4 bg-background p-3 text-foreground">
        <StudioInteractions targetId="question" />
        <StudioInteractions targetId="approval" />
        <div style={{ height: 450 }}>
          <StudioTimeline targetId="tool" showHistory={false} showInteractions={false} />
        </div>
      </main>
    </KnorviaIntlProvider>
  </ServiceProvider>,
);
