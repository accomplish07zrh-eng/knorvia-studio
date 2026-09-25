export const CLI_COMMAND_NAME = "knorvia";
export const CLI_PROCESS_NAME = "knorvia-agent";

interface ProcessTitleTarget {
  title: string;
}

export const setCliProcessTitle = (target: ProcessTitleTarget = process): void => {
  target.title = CLI_PROCESS_NAME;
};
