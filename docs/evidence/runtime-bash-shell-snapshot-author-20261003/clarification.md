# Supplementary fixed warning facts (before seal)

Error rendering is `error instanceof Error ? error.message : String(error)`.
Persistence failure fields: trace log context spread, errorMessage, event:'session_entry.bash_shell_selection.persist_failed',module:'core.runtime',status:'failed'.
Read failure fields: trace spread,errorMessage,event:'session_entry.bash_shell_selection.read_failed',module:'core.runtime',status:'failed'.
Invalid warning fields: trace spread,event:'session_entry.bash_shell_selection.invalid',module:'core.runtime'. No status/errorMessage.
Stale warning fields: trace spread,event:'session_entry.bash_shell_selection.stale',module:'core.runtime',persistedShellName:restore.selection.display.name,persistedShellPath:restore.selection.path. No status/errorMessage.
