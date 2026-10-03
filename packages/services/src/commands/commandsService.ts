import { KNORVIA_COMMAND_AGENT_SOURCE, KNORVIA_COMMAND_AGENT_SOURCES } from "@knorvia/shared";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ICommandsService } from "./commands.js";
import { CommandFileParser } from "./commandFileParser.js";
import {
  readCommandConfiguration,
  readEnabledOverrides,
  withCommandEnabled,
  writeCommandConfiguration,
} from "./commandConfig.js";
import { discoverPluginCommands, discoverUserCommands, userCommand } from "./commandDiscovery.js";
import { commandDescriptor, commandFilename, commandTarget } from "./commandLocations.js";

async function requireAbsent(filePath: string, filename: string): Promise<void> {
  try {
    await access(filePath);
    throw new Error(`Command file already exists: ${filename}`);
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
  }
}

export function createCommandsService(_options?: { isDesktopRuntime?: boolean }): ICommandsService {
  return {
    async list(params) {
      const sources = params.agentSource ? [params.agentSource] : KNORVIA_COMMAND_AGENT_SOURCES;
      const overrides = await readEnabledOverrides();
      const workspacePath = params.workspacePath;
      const userCommands = await discoverUserCommands(sources, workspacePath, overrides);
      const pluginCommands =
        !params.agentSource || params.agentSource === KNORVIA_COMMAND_AGENT_SOURCE
          ? await discoverPluginCommands(overrides)
          : [];
      return {
        commands: [...userCommands, ...pluginCommands],
        userCommands,
        pluginCommands,
        capability: { userScopeAvailable: true },
      };
    },

    async writeCommandFile(params) {
      const source = params.agentSource ?? KNORVIA_COMMAND_AGENT_SOURCE;
      const descriptor = commandDescriptor(source);
      const target = commandTarget(descriptor, params.storageLevel, params.workspacePath);
      await mkdir(target.rootPath, { recursive: true });
      const filename = commandFilename(params.config.name, descriptor);
      const filePath = join(target.rootPath, filename);
      await requireAbsent(filePath, filename);
      const content = CommandFileParser.generateCommandFileContent(
        params.config,
        descriptor.format,
      );
      await writeFile(filePath, content, "utf-8");
      const config = await readCommandConfiguration();
      await writeCommandConfiguration(withCommandEnabled(config, filePath, true));
      const parsed = CommandFileParser.parseCommandFile(content, filePath, descriptor.format);
      if (!parsed) throw new Error("Failed to parse written command file");
      return { command: userCommand(parsed, filePath, source, target, true) };
    },

    async updateCommandFile(params) {
      const source = params.agentSource ?? KNORVIA_COMMAND_AGENT_SOURCE;
      const descriptor = commandDescriptor(source);
      const target = commandTarget(descriptor, params.storageLevel, params.workspacePath);
      const filename = commandFilename(params.config.name, descriptor);
      const filePath = join(target.rootPath, filename);
      const initialOverrides = await readEnabledOverrides();
      const oldFilePath = params.oldFilePath;
      const existingContent = oldFilePath
        ? await readFile(oldFilePath, "utf-8").catch(() => undefined)
        : undefined;
      if (oldFilePath && oldFilePath !== filePath) {
        await rm(oldFilePath).catch(() => undefined);
      }
      if (filePath !== oldFilePath) await requireAbsent(filePath, filename);
      const content = CommandFileParser.generateCommandFileContent(
        params.config,
        descriptor.format,
        existingContent,
      );
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
      if (oldFilePath && oldFilePath !== filePath && initialOverrides.has(oldFilePath)) {
        const config = await readCommandConfiguration();
        const withoutOld = withCommandEnabled(config, oldFilePath, true);
        const migrated = withCommandEnabled(
          withoutOld,
          filePath,
          initialOverrides.get(oldFilePath) ?? true,
        );
        await writeCommandConfiguration(migrated);
      }
      const parsed = CommandFileParser.parseCommandFile(content, filePath, descriptor.format);
      if (!parsed) throw new Error("Failed to parse written command file");
      const command = userCommand(parsed, filePath, source, target, true);
      command.enabled = (await readEnabledOverrides()).get(filePath) ?? true;
      return { command };
    },

    async deleteCommandFile(params) {
      try {
        await rm(params.filePath);
      } catch (error) {
        if ((error as { code?: string }).code !== "ENOENT") throw error;
      }
      const config = await readCommandConfiguration();
      await writeCommandConfiguration(withCommandEnabled(config, params.filePath, true));
    },

    async setCommandEnabled(params) {
      const config = await readCommandConfiguration();
      await writeCommandConfiguration(withCommandEnabled(config, params.filePath, params.enabled));
    },

    async getPrimaryUserCommandsDirectory(params) {
      const target = commandTarget(commandDescriptor(params?.agentSource));
      await mkdir(target.rootPath, { recursive: true });
      return { path: target.rootPath };
    },
  };
}
