import { KNORVIA_COMMAND_AGENT_SOURCE } from "@knorvia/shared";
import type {
  CommandAgentSource,
  SettingsDirectoryLocation,
  SettingsDirectorySource,
} from "@knorvia/shared";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { getKnorviaDataRootDir } from "#src/paths.js";
import type { CommandFileFormat } from "./commandFileParser.js";

export interface CommandDescriptor {
  directorySource: SettingsDirectorySource;
  userSegments: string[];
  workspaceSegments: string[];
  extension: string;
  format: CommandFileFormat;
  namespace: "/";
  supportsArgumentHint: boolean;
}

const agent: CommandDescriptor = {
  directorySource: "knorvia",
  userSegments: [".knorvia-studio", "commands"],
  workspaceSegments: [".knorvia-studio", "commands"],
  extension: ".md",
  format: "markdown",
  namespace: "/",
  supportsArgumentHint: true,
};

const descriptors: Record<CommandAgentSource, CommandDescriptor> = { agent };
const agents: CommandDescriptor = {
  ...agent,
  directorySource: "agents",
  userSegments: [".agents", "commands"],
  workspaceSegments: [".agents", "commands"],
};

export function commandDescriptor(
  source: CommandAgentSource = KNORVIA_COMMAND_AGENT_SOURCE,
): CommandDescriptor {
  return descriptors[source];
}

export function discoveryDescriptors(source: CommandAgentSource): CommandDescriptor[] {
  return source === KNORVIA_COMMAND_AGENT_SOURCE ? [agent, agents] : [commandDescriptor(source)];
}

export function commandHome(): string {
  return process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || homedir();
}

export interface CommandTarget {
  descriptor: CommandDescriptor;
  rootPath: string;
  scope: "global" | "project";
  projectPath?: string;
  location: SettingsDirectoryLocation;
}

export function commandTarget(
  descriptor: CommandDescriptor,
  storageLevel?: "user" | "project",
  workspacePath?: string,
): CommandTarget {
  const project = storageLevel === "project";
  if (project && !workspacePath) throw new Error("Missing workspace path for project command");
  const rootPath = project
    ? join(workspacePath!, ...descriptor.workspaceSegments)
    : descriptor.directorySource === "knorvia"
      ? join(getKnorviaDataRootDir(), "commands")
      : join(commandHome(), ...descriptor.userSegments);
  const projectPath = project ? workspacePath : undefined;
  return {
    descriptor,
    rootPath,
    scope: project ? "project" : "global",
    ...(projectPath ? { projectPath } : {}),
    location: {
      source: descriptor.directorySource,
      scope: project ? "project" : "user",
      directoryPath: rootPath,
      ...(projectPath ? { projectPath } : {}),
    },
  };
}

export function commandName(rootPath: string, filePath: string): string {
  const segments = relative(rootPath, filePath)
    .replace(/\.md$/i, "")
    .split(/[\\/]+/)
    .filter(Boolean);
  return `/${segments.join("/")}`;
}

export function commandFilename(name: string, descriptor: CommandDescriptor): string {
  return `${name.replace(/^\//, "")}${descriptor.extension}`;
}
