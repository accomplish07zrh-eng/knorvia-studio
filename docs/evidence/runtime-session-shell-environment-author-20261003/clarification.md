# Public port-name fact

Both pre-conversation prefix inspection and duplicate-notice inspection call runtime.messageHistory.borrowReadOnlyRuntimeEntries(). It returns the owner's readonly entry array. No other history accessor or clone is introduced.
