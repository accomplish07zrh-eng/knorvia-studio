import { Download, GitBranch, MoreHorizontal, Plus, Search, Upload, Workflow } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.js";
import type { StudioWorkflow, WorkflowTemplate } from "./types.js";
import { useWorkflowText } from "./useWorkflowText.js";

interface Props {
  workflows: StudioWorkflow[];
  disabled: boolean;
  onCreate: (template: WorkflowTemplate) => void;
  onOpen: (id: string) => void;
  onRename: (workflow: StudioWorkflow) => void;
  onDuplicate: (workflow: StudioWorkflow) => void;
  onDelete: (workflow: StudioWorkflow) => void;
  onImport: () => void;
  onExport: (workflow: StudioWorkflow) => void;
}

export function WorkflowLibrary({
  workflows,
  disabled,
  onCreate,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onImport,
  onExport,
}: Props) {
  const t = useWorkflowText();
  const [search, setSearch] = useState("");
  const visible = useMemo(
    () =>
      workflows
        .filter((workflow) =>
          workflow.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [workflows, search],
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h1 className="text-ui-base font-medium">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-md"
            onClick={onImport}
            disabled={disabled}
            title={t("import")}
            aria-label={t("import")}
          >
            <Upload />
          </Button>
          <Button variant="outline" size="lg" onClick={() => onCreate("blank")} disabled={disabled}>
            <Plus aria-hidden="true" />
            {t("new")}
          </Button>
        </div>
      </header>
      {!workflows.length ? (
        <div className="m-auto flex w-full max-w-3xl flex-col px-6 py-10">
          <Workflow className="mb-4 size-6 text-foreground-subtle" aria-hidden="true" />
          <h2 className="text-ui-lg font-medium">{t("emptyTitle")}</h2>
          <p className="mt-2 text-ui-base text-foreground-subtle">{t("emptyDescription")}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {(["blank", "sequence", "parallel", "branch"] as const).map((template) => (
              <button
                key={template}
                type="button"
                disabled={disabled}
                onClick={() => onCreate(template)}
                className="rounded-xl border border-card-border bg-card px-4 py-4 text-left hover:border-border-hover hover:bg-hover disabled:opacity-50"
              >
                <span className="text-ui-base font-medium">{t(template)}</span>
                <span className="mt-1 block text-ui-sm text-foreground-subtle">
                  {t(`${template}Description`)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-5xl px-5 py-5">
          <div className="relative mb-4 max-w-sm">
            <Search
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-foreground-subtle"
              aria-hidden="true"
            />
            <Input
              aria-label={t("search")}
              placeholder={t("search")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-7"
            />
          </div>
          <div className="overflow-hidden rounded-xl border border-card-border bg-card">
            {visible.map((workflow) => (
              <div
                key={workflow.id}
                className="flex items-center gap-2 border-b border-border px-3 last:border-b-0 hover:bg-hover"
              >
                <button
                  type="button"
                  onClick={() => onOpen(workflow.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 py-4 text-left"
                >
                  <GitBranch
                    className="size-4 shrink-0 text-foreground-subtle"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui-base font-medium">{workflow.name}</span>
                    <span className="mt-1 block truncate text-ui-sm text-foreground-subtle">
                      {t("nodeCount", { count: workflow.nodes.length })} · {t("localDraft")}
                    </span>
                  </span>
                </button>
                <WorkflowMenu
                  workflow={workflow}
                  onRename={onRename}
                  onDuplicate={onDuplicate}
                  onDelete={onDelete}
                  onExport={onExport}
                  disabled={disabled}
                />
              </div>
            ))}
            {!visible.length && (
              <p className="px-4 py-8 text-center text-ui-base text-foreground-subtle">
                {t("noResults")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function WorkflowMenu({
  workflow,
  onRename,
  onDuplicate,
  onDelete,
  onImport,
  onExport,
  disabled,
}: Pick<Props, "onRename" | "onDuplicate" | "onDelete" | "onExport"> & {
  workflow: StudioWorkflow;
  onImport?: () => void;
  disabled?: boolean;
}) {
  const t = useWorkflowText();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-md" aria-label={t("more")} disabled={disabled}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onRename(workflow)}>{t("rename")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onDuplicate(workflow)}>{t("duplicate")}</DropdownMenuItem>
        <DropdownMenuSeparator />
        {onImport && (
          <DropdownMenuItem onSelect={onImport}>
            <Upload />
            {t("import")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => onExport(workflow)}>
          <Download />
          {t("export")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onSelect={() => onDelete(workflow)}>
          {t("delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
