// Exercises the real native draft owner, independently of model readiness or execution.
import { useDraftConfigControl } from "../../src/v4/composer/useDraftConfigControl.js";

export function WorkbenchNativeDraftProbe({ id }: { id: string }) {
  const draft = useDraftConfigControl({
    workspacePath: "/test/project",
    sessionId: null,
    draftScopeId: `workbench:${id}`,
    agentStartupAllowed: false,
    modelSelectionService: null,
  });
  return (
    <div data-testid={`native-draft-${id}`}>
      <input
        aria-label={`Native draft ${id}`}
        value={draft.composerDraft.text}
        onChange={(event) => draft.updateComposerContent({ text: event.target.value })}
      />
      <button onClick={() => draft.promoteComposerDraft(`accepted-${id}`)}>Accept {id}</button>
    </div>
  );
}
