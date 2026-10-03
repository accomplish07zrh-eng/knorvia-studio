import type { PluginMetadata, PluginReferenceCatalog, PluginReferenceCatalogEntry } from "@knorvia/contracts";
export declare function buildPluginReferenceCatalog(plugins: readonly PluginMetadata[]): PluginReferenceCatalog;
export declare function findPluginReferenceCatalogEntry(catalog: PluginReferenceCatalog | undefined, pluginId: string): PluginReferenceCatalogEntry | undefined;
