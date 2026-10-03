import type { connectViaWebSocket } from "@knorvia/client";
import type { IPlatformService } from "@knorvia/shared";
import type { WebBootstrapResult } from "./webBootstrap.js";

export type WebServices = Awaited<ReturnType<typeof connectViaWebSocket>>;

export interface WebWorkspaceInput {
  readonly bootstrap: WebBootstrapResult;
  readonly services: WebServices;
  readonly platform: IPlatformService;
}

export interface WebStartupPorts {
  resolve(): Promise<WebBootstrapResult>;
  connect(url: string): Promise<WebServices>;
  createPlatform(): IPlatformService;
  present(input: WebWorkspaceInput): void;
  failure(error: unknown): void;
}

type StartupFrame =
  | { readonly phase: "planning" }
  | { readonly phase: "connecting"; readonly bootstrap: WebBootstrapResult }
  | {
      readonly phase: "presenting";
      readonly bootstrap: WebBootstrapResult;
      readonly services: WebServices;
    }
  | { readonly phase: "ready" }
  | { readonly phase: "failed"; readonly error: unknown };

/** One execution owns the handoff; connection and business state stay in their services. */
export async function startWebApp(ports: WebStartupPorts): Promise<void> {
  let current: StartupFrame = { phase: "planning" };
  for (;;) {
    if (current.phase === "ready") return;
    if (current.phase === "failed") {
      ports.failure(current.error);
      return;
    }
    try {
      switch (current.phase) {
        case "planning":
          current = { phase: "connecting", bootstrap: await ports.resolve() };
          break;
        case "connecting":
          current = {
            phase: "presenting",
            bootstrap: current.bootstrap,
            services: await ports.connect(current.bootstrap.wsUrl),
          };
          break;
        case "presenting":
          ports.present({
            bootstrap: current.bootstrap,
            services: current.services,
            platform: ports.createPlatform(),
          });
          current = { phase: "ready" };
          break;
      }
    } catch (error) {
      current = { phase: "failed", error };
    }
  }
}
