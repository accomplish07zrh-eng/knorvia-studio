# Pre-write public contract clarifications

Curator source exposure is disclosed. These are externally visible public port/data facts, not private inherited implementations.

- BrowserBackendDescriptor has apiSupportOverrides on its root, alongside id, generation, type, name, capabilities and metadata. Command discrimination for the contract is command.method === "playwright" and command.action.name === "locator", then command.action.operation. A completed recording uses result.recording.status === "completed" and result.recording.artifact.path. These were intended by the original packet; no extra descriptor nesting is inferred.
- KnorviaPromptAttachment filename is the property literally named filename (not name); localPath is the local/remote path property. All other attachment properties must be preserved verbatim by identity or shallow copy as specified.
- Await backend.exec(command) to obtain a handle with stdout.on("data", callback), stderr.on("data", callback), and onClose(callback), where callback receives the exit code. Data chunks are Buffer or string and support toString(). No additional handle methods/events are required or authorized for this owner.

Authors may read only this clarification in addition to their original permitted files. Whole literal draft and SHA-only rules still apply; no inherited/dependency reads or prior draft access.
