import { AppErrorBoundary, KnorviaIntlProvider, Root } from "@knorvia/ui";
import type { WebWorkspaceInput } from "./webStartup.js";

/** Keep the existing provider tree and evaluate its props inside the startup handoff. */
export function createWebWorkspace({ services, platform, bootstrap }: WebWorkspaceInput) {
  return (
    <AppErrorBoundary>
      <KnorviaIntlProvider
        settingService={services.settingService}
        broadcastService={services.broadcastService}
      >
        <Root
          services={services}
          platform={platform}
          initialWorkspaceAbsPath={bootstrap.initialWorkspaceAbsPath}
          initialWorkspaceIdentity={bootstrap.initialWorkspaceIdentity}
          initialTaskId={bootstrap.initialTaskId}
          restoreSession={bootstrap.restoreSession}
          allowOpenWorkspace={bootstrap.allowOpenWorkspace}
          preferDirectoryBrowser
          supportsEmbeddedBrowser={false}
          allowRemoteWorkspace={false}
        />
      </KnorviaIntlProvider>
    </AppErrorBoundary>
  );
}

export function WebBootstrapErrorScreen({ message }: { message: string }) {
  return (
    <div className="h-dvh min-h-dvh w-screen bg-background text-foreground">
      <div className="mx-auto flex h-full w-full max-w-lg items-center px-4">
        <section className="w-full rounded-xl border border-card-border bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="size-2 rounded-full bg-destructive" />
            <h1 className="text-ui-xs font-medium">
              {/^zh\b/i.test(navigator.language) ? "Web 启动失败" : "Web bootstrap failed"}
            </h1>
          </div>
          <p className="mt-2 break-all text-ui-xs/relaxed text-foreground-subtle">{message}</p>
          <button
            type="button"
            className="mt-4 rounded-lg border border-border bg-surface px-3 py-2 text-ui-xs text-foreground-subtle hover:bg-surface-hover"
            onClick={() => {
              window.location.reload();
            }}
          >
            {/^zh\b/i.test(navigator.language) ? "重试" : "Retry"}
          </button>
        </section>
      </div>
    </div>
  );
}
