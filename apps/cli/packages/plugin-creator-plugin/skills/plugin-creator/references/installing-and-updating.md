# Install through the existing settings page

1. Create or edit the plugin in a development directory and run local validation.
2. Run upsert-dev-marketplace.mjs with the plugin directory. The result gives a local source index and stable plugin identifier.
3. In Knorvia Studio, open Settings → Plugins for the intended workspace/Host. Add the local source directory or index using the existing source controls, refresh, and install the plugin.
4. Check installation and enablement status. Test the intended capability. A listed or enabled plugin is not evidence that all its tools work.

For updates, edit the development source, increase the version, validate and test, update the local index, then refresh/update through Settings → Plugins. Do not edit installed cache directories: refreshes may replace them. Removing a source is different from uninstalling a plugin, and uninstalling need not remove its user data.

If a source points to a different plugin directory, the helper refuses to silently redirect it. Inspect the index and make the requested change explicitly. If the index is malformed or locked, preserve it and resolve the reported issue before retrying; do not delete unknown lock files or replace damaged content with an empty index.
